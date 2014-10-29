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

var util = require('util');

var profile = require('../../../util/profile');
var utils = require('../../../util/utils');

var groupUtils = require('./groupUtils');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;

  var group = cli.category('group');
  var deployment = group.category('deployment')
      .description($('Commands to manage your deployment in a resource group'));

  deployment.command('create [resource-group] [name]')
    .description($('Creates a deployment'))
    .option('-g --resource-group <resource-group>', $('the name of the resource group'))
    .option('-n --name <name>', $('the name of the deployment'))
    .option('-y --gallery-template <gallery-template>', $('the name of the template in the gallery'))
    .option('-f --template-file <template-file>', $('the path to the template file in the file system'))
    .option('--template-uri <template-uri>', $('the uri to the remote template file'))
    .option('--template-version <template-version>', $('the content version of the template'))
    .option('-s --storage-account <storage-account>', $('the storage account where we will upload the template file'))
    .option('-p --parameters <parameters>', $('a JSON-formatted string containing parameters'))
    .option('-e --parameters-file <parametersFile>', $('a file containing parameters'))
    .option('--subscription <subscription>', $('the subscription identifier'))
    .execute(function (resourceGroup, name, options, _) {
      if (!resourceGroup) {
        return cli.missingArgument('resourceGroup');
      }
      groupUtils.warnOnUsingStorage(options, log);

      var deployment = groupUtils.createDeployment(cli, resourceGroup, name, options, _);

      displayDeployment(deployment, resourceGroup, true, cli.output);
    });

  deployment.command('list [resource-group] [state]')
    .usage('[options] <resource-group> [state]')
    .description($('Gets deployments'))
    .option('-g --resource-group <resourceGroup>', $('the name of the resource group.'))
    .option('--state <state>', $('filter the deployments by provisioning state (valid ' +
      'values are Accepted, Running, Failed, and Succeeded)'))
    .option('--subscription <subscription>', $('subscription containing deployments to list (optional)'))
    .execute(function (resourceGroup, state, options, _) {
      if (!resourceGroup) {
        return cli.missingArgument('resourceGroup');
      }
      var subscription = profile.current.getSubscription(options.subscription);
      var client = subscription.createResourceClient('createResourceManagementClient');
      var progress = cli.interaction.progress($('Listing deployments'));
      var allDeployments;
      try {
        allDeployments = retrieveDeployments(client, resourceGroup, state, _);
      } finally {
        progress.end();
      }

      cli.interaction.formatOutput(allDeployments, function (outputData) {
        if (outputData) {
          for (var i = 0; i < outputData.length; i++) {
            var deployment = outputData[i];
            displayDeployment(deployment, resourceGroup, false, log);
            if (i !== outputData.length - 1) {
              //Insert an empty line between each deployment.
              log.data($(''));
            }
          }
        }
      });
    });

  deployment.command('show [resource-group] [name]')
    .usage('[options] <resource-group> [deployment-name]')
    .description($('Shows a deployment'))
    .option('-g --resource-group <resourceGroup>', $('the name of the resource group.'))
    .option('-n --name <name>', $('the name of the deployment (if not specified, the most recent deployment is shown)'))
    .option('--subscription <subscription>', $('subscription containing the deployment to display (optional)'))
    .execute(function (resourceGroup, name, options, _) {
      if (!resourceGroup) {
        return cli.missingArgument('resourceGroup');
      }
      var subscription = profile.current.getSubscription(options.subscription);
      var client = subscription.createResourceClient('createResourceManagementClient');
      var progress = cli.interaction.progress($('Getting deployments'));
      var deployment;
      try {
        if (name) {
          deployment = client.deployments.get(resourceGroup, name, _).deployment;
        }
        else {
          //look for the most recent one
          var allDeployments = retrieveDeployments(client, resourceGroup, '', _);
          if (allDeployments && allDeployments.length > 0) {
            allDeployments.sort(function (a, b) {
              return Date.parse(a.properties.timestamp) < Date.parse(b.properties.timestamp);
            });
            deployment = allDeployments[0];
          }
        }
      } finally {
        progress.end();
      }

      if (deployment) {
        displayDeployment(deployment, resourceGroup, true, log);
      }
    });

  deployment.command('stop [resource-group] [name]')
    .usage('[options] <resource-group> [deployment-name]')
    .description($('Stops a deployment'))
    .option('-g --resource-group <resourceGroup>', $('the name of the resource group'))
    .option('-q --quiet', $('quiet mode (do not ask for stop deployment confirmation)'))
    .option('-n --name <name>', $('the name of the deployment (if not specified, the currently running deployment is stopped)'))
    .option('--subscription <subscription>', $('the subscription identifier'))
    .execute(function (resourceGroup, name, options, _) {
      if (!resourceGroup) {
        return cli.missingArgument('resourceGroup');
      }
      var subscription = profile.current.getSubscription(options.subscription);
      var client = subscription.createResourceClient('createResourceManagementClient');
      var deploymentToStop = name;

      if (!name) {
        cli.interaction.withProgress($('Looking for "Running" or "Accepted" deployment'),
          function (log, _) {
            //We leverage service side filtering for simplicity and less payload on the wire. If user data
            //proves the extra round trip causes non-trivial latency, we can choose to do it at the client side.
            var allRunningDeployments = retrieveDeployments(client, resourceGroup, 'Running', _);
            var allAcceptedDeployments = retrieveDeployments(client, resourceGroup, 'Accepted', _);
            var allCancellableDeployments = allRunningDeployments;
            if (!allCancellableDeployments){
              allCancellableDeployments = allAcceptedDeployments;
            } else {
              allCancellableDeployments = allCancellableDeployments.concat(allAcceptedDeployments);
            }

            if (allCancellableDeployments && allCancellableDeployments.length > 0) {
              if (allCancellableDeployments.length > 1) {
                throw new Error($('There are more than 1 deployment in either "Running" or "Accepted" state, please name one.'));
              }
              deploymentToStop = allCancellableDeployments[0].deploymentName;
              log.info(util.format($('Found a deployment: %s'), deploymentToStop));
            }
            else {
              log.info($('There is no deployment to stop.'));
            }
          }, _);
      }

      if (deploymentToStop) {
        if (!options.quiet &&
            !cli.interaction.confirm(util.format($('Stop deployment %s? [y/n]: '), deploymentToStop), _)) {
          return;
        }

        var progress = cli.interaction.progress($('Stopping deployment'));

        try {
          client.deployments.cancel(resourceGroup, deploymentToStop, _);
        } finally {
          progress.end();
        }
      }
    });
};

