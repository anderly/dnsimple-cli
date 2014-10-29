//
// Copyright (c) Microsoft and contributors.  All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
var _ = require('underscore');
var fs = require('fs');
var url = require('url');
var async = require('async');
var util = require('util');
var utils = require('../../../util/utils');
var blobUtils = require('../../../util/blobUtils');
var pageBlob = require('../iaas/upload/pageBlob');
var CommunityUtil = require('../../../util/communityUtil');
var crypto = require('crypto');
var VNetUtil = require('../network/vnetUtil');
var EndPointUtil = require('../vm/endpointUtil');
var underscore = require('underscore');
var $ = utils.getLocaleString;
var profile = require('../../../util/profile');
var path = require('path');
var openssl = require('openssl-wrapper');
var vmUtils = require('./vmUtils');

function VMClient(cli, subscription) {
  this.cli = cli;
  this.subscription = subscription;
}

_.extend(VMClient.prototype, {

  createVM: function (dnsName, imageName, userName, password, options, callback, logger) {
    var self = this;
    var dnsPrefix = utils.getDnsPrefix(dnsName);
    var vmSize = getVMSize(options, logger);

    if (options.rdp) {
      if (typeof options.rdp === 'boolean') {
        options.rdp = 3389;
      } else if ((options.rdp != parseInt(options.rdp, 10)) || (options.rdp > 65535)) {
        return callback(new Error($('--rdp [port] must be an integer less than or equal to 65535')));
      }
    }

    // Note: The optional argument --no-ssh-password maps to options.sshPassword.
    // if --no-ssh-password is specified in the command line then options.sshPassword
    // will be set to 'false' by commander. If --no-ssh-password is not specified as
    // an option then options.sshPassword will be set to true by commander.
    if (options.ssh) {
      if (typeof options.ssh === 'boolean') {
        options.ssh = 22;
      } else if ((options.ssh != parseInt(options.ssh, 10)) || (options.ssh > 65535)) {
        return callback(new Error($('--ssh [port] must be an integer less than or equal to 65535')));
      }
    } else if (!options.sshPassword || options.sshCert) {
      return callback(new Error($('--no-ssh-password and --ssh-cert can only be used with --ssh parameter')));
    }

    if (!options.sshPassword && !options.sshCert) {
      return callback(new Error($('--no-ssh-password can only be used with the --ssh-cert parameter')));
    }

    if (options.customData) {
      // Size of customData file should be less then 64 KB
      var stats = fs.statSync(options.customData);
      var maxSize = 65535; // 64 KB

      if (stats['size'] > maxSize) {
        return callback(new Error($('--custom-data must be less then 64 KB')));
      }
    }

    if (options.staticIp) {
      var vnetUtil = new VNetUtil();
      var parsedIp = vnetUtil.parseIPv4(options.staticIp);
      if (parsedIp.error) {
        return callback(parsedIp.error);
      }
      if (!options.virtualNetworkName) {
        return callback(new Error($('--virtual-network-name must be specified when the --static-ip option is given')));
      }
      if (options.subnetNames) {
        logger.warn('--static-ip, --subnet-names will be ignored and the static ip subnet will be used');
        options.subnetNames = null;
      }
    }

    var computeManagementClient = self.createComputeManagementClient();
    var managementClient = self.createManagementClient();
    var storageClient = self.createStorageClient();
    var networkClient = self.createNetworkClient();

    createVM({
      dnsPrefix: dnsPrefix,
      imageName: imageName,
      password: password,
      userName: userName,
      subscription: options.subscription,
      size: vmSize,
      location: options.location,
      affinityGroup: options.affinityGroup,
      imageTarget: options.blobUrl,
      ssh: options.ssh,
      sshCert: options.sshCert,
      logger: logger,
      noSshPassword: options.sshPassword === false,
      rdp: options.rdp,
      connect: options.connect,
      community: options.community,
      vmName: options.vmName,
      virtualNetworkName: options.virtualNetworkName,
      subnetNames: options.subnetNames,
      staticIp: options.staticIp,
      reservedIp: options.reservedIp,
      availabilitySet: options.availabilitySet,
      customData: options.customData,
      computeManagementClient: computeManagementClient,
      managementClient: managementClient,
      storageClient: storageClient,
      networkClient : networkClient
    }, callback, logger, self.cli);
  },

  createVMfromJson: function (dnsName, roleFile, options, callback, logger) {
    var self = this;

    function stripBOM(content) {
      // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
      // because the buffer-to-string conversion in `fs.readFileSync()`
      // translates it to FEFF, the UTF-16 BOM.
      if (content.charCodeAt(0) === 0xFEFF || content.charCodeAt(0) === 0xFFFE) {
        content = content.slice(1);
      }
      return content;
    }

    var dnsPrefix = utils.getDnsPrefix(dnsName);
    logger.verbose(util.format($('Loading role file: %s'), roleFile));
    var jsonFile = fs.readFileSync(roleFile, 'utf8');
    var role = JSON.parse(stripBOM(jsonFile));

    // remove resourceExtensionReferences if empty
    if (role.resourceExtensionReferences.length === 0) {
      delete role.resourceExtensionReferences;
    }

    var computeManagementClient = self.createComputeManagementClient();
    var managementClient = self.createManagementClient();
    var storageClient = self.createStorageClient();
    var networkClient = self.createNetworkClient();

    createVM({
      subscription: options.subscription,
      location: options.location,
      affinityGroup: options.affinityGroup,
      dnsPrefix: dnsPrefix,
      connect: options.connect,
      role: role,
      sshCert: options.sshCert,
      virtualNetworkName: options.virtualNetworkName,
      computeManagementClient: computeManagementClient,
      managementClient: managementClient,
      storageClient: storageClient,
      networkClient : networkClient
    }, callback, logger, self.cli);

  },

  listVMs: function (options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var vms = [];
        if (deployments.length > 0) {
          for (var i = 0; i < deployments.length; i++) {
            var roles = deployments[i].deploy.roles;
            if (roles) {
              for (var j = 0; j < roles.length; j++) {
                if (roles[j].roleType === 'PersistentVMRole') {
                  vms.push(createVMView(roles[j], deployments[i]));
                }
              }
            }
          }
        }

        self.cli.interaction.formatOutput(vms, function (outputData) {
          if (outputData.length === 0) {
            logger.info($('No VMs found'));
          } else {
            logger.table(outputData, function (row, item) {
              row.cell($('Name'), item.VMName);
              row.cell($('Status'), item.InstanceStatus);
              row.cell($('Location'), item.Location ? item.Location : item.AffinityGroup);
              row.cell($('DNS Name'), item.DNSName);
              row.cell($('IP Address'), item.IPAddress);
            });
          }
        });

        return callback();
      }
    });
  },

  showVM: function (name, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var vms = [];
        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                vms.push(createVMView(roles[j], deployments[i]));
              }
            }
          }
        }

        // got vms, show detailed info about it
        if (vms.length > 0) {
          var vmOut = vms.length === 1 ? vms[0] : vms;
          if (logger.format().json) {
            logger.json(vmOut);
          } else {
            utils.logLineFormat(vmOut, logger.data);
          }
        } else {
          logger.warn($('No VMs found'));
        }

        return callback();
      }
    });
  },

  deleteVM: function (vmName, options, callback, logger) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        options.dnsPrefix = options.dnsName;
        var found = null;
        var role = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === vmName) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }

                found = deployments[i];
                role = roles[j];
              }
            }
          }
        }

        // got unique vm, delete it
        if (found) {
          var deleteVMInternal = function () {
            var progress = self.cli.interaction.progress($('Deleting VM'));
            deleteRoleOrDeployment(computeManagementClient, found.svc, found.deploy, vmName, options, self.cli, callback, progress);
          };

          // confirm deleting if required
          if (options.quiet)
            deleteVMInternal();
          else self.cli.interaction.confirm(util.format($('Delete the VM %s ? [y/n] '), vmName), function (dummy, shouldDelete) {
            if (shouldDelete) {
              deleteVMInternal();
            } else {
              return callback();
            }
          });
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  startVM: function (name, options, callback, logger) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                found = deployments[i];
                found.roleInstance = getRoleInstance(roles[j].roleName, deployments[i].deploy);
              }
            }
          }
        }

        // got unique vm, start it
        if (found) {
          var progress = self.cli.interaction.progress($('Starting VM'));
          computeManagementClient.virtualMachines.start(found.svc, found.deploy.name,
            found.roleInstance.instanceName, function (error) {
              progress.end();
              return callback(error);
            });
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  restartVM: function (name, options, callback, logger) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                found = deployments[i];
                found.roleInstance = getRoleInstance(roles[j].roleName, deployments[i].deploy);
              }
            }
          }
        }

        // got unique vm, restart it
        if (found) {
          var progress = self.cli.interaction.progress($('Restarting VM'));
          computeManagementClient.virtualMachines.restart(found.svc, found.deploy.name,
            found.roleInstance.instanceName, function (error) {
              progress.end();
              return callback(error);
            });
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  shutdownVM: function (name, options, callback, logger) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                found = deployments[i];
                found.roleInstance = getRoleInstance(roles[j].roleName, deployments[i].deploy);
              }
            }
          }
        }

        // got unique vm, shutting down it
        if (found) {
          var parameters = {
            postShutdownAction: 'StoppedDeallocated'
          };

          // if --stay-provisioned argument is provided shutdown vm to "Stopped" state
          if (options.stayProvisioned) {
            parameters.postShutdownAction = 'Stopped';
          }

          var progress = self.cli.interaction.progress($('Shutting down VM'));
          computeManagementClient.virtualMachines.shutdown(found.svc, found.deploy.name,
            found.roleInstance.instanceName, parameters, function (error) {
              progress.end();
              return callback(error);
            });
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  captureVM: function (vmName, targetImageName, options, callback, logger) {
    var self = this;

    if (!options['delete']) {
      // Using this option will warn the user that the machine will be deleted
      logger.help($('Reprovisioning a captured VM is not yet supported'));
      return callback('required --delete option is missing');
    }

    var computeManagementClient = self.createComputeManagementClient();

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === vmName) {
                if (found) {
                  // found duplicates, emit error
                  return callback($('VM name is not unique'));
                }

                found = deployments[i];
                found.roleInstance = getRoleInstance(roles[j].roleName, deployments[i].deploy);
              }
            }
          }
        }

        // got unique vm, capture it
        if (found) {

          var captureOptions = {
            postCaptureAction: 'Delete',
            targetImageName: targetImageName,
            targetImageLabel: options.label || targetImageName // does not work without label
          };

          var progress = self.cli.interaction.progress($('Capturing VM'));

          computeManagementClient.virtualMachines.captureOSImage(found.svc, found.deploy.name, found.roleInstance.instanceName, captureOptions, function (error) {
            progress.end();
            return callback(error);
          });

        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  exportVM: function (vmName, filePath, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === vmName) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                found = roles[j];
              }
            }
          }
        }

        // got unique role, export to file
        if (found) {
          var progress = self.cli.interaction.progress('Exporting the VM');

          var prepareForExport = function (role) {
            for (var key in role) {
              // Remove namespace @ node
              if (key === '@' || key === 'OsVersion') {
                delete role[key];
              } else if (key === 'dataVirtualHardDisks') {
                // Remove Links of all DataVirtualHardDisks since
                // while importing we need to pass only DiskName
                // which will be already linked with a vhd
                for (var i = 0; i < role[key].length; i++) {
                  delete role[key][i].mediaLink;
                  // delete role[key][i].sourceMediaLink; property is deprecated
                }
              } else if (key === 'oSVirtualHardDisk') {
                delete role[key].mediaLink;
                delete role[key].sourceImageName;
              }

              // Remove namespace in inner objects
              if (typeof role[key] === 'object') {
                prepareForExport(role[key]);
              }
            }
          };

          prepareForExport(found);

          if (found.dataVirtualHardDisks.length && !found.dataVirtualHardDisks[0].logicalUnitNumber) {
            found.dataVirtualHardDisks[0].logicalUnitNumber = '0';
          }

          progress.end();
          var roleAsString = JSON.stringify(found);
          fs.writeFile(filePath, roleAsString, function (err) {
            if (err) {
              return callback(err);
            } else {
              logger.info(util.format($('VM %s exported to %s'), vmName, filePath));
              return callback();
            }
          });

        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  listLocations: function (options, callback, logger) {
    var self = this;
    var managementClient = self.createManagementClient();
    var progress = self.cli.interaction.progress($('Getting locations'));

    managementClient.locations.list(function (error, response) {
      progress.end();
      if (error) {
        return callback(error);
      } else {
        var locations = response.locations;

        if (locations.length === 0) {
          logger.info($('No locations found'));
        } else {
          self.cli.interaction.formatOutput(locations, function (outputData) {
            if (outputData.length === 0) {
              logger.info($('No locations'));
            } else {
              logger.table(outputData, function (row, item) {
                row.cell($('Name'), item.name);
              });
            }
          });
        }

        return callback();
      }
    });

  },

  createEP: function (vmName, lbport, vmport, options, callback, logger) {
    var self = this;
    var endPointUtil = new EndPointUtil();
    var epInput = {};
    epInput.lbPort = {
      'value': lbport,
      'argName': 'lb-port'
    };

    if (vmport) {
      epInput.vmPort = {
        'value': vmport,
        'argName': 'vm-port'
      };
    }

    if (options.endpointName) {
      epInput.name = {
        'value': options.endpointName,
        'argName': '--endpoint-name'
      };
    }

    if (options.endpointProtocol) {
      epInput.protocol = {
        'value': options.endpointProtocol,
        'argName': '--endpoint-protocol'
      };
    }

    if (options.lbSetName) {
      epInput.lbSetName = {
        'value': options.lbSetName,
        'argName': '--lb-set-name'
      };
    }

    if (options.probePort) {
      epInput.probePort = {
        'value': options.probePort,
        'argName': '--probe-port'
      };
    }

    if (options.probeProtocol) {
      epInput.probeProtocol = {
        'value': options.probeProtocol,
        'argName': '--probe-protocol'
      };
    }

    if (options.probePath) {
      epInput.probePath = {
        'value': options.probePath,
        'argName': '--probe-path'
      };
    }

    if (options.enableDirectServerReturn) {
      epInput.directServerReturn = {
        'value': 'true',
        'argName': '--enable-direct-server-return'
      };
    }

    var result = endPointUtil.verifyAndGetEndPointObj(epInput, [], false); // endpoint parameters validation
    if (result.error) {
      return callback(new Error(result.error));
    }

    var newEndPoints = result.endPoint;

    var newEndPointsResult = endPointUtil.verifyEndPoints(newEndPoints);
    if (newEndPointsResult.error) {
      return callback(new Error(newEndPointsResult.error));
    }

    var computeManagementClient = self.createComputeManagementClient();

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          // Get all LB settings defined in this hosted service
          var lbsetConfigs = endPointUtil.getAllLBSettings(result.deployment.deploy.roles);
          // If any of the new endpoint has lb set name, if same lb settings is
          // defined for this hosted service then overwrite user provided lb
          // settings with this.
          for (var l = 0; l < newEndPoints.length; l++) {
            var lbSetName = newEndPoints[l].loadBalancedEndpointSetName;
            if (lbSetName) {
              lbSetName = lbSetName.toLowerCase();
              if (lbSetName in lbsetConfigs) {
                if (underscore.contains(lbsetConfigs[lbSetName].VmNames, name)) {
                  return callback(new Error(
                    util.format($('this VM already has an endpoint with lb set name %s. lb set name should be unique'),
                      lbSetName)));
                }

                logger.info(util.format($('cloud service already has an lb set defined with name %s, using this existing lb settings configuration'),
                  lbSetName));

                newEndPoints[l].loadBalancerProbe =
                  lbsetConfigs[lbSetName].ProbSettings;
                newEndPoints[l].enableDirectServerReturn =
                  lbsetConfigs[lbSetName].enableDirectServerReturn;
              }
            }
          }

          var progress = self.cli.interaction.progress($('Reading network configuration'));

          computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var persistentVMRole = response;
              var configurationSets = persistentVMRole.configurationSets;
              var m = 0;
              for (; m < configurationSets.length; m++) {
                if (configurationSets[m].configurationSetType === 'NetworkConfiguration') {
                  break;
                }
              }

              if (!configurationSets[m].inputEndpoints) {
                configurationSets[m].inputEndpoints = [];
              }

              var endpoints = configurationSets[m].inputEndpoints;
              var endpointCount = endpoints.length;

              for (var n = 0; n < endpointCount; n++) {
                var key = endpoints[n].port + ':' + endpoints[n].protocol;
                if (key in newEndPointsResult.protocolPorts) {
                  return callback(new Error(
                    util.format($('this VM already has a %s load balancer port %s. lb port and protocol together should be unique'),
                      endpoints[n].protocol, endpoints[n].port)));
                }

                key = endpoints[n].name.toLowerCase();
                if (key in newEndPointsResult.endPointNames) {
                  return callback(new Error(
                    util.format($('this VM already has an endpoint with name %s, endpoint name should unique'),
                      key)));
                }
              }

              configurationSets[m].inputEndpoints = configurationSets[m].inputEndpoints.concat(newEndPoints);

              progress = self.cli.interaction.progress($('Updating network configuration'));

              computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, persistentVMRole, function (error) {
                progress.end();
                return callback(error);
              });
            }
          });
        }
      }
    });
  },

  createMultipleEP: function (vmName, endpoints, options, callback, logger) {
    var self = this;
    var message = 'each endpoint in the endpoints argument should be of the form \r\n         <lb-port>[:<vm-port>[:<protocol>[:<enable-direct-server-return>[:<lb-set-name>[:<probe-protocol>[:<probe-port>[:<probe-path>]]]]]]] \r\n         and prob-path Should be relative';
    var endpointsAsList = endpoints.split(',');
    var inputEndpoints = [];
    var endPointUtil = new EndPointUtil();

    endpointsAsList.forEach(function (endpointInfoStr, j) {
      if (!endpointInfoStr) {
        return callback(new Error(message));
      }

      var endpointInfoAsList = endpointInfoStr.split(':');
      if (endpointInfoAsList.length > 8) {
        return callback(new Error(message));
      }

      var i = 0;
      var epInput = {};
      endpointInfoAsList.forEach(function (item) {
        if (!item) {
          return callback(new Error(message));
        }

        switch (i) {
        case 0:
          epInput.lbPort = {
            value: item,
            argName: 'lb-port'
          };
          break;
        case 1:
          epInput.vmPort = {
            value: item,
            argName: 'vm-port'
          };
          break;
        case 2:
          epInput.protocol = {
            value: item,
            argName: 'protocol'
          };
          break;
        case 3:
          epInput.directServerReturn = {
            value: item,
            argName: 'enable-direct-server-return'
          };
          break;
        case 4:
          epInput.lbSetName = {
            value: item,
            argName: 'lb-set-name'
          };
          break;
        case 5:
          epInput.probeProtocol = {
            value: item,
            argName: 'probe-protocol'
          };
          break;
        case 6:
          epInput.probePort = {
            value: item,
            argName: 'probe-port'
          };
          break;
        case 7:
          epInput.probePath = {
            value: item,
            argName: 'probe-path'
          };
          break;
        }

        i++;
      });

      j++;
      var result = endPointUtil.verifyAndGetEndPointObj(epInput, [], false);
      if (result.error) {
        return callback(new Error(util.format('%s (endpoint %s)', result.error, j)));
      }

      inputEndpoints.push(result.endPoint);
    });

    var newEndPoints = inputEndpoints;

    var newEndPointsResult = endPointUtil.verifyEndPoints(newEndPoints);
    if (newEndPointsResult.error) {
      return callback(new Error(newEndPointsResult.error));
    }

    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          // Get all LB settings defined in this hosted service
          var lbsetConfigs = endPointUtil.getAllLBSettings(result.deployment.deploy.roles);
          // If any of the new endpoint has lb set name, if same lb settings is
          // defined for this hosted service then overwrite user provided lb
          // settings with this.
          for (var l = 0; l < newEndPoints.length; l++) {
            var lbSetName = newEndPoints[l].loadBalancedEndpointSetName;
            if (lbSetName) {
              lbSetName = lbSetName.toLowerCase();
              if (lbSetName in lbsetConfigs) {
                if (underscore.contains(lbsetConfigs[lbSetName].VmNames, vmName)) {
                  return callback(new Error(
                    util.format($('this VM already has an endpoint with lb set name %s. lb set name should be unique'),
                      lbSetName)));
                }

                logger.info(util.format($('cloud service already has an lb set defined with name %s, using this existing lb settings configuration'),
                  lbSetName));

                newEndPoints[l].loadBalancerProbe =
                  lbsetConfigs[lbSetName].ProbSettings;
                newEndPoints[l].enableDirectServerReturn =
                  lbsetConfigs[lbSetName].EnableDirectServerReturn;
              }
            }
          }

          var progress = self.cli.interaction.progress($('Reading network configuration'));

          computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var persistentVMRole = response;
              var configurationSets = persistentVMRole.configurationSets;
              var m = 0;
              for (; m < configurationSets.length; m++) {
                if (configurationSets[m].configurationSetType === 'NetworkConfiguration') {
                  break;
                }
              }

              if (!configurationSets[m].inputEndpoints) {
                configurationSets[m].inputEndpoints = [];
              }

              var endpoints = configurationSets[m].inputEndpoints;
              var endpointCount = endpoints.length;

              for (var n = 0; n < endpointCount; n++) {
                var key = endpoints[n].port + ':' + endpoints[n].protocol;
                if (key in newEndPointsResult.protocolPorts) {
                  return callback(new Error(
                    util.format($('this VM already has a %s load balancer port %s. lb port and protocol together should be unique'),
                      endpoints[n].protocol, endpoints[n].port)));
                }

                key = endpoints[n].name.toLowerCase();
                if (key in newEndPointsResult.endPointNames) {
                  return callback(new Error(
                    util.format($('this VM already has an endpoint with name %s, endpoint name should unique'),
                      key)));
                }
              }

              configurationSets[m].inputEndpoints = configurationSets[m].inputEndpoints.concat(newEndPoints);
              progress = self.cli.interaction.progress($('Updating network configuration'));

              computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, persistentVMRole, function (error) {
                progress.end();
                return callback(error);
              });
            }
          });
        }
      }
    });
  },

  listEPs: function (name, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var role = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                if (role) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                role = roles[j];
              }
            }
          }
        }

        var endpointName = options.endpointName;

        if (role) {
          var networkConfigSet = getNetworkConfigSet(role, endpointName);
          if (!networkConfigSet.inputEndpoints) {
            if (logger.format().json) {
              logger.json([]);
            } else {
              logger.warn($('No VMs found'));
            }
            return callback();
          } else {
            logger.table(networkConfigSet.inputEndpoints, function (row, item) {
              row.cell('Name', item.name);
              row.cell('Protocol', item.protocol);
              row.cell('Public Port', item.port);
              row.cell('Private Port', item.localPort);
              row.cell('Virtual IP', item.virtualIPAddress || '');
              row.cell('EnableDirectServerReturn', item.enableDirectServerReturn);
              row.cell('Load Balanced', item.loadBalancedEndpointSetName ? 'Yes' : 'No');
            });
            return callback();
          }
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  showStaticIP: function (vmName, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var role = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === vmName) {
                if (role) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                role = roles[j];
              }
            }
          }
        }

        if (role) {
          var networkConfigSet = getNetworkConfigSet(role);

          var ipAddress = networkConfigSet.staticVirtualNetworkIPAddress;

          if (ipAddress) {
            var staticIPConfig = {
              Network: {
                StaticIP: ipAddress
              }
            };
            if (logger.format().json) {
              logger.json(staticIPConfig);
            } else {
              utils.logLineFormat(staticIPConfig, logger.data);
            }
          } else {
            logger.info(util.format($('No static IP address set for VM %s'), vmName));
          }
          return callback();
        } else {
          logger.warn($('No VMs found'));
        }
      }
    });
  },

  setStaticIP: function (vmName, ipAddress, options, callback) {
    var self = this;
    var progress;
    var vnetUtil = new VNetUtil();
    var parsedIp = vnetUtil.parseIPv4(ipAddress);
    if (parsedIp.error) {
      return callback(parsedIp.error);
    }

    var computeManagementClient = self.createComputeManagementClient(options);
    var networkClient = self.createNetworkClient();

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          var virtualNetworkName = result.deployment.deploy.virtualNetworkName;
          if (!virtualNetworkName) {
            return callback(new Error($('The VM does not belong to any virtual networks.')));
          }

          progress = self.cli.interaction.progress($('Looking up virtual network'));

          getNetworkInfo(networkClient, virtualNetworkName, function(error, networkInfo) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var subnetName = getIPAddressSubnet(networkInfo, ipAddress);
              if (subnetName && subnetName.error) {
                return callback(subnetName.error);
              }
              if (!subnetName) {
                return callback(new Error(util.format($('The static address %s doesn\'t belong to the address space defined by the role\'s subnets.'), ipAddress)));
              }

              progress = self.cli.interaction.progress($('Reading network configuration'));

              computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
                progress.end();
                if (error) {
                  return callback(error);
                } else {
                  var role = response;
                  var networkConfigSet = getNetworkConfigSet(role);

                  networkConfigSet.staticVirtualNetworkIPAddress = ipAddress;
                  networkConfigSet.subnetNames = [
                    subnetName
                  ];

                  progress = self.cli.interaction.progress($('Updating network configuration'));

                  computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, role, function (error) {
                    progress.end();
                    return callback(error);
                  });
                }
              });
            }
          });
        }
      }
    });
  },

  removeStaticIP: function (vmName, options, callback) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient(options);

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          var progress = self.cli.interaction.progress($('Reading network configuration'));

          computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var role = response;
              var networkConfigSet = getNetworkConfigSet(role);

              if (!networkConfigSet.staticVirtualNetworkIPAddress) {
                // Nothing to do
                return callback();
              }

              networkConfigSet.staticVirtualNetworkIPAddress = null;

              progress = self.cli.interaction.progress($('Updating network configuration'));

              computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, role, function (error) {
                progress.end();
                return callback(error);
              });
            }
          });
        }
      }
    });
  },

  showEP: function (name, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var role = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === name) {
                if (role) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                role = roles[j];
              }
            }
          }
        }

        var endpointName = options.endpointName;

        if (role) {
          var networkConfigSet = getNetworkConfigSet(role, endpointName);
          if (!networkConfigSet.inputEndpoints) {
            if (logger.format().json) {
              logger.json([]);
            } else {
              logger.warn($('No VMs found'));
            }
            return callback();
          } else {
            var endpointConfig = {
              Network: {
                Endpoints: networkConfigSet.inputEndpoints
              }
            };
            if (logger.format().json) {
              logger.json(endpointConfig);
            } else {
              utils.logLineFormat(endpointConfig, logger.data);
            }
            return callback();
          }
        } else {
          logger.warn($('No VMs found'));
          return callback();
        }
      }
    });
  },

  deleteEP: function (vmName, endpointName, options, callback) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          var progress = self.cli.interaction.progress($('Reading network configuration'));

          computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var persistentVMRole = response;
              var configurationSets = persistentVMRole.configurationSets;
              var m = 0;
              for (; m < configurationSets.length; m++) {
                if (configurationSets[m].configurationSetType === 'NetworkConfiguration') {
                  break;
                }
              }

              var endpoints = configurationSets[m].inputEndpoints;
              var i = -1;
              if (underscore.isArray(endpoints)) {
                i = 0;
                for (; i < endpoints.length; i++) {
                  if (utils.ignoreCaseEquals(endpoints[i].name, endpointName)) {
                    break;
                  }
                }
              }

              if ((i == -1) || (i == endpoints.length)) {
                return callback(util.format($('Endpoint %s not found in the network configuration'), endpointName));
              }

              configurationSets[m].inputEndpoints.splice(i, 1); // remove endpoint
              progress = self.cli.interaction.progress($('Updating network configuration'));

              // persistentVMRole contains vm role without specified endpoint, let's update role
              computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, persistentVMRole, function (error) {
                progress.end();
                return callback(error);
              });
            }
          });
        }
      }
    });
  },

  updateEP: function (vmName, endpointName, options, callback) {
    var self = this;
    var endPointUtil = new EndPointUtil();
    var epNew = {};

    if (options.newEndpointName) {
      var epNameRes = endPointUtil.validateEndPointName(options.newEndpointName, '--new-endpoint-name');
      if (epNameRes.error) {
        return callback(epNameRes.error);
      }

      epNew.name = epNameRes.endpointName;
    }

    if (options.lbPort) {
      var lbpRes = endPointUtil.validatePort(options.lbPort, '--lb-port');
      if (lbpRes.error) {
        return callback(lbpRes.error);
      }

      epNew.port = lbpRes.port;
    }

    if (options.vmPort) {
      var vmpRes = endPointUtil.validatePort(options.vmPort, '--vm-port');
      if (vmpRes.error) {
        return callback(vmpRes.error);
      }

      epNew.localPort = vmpRes.port;
    }

    if (options.endpointProtocol) {
      var eppRes = endPointUtil.validateProtocol(options.endpointProtocol, '--endpoint-protocol');
      if (eppRes.error) {
        return callback(eppRes.error);
      }

      epNew.protocol = eppRes.protocol;
    }

    if (underscore.isEmpty(epNew)) {
      return callback($('one of the optional parameter --new-endpoint-name, --lb-port, --vm-port or --endpoint-protocol is required'));
    }

    var computeManagementClient = self.createComputeManagementClient();

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var result = getVMDeployment(deployments, vmName);
        if (result.error) {
          return callback(result.error);
        } else {
          var progress = self.cli.interaction.progress($('Reading network configuration'));

          computeManagementClient.virtualMachines.get(result.deployment.svc, result.deployment.deploy.name, vmName, function (error, response) {
            progress.end();
            if (error) {
              return callback(error);
            } else {
              var persistentVMRole = response;
              var configurationSets = persistentVMRole.configurationSets;
              var m = 0;
              for (; m < configurationSets.length; m++) {
                if (configurationSets[m].configurationSetType === 'NetworkConfiguration') {
                  break;
                }
              }

              var endpoints = configurationSets[m].inputEndpoints;
              var i = -1;
              if (underscore.isArray(endpoints)) {
                i = 0;
                for (; i < endpoints.length; i++) {
                  if (utils.ignoreCaseEquals(endpoints[i].name, endpointName)) {
                    break;
                  }
                }
              }

              if ((i == -1) || (i == endpoints.length)) {
                return callback(util.format($('Endpoint %s not found in the network configuration'), endpointName));
              }

              var epToUpdate = configurationSets[m].inputEndpoints[i];
              if (epNew.name) {
                epToUpdate.name = epNew.name;
              }

              if (epNew.port) {
                epToUpdate.port = epNew.port;
              }

              if (epNew.localPort) {
                epToUpdate.localPort = epNew.localPort;
              }

              if (epNew.protocol) {
                epToUpdate.protocol = epNew.protocol;
              }

              var message = null;

              for (var j = 0; j < endpoints.length; j++) {
                if (i != j) {
                  if (utils.ignoreCaseEquals(endpoints[j].name, epToUpdate.name)) {
                    message = util.format($('An endpoint with name %s already exists'), epToUpdate.name);
                    break;
                  }

                  var portAsInt = parseInt(endpoints[j].port, 10);
                  if ((portAsInt == epToUpdate.port) && (utils.ignoreCaseEquals(endpoints[j].protocol, epToUpdate.protocol))) {
                    message = util.format($('this VM already has an %s load balancer port %s, lb port and protocol together should be unique'),
                      epToUpdate.protocol, epToUpdate.port);
                    break;
                  }
                }
              }

              if (message) {
                return callback(message);
              }

              configurationSets[m].inputEndpoints[i] = epToUpdate;
              progress = self.cli.interaction.progress($('Updating network configuration'));

              computeManagementClient.virtualMachines.update(result.deployment.svc, result.deployment.deploy.name, vmName, persistentVMRole, function (error) {
                progress.end();
                return callback(error);
              });
            }
          });
        }
      }
    });

  },

  uploadDataDisk: function (sourcePath, blobUrl, storageAccountKey, options, callback, logger) {
    var self = this;
    if (/^https?\:\/\//i.test(sourcePath)) {
      logger.verbose('Copying blob from ' + sourcePath);
      if (options.md5Skip || options.parallel !== 96 || options.baseVhd) {
        logger.warn('--md5-skip, --parallel and/or --base-vhd options will be ignored');
      }
      if (!options.forceOverwrite) {
        logger.warn('Any existing blob will be overwritten' + (blobUrl ? ' at ' + blobUrl : ''));
      }
      var progress = self.cli.interaction.progress('Copying blob');
      pageBlob.copyBlob(sourcePath, options.sourceKey, blobUrl, storageAccountKey, function (error, blob, response) {
        progress.end();
        logger.silly(util.inspect(response, null, null, true));
        if (!error) {
          logger.silly('Status : ' + response.copyStatus);
        }

        return callback(error);
      });
    } else {
      var uploadOptions = {
        verbose: self.cli.verbose ||
          logger.format().level === 'verbose' ||
          logger.format().level === 'silly',
        skipMd5: options.md5Skip,
        force: options.forceOverwrite,
        vhd: true,
        threads: options.parallel,
        parentBlob: options.baseVhd,
        exitWithError: callback,
        logger: logger
      };

      pageBlob.uploadPageBlob(blobUrl, storageAccountKey, sourcePath, uploadOptions, callback);
    }

  },

  attachDataDisk: function (vmName, diskImageName, options, callback, logger) {
    var self = this;

    self.diskAttachDetach({
      subscription: options.subscription,
      name: vmName,
      dnsName: options.dnsName,
      size: null,
      isDiskImage: true,
      url: diskImageName,
      attach: true,
      logger: logger
    }, callback);

  },

  attachNewDataDisk: function (vmName, size, blobUrl, options, callback, logger) {
    var self = this;

    var sizeAsInt = utils.parseInt(size);
    if (isNaN(sizeAsInt)) {
      return callback('size-in-gb must be an integer');
    }

    self.diskAttachDetach({
      subscription: options.subscription,
      name: vmName,
      dnsName: options.dnsName,
      size: sizeAsInt,
      isDiskImage: false,
      url: blobUrl,
      attach: true,
      logger: logger
    }, callback);

  },

  detachDataDisk: function (vmName, lun, options, callback, logger) {
    var self = this;

    var lunAsInt = utils.parseInt(lun);
    if (isNaN(lunAsInt)) {
      return callback('lun must be an integer');
    }

    self.diskAttachDetach({
      subscription: options.subscription,
      name: vmName,
      dnsName: options.dnsName,
      lun: lunAsInt,
      attach: false,
      logger: logger
    }, callback);

  },

  getDeployments: function (options, callback) {
    var self = this;
    var computeManagementClient = self.createComputeManagementClient();
    var deployments = [];

    var progress = self.cli.interaction.progress($('Getting virtual machines'));

    var getDeploymentSlot = function (hostedServices) {
      async.each(hostedServices, function (hostedService, cb) {
        computeManagementClient.deployments.getBySlot(hostedService.serviceName, 'Production', function (error, response) {
          if (error) {
            if (error.code === 'ResourceNotFound') {
              return cb(null);
            } else {
              return cb(error);
            }
          }

          var deployment = {
            svc: hostedService.serviceName,
            deploy: response
          };

          if (hostedService && hostedService.properties) {
            deployment.Location = hostedService.properties.location;
            deployment.AffinityGroup = hostedService.properties.affinityGroup;
          }

          deployments.push(deployment);

          cb(null);
        });
      }, function (err) {
        progress.end();
        return callback(err, deployments);
      });
    };

    // get deployment by slot. Checks which slots to query.
    options.dnsPrefix = options.dnsPrefix || utils.getDnsPrefix(options.dnsName, true);
    if (options.dnsPrefix) {
      getDeploymentSlot([{
        serviceName: options.dnsPrefix
      }]);
    } else {
      computeManagementClient.hostedServices.list(function (error, response) {
        if (error) {
          return callback(error);
        }

        return getDeploymentSlot(response.hostedServices);
      });
    }
  },

  diskAttachDetach: function (options, callback) {
    var self = this;
    var lookupOsDiskUrl = false;
    var diskInfo = {};
    var computeManagementClient = self.createComputeManagementClient();

    if (!options.isDiskImage) {
      if (!options.url || !url.parse(options.url).protocol) {
        // If the blob url is not provide or partially provided, we need see
        // what storage account is used by VM's OS disk.
        lookupOsDiskUrl = true;
      } else {
        diskInfo.mediaLinkUri = options.url;
      }
    } else {
      diskInfo.name = options.url;
    }

    self.getDeployments(options, function (error, deployments) {
      if (error) {
        return callback(error);
      } else {
        var found = null;

        for (var i = 0; i < deployments.length; i++) {
          var roles = deployments[i].deploy.roles;
          if (roles) {
            for (var j = 0; j < roles.length; j++) {
              if (roles[j].roleType === 'PersistentVMRole' &&
                roles[j].roleName === options.name) {
                if (found) {
                  // found duplicates, emit error
                  return callback(new Error($('VM name is not unique')));
                }
                found = deployments[i];
                found.dataVirtualHardDisks = roles[j].dataVirtualHardDisks;
                found.osDisk = roles[j].oSVirtualHardDisk;
              }
            }
          }
        }

        // got unique role under a deployment and service, add disk
        if (found) {
          var progress;
          if (options.attach) {
            // Check if we need to set the disk url based on the VM OS disk
            if (lookupOsDiskUrl) {
              if (options.url) {
                var parsed = url.parse(found.osDisk.mediaLink);
                diskInfo.mediaLinkUri = parsed.protocol + '//' + parsed.host + '/' + options.url;
              } else {
                diskInfo.mediaLinkUri = found.osDisk.mediaLink.slice(0, found.osDisk.mediaLink.lastIndexOf('/')) +
                  '/' + options.name + '-' + crypto.randomBytes(8).toString('hex') + '.vhd';
              }

              options.logger.verbose('Disk MediaLink: ' + diskInfo.mediaLinkUri);
            }

            var maxLun = -1;
            for (var k = 0; k < found.dataVirtualHardDisks.length; k++) {
              var lun = found.dataVirtualHardDisks[k].logicalUnitNumber ? parseInt(found.dataVirtualHardDisks[k].logicalUnitNumber, 10) : 0;
              maxLun = Math.max(maxLun, lun);
            }

            var nextLun = maxLun + 1;
            diskInfo.logicalUnitNumber = nextLun;

            if (options.size) {
              diskInfo.logicalDiskSizeInGB = options.size;
            } else {
              // computeManagementClient.virtualMachineDisks.createDataDisk
              // requires logicalDiskSizeInGB and mediaLinkUri parameters,
              // let's init it with dummy values (will be ignored by azure sdk)
              diskInfo.logicalDiskSizeInGB = 5;
              diskInfo.mediaLinkUri = 'http://dummy';
            }

            diskInfo.hostCaching = 'None';
            diskInfo.label = found.svc + '-' + found.deploy.name + '-' + options.name + '-' + nextLun;
            options.logger.verbose('Disk Lun: ' + nextLun);
            options.logger.verbose('Disk Label: ' + diskInfo.label);

            progress = self.cli.interaction.progress('Adding Data-Disk');

            computeManagementClient.virtualMachineDisks.createDataDisk(found.svc, found.deploy.name, options.name, diskInfo, function (error) {
              progress.end();
              // TODO: azure sdk returns empty 'Error' object if operation completed successfully
              if (error && error.message === '') {
                return callback(null);
              }
              return callback(error);
            });
          } else {
            progress = self.cli.interaction.progress('Removing Data-Disk');

            computeManagementClient.virtualMachineDisks.deleteDataDisk(found.svc, found.deploy.name, options.name, options.lun, {}, function (error) {
              progress.end();
              return callback(error);
            });
          }
        } else {
          options.logger.warn('No VMs found');
          return callback();
        }
      }
    });
  },

  createServiceManagementService: function () {
    var self = this;
    return utils.createServiceManagementService(profile.current.getSubscription(self.subscription), self.cli.output);
  },

  createComputeManagementClient: function () {
    var self = this;
    return utils._createComputeClient(profile.current.getSubscription(self.subscription), self.cli.output);
  },

  createManagementClient: function () {
    var self = this;
    return utils._createManagementClient(profile.current.getSubscription(self.subscription), self.cli.output);
  },

  createStorageClient: function () {
    var self = this;
    return utils._createStorageClient(profile.current.getSubscription(self.subscription), self.cli.output);
  },

  createNetworkClient: function () {
    var self = this;
    return utils._createNetworkClient(profile.current.getSubscription(self.subscription), self.cli.output);
  },

  createDockerVM: function (dnsName, imageName, userName, password, options, callback, logger) {
    var self = this;
    if (userName.toLowerCase() === 'docker') {
      return callback(new Error($('docker is not valid username for docker vm. Please specify another username.')));
    }

    var dnsPrefix = utils.getDnsPrefix(dnsName);
    var vmSize = getVMSize(options, logger);

    if (options.ssh) {
      if (typeof options.ssh === 'boolean') {
        options.ssh = 22;
      } else if ((options.ssh != parseInt(options.ssh, 10)) || (options.ssh > 65535)) {
        return callback(new Error($('--ssh [port] must be an integer less than or equal to 65535')));
      }
    } else if (!options.sshPassword || options.sshCert) {
      return callback(new Error($('--no-ssh-password and --ssh-cert can only be used with --ssh parameter')));
    }

    if (!options.sshPassword && !options.sshCert) {
      return callback(new Error($('--no-ssh-password can only be used with the --ssh-cert parameter')));
    }

    if (options.staticIp) {
      var vnetUtil = new VNetUtil();
      var parsedIp = vnetUtil.parseIPv4(options.staticIp);
      if (parsedIp.error) {
        return callback(parsedIp.error);
      }
      if (!options.virtualNetworkName) {
        return callback(new Error($('--virtual-network-name must be specified when the --static-ip option is given')));
      }
      if (options.subnetNames) {
        logger.warn($('--static-ip, --subnet-names will be ignored and the static ip subnet will be used'));
        options.subnetNames = null;
      }
    }

    if ((options.dockerPort && typeof options.dockerPort === 'boolean') || !options.dockerPort) {
      options.dockerPort = 4243;
    }

    if ((options.dockerCertDir && typeof options.dockerCertDir === 'boolean') || !options.dockerCertDir) {
      var homePath = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
      options.dockerCertDir = path.join(homePath, '.docker');
    }

    var computeManagementClient = self.createComputeManagementClient();
    var managementClient = self.createManagementClient();
    var storageClient = self.createStorageClient();
    var networkClient = self.createNetworkClient();

    options.userName = userName;
    options.password = password;
    options.size = vmSize;
    options.dnsPrefix = dnsPrefix;
    options.imageName = imageName;
    options.noSshPassword = options.sshPassword === false;
    options.logger = logger;
    options.computeManagementClient = computeManagementClient;
    options.managementClient = managementClient;
    options.storageClient = storageClient;
    options.networkClient = networkClient;

    return createDockerVM(dnsName, options, logger, self.cli, callback);
  },

  listExtensions: function(options, callback, logger) {
    var self = this;
    var context = {
      options: options,
      cli: self.cli,
      computeManagementClient: self.createComputeManagementClient(),
      logger: logger
    };

    async.series([
      _.bind(validateExtNamePublisher, context),
      _.bind(runListExtensionCommand, context)
    ], function(err) {
      return callback(err);
    });

    // if version or all-versions is given then publisher and
    // extension name are mandatory
    function validateExtNamePublisher(cb) {
      var self = this;

      if(self.options.version || self.options.allVersions) {
        async.series([
          _.bind(self.cli.interaction.promptIfNotGiven,
            self.cli.interaction,
            $('Extension name: '),
            self.options.extensionName),
          _.bind(self.cli.interaction.promptIfNotGiven,
            self.cli.interaction,
            $('Publisher name: '),
            self.options.publisherName)
        ], function(err, results) {
          if(!results || !results.length || results.length < 2 ||
            !results[0] || !results[1]) {
            cb(new Error($('--name and --publisher must be specified when --version or --all-versions options are used')));
            return;
          }

          self.options.extensionName = results[0];
          self.options.publisherName = results[1];
          cb();
        });
      } else {
        cb();
      }
    }

    function runListExtensionCommand(cb) {
      var self = this;
      var context = _.defaults(self, {
        progress: self.cli.interaction.progress($('Getting extensions'))
      });

      // if options.version or options.allVersions is set invoke the "listVersions" api
      // else call the "list" api
      if(self.options.version || self.options.allVersions) {
        runListExtensionListVersionsCommand.call(context, cb);
      } else {
        runListExtensionListCommand.call(context, cb);
      }
    }

    function runListExtensionListVersionsCommand(cb) {
      var self = this;

      self.computeManagementClient.virtualMachineExtensions.listVersions(
        self.options.publisherName,
        self.options.extensionName,
        function(err, result) {
          self.progress.end();

          if(err) {
            cb(err);
            return;
          }

          // filter for given version number if one has been provided
          if(result.resourceExtensions.length && self.options.version) {
            var version = self.options.version;

            result.resourceExtensions = _.filter(result.resourceExtensions, function(ext) {
              return version === ext.version;
            });
          }

          printExtensionList.call(self, result.resourceExtensions);
          cb();
        });
    }

    function runListExtensionListCommand(cb) {
      var self = this;

      self.computeManagementClient.virtualMachineExtensions.list(function(err, result) {
        self.progress.end();

        if(err) {
          cb(err);
          return;
        }

        // filter for extension or publisher name if provided; note that if both
        // extension *and* publisher name are given we still do an OR match which
        // means that all extensions where either of the 2 attributes that match
        // will be returned
        if(result.resourceExtensions.length &&
          (self.options.extensionName || self.options.publisherName)) {
          var extName = self.options.extensionName;
          var pubName = self.options.publisherName;

          result.resourceExtensions = _.filter(result.resourceExtensions, function(ext) {
            return utils.ignoreCaseEquals(extName, ext.name) ||
              utils.ignoreCaseEquals(pubName, ext.publisher);
          });
        }

        printExtensionList.call(self, result.resourceExtensions);
        cb();
      });
    }

    function printExtensionList(resourceExtensions) {
      var self = this;

      self.cli.interaction.formatOutput(resourceExtensions, function (extensions) {
        if (extensions.length === 0) {
          if (self.logger.format().json) {
            self.logger.json([]);
          } else {
            self.logger.info($('No extensions found'));
          }
        } else {
          self.logger.table(extensions, function (row, item) {
            row.cell($('Publisher'), item.publisher, null, 20);
            row.cell($('Extension name'), item.name, null, 15);
            row.cell($('Description'), item.description, null, 25);
            row.cell($('Version'), item.version);
          });
        }
      });
    }
  },

  setExtension: function(vmName, extensionName, publisherName, version, options, callback) {
    var self = this;

    // if there's no extension and publisher name are mandatory
    if(!extensionName || !publisherName || !version) {
      return callback(
        new Error($('Extension name, publisher name and version are required.')));
    }

    // get list of vms
    self.getDeployments(options, function (error, deployments) {
      if(error) {
        return callback(error);
      }

      // find the vm we're interested in
      var result = getVMDeployment(deployments, vmName);
      if(result.error) {
        return callback(result.error);
      }

      // check if guest agent is enabled on the VM
      var role = _.find(result.deployment.deploy.roles, function(r) {
        return utils.ignoreCaseEquals(r.roleName, vmName);
      });
      if(!role.provisionGuestAgent) {
        return callback(
          new Error($('Provision Guest Agent must be enabled on the VM before setting VM Extension.')));
      }

      // if the extension being set is already set on the vm then
      // reuse the reference name from that if there's no reference
      // name set
      var extension = lookupExtension(role.resourceExtensionReferences);
      if(!options.referenceName && extension && extension.referenceName) {
        options.referenceName = extension.referenceName;
      }

      // assign this extension configuration to the role
      var isLegacy = isLegacyExtension(extensionName, publisherName, version);
      async.series([
        _.bind(loadConfig, self, options, 'publicConfigPath', 'publicConfig'),
        _.bind(loadConfig, self, options, 'privateConfigPath', 'privateConfig'),
        function configureExtension(cb) {
          // add this extension to the role if this is a new extension
          if(!extension) {
            extension = {};
            role.resourceExtensionReferences.push(extension);
          }

          extension = _.extend(extension, {
            referenceName: options.referenceName ? options.referenceName : extensionName,
            publisher: publisherName,
            name: extensionName,
            version: version,
            state: isLegacy ? null :
              options.uninstall ? 'Uninstall' :
                options.disable ? 'Disable' : 'Enable',
            resourceExtensionParameterValues: []
          });

          if(options.publicConfig) {
            extension.resourceExtensionParameterValues.push({
              key: extension.name + (isLegacy ? '' : 'Public') + 'ConfigParameter',
              value: options.publicConfig,
              type: isLegacy ? null : 'Public'
            });
          }

          if(options.privateConfig) {
            extension.resourceExtensionParameterValues.push({
              key: extension.name + (isLegacy ? '' : 'Private') + 'ConfigParameter',
              value: options.privateConfig,
              type: isLegacy ? null : 'Private'
            });
          }

          // update the vm
          var progress = self.cli.interaction.progress(getProgressMsg(extension));
          var computeManagementClient = self.createComputeManagementClient(options);
          computeManagementClient.virtualMachines.update(
              result.deployment.svc,
              result.deployment.deploy.name,
              vmName, role, function (error) {
            progress.end();
            return cb(error);
          });
        }
      ], function(err) {
        return callback(err);
      });
    });

    function getProgressMsg(extension) {
      switch(extension.state) {
        case 'Disable':
          return $('Disabling vm extension');
        case 'Uninstall':
          return $('Uninstalling vm extension');
        default:
          return $('Updating vm extension');
      }
    }

    function loadConfig(options, propFrom, propTo, cb) {
      if(options[propFrom]) {
        fs.readFile(options[propFrom], function(err, data) {
          if(!err) {
            options[propTo] = data.toString();
          }

          cb(err);
        });
      } else {
        cb();
      }
    }

    function isLegacyExtension(name, publisher, version) {
      if(!VMClient.legacyExtensions) {
        VMClient.legacyExtensions = [
          {
            name: 'VMAccessAgent',
            publisher: 'Microsoft.Compute',
            version: '0.1'
          },
          {
            name: 'DiagnosticsAgent',
            publisher: 'Microsoft.Compute',
            version: '0.1'
          }
        ];
      }

      return _.find(VMClient.legacyExtensions, function(e) {
        return utils.ignoreCaseEquals(e.name, name) &&
          utils.ignoreCaseEquals(e.publisher, publisher) &&
          utils.ignoreCaseEquals(e.version, version);
      });
    }

    function lookupExtension(extensionRefs) {
      // if there's an extension name then we match on that and publisher name;
      // if not then we match on reference name
      if(!extensionName) {
        return _.find(extensionRefs, function(r) {
          return utils.ignoreCaseEquals(options.referenceName, r.referenceName);
        });
      } else {
        return _.find(extensionRefs, function(r) {
          return utils.ignoreCaseEquals(extensionName, r.name) &&
            utils.ignoreCaseEquals(publisherName, r.publisher);
        });
      }
    }
  },

  getExtensions: function(vmName, options, callback, logger) {
    var self = this;
    self.getDeployments(options, function (error, deployments) {
      if(error) {
        return callback(error);
      }

      var result = getVMDeployment(deployments, vmName);
      if(result.error) {
        return callback(result.error);
      }

      var role = _.find(result.deployment.deploy.roles, function(r) {
        return utils.ignoreCaseEquals(r.roleName, vmName);
      });

      var extensionRefs = role.resourceExtensionReferences;
      var allExtensions = !(options.referenceName || options.extensionName || options.publisherName);
      if (!allExtensions && extensionRefs) {
        extensionRefs = _.filter(extensionRefs, function(r) {
          return utils.ignoreCaseEquals(options.extensionName, r.name) ||
            utils.ignoreCaseEquals(options.publisherName, r.publisher) ||
            utils.ignoreCaseEquals(options.referenceName, r.referenceName);
          });
      }

      self.cli.interaction.formatOutput(extensionRefs, function (extensions) {
        if (!extensionRefs || extensions.length === 0) {
          if (logger.format().json) {
            logger.json([]);
          } else {
            logger.info($('No extensions found'));
          }
        } else {
          logger.table(extensions, function (row, item) {
            row.cell($('Publisher'), item.publisher, null, 20);
            row.cell($('Extension name'), item.name, null, 15);
            row.cell($('ReferenceName'), item.referenceName, null, 25);
            row.cell($('Version'), item.version);
            row.cell($('State'), item.state);
          });
        }
      });

      return callback();
    });
  }
});

