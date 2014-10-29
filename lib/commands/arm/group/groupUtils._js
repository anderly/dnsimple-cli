/**
* Copyright (c) Microsoft.  All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

var __ = require('underscore');
var fs = require('fs');
var path = require('path');
var azure = require('azure');
var request = require('request');
var through = require('through');
var util = require('util');

var knownLocations = require('../location/knownLocations');
var validation = require('../../../util/validation');
var profile = require('../../../util/profile');
var utils = require('../../../util/utils');

var $ = utils.getLocaleString;

/**
* Validate that a given location is valid for group creation
* and prompts for location if not valid or not given.
*
* @param {string} location location requested
* @param {object} log object to print messages to user
* @param {object} interaction the interactor object to prompt with
* @param {function} callback callback received either error or final location
*/
exports.validateLocation = function validateLocation(location, log, interaction, callback) {
  var validLocations = knownLocations.getValidLocationsOfResourceGroup();

  if (location && validLocations.some(function (l) { return utils.ignoreCaseEquals(l, location); })) {
    return callback(null, location);
  }

  if (location) {
    log.info(util.format($('The location %s is not valid'), location));
  }

  log.info($('Choose location: '));
  interaction.choose(validLocations, function (err, locationIndex) {
    callback(err, validLocations[locationIndex]);
  });
};

exports.getGroup = function getGroup(client, name, callback) {
  client.resourceGroups.get(name, function (err, group) {
    if (err) {
      // 404 means doesn't exist
      if (err.statusCode === 404) {
        callback(null, null);
      } else {
        // some other error, let it out
        callback(err);
      }
    } else {
      // No error, group exists
      callback(null, group.resourceGroup);
    }
  });
};

exports.getResource = function getResource(client, resourceGroup, identity, callback) {
  client.resources.get(resourceGroup, identity, function (err, resource) {
    if (err) {
      // 404 means doesn't exist
      if (err.statusCode === 404) {
        callback(null, null);
      } else {
        // some other error, let it out
        callback(err);
      }
    } else {
      // No error, resource exists
      callback(null, resource.resource);
    }
  });
};

exports.createDeployment = function (cli, resourceGroup, name, options, _) {
  var subscription = profile.current.getSubscription(options.subscription);
  var client = subscription.createResourceClient('createResourceManagementClient');

  var templateParameters = createDeploymentParameters(cli, subscription, resourceGroup, options, _);

  //if not provided, derive it from the template file name
  if (!name) {
    var templateName = options.galleryTemplate || options.templateFile || options.templateUri;
    var baseTemplateName = path.basename(templateName);
    //if the file extension is '.json', get rid of it.
    if (utils.stringEndsWith(baseTemplateName, '.json', true)) {
      baseTemplateName = path.basename(baseTemplateName, path.extname(baseTemplateName));
    }
    name = baseTemplateName;
  }

  var result = cli.interaction.withProgress($('Creating a deployment'),
    function (log, _) {
      var validationResponse = client.deployments.validate(resourceGroup, name, templateParameters, _);
      var createResponse = client.deployments.createOrUpdate(resourceGroup, name, templateParameters, _);
      createResponse.requiredProviders = getTemplateProviders(validationResponse);
      return createResponse;
    }, _);

  cli.output.info(util.format($('Created template deployment "%s"'), name));

  // register providers required for new template
  addKnownProviders(subscription);
 
  cli.interaction.withProgress($('Registering providers'),
    function (log, _) {
      for (var i = 0; i < result.requiredProviders.length; i++) {
        var namespace = result.requiredProviders[i];
        if (!__.contains(profile.knownResourceNamespaces(), namespace)) {
          log.info(util.format($('Registering provider %s'), namespace));
          subscription.registerResourceNamespace(namespace, _);
        }
      }
    },
    _);

  return result.deployment;

};