function retrieveDeployments(client, resourceGroup, state, _) {
  var response = client.deployments.list(resourceGroup, { provisioningState: state }, _);
  var allDeployments = response.deployments;
  var nextLink = response.nextLink;

  while (nextLink) {
    response = client.deployments.listNext(nextLink, _);
    allDeployments = allDeployments.concat(response.deployments);
    nextLink = response.nextLink;
  }

  return allDeployments;
}

function displayDeployment(deployment, resourceGroup, showDetail, log) {
  log.data($('DeploymentName     :'), deployment.name || deployment.deploymentName);
  log.data($('ResourceGroupName  :'), resourceGroup);
  log.data($('ProvisioningState  :'), deployment.properties.provisioningState);
  log.data($('Timestamp          :'), deployment.properties.timestamp);
  log.data($('Mode               :'), deployment.properties.mode);
  if (showDetail) {
    if (deployment.properties.templateLink) {
      log.data($('TemplateLink       :'), deployment.properties.templateLink.uri);
      log.data($('ContentVersion     :'), deployment.properties.templateLink.contentVersion);
    }
    log.table(deployment.properties.parameters, function (row, item) {
      row.cell($('Name'), item);
      row.cell($('Type'), deployment.properties.parameters[item].type);
      row.cell($('Value'), deployment.properties.parameters[item].value);
    });
  }
}