// default service options
var svcParams = {
  label: '',
  description: 'Implicitly created hosted service'
};

// helpers methods
function createVMView(role, deployment) {
  var roleInstance = getRoleInstance(role.roleName, deployment.deploy);
  var networkConfigSet = getNetworkConfigSet(role);

  return {
    DNSName: url.parse(deployment.deploy.uri).host,
    Location: deployment.Location,
    AffinityGroup: deployment.AffinityGroup,
    VMName: role.roleName,
    IPAddress: roleInstance.iPAddress || '',
    InstanceStatus: roleInstance.instanceStatus,
    InstanceSize: roleInstance.instanceSize,
    /* InstanceStateDetails: roleInstance.InstanceStateDetails,  this property is deprecated */
    /* AvailabilitySetName: role.AvailabilitySetName, this property is deprecated */
    /* OSVersion: role.OsVersion, this property is deprecated */
    Image: role.oSVirtualHardDisk.sourceImageName,
    OSDisk: role.oSVirtualHardDisk,
    DataDisks: role.dataVirtualHardDisks,
    ReservedIPName: deployment.deploy.reservedIPName || '',
    VirtualIPAddresses: deployment.deploy.virtualIPAddresses ? deployment.deploy.virtualIPAddresses : [],
    Network: {
      Endpoints: (networkConfigSet ? networkConfigSet.inputEndpoints : {})
    }
  };
}