exports.validateTemplate = function (cli, resourceGroup, options, _) {
  var subscription = profile.current.getSubscription(options.subscription);
  var client = subscription.createResourceClient('createResourceManagementClient');

  var templateParameters = createDeploymentParameters(cli, subscription, resourceGroup, options, _);

  var response = cli.interaction.withProgress($('Validating the template'),
    function (log, _) {
      return client.deployments.validate(resourceGroup, 'fakedDeploymentName', templateParameters, _);
    }, _);

  response.requiredProviders = getTemplateProviders(response);

  return response;
};

exports.getGalleryTemplateFile = function (subscription, galleryTemplateName, _) {
  var galleryClient = utils.createClient('createGalleryClient', new azure.AnonymousCloudCredentials(),
    subscription.galleryEndpointUrl);
  var galleryItem = galleryClient.items.get(galleryTemplateName, _).item;
  return exports.getTemplateDownloadUrl(galleryItem);
};

exports.getTemplateDownloadUrl = function getTemplateDownloadUrl(templateData) {
  var key = templateData.definitionTemplates.defaultDeploymentTemplateId;
  var urls = Object.keys(templateData.definitionTemplates.deploymentTemplateFileUrls)
    .filter(function (url) { return utils.ignoreCaseEquals(key, url); });

  if (urls.length === 0) {
    throw new Error($('Error in template, the key %s is not found in deploymentTemplateFileUrls'));
  }

  return templateData.definitionTemplates.deploymentTemplateFileUrls[urls[0]];
};

exports.getAllEvents = function (subscription, groupName) {
  var output = through();
  var client = subscription.createResourceClient('createEventsClient');

  client.eventData.listEventsForResourceGroup({
    resourceGroupName: groupName,
    startTime: new Date(Date.now() - eventRetentionPeriodMS),
    endTime: new Date()
  }, function (err, response) {
    if (err) {
      return output.emit('error', err);
    }

    response.eventDataCollection.value.forEach(function (e) {
      output.queue(e);
    });
    output.end();
  });
  return output;
};

exports.getDeploymentLog = function (subscription, name, deploymentName) {
  var output = through();
  var client = subscription.createResourceClient('createResourceManagementClient');

  client.deployments.get(name, deploymentName, function (err, result) {
    if (err) {
      return output.emit('error', err);
    }
    getDeploymentLogs(subscription, result.deployment.properties.correlationId).pipe(output);
  });
  return output;
};

exports.getLastDeploymentLog = function (subscription, name) {
  var output = through();
  var client = subscription.createResourceClient('createResourceManagementClient');

  client.deployments.list(name, { top: 1 }, function (err, response) {
    if (err) { return output.emit('error', err); }
    if (response.deployments.length === 0) {
      output.emit('error', new Error($('Deployment not found')));
    }
    getDeploymentLogs(subscription, response.deployments[0].properties.correlationId).pipe(output);
  });
  return output;
};

exports.normalizeDownloadFileName = function normalizeDownloadFileName(name, file, quiet, confirmer, callback) {
  name = name + '.json';
  var downloadFile = path.resolve(file || name);

  function ensureDirExists(dirname) {
    if (!dirname) {
      return;
    }

    if (utils.pathExistsSync(dirname)) {
      if (!fs.statSync(dirname).isDirectory()) {
        throw new Error(util.format($('Path %s already exists and is not a directory.'), dirname));
      }
      return;
    }

    ensureDirExists(path.dirname(dirname));

    fs.mkdirSync(dirname);
  }

  function normalizeFile() {
    try {
      ensureDirExists(path.dirname(downloadFile));
      if (utils.pathExistsSync(downloadFile) && !quiet) {
        confirmer(
          util.format($('The file %s already exists. Overwrite? [y/n]: '), downloadFile),
            function (confirmed) {
              if (confirmed) {
                callback(null, downloadFile);
              } else {
                callback(null, null);
              }
            }
        );
      } else {
        callback(null, downloadFile);
      }
    } catch (ex) {
      callback(ex);
    }
  }

  function normalizeDirectory() {
    downloadFile = path.join(downloadFile, name);
    normalizeFile();
  }

  if (utils.pathExistsSync(downloadFile) && fs.statSync(downloadFile).isDirectory()) {
    normalizeDirectory();
  } else {
    normalizeFile();
  }
};

