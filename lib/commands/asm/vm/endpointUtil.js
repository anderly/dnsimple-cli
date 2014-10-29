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
var util = require('util');
var utils = require('../../../util/utils');
var $ = utils.getLocaleString;

function EndPointUtil() {
  this.protocols = {
    TCP: 'tcp',
    HTTP: 'http',
    UDP: 'udp'
  };

  this.endPointConsts = {
    portMaxValue: 65535,
    defaultProtocol: this.protocols.TCP,
    protocols: [ this.protocols.TCP, this.protocols.UDP ],
    nameMinLen: 3,
    nameMaxLen: 15,
    lbSetMinLen: 3,
    lbSetMaxLen: 15,
    defaultProbeProtocol: this.protocols.TCP,
    probeProtocols: [ this.protocols.TCP, this.protocols.HTTP ],
    defaultProbePath: '/',
    probeTimeOutMin: 5,
    defaultProbeTimeout: 15,
    probeIntervalMin: 5,
    defaultProbeInterval: 15,
    aclOrderIDMinValue: 0,
    aclOrderIDMaxValue: 65535,
    aclActions: ['permit', 'deny'],
    cidrMin: 1,
    cidrMax: 32,
    aclDesLen: 255
  };
}

_.extend(EndPointUtil.prototype, {

  listToString: function(list) {
    var str = _.reduce(list,
      function(memo, s){ return memo + s + ','; }, '[');
    return str.slice(0, -1) + ']';
  },

  validatePort: function(port, paramName) {
    var portAsInt = parseInt(port, 10);
    if ((port != portAsInt) || (portAsInt > this.endPointConsts.portMaxValue)) {
      return { error: util.format($('%s must be an integer less than or equal to %s'),
        paramName, this.endPointConsts.portMaxValue) };
    }

    return {
      error:null,
      port: portAsInt
    };
  },

  validateProtocol: function(protocol, paramName) {
    protocol = protocol.toLowerCase();
    if (!_.contains(this.endPointConsts.protocols, protocol)) {
      var protocolsAsStr = this.listToString(this.endPointConsts.protocols);
      return { error: util.format($('valid values for %s are %s'), paramName, protocolsAsStr) };
    }

    return {
      error:null,
      protocol: protocol
    };
  },

  validateEndPointName: function(endpointName, paramName) {
    if (endpointName.length < this.endPointConsts.nameMinLen ||
      endpointName.length > this.endPointConsts.nameMaxLen) {
      return { error: util.format($('%s length of the endpoint name must be between %s and %s characters'),
        paramName, this.endPointConsts.nameMinLen, this.endPointConsts.nameMaxLen) };
    }

    return {
      error:null,
      endpointName: endpointName
    };
  },

  validateLBSetName: function(lbSetName, paramName) {
    if (lbSetName.length < this.endPointConsts.lbSetMinLen ||
      lbSetName.length > this.endPointConsts.lbSetMaxLen) {
      return { error: util.format($('%s The length of the load-balanced set name must be between %s and %s characters'),
        paramName, this.endPointConsts.lbSetMinLen, this.endPointConsts.lbSetMaxLen) };
    }

    return {
      error:null,
      lbSetName: lbSetName
    };
  },

  validateProbProtocol: function(probProtocol, paramName) {
    var protocol = probProtocol.toLowerCase();
    if (!_.contains(this.endPointConsts.probeProtocols, protocol)) {
      var protocolsAsStr = this.listToString(this.endPointConsts.probeProtocols);
      return { error: util.format($('valid values for %s are %s'), paramName, protocolsAsStr) };
    }

    return {
      error:null,
      protocol: protocol
    };
  },

  validateProbTimeout: function(probTimeout, paramName) {
    var timeoutAsInt = parseInt(probTimeout, 10);
    if ((probTimeout != timeoutAsInt) || (timeoutAsInt < this.endPointConsts.probeTimeOutMin)) {
      return { error: util.format($('%s must be an integer greater than or equal to %s'),
        paramName, this.endPointConsts.probeTimeOutMin) };
    }

    return {
      error:null,
      timeout: timeoutAsInt
    };
  },

  validateProbInterval: function(probInterval, paramName) {
    var intervalAsInt = parseInt(probInterval, 10);
    if ((probInterval != intervalAsInt) || (intervalAsInt < this.endPointConsts.probeIntervalMin)) {
      return { error: util.format($('%s must be an integer greater than or equal to %s'),
        paramName, this.endPointConsts.probeIntervalMin) };
    }

    return {
      error:null,
      interval: intervalAsInt
    };
  },

  validateDirectServerReturn: function(enableDirectServerReturn, paramName) {
    enableDirectServerReturn = enableDirectServerReturn.toLowerCase();
    if (enableDirectServerReturn !== 'true' && enableDirectServerReturn !== 'false') {
      return { error: util.format($('value of %s should be true or false'), paramName) };
    }

    return {
      error:null,
      enableDirectServerReturn: enableDirectServerReturn
    };
  },

  validateACLOrderID: function(orderID, paramName) {
    var orderIDAsInt = parseInt(orderID, 10);
    if ((orderID != orderIDAsInt) ||
      (orderIDAsInt < this.endPointConsts.aclOrderIDMinValue) ||
      (orderIDAsInt > this.endPointConsts.aclOrderIDMaxValue)) {
      return { error: util.format($('%s must be an integer in the range [%s, %s]'),
        paramName, this.endPointConsts.aclOrderIDMinValue, this.endPointConsts.aclOrderIDMaxValue) };
    }

    return {
      error:null,
      orderID: orderID
    };
  },

  validateACLAction: function(action, paramName) {
    action = action.toLowerCase();
    if (!_.contains(this.endPointConsts.aclActions, action)) {
      var actionsAsStr = this.listToString(this.endPointConsts.aclActions);
      return { error: util.format($('valid values for %s are %s'), paramName, actionsAsStr) };
    }

    return {
      error:null,
      action: action
    };
  },

  validateACLRemoteSubnet: function(remoteSubnet, paramName) {
    var parts = remoteSubnet.split('/');
    if (parts.length !== 2) {
      return  { error: util.format($('the paramater %s should be in cidr format, ipv4/cidr'), paramName) };
    }

    
    if (isNaN(parts[1]) || parts[1] < this.endPointConsts.cidrMin || parts[1] > this.endPointConsts.cidrMax) {
      return  {
        error: util.format($('cidr part %s should be a number in the range [%s, %s] in paramater %s'),
          parts[1], this.endPointConsts.cidrMin, this.endPointConsts.cidrMax, paramName)
      };
    }

    var ipv4Pattern = new RegExp(/^([01]?\d\d?|2[0-4]\d|25[0-5])\.([01]?\d\d?|2[0-4]\d|25[0-5])\.([01]?\d\d?|2[0-4]\d|25[0-5])\.([01]?\d\d?|2[0-4]\d|25[0-5])$/);
    var patternMatch = parts[0].match(ipv4Pattern);
    if (!patternMatch) {
      return  {
        error: util.format($('the ip address part %s is invalid in paramater %s'), parts[0], paramName)
      };
    }
  
    var octects = {
      octect0: null,
      octect1: null,
      octect2: null,
      octect3: null,
    };

    for (var i = 0; i < 4; i++) {
      octects['octect' + i] = parseInt(patternMatch[i + 1], 10);
    }
  
    return {
      error: null,
      remoteSubnet: octects.octect0 + '.' + octects.octect1 + '.' + octects.octect2 + '.' + octects.octect3 + '/' + parts[1]
    };
  },

  validateACLDescription: function(description, paramName) {
    if (description) {
      description = description.trim();
      if (description.length > this.endPointConsts.aclDesLen) {
        return {
          error: util.format($('the maximum length of the parameter %s is %s'), paramName, this.endPointConsts.aclDesLen)
        };
      }
    }

    return {
      error: null,
      description: description
    };
  },

  verifyAndGetEndPointObj: function (epInput, currentEndPoints, update) {

    // e.g. epInput
    // {
    //   vmPort: { value:'', argName:'' },
    //   lbPort: { value:'', argName:'' },
    //   protocol: { value:'', argName:'' },
    //   name: { value:'', argName:'' },
    //   lbSetName: { value:'', argName:'' },
    //   probePort: { value:'', argName:'' },
    //   probeProtocol: { value:'', argName:'' },
    //   probePath: { value:'', argName:'' }
    //   enableDirectServerReturn: { value:'', argName:'' }
    // }

    var endpoint = {};
    var result = function(err) {
      return (err) ? { error: err, endPoint:null } : { error: null, endPoint: endpoint };
    };

    for (var item in epInput) {
      if (epInput.hasOwnProperty(item)) {
        if (!epInput[item].hasOwnProperty('value') || !epInput[item].hasOwnProperty('argName')) {
          return result($('A property in epInput object must have value and argName as child properties'));
        }
      }
    }

    if (!epInput.lbPort) {
      return result($('epInput object missing required property lbPort'));
    }

    var lbRes = this.validatePort(epInput.lbPort.value, epInput.lbPort.argName);
    if (lbRes.error) {
      return result(lbRes.error);
    }

    endpoint.port = lbRes.port;

    if (!epInput.vmPort) {
      if (update) {
        return result($('epInput object missing required property vmPort'));
      }

      endpoint.localPort = endpoint.port;
    } else {
      var vmpRes = this.validatePort(epInput.vmPort.value, epInput.vmPort.argName);
      if (vmpRes.error) {
        return result(vmpRes.error);
      }

      endpoint.localPort = vmpRes.port;
    }

    if (!epInput.protocol) {
      if (update) {
        return result($('epInput object missing required property protocol'));
      }

      endpoint.protocol = this.endPointConsts.defaultProtocol;
    } else {
      var protoRes = this.validateProtocol(epInput.protocol.value, epInput.protocol.argName);
      if (protoRes.error) {
        return result(protoRes.error);
      }

      endpoint.protocol = protoRes.protocol;
    }

    if (!epInput.name) {
      if (update) {
        return result($('epInput object missing required property name'));
      }

      // [tcp|udp]-LBPort-VMPort
      endpoint.name = endpoint.protocol + '-' + endpoint.port + '-' + endpoint.localPort;
    } else {
      var epnameRes = this.validateEndPointName(epInput.name.value, epInput.name.argName);
      if (epnameRes.error) {
        return result(epnameRes.error);
      }
      endpoint.name = epnameRes.endpointName;
    }

    if (epInput.directServerReturn) {
      var dsrRes = this.validateDirectServerReturn(epInput.directServerReturn.value, epInput.directServerReturn.argName);
      if (dsrRes.error) {
        return result(dsrRes.error);
      }
      endpoint.enableDirectServerReturn = dsrRes.enableDirectServerReturn;
    }

    if (epInput.lbSetName) {
      var lbnameRes = this.validateLBSetName(epInput.lbSetName.value, epInput.lbSetName.argName);
      if (lbnameRes.error) {
        return result(lbnameRes.error);
      }
      endpoint.loadBalancedEndpointSetName = lbnameRes.lbSetName;
    }

    if ((epInput.probePort || epInput.probeProtocol || epInput.probePath) &&
      !endpoint.loadBalancedEndpointSetName) {
      return result(util.format($('load-balanced set name must be specified to enable probing')));
    }

    if (epInput.probePath && !epInput.probeProtocol) {
      return result(util.format($('probe protocol is required when %s is specified'), epInput.probePath.argName));
    }

    endpoint.loadBalancerProbe = {};

    if (epInput.probeProtocol) {
      var pprotoRes = this.validateProbProtocol(epInput.probeProtocol.value, epInput.probeProtocol.argName);
      if (pprotoRes.error) {
        return result(pprotoRes.error);
      }

      endpoint.loadBalancerProbe.protocol = pprotoRes.protocol;
    }

    if (epInput.probePort) {
      if (!endpoint.loadBalancerProbe.protocol) {
        endpoint.loadBalancerProbe.protocol = this.endPointConsts.defaultProbeProtocol;
      }

      var ppRes = this.validatePort(epInput.probePort.value, epInput.probePort.argName);
      if (ppRes.error) {
        return result(ppRes.error);
      }

      endpoint.loadBalancerProbe.port = ppRes.port;
    } else if (endpoint.loadBalancerProbe.protocol) {
      endpoint.loadBalancerProbe.port = endpoint.localPort;
    }

    if (epInput.probePath) {
      if (endpoint.loadBalancerProbe.protocol ==  this.protocols.HTTP) {
        endpoint.loadBalancerProbe.path = epInput.probePath.value;
      } else if (endpoint.loadBalancerProbe.protocol == this.protocols.TCP) {
        endpoint.loadBalancerProbe.path = undefined;
      }
    } else if (endpoint.loadBalancerProbe.protocol == this.protocols.HTTP) {
      endpoint.loadBalancerProbe.path = this.endPointConsts.defaultProbePath;
    }

    if (_.isEmpty(endpoint.loadBalancerProbe)) {
      delete endpoint['loadBalancerProbe'];
    }

    return result(null);
  },

  getAllLBSettings: function (roles) {
    var lbsetConfigs = _.chain(roles)
      .filter(function(role) { return role.roleType == 'PersistentVMRole'; })
      .reduce(function(endpoints, role) {
        if (_.isArray(role.configurationSets)) {
          var networkConfig = _.find(role.configurationSets,
            function(set) { return set.configurationSetType === 'NetworkConfiguration'; }
          );

          if (networkConfig && !_.isEmpty(networkConfig.inputEndpoints)) {
            networkConfig.inputEndpoints = _.map(networkConfig.inputEndpoints,
              function (ep) { ep.vmName = role.roleName.toLowerCase(); return ep; });
            endpoints = endpoints.concat(networkConfig.inputEndpoints);
          }
        }
        return endpoints;
      }, [])
      .reduce(function(lbConfigs, endPoint) {
        var lbSetName = endPoint.loadBalancedEndpointSetName;
        if (lbSetName) {
          lbSetName = lbSetName.toLowerCase();
          if(!(lbSetName in lbConfigs)) {
            lbConfigs[lbSetName] = {
              Name: endPoint.loadBalancedEndpointSetName,
              ProbSettings: endPoint.loadBalancerProbe,
              EnableDirectServerReturn: endPoint.enableDirectServerReturn,
              VmNames: [endPoint.vmName]
            };
            lbConfigs[lbSetName].endPoints = [endPoint];
          } else {
            lbConfigs[lbSetName].VmNames.push(endPoint.vmName);
            lbConfigs[lbSetName].endPoints.push(endPoint);
          }
        }
        return lbConfigs;
      }, {})
      .value();

    return lbsetConfigs;
  },

  verifyEndPoints: function (endPoints) {
    var lbSetNames = {};
    var protocolPorts = {};
    var endPointNames = {};

    var result = function(error) {
      return (error ? { 'error': error } :
        { 'error': null, 'protocolPorts' : protocolPorts, 'endPointNames': endPointNames });
    };

    for(var i = 0; i < endPoints.length; i++) {
      var key = endPoints[i].port + ':' + endPoints[i].protocol;
      if (key in protocolPorts) {
        return result($('load balancer port and protocol together needs to be unique'));
      }

      protocolPorts[key] = true;

      key = endPoints[i].loadBalancedEndpointSetName;
      if (key) {
        key = key.toLowerCase();
        if (key in lbSetNames) {
          return result($('load balancer set name needs to be unique'));
        }

        lbSetNames[key] = true;
      }

      key = endPoints[i].name.toLowerCase();
      if (key in endPointNames) {
        return result($('end point name needs to be unique'));
      }

      endPointNames[key] = true;
    }

    return result(null);
  }
});

module.exports = EndPointUtil;