function getRoleInstance(roleName, deployment) {
  for (var i = 0; i < deployment.roleInstances.length; i++) {
    if (deployment.roleInstances[i].roleName === roleName) {
      return deployment.roleInstances[i];
    }
  }
}

function getNetworkConfigSet(role, endpointName) {
  for (var i = 0; i < role.configurationSets.length; i++) {
    var configSet = role.configurationSets[i];
    if (configSet.configurationSetType === 'NetworkConfiguration') {
      if (endpointName) {
        var endpointSet;
        for (var j = 0; j < configSet.inputEndpoints.length; j++) {
          if (configSet.inputEndpoints[j].name === endpointName) {
            endpointSet = {
              LocalPort: configSet.inputEndpoints[j].localPort,
              Name: configSet.inputEndpoints[j].name,
              Port: configSet.inputEndpoints[j].port,
              Protocol: configSet.inputEndpoints[j].protocol,
              Vip: configSet.inputEndpoints[j].virtualIPAddress,
              EnableDirectServerReturn: configSet.inputEndpoints[j].enableDirectServerReturn
            };
            break;
          }
        }
        configSet.inputEndpoints = [endpointSet];
      }
      return configSet;
    }
  }
}

function loadCustomData(udfile, logger) {
  if (udfile) {
    logger.verbose('loading customdata from:' + udfile);
    return fs.readFileSync(udfile).toString('base64');
  } else {
    logger.verbose('no customData option');
    return null;
  }
}