exports.warnOnUsingStorage = function (options, log) {
  if (options.storageAccount) {
    log.warn($('Storage account parameter is not used anymore and will be removed soon in a future release.'));
  }
};

function createDeploymentParameters(cli, subscription, resourceGroup, options, _) {
  var templateOptions = [options.galleryTemplate, options.templateFile, options.templateUri];
  var templateOptionsProvided = templateOptions.filter(function (value) { return value !== undefined; }).length;
  if (templateOptionsProvided > 1) {
    throw new Error($('Specify exactly one of the --gallery-template, --template-file, or template-uri options.'));
  } else if (templateOptionsProvided === 0) {
    throw new Error($('One of the --gallery-template, --template-file, or --template-uri options is required.'));
  }

  if (options.parameters && options.parametersFile) {
    throw new Error($('Either --parameters or --parameters-file need to be specified. Not both.'));
  }

  var deploymentParameters;
  if (options.parametersFile) {
    var jsonFile = fs.readFileSync(options.parametersFile, 'utf8');
    deploymentParameters = JSON.parse(utils.stripBOM(jsonFile));
  } else if (options.parameters) {
    deploymentParameters = JSON.parse(options.parameters);
  }

  var templateParameters = { mode: 'Incremental' };
  cli.interaction.withProgress($('Initializing template configurations and parameters'),
    function (log, _) {

      var templateUri = options.templateUri;
      if (!templateUri) {
        var templateContent = getTemplateContent(subscription,
           options.templateFile,
           options.galleryTemplate,
           _);
        templateParameters['template'] = templateContent;
      } else {
        templateParameters['templateLink'] = { uri: templateUri };
        if (options.templateVersion) {
          templateParameters.templateLink.contentVersion = options.templateVersion;
        }
      }

      if (deploymentParameters) {
        templateParameters.parameters = deploymentParameters;
      }

    }, _);
  return templateParameters;
}

var eventRetentionPeriodMS = 89 * 24 * 60 * 60 * 1000; // 89 days in milliseconds

function getDeploymentLogs(subscription, correlationId) {
  var output = through();
  var client = subscription.createResourceClient('createEventsClient');
  client.eventData.listEventsForCorrelationId({
    correlationId: correlationId,
    startTime: new Date(Date.now() - eventRetentionPeriodMS),
    endTime: new Date()
  }, function (err, response) {
    if (err) {
      return output.emit('error', err);
    }
    response.eventDataCollection.value.forEach(function (e) {
      output.queue(e);
    });
    output.end();
  });
  return output;
}

function getTemplateProviders(validationResponse) {
  return __.map(validationResponse.properties.providers, function (provider) {
    return provider.namespace.toLowerCase();
  });
}

function addKnownProviders(subscription) {
  __.each(subscription.registeredResourceNamespaces, function (ns) {
    profile.addKnownResourceNamespace(ns);
  });

  __.each(subscription.registeredProviders, function (ns) {
    profile.addKnownProvider(ns);
  });
}

function getTemplateContent(subscription, templateFile, galleryTemplateName, _) {
  function readTemplateFileContentFromUri(templateFileUri, callback) {
    request(templateFileUri, function (error, response, body) {
      callback(error, body);//need to filter on some errors?
    });
  }

  var templateFileUri;
  if (templateFile) {
    if (validation.isURL(templateFile)) {
      templateFileUri = templateFile;
    }
  } else if (galleryTemplateName) {
    templateFileUri = exports.getGalleryTemplateFile(subscription, galleryTemplateName, _);
  }

  var content = {};
  if (templateFileUri) {
    content = readTemplateFileContentFromUri(templateFileUri, _);
  } else if (templateFile) {
    content = fs.readFileSync(utils.stripBOM(templateFile));
  }

  return JSON.parse(content);
}