function getNetworkInfo(networkManagementClient, vnet, callback) {
  networkManagementClient.networks.list(function(error, response) {
    if (error) {
      return callback(error);
    } else {
      var virtualNetworkSites = response.virtualNetworkSites;
      var virtualNetworkSite = null;
      for (var i = 0; i < virtualNetworkSites.length; i++) {
        if (utils.ignoreCaseEquals(virtualNetworkSites[i].name, vnet)) {
          virtualNetworkSite = virtualNetworkSites[i];
          break;
        }
      }

      if (virtualNetworkSite) {
        callback(null, virtualNetworkSite);
      } else {
        callback(new Error(util.format($('Virtual network with name %s not found'), vnet)));
      }
    }
  });
}

function getIPAddressSubnet(networkInfo, ipAddress) {
  // Figure out which subnet the given ip address belongs to
  var vnetUtil = new VNetUtil();
  var parsedIp = vnetUtil.parseIPv4(ipAddress);
  if (parsedIp.error)
    return { error: parsedIp.error };

  var subnetName;
  for (var i = 0; i < networkInfo.subnets.length; i++) {
    var parsedSubnet = vnetUtil.parseIPv4Cidr(networkInfo.subnets[i].addressPrefix, networkInfo.subnets[i].name);
    if (parsedSubnet.error)
      return { error: parsedSubnet.error };

    var subnetMask = vnetUtil.getNetworkMaskFromCIDR(parsedSubnet.cidr);
    if (subnetMask.error)
      return { error: subnetMask.error };

    var ipRange = vnetUtil.getIPRange(parsedSubnet.octects, subnetMask.octects);
    if (vnetUtil.isIPInRange(ipRange.start, ipRange.end, parsedIp.octects)) {
      subnetName = networkInfo.subnets[i].name;
      break;
    }
  }

  return subnetName;
}

function createVM(options, callback, logger, cli) {
  var deploymentParams = {
    name: options.dnsPrefix,
    label: options.dnsPrefix,
    deploymentSlot: 'Production',
    virtualNetworkName: options.virtualNetworkName
  };

  if (options.reservedIp)
    deploymentParams.reservedIPName = options.reservedIp;

  var role;
  var image;
  var provisioningConfig;
  var progress;
  var dnsPrefix;
  var location;
  var affinityGroup;
  var hostedServiceCreated = false;
  var communityImgInfo = {
    created: false,
    name: null,
    blobUrl: null
  };

  dnsPrefix = options.dnsPrefix;

  function cmdCallbackHook(error) {
    if (communityImgInfo.created) {
      // cleanup community image
      var imageHelper = require('../iaas/image');
      var imageDelete = imageHelper.delete(imageHelper.OSIMAGE, cli);
      var deleteOptions = {
        blobDelete: true,
        subscription: options.subscription
      };

      imageDelete(communityImgInfo.name, deleteOptions, function (imgDelErr) {
        if (imgDelErr) {
          // Show message to user that image clean up failed but vm creation
          // succeeded
          if (!error) {
            logger.error(util.format($('though VM creation succeeded failed to cleanup the image'), communityImgInfo.name));
          } else {
            logger.error($('failed to cleanup the image'));
          }
        }

        if (error) {
          return cleanupHostedServiceAndExit(error);
        } else {
          return callback();
        }
      });
    } else {
      if (error) {
        return cleanupHostedServiceAndExit(error);
      } else {
        return callback();
      }
    }
  }

  function copyAndRegCommunityImgIfRequired(callback) {
    if (options.community) {
      var imageHelper = require('../iaas/image');
      var imageCreate = imageHelper.create(imageHelper.OSIMAGE, cli);
      var imageCreateOptions = {
        os: 'Linux',
        blobUrl: options.imageTarget,
        location: options.location,
        affinityGroup: options.affinityGroup,
        subscription: options.subscription
      };

      imageCreate(communityImgInfo.name, communityImgInfo.blobUrl, imageCreateOptions, function (error) {
        if (error) {
          return cmdCallbackHook(error);
        }

        communityImgInfo.created = true;

        lookupImage(options.computeManagementClient, communityImgInfo.name, options.logger, cli, function (error, comImage) {
          if (error) {
            return cmdCallbackHook(error);
          }

          // set the global image reference
          image = comImage;
          options.imageName = communityImgInfo.name;
          return callback();
        });
      });
    } else {
      return callback();
    }
  }

  // Load the roleFile if provided
  if (options.role) {
    role = options.role;
    logger.silly('role', role);
    if (options.sshCert) {
      // verify that the pem file exists and is valid before creating anything
      loadSshCert(options, logger, function (loadSshErr, newPemSshCert, newSshFingerprint) {
        if (loadSshErr) {
          return callback(loadSshErr);
        }

        options.pemSshCert = newPemSshCert;
        options.sshFingerprint = newSshFingerprint;
        createHostedService(dnsPrefix, options, logger, cli, function (hostedServiceError, alreadyExists) {
          if (hostedServiceError) {
            return callback(hostedServiceError);
          }

          if (alreadyExists) {
            return createDeploymentInExistingHostedService();
          }

          hostedServiceCreated = true;
          createDeployment(options.computeManagementClient);
        });
      });
    } else {
      createHostedService(dnsPrefix, options, logger, cli, function (hostedServiceError, alreadyExists) {
        if (hostedServiceError) {
          return callback(hostedServiceError);
        }

        if (alreadyExists) {
          return createDeploymentInExistingHostedService();
        }

        hostedServiceCreated = true;
        createDeployment(options.computeManagementClient);
      });
    }
  } else {
    if (options.community) {
      progress = cli.interaction.progress($('Looking up community image'));
      var managementEndPoint = profile.current.getSubscription(options.subscription).managementEndpointUrl;
      var communityUtil = new CommunityUtil(managementEndPoint);
      communityUtil.resolveUid(options.imageName, function (error, response) {
        progress.end();

        if (!error) {
          var comResult = (response.body.d || response.body.value)[0];
          communityImgInfo.name = options.imageName + '-' + crypto.randomBytes(4).toString('hex');
          communityImgInfo.blobUrl = comResult.BlobUrl;

          verifyUserNameAndPwd('linux', options, logger, cli, function (error) {
            if (error) {
              return callback(error);
            }

            verifyCertFingerPrint('linux', options, logger, function (certErr, newPemSshCert, newSshFingerprint) {
              if (certErr) {
                return callback(certErr);
              }

              options.pemSshCert = newPemSshCert;
              options.sshFingerprint = newSshFingerprint;
              // Note: at this point we have verified that the community image exists in the remote
              // image repository, copying this image to user's subscription will happen before
              // creating the deployment.

              createHostedService(dnsPrefix, options, logger, cli, function (hostedServiceError, alreadyExists) {
                if (hostedServiceError) {
                  return callback(hostedServiceError);
                }

                if (alreadyExists) {
                  return createDeploymentInExistingHostedService();
                }

                hostedServiceCreated = true;
                createDeployment(options.computeManagementClient);
              });
            });
          });
        } else {
          return callback(new Error($('Failed to validate Community image')));
        }
      });
    } else {
      lookupImage(options.computeManagementClient, options.imageName, logger, cli, function (imgErr, foundImage) {
        if (imgErr) {
          return callback(imgErr);
        }

        image = foundImage;
        verifyUserNameAndPwd(image.operatingSystemType, options, logger, cli, function (error) {
          if (error) {
            return callback(error);
          }

          verifyCertFingerPrint(image.operatingSystemType, options, logger, function (certErr, newPemSshCert, newSshFingerprint) {
            if (certErr) {
              return callback(certErr);
            }


            options.pemSshCert = newPemSshCert;
            options.sshFingerprint = newSshFingerprint;
            createHostedService(dnsPrefix, options, logger, cli, function (hostedServiceError, alreadyExists) {
              if (hostedServiceError) {
                return callback(hostedServiceError);
              }

              if (alreadyExists) {
                return createDeploymentInExistingHostedService();
              }

              hostedServiceCreated = true;
              createDeployment(options.computeManagementClient);
            });
          });
        });
      });
    }
  }

  function createDeploymentInExistingHostedService() {
    if (options.location) {
      logger.warn($('--location option will be ignored'));
    }
    if (options.affinityGroup) {
      logger.warn($('--affinity-group option will be ignored'));
    }

    var computeManagementClient = options.computeManagementClient;
    // get cloud service properties
    progress = cli.interaction.progress($('Getting cloud service properties'));

    computeManagementClient.hostedServices.get(dnsPrefix, function (error, response) {
      progress.end();
      if (error) {
        return callback(error);
      } else {
        logger.verbose($('Cloud service properties:'));
        logger.json('verbose', response);
        location = response.properties.location;
        affinityGroup = response.properties.affinityGroup;

        // check for existing production deployment
        progress = cli.interaction.progress($('Looking up deployment'));
        computeManagementClient.deployments.getBySlot(dnsPrefix, 'Production', function (error, response) {
          progress.end();
          if (error) {
            if (error.statusCode === 404) {
              // There's no production deployment.  Create a new deployment.
              /*jshint camelcase:false*/
              var createDeployment_ = function () {
                progress = cli.interaction.progress($('Creating VM'));

                deploymentParams.roles = [role];
                deploymentParams.deploymentSlot = 'Production';

                computeManagementClient.virtualMachines.createDeployment(dnsPrefix, deploymentParams, function (error) {
                  progress.end();
                  if (!error) {
                    logger.info('OK');
                    return cmdCallbackHook(null);
                  } else {
                    return cmdCallbackHook(error);
                  }
                });
              };

              copyAndRegCommunityImgIfRequired(function () {
                if (!role) {
                  createRole(null, dnsPrefix, image, options, logger, cli, function (createRoleError, newRole) {
                    if (createRoleError) {
                      callback(new Error(createRoleError));
                    }

                    role = newRole;
                    createDeployment_();
                  });
                } else {
                  createDeployment_();
                }
              });
            } else {
              return callback(error);
            }
          } else {
            // There's existing production deployment.  Add a new role if --connect was specified.
            var hookEx = false;
            if (!options.connect) {
              logger.help($('Specify --connect option to connect the new VM to an existing VM'));
              hookEx = true;
              return callback(util.format($('A VM with dns prefix "%s" already exists'), dnsPrefix));
            }

            var addRoleInternal = function () {
              logger.verbose($('Adding a VM to existing deployment'));
              progress = cli.interaction.progress('Creating VM');

              computeManagementClient.virtualMachines.create(dnsPrefix, response.name, role, function (error) {
                progress.end();
                return cmdCallbackHook(error);
              });
            };

            var roleList = response.roles;
            var maxNum = 0;
            if (roleList) {
              maxNum = 1;
              for (var i = 0; i < roleList.length; i++) {
                var numSplit = roleList[i].roleName.split('-');
                if (numSplit.length > 1) {
                  // did it start with dnsPrefix? If not, ignore.
                  var leftSplit = numSplit.slice(0, -1).join('-');
                  if (leftSplit === dnsPrefix.slice(0, leftSplit.length)) {
                    var num = parseInt(numSplit[numSplit.length - 1], 10);
                    if (!isNaN(num) && num !== num + 1 && num > maxNum) { // number that is not too big
                      maxNum = num;
                    }
                  }
                }
              }
            }

            copyAndRegCommunityImgIfRequired(function () {
              if (!hookEx) {
                if (!role) {
                  var tag = '-' + (maxNum + 1);
                  var vmName = image.operatingSystemType.toLowerCase() === 'linux' ? dnsPrefix : dnsPrefix.slice(0, 15 - tag.length);
                  vmName += tag;
                  createRole(vmName, dnsPrefix, image, options, logger, cli, function (createRoleError, newRole) {
                    if (createRoleError) {
                      callback(new Error(createRoleError));
                    }

                    role = newRole;
                    addRoleInternal();
                  });
                } else {
                  addRoleInternal();
                }
              }
            });

          }
        });
      }
    });
  }

  function createDeployment(computeManagementClient) {
    /*jshint camelcase:false*/

    function createDeploymentInternal() {
      progress = cli.interaction.progress($('Creating VM'));

      deploymentParams.roles = [role];
      deploymentParams.deploymentSlot = 'Production';

      computeManagementClient.virtualMachines.createDeployment(dnsPrefix, deploymentParams, function (error) {
        progress.end();
        if (error) {
          return cmdCallbackHook(error);
        } else {
          return cmdCallbackHook(error);
        }
      });

    }

    // At this point we have a valid cloud service (existing or new one)
    // copy the community image if required.
    copyAndRegCommunityImgIfRequired(function () {
      if (!role) {
        createRole(null, dnsPrefix, image, options, logger, cli, function (createRoleError, newRole) {
          if (createRoleError) {
            callback(new Error(createRoleError));
          }

          role = newRole;
          createDeploymentInternal();
        });
      } else {
        if (options.sshCert && options.pemSshCert) {
          progress = cli.interaction.progress($('Configuring certificate'));
          configureCert(dnsPrefix, provisioningConfig, options.pemSshCert, options.sshFingerprint, options, logger, function (error) {
            progress.end();
            if (error) {
              return callback(error);
            }
            createDeploymentInternal();
          });
        } else {
          createDeploymentInternal();
        }
      }
    });
  }

  function cleanupHostedServiceAndExit(error) {
    var computeManagementClient = options.computeManagementClient;
    if (hostedServiceCreated) {
      logger.verbose(util.format($('Error occurred. Deleting %s cloud service'), options.dnsPrefix));

      progress = cli.interaction.progress($('Deleting cloud service'));

      computeManagementClient.hostedServices.delete(options.dnsPrefix, function (err) {
        progress.end();
        if (err) {
          logger.warn(util.format($('Error deleting %s cloud service'), options.dnsPrefix));
          logger.json('verbose', err);
        } else {
          logger.verbose(util.format($('Cloud service %s deleted'), options.dnsPrefix));
        }
        return callback(error);
      });
    } else {
      return callback(error);
    }
  }
}

function deleteHostedServiceIfEmpty(computeManagementClient, dnsPrefix, cli, callback) {
  // delete cloud service if it has no deployments
  computeManagementClient.hostedServices.getDetailed(dnsPrefix, function (error, response) {
    if (error) {
      return callback(error);
    } else {
      if (response.deployments.length === 0) {
        var progress = cli.interaction.progress($('Deleting Cloud Service'));
        computeManagementClient.hostedServices.delete(dnsPrefix, function (error) {
          progress.end();
          if (error) {
            return callback(error);
          } else {
            return callback();
          }
        });
      } else {
        return callback();
      }
    }
  });
}

function deleteRoleOrDeployment(computeManagementClient, svcname, deployment, vmName, options, cli, callback, progress) {
  // if more than 1 role in deployment - then delete role, else delete deployment
  var deleteFromStorage = options.blobDelete || false;

  if (deployment.roles.length > 1) {
    computeManagementClient.virtualMachines.delete(svcname, deployment.name, vmName, deleteFromStorage, function (error) {
      progress.end();
      return callback(error);
    });
  } else {
    computeManagementClient.deployments.deleteByName(svcname, deployment.name, deleteFromStorage, function (error) {
      progress.end();
      if (error) {
        return callback(error);
      } else {
        deleteHostedServiceIfEmpty(computeManagementClient, svcname, cli, callback);
      }
    });
  }
}

function getVMDeployment(deployments, vmName) {
  var found = null;

  var result = function (error) {
    return (error ? {
      error: error
    } : {
      error: null,
      'deployment': found.deployment,
      'roleInstance': found.roleInstance
    });
  };

  for (var i = 0; i < deployments.length; i++) {
    var roles = deployments[i].deploy.roles;
    if (roles) {
      for (var j = 0; j < roles.length; j++) {
        if (roles[j].roleType === 'PersistentVMRole' &&
          utils.ignoreCaseEquals(roles[j].roleName, vmName)) {
          if (found) {
            // found duplicates
            return result($('VM name is not unique'));
          }

          found = {
            'deployment': deployments[i],
            'roleInstance': getRoleInstance(roles[j].roleName, deployments[i].deploy)
          };
        }
      }
    }
  }

  if (!found) {
    return result($('No VMs found'));
  }

  return result(null);
}

function setVMExtension(role, name, publisher, version, referenceName, state, privateConfigurationValue, publicConfigurationValue, callback) {

  if (!role) {
    return callback($('Specify role param'));
  }

  if (!role.resourceExtensionReferences) {
    role.resourceExtensionReferences = [];
  }

  var extension = {
    name: name,
    publisher: publisher,
    version: version,
    referenceName: referenceName,
    state: state
  };

  if (privateConfigurationValue) {
    var privateConfiguration = {
      //key: referenceName + "PrivateConfigParameter",
      key: 'ignored',
      value: privateConfigurationValue,
      type: 'Private'
    };

    extension.resourceExtensionParameterValues = [privateConfiguration];
  }

  if (publicConfigurationValue) {
    var publicConfiguration = {
      //key: referenceName + "PublicConfigParameter",
      key: 'ignored',
      value: publicConfigurationValue,
      type: 'Public'
    };

    if (extension.resourceExtensionParameterValues) {
      extension.resourceExtensionParameterValues.push(publicConfiguration);
    } else {
      extension.resourceExtensionParameterValues = [publicConfiguration];
    }
  }

  role.resourceExtensionReferences.push(extension);
  return callback(null, role);
}

function getVMSize(options, logger) {
  if(!options.vmSize) {
    logger.warn($('--vm-size has not been specified. Defaulting to "Small".'));
  }
  return options.vmSize || 'Small';
}

function createDockerVM(dnsName, options, logger, cli, callback) {

  options.dockerCerts = {
    caKey: path.join(options.dockerCertDir, 'ca-key.pem'),
    ca: path.join(options.dockerCertDir, 'ca.pem'),
    serverKey: path.join(options.dockerCertDir, 'server-key.pem'),
    server: path.join(options.dockerCertDir, 'server.csr'),
    serverCert: path.join(options.dockerCertDir, 'server-cert.pem'),
    clientKey: path.join(options.dockerCertDir, 'key.pem'),
    client: path.join(options.dockerCertDir, 'client.csr'),
    clientCert: path.join(options.dockerCertDir, 'cert.pem')
  };

  checkAndGenerateCertificatesIfNeeded(function (certificateError) {
    if (certificateError) {
      return callback(certificateError);
    }

    lookupImage(options.computeManagementClient, options.imageName, logger, cli, function (imgErr, image) {
      if (imgErr) {
        return callback(imgErr);
      }

      verifyUserNameAndPwd(image.operatingSystemType, options, logger, cli, function (error) {
        if (error) {
          return callback(error);
        }

        verifyCertFingerPrint(image.operatingSystemType, options, logger, function (certErr, pemSshCert, sshFingerprint) {
          if (certErr) {
            return callback(certErr);
          }

          options.pemSshCert = pemSshCert;
          options.sshFingerprint = sshFingerprint;

          createHostedService(options.dnsPrefix, options, logger, cli, function (hostedServiceError) {
            if (hostedServiceError) {
              return callback(hostedServiceError);
            }

            createRole(dnsName, options.dnsPrefix, image, options, logger, cli, function (createRoleError, role) {
              if (createRoleError) {
                callback(new Error(createRoleError));
              }

              if (role.configurationSets.length > 1) {
                role.configurationSets[1].inputEndpoints.push({
                  name: 'docker',
                  protocol: 'tcp',
                  port: options.dockerPort,
                  localPort: options.dockerPort
                });
              } else {
                role.configurationSets.push({
                  configurationSetType: 'NetworkConfiguration',
                  inputEndpoints: [{
                    name: 'docker',
                    protocol: 'tcp',
                    port: options.dockerPort,
                    localPort: options.dockerPort
                  }],
                  subnetNames: options.subnetNames ? options.subnetNames.split(',') : []
                });
              }

              setDockerVMExtension(role, '0.3', options, logger, function (err, roleWithExtension) {
                logger.verbose($('role with extension'));
                logger.json('verbose', roleWithExtension);

                createVM({
                  role: roleWithExtension,
                  subscription: options.subscription,
                  location: options.location,
                  affinityGroup: options.affinityGroup,
                  dnsPrefix: options.dnsPrefix,
                  connect: options.connect,
                  sshCert: options.sshCert,
                  imageTarget: options.imageName,
                  virtualNetworkName: options.virtualNetworkName,
                  reservedIp: options.reservedIp,
                  computeManagementClient: options.computeManagementClient,
                  managementClient: options.managementClient,
                  storageClient: options.storageClient,
                  networkClient : options.networkClient
                }, function (error) {
                  if (error) {
                    return callback(error);
                  }

                  return callback();
                }, logger, cli);
              });
            });
          });
        });
      });
    });
  });

  function checkAndGenerateCertificatesIfNeeded(cb) {
    utils.fileExists(options.dockerCertDir, function (certDirError, exists) {
      if (certDirError) {
        return cb(certDirError);
      }

      if (!exists) {
        logger.verbose($('Certificates were not found.'));
        fs.mkdir(options.dockerCertDir, function (mkdirErr) {
          if (mkdirErr) {
            return cb(mkdirErr);
          }

          var progress = cli.interaction.progress($('Generating docker certificates.'));
          generateDockerCertificates(function () {
            progress.end();
            return cb();
          });
        });
      } else {
        // We need to check if all certificates are in place.
        // If not, generate them from scratch
        checkExistingCertificates(function (missingCertificates) {
          if (missingCertificates.length === 0) {
            logger.info($('Found docker certificates.'));
            return cb();
          }

          for (i = 0; i < missingCertificates.length; i++) {
            logger.verbose(missingCertificates[i]);
          }

          var progress = cli.interaction.progress($('Generating docker certificates.'));
          generateDockerCertificates(function () {
            progress.end();
            return cb();
          });
        });
      }
    });
  }

  function checkExistingCertificates(cb) {
    var missingCertificateErrors = [];
    checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.caKey, function () {
      checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.ca, function () {
        checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.serverKey, function () {
          checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.serverCert, function () {
            checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.clientKey, function () {
              checkIfCertificateExist(missingCertificateErrors, options.dockerCerts.clientCert, function () {
                return cb(missingCertificateErrors);
              });
            });
          });
        });
      });
    });
  }

  function generateDockerCertificates(cb) {
    /*jshint camelcase: false */
    var password = 'Docker123';
    openssl.exec('genrsa', {
      des3: true,
      passout: 'pass:' + password,
      out: options.dockerCerts.caKey
    }, function (err) {
      if (err) {
        logger.verbose(err);
      }

      openssl.exec('req', {
        new: true,
        x509: true,
        days: 365,
        passin: 'pass:' + password,
        subj: '/C=AU/ST=Some-State/O=Internet Widgits Pty Ltd/CN=\\*',
        key: options.dockerCerts.caKey,
        out: options.dockerCerts.ca
      }, function (err) {
        if (err) {
          logger.verbose(err);
        }

        openssl.exec('genrsa', {
          des3: true,
          passout: 'pass:' + password,
          out: options.dockerCerts.serverKey
        }, function (err) {
          if (err) {
            logger.verbose(err);
          }

          openssl.exec('req', {
            new: true,
            passin: 'pass:' + password,
            subj: '/C=AU/ST=Some-State/O=Internet Widgits Pty Ltd/CN=\\*',
            key: options.dockerCerts.serverKey,
            out: options.dockerCerts.server
          }, function (err) {
            if (err) {
              logger.verbose(err);
            }

            openssl.exec('x509', {
              req: true,
              days: 365,
              in : options.dockerCerts.server,
              passin: 'pass:' + password,
              set_serial: 01,
              CA: options.dockerCerts.ca,
              CAkey: options.dockerCerts.caKey,
              out: options.dockerCerts.serverCert
            }, function (err) {
              if (err) {
                logger.verbose(err.toString());
              }

              openssl.exec('genrsa', {
                des3: true,
                passout: 'pass:' + password,
                out: options.dockerCerts.clientKey
              }, function (err) {
                if (err) {
                  logger.verbose(err);
                }

                openssl.exec('req', {
                  new: true,
                  passin: 'pass:' + password,
                  subj: '/C=AU/ST=Some-State/O=Internet Widgits Pty Ltd/CN=\\*',
                  key: options.dockerCerts.clientKey,
                  out: options.dockerCerts.client
                }, function (err) {
                  if (err) {
                    logger.verbose(err.toString());
                  }

                  var configPath = path.join(options.dockerCertDir, 'extfile.cnf');
                  fs.writeFile(configPath, 'extendedKeyUsage = clientAuth', function (err) {
                    if (err) {
                      logger.verbose(err);
                    }

                    openssl.exec('x509', {
                      req: true,
                      days: 365,
                      in : options.dockerCerts.client,
                      passin: 'pass:' + password,
                      set_serial: 01,
                      extfile: configPath,
                      CA: options.dockerCerts.ca,
                      CAkey: options.dockerCerts.caKey,
                      out: options.dockerCerts.clientCert
                    }, function (err) {
                      if (err) {
                        logger.verbose(err.toString());
                      }

                      openssl.exec('rsa', {
                        passin: 'pass:' + password,
                        in : options.dockerCerts.serverKey,
                        passout: 'pass:' + password,
                        out: options.dockerCerts.serverKey
                      }, function (err) {
                        if (err) {
                          logger.verbose(err.toString());
                        }

                        openssl.exec('rsa', {
                          passin: 'pass:' + password,
                          in : options.dockerCerts.clientKey,
                          passout: 'pass:' + password,
                          out: options.dockerCerts.clientKey
                        }, function (err) {
                          if (err) {
                            logger.verbose(err.toString());
                          }

                          // setting cert permissions
                          fs.chmodSync(options.dockerCerts.caKey, 0600);
                          fs.chmodSync(options.dockerCerts.ca, 0600);
                          fs.chmodSync(options.dockerCerts.serverKey, 0600);
                          fs.chmodSync(options.dockerCerts.server, 0600);
                          fs.chmodSync(options.dockerCerts.serverCert, 0600);
                          fs.chmodSync(options.dockerCerts.clientKey, 0600);
                          fs.chmodSync(options.dockerCerts.client, 0600);
                          fs.chmodSync(configPath, 0600);
                          fs.chmodSync(options.dockerCerts.clientCert, 0600);
                          return cb();
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function checkIfCertificateExist(missingCertificateErrors, filepath, cb) {
    utils.fileExists(filepath, function (error, exists) {
      if (error) {
        return cb(error);
      }

      if (!exists) {
        missingCertificateErrors.push(util.format($('%s file was not found'), filepath));
        return cb();
      }

      return cb();
    });
  }
}

function setDockerVMExtension(role, version, options, logger, callback) {
  version = version || '0.3';
  var publicConfig = createDockerPublicConfiguration(options);
  var privateConfig = createDockerPrivateConfiguration(options);
  setVMExtension(role, 'DockerExtension', 'MSOpenTech.Extensions', version, 'DockerExtension', 'enable', privateConfig, publicConfig, function (err, roleWithExtension) {
    return callback(err, roleWithExtension);
  });

  function createDockerPublicConfiguration(options) {
    return util.format($('{ \"dockerport\": \"%s\" }'), options.dockerPort);
  }

  function createDockerPrivateConfiguration(options) {
    var certs = getDockerCertificates(options);
    var privateConf = util.format($('{ \"ca\": \"%s\", \"server-cert\": \"%s\", \"server-key\": \"%s\" }'), certs.caCert, certs.serverCert, certs.serverKey);
    return privateConf;
  }

  function convertFileToBase64(filePath) {
    var file = fs.readFileSync(filePath);
    return new Buffer(file).toString('base64');
  }

  function getDockerCertificates(options) {
    var caCert = convertFileToBase64(options.dockerCerts.ca);
    var serverKey = convertFileToBase64(options.dockerCerts.serverKey);
    var serverCert = convertFileToBase64(options.dockerCerts.serverCert);

    return {
      caCert: caCert,
      serverKey: serverKey,
      serverCert: serverCert
    };
  }
}

function lookupImage(computeManagementClient, imageName, logger, cli, callback) {
  var result = {
    error: null,
    image: null
  };

  progress = cli.interaction.progress(util.format($('Looking up image %s'), imageName));

  vmUtils.getImageInfo(computeManagementClient, imageName, function(error, response) {
    progress.end();
    if (!error) {
      result.image = response.vmImage || response.osImage;

      if (!result.image) {
        result.error = util.format($('Image "%s" not found'), imageName);
      } else {
        if (result.image.oSDiskConfiguration) {
          result.image.operatingSystemType = result.image.oSDiskConfiguration.operatingSystem;
        }

        result.image.isVMImage = response.vmImage ? true : false;
        logger.silly('image:');
        logger.json('silly', result.image);
      }
    } else {
      result.error = error;
    }

    return callback(result.error, result.image);
  });
}

function createRole(name, dnsPrefix, image, options, logger, cli, callback) {
  var inputEndPoints = [];
  logger.verbose($('Creating role'));
  var vmName = options.vmName || name || dnsPrefix;
  role = {
    roleName: vmName,
    roleSize: options.size,
    roleType: 'PersistentVMRole',
    provisionGuestAgent: true
  };

  if (image.isVMImage) {
    role.vMImageName = image.name;
  } else {
    role.oSVirtualHardDisk = {
      sourceImageName: image.name
    };
  }

  if (options.availabilitySet) {
    role.availabilitySetName = options.availabilitySet;
    logger.verbose(util.format($('VM will be part of the %s availability set.'), options.availabilitySet));
  }

  /*jshint camelcase:false*/
  function createRoleInternal() {
    var configureSshCert = false;
    var customDataBase64 = null;
    if (image.operatingSystemType.toLowerCase() === 'linux') {
      logger.verbose($('Using Linux ProvisioningConfiguration'));

      provisioningConfig = {
        configurationSetType: 'LinuxProvisioningConfiguration',
        hostName: vmName,
        userName: options.userName,
        userPassword: options.password
      };

      if (options.ssh) {
        logger.verbose(util.format($('SSH is enabled on port %s'), options.ssh));

        inputEndPoints.push({
          name: 'ssh',
          protocol: 'tcp',
          port: options.ssh,
          localPort: '22'
        });

        provisioningConfig.disableSshPasswordAuthentication = 'false';

        if (options.sshCert) {
          options.sshFingerprint = options.sshFingerprint.toUpperCase();
          logger.verbose(util.format($('using SSH fingerprint: %s'), options.sshFingerprint));
          // Configure the cert for cloud service
          configureSshCert = true;
          if (options.noSshPassword) {
            logger.verbose($('Password-based authentication will not be enabled'));
            provisioningConfig.disableSshPasswordAuthentication = true;
          }
        }
      }
    } else {
      logger.verbose($('Using Windows ProvisioningConfiguration'));
      provisioningConfig = {
        configurationSetType: 'WindowsProvisioningConfiguration',
        computerName: vmName,
        adminPassword: options.password,
        adminUserName: options.userName,
        resetPasswordOnFirstLogon: false
      };

      if (options.rdp) {
        logger.verbose(util.format($('RDP is enabled on port %s'), options.rdp));
        inputEndPoints.push({
          name: 'rdp',
          protocol: 'tcp',
          port: options.rdp,
          localPort: '3389'
        });
      }
    }

    role.configurationSets = [provisioningConfig];

    if (inputEndPoints.length || options.subnetNames || options.staticIp) {
      var subnetNames = options.subnetNames;
      if (options.staticIp) {
        var staticIpSubnet = getIPAddressSubnet(options.networkInfo, options.staticIp);
        if (staticIpSubnet && staticIpSubnet.error) {
          return callback(staticIpSubnet.error);
        }
        if (!staticIpSubnet) {
          return callback(new Error(util.format($('The static address %s doesn\'t belong to the address space defined by the role\'s subnets.'), options.staticIp)));
        }
        subnetNames = staticIpSubnet;
      }
      role.configurationSets.push({
        configurationSetType: 'NetworkConfiguration',
        inputEndpoints: inputEndPoints,
        subnetNames: subnetNames ? subnetNames.split(',') : [],
        staticVirtualNetworkIPAddress : options.staticIp
      });
    }

    customDataBase64 = loadCustomData(options.customData, logger);
    if (customDataBase64) {
      provisioningConfig.customData = customDataBase64;
    }

    if (configureSshCert) {
      progress = cli.interaction.progress($('Configuring certificate'));
      configureCert(dnsPrefix, provisioningConfig, options.pemSshCert, options.sshFingerprint, options, logger, function (error) {
        if (error) {
          return callback(error);
        }

        progress.end();
        logger.verbose('role:');
        logger.json('verbose', role);
        return callback(null, role);
      });
    } else {
      logger.verbose('role:');
      logger.json('verbose', role);
      return callback(null, role);
    }
  }

  if (!options.imageTarget && image && image.mediaLink && image.mediaLink.indexOf('$root') >= 0) {
    // Make sure OS disk is not stored in $root container by default. Use a different container in the same storage account.
    options.imageTarget = image.mediaLink.split('$root')[0] +
      'vhd-store-root/' + vmName + '-' + crypto.randomBytes(8).toString('hex') + '.vhd';
  }

  if (options.imageTarget || image.category !== 'User') {
    blobUtils.getBlobName(cli, options.storageClient, options.location, options.affinityGroup, dnsPrefix, options.imageTarget,
      '/vhd-store/', vmName + '-' + crypto.randomBytes(8).toString('hex') + '.vhd',
      function (error, imageTargetUrl) {
        if (error) {
          logger.error($('Unable to retrieve storage account'));
          return callback(error);
        } else {
          imageTargetUrl = blobUtils.normalizeBlobUri(imageTargetUrl, false);
          logger.verbose('image MediaLink: ' + imageTargetUrl);
          role.oSVirtualHardDisk.mediaLink = imageTargetUrl;
          if (imageTargetUrl.indexOf('$root') >= 0) {
            return callback(util.format($('Creating OS disks in $root storage container is not supported. Storage URL: %s'), imageTargetUrl));
          }
          return createRoleInternal();
        }
      }
    );
  } else {
    return createRoleInternal();
  }
}

function verifyUserNameAndPwd(osName, options, logger, cli, callback) {
  var passwordErr = $('password must be at least 8 character in length, it must contain a lower case, an upper case, a number and a special character such as !@#$%^&+=');
  var passwordRegEx = new RegExp(/^.*(?=.{8,})(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\*!@#$%^&+=]).*$/);
  var promptMsg = util.format($('Enter VM \'%s\' password:'), options.userName);

  if (utils.ignoreCaseEquals(osName, 'windows')) {
    if (utils.ignoreCaseEquals(options.userName, 'administrator')) {
      return callback($('user name administrator cannot be used'));
    }

    if (typeof options.password === 'undefined') {
      cli.interaction.password(promptMsg, '*', function (password) {
        process.stdin.pause();
        options.password = password;
        if (!options.password.match(passwordRegEx)) {
          return callback(passwordErr);
        }

        return callback();
      });
    } else if (!options.password.match(passwordRegEx)) {
      return callback(passwordErr);
    } else {
      return callback();
    }
  } else if (utils.ignoreCaseEquals(osName, 'linux')) {
    if (options.noSshPassword !== true) {
      if (typeof options.password === 'undefined') {
        cli.interaction.password(promptMsg, '*', function (password) {
          process.stdin.pause();
          options.password = password;
          if (!options.password.match(passwordRegEx)) {
            return callback(passwordErr);
          }

          return callback();
        });
      } else if (!options.password.match(passwordRegEx)) {
        return callback(passwordErr);
      } else {
        return callback();
      }
    } else {
      return callback();
    }
  } else {
    return callback();
  }
}

function verifyCertFingerPrint(osName, options, logger, cb) {
  if (!utils.ignoreCaseEquals(osName, 'linux')) {
    return cb();
  }

  if (!options.sshCert) {
    return cb();
  }

  if (utils.isSha1Hash(options.sshCert)) {
    sshFingerprint = options.sshCert;
    return cb(null, null, sshFingerprint);
  } else {
    loadSshCert(options, logger, function (loadSshErr, pemSshCert, sshFingerprint) {
      if (loadSshErr) {
        return cb(loadSshErr);
      }

      sshFingerprint = sshFingerprint.toUpperCase();
      logger.verbose(util.format($('using SSH fingerprint: %s'), sshFingerprint));

      return cb(null, pemSshCert, sshFingerprint);
    });
  }
}

function loadSshCert(options, logger, cb) {
  logger.verbose(util.format($('Trying to open SSH cert: %s'), options.sshCert));
  logger.silly(util.format($('Trying to open SSH cert: %s'), options.sshCert));
  var pemSshCert = fs.readFileSync(options.sshCert);
  var pemSshCertStr = pemSshCert.toString();
  if (!utils.isPemCert(pemSshCertStr)) {
    return cb($('Specified SSH certificate is not in PEM format'));
  }

  var sshFingerprint = utils.getCertFingerprint(pemSshCertStr);
  return cb(null, pemSshCert, sshFingerprint);
}

function configureCert(serviceName, provisioningConfig, pemSshCert, sshFingerprint, options, logger, callback) {
  if (provisioningConfig) {
    provisioningConfig.sshSettings = {
      publicKeys: [{
        fingerprint: sshFingerprint,
        path: '/home/' + options.userName + '/.ssh/authorized_keys'
      }]
    };

    logger.silly($('provisioningConfig with SSH:'));
    logger.silly(JSON.stringify(provisioningConfig));
  }

  if (pemSshCert) {
    logger.verbose($('uploading cert'));

    var certParams = {
      data: pemSshCert,
      certificateFormat: 'pfx'
    };

    var computeManagementClient = options.computeManagementClient;
    computeManagementClient.serviceCertificates.create(serviceName, certParams, function (error) {
      if (error) {
        logger.json('data', error);
        return callback(error);
      } else {
        logger.verbose($('uploading cert succeeded'));
        return callback();
      }
    });
  } else {
    return callback();
  }
}

function createHostedService(dnsPrefix, options, logger, cli, callback) {
  var createNewHostedService = function() {
    var createHostedServiceInternal = function () {
      svcParams.location = options.location;
      svcParams.affinityGroup = options.affinityGroup;
      svcParams.label = dnsPrefix;
      svcParams.serviceName = dnsPrefix;
      progress = cli.interaction.progress($('Creating cloud service'));

      computeManagementClient.hostedServices.create(svcParams, function (error) {
        progress.end();
        return callback(error);
      });
    };

    if (options.location && options.affinityGroup) {
      return callback($('both --location and --affinitygroup options are specified'));
    }

    // In some cases we override the request to use the virtual network's affinity group
    if (options.virtualNetworkAffinityGroupName) {
      if (options.location) {
        if (!utils.ignoreCaseEquals(options.location, options.virtualNetworkAffinityGroupDetails.location)) {
          return callback(new Error($('The hosted service location must be the same as the virtual network\'s affinity group location')));
        }

        // Override options to use the virtual network's affinity group
        options.location = null;
        options.affinityGroup = options.virtualNetworkAffinityGroupDetails.name;
      }
      else if (!options.affinityGroup) {
        logger.info(util.format($('Using the virtual network\'s affinity group %s'), options.virtualNetworkAffinityGroupName));

        // Override options to use the virtual network's affinity group
        options.location = null;
        options.affinityGroup = options.virtualNetworkAffinityGroupDetails.name;
      }
    }

    // In some cases we override the request to use the reserved IP address location
    if (options.reservedIpInfo) {
      if (options.location) {
        if (!utils.ignoreCaseEquals(options.location, options.reservedIpInfo.location)) {
          return callback(new Error($('The hosted service location must be the same as the reserved IP address\' location')));
        }
      }
      else if (!options.affinityGroup) {
        logger.info(util.format($('Using the reserved IP address\' location %s'), options.reservedIpInfo.location));

        // Override options to use the reserved IP address' location
        options.location = options.reservedIpInfo.location;
      }
    }

    if (!options.location && !options.affinityGroup) {
      logger.help($('location or affinity group is required for a new cloud service\nplease specify --location or --affinity-group'));
      logger.help($('following commands show available locations and affinity groups:'));
      logger.help('    azure vm location list');
      logger.help('    azure account affinity-group list');
      return callback(new Error($('location or affinity group is required for a new cloud service')));
    }

    if (options.location) {
      logger.verbose(util.format($('Resolving the location %s'), options.location));
      utils.resolveLocationName(managementClient, options.location, function (error, resolvedLocation) {
        if (!error) {
          if (!resolvedLocation.availableServices || !underscore.find(resolvedLocation.availableServices, function (s) {
            return s === 'PersistentVMRole';
          })) {
            logger.help($('following command show available locations along with supported services:'));
            logger.help('    azure vm location list --json');
            return callback(util.format($('the given location \'%s\' does not support PersistentVMRole service'), options.location));
          }

          options.location = resolvedLocation.name;
          logger.verbose(util.format($('Location resolved to %s'), options.location));

          createHostedServiceInternal();
        } else {
          return callback(error);
        }
      });
    } else if (options.affinityGroup) {
      logger.verbose(util.format($('Looking up the affinity group %s'), options.affinityGroup));
      managementClient.affinityGroups.list(function (error, affinityGrpRes) {
        var helpmsg1 = $('following command show available affinity groups along with supported services:');
        var helpmsg2 = '    azure account affinity-group list --json';

        if (!error) {
          var affinityGroups = affinityGrpRes.affinityGroups;
          var foundAffinityGroup = null;
          if (affinityGroups instanceof Array) {
            foundAffinityGroup = underscore.find(affinityGroups, function (af) {
              return utils.ignoreCaseEquals(af.name, options.affinityGroup);
            });
          }

          if (!foundAffinityGroup) {
            logger.help(helpmsg1);
            logger.help(helpmsg2);
            return callback(util.format($('No affinity group found with name %s'), options.affinityGroup));
          }

          if (foundAffinityGroup.capabilities && !(foundAffinityGroup.capabilities instanceof Array)) {
            // normalize Capability to an array.
            foundAffinityGroup.capabilities = [foundAffinityGroup.capabilities];
          }

          if (!foundAffinityGroup.capabilities || !underscore.find(foundAffinityGroup.capabilities, function (ca) {
            return ca === 'PersistentVMRole';
          })) {
            logger.help(helpmsg1);
            logger.help(helpmsg2);
            return callback(util.format($('the given affinity group \'%s\' does not support PersistentVMRole service'), options.affinityGroup));
          }

          options.affinityGroup = foundAffinityGroup.name;
          createHostedServiceInternal();
        } else {
          return callback(error);
        }
      });
    } else {
      createHostedServiceInternal();
    }
  };

  var createHostedService3 = function() {
    // check if cloud service exists for specified dns name
    logger.verbose(util.format($('Checking for existence of %s cloud service'), dnsPrefix));

    progress = cli.interaction.progress($('Looking up cloud service'));

    computeManagementClient.hostedServices.list(function (error, response) {
      progress.end();
      if (error) {
        return callback(error);
      } else {
        var service = null;
        var services = response.hostedServices;
        for (var i = 0; i < services.length; i++) {
          if (services[i].serviceName.toLowerCase() === dnsPrefix.toLowerCase()) {
            service = services[i];
            break;
          }
        }

        if (service) {
          logger.verbose(util.format($('Found existing cloud service %s'), service.serviceName));
          return callback(null, true);
        } else {
          logger.info(util.format($('cloud service %s not found.'), dnsPrefix));
          if (options.networkInfo && options.networkInfo.affinityGroup) {
            options.virtualNetworkAffinityGroupName = options.networkInfo.affinityGroup;
            managementClient.affinityGroups.get(options.networkInfo.affinityGroup, function(error, affinityGroupDetails) {
              progress.end();
              if (error) {
                return callback(error);
              } else {
                options.virtualNetworkAffinityGroupDetails = affinityGroupDetails;
                createNewHostedService();
              }
            });
          } else {
            createNewHostedService();
          }
        }
      }
    });
  };

  var createHostedService2 = function() {
    if (options.reservedIp) {
      progress = cli.interaction.progress($('Looking up reserved IP address'));
      options.networkClient.reservedIPs.get(options.reservedIp, function(error, response) {
        if (error) {
          progress.end();
          return callback(error, response);
        } else {
          options.reservedIpInfo = response;
          return createHostedService3();
        }
      });
    } else {
      return createHostedService3();
    }
  };

  var computeManagementClient = options.computeManagementClient;
  var managementClient = options.managementClient;

  if (options.virtualNetworkName) {
    progress = cli.interaction.progress($('Looking up virtual network'));
    getNetworkInfo(options.networkClient, options.virtualNetworkName, function(error, networkInfo) {
      if (error) {
        progress.end();
        return callback(error);
      } else {
        options.networkInfo = networkInfo;
        return createHostedService2();
      }
    });
  } else {
    return createHostedService2();
  }
}

module.exports = VMClient;
