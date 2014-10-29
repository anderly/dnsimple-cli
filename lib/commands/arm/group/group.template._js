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

var fs = require('fs');
var request = require('request');
var util = require('util');

var profile = require('../../../util/profile');
var utils = require('../../../util/utils');

var groupUtils = require('./groupUtils');

var $ = utils.getLocaleString;

var azure = require('azure');

exports.init = function(cli) {
  profile.addKnownResourceNamespace('successbricks.cleardb', 'microsoft.insights');
  profile.addKnownProvider('website', 'sqlserver');

  var log = cli.output;
  var group = cli.category('group');

  var groupTemplate = group.category('template')
    .description($('Commands to manage your local or gallery resource group template'));

  groupTemplate.command('list')
    .description($('Lists gallery resource group templates'))
    .option('-c --category [category]', $('the category of the templates to list'))
    .option('-p --publisher [publisher]', $('the publisher of the templates to list'))
    .option('--subscription <subscription>', $('the Azure subscription to run against'))
    .execute(function (options, _) {
      var client = createGalleryClient(profile.current.getSubscription(options.subscription));

      var filters = [];
      if (options.publisher) {
        filters.push(util.format('Publisher eq \'%s\'', options.publisher));
      }

      if (options.category) {
        filters.push(util.format('CategoryIds/any(c: c eq \'%s\')', options.category));
      }

      var result = cli.interaction.withProgress($('Listing gallery resource group templates'),
        function (log, _) {
          return client.items.list(filters.length === 0 ? null : { filter: filters.join(' and ') }, _);
        }, _);

      cli.interaction.formatOutput(result.items, function (data) {
        if (data.length === 0) {
          log.info($('No gallery resource group templates'));
        } else {
          var validItems = data.filter(function (c) {
            return !utils.stringEndsWith(c.version, '-placeholder', true);
          });
          var sortedItems = validItems.sort(function (left, right) {
            return left.publisher.localeCompare(right.publisher);
          });
          log.table(sortedItems, function (row, item) {
            row.cell($('Publisher'), item.publisher);
            row.cell($('Name'), item.identity);
          });
        }
      });
    });

  groupTemplate.command('show [name]')
    .description($('Shows a gallery resource group template'))
    .usage('[options] <name>')
    .option('-n --name <name>', $('the name of template to show'))
    .option('--subscription <subscription>', $('the Azure subscription to run against'))
    .execute(function (name, options, _) {

      if (!name) {
        return cli.missingArgument('name');
      }

      var client = createGalleryClient(profile.current.getSubscription(options.subscription));

      var result = cli.interaction.withProgress($('Showing a gallery resource group template'),
        function (log, _) {
          return client.items.get(name, _);
        }, _);

      cli.interaction.formatOutput(result.item, function (data) {
        log.data($('Name:        '), data.identity);
        log.data($('Publisher:   '), data.publisher);
        log.data($('Version:     '), data.version);
        log.data($('Url:         '), groupUtils.getTemplateDownloadUrl(data));
        log.data($('Summary:     '), data.summary);
        log.data($('Description: '), data.description);
      });
    });

  groupTemplate.command('download [name] [file]')
    .description($('Downloads a gallery resource group template'))
    .usage('[options] [name] [file]')
    .option('-n --name <name>', $('the name of the template to download'))
    .option('-f --file <file>', $('the name of the destination directory or file'))
    .option('-q --quiet', $('quiet mode (do not prompt for overwrite if output file exists)'))
    .option('--subscription <subscription>', $('the Azure subscription to run against'))
    .execute(function (name, file, options, _) {

      if (!name) {
        return cli.missingArgument('name');
      }
      var confirm = cli.interaction.confirm.bind(cli.interaction);

      var downloadFileName = groupUtils.normalizeDownloadFileName(name, file, options.quiet, confirm, _);
      if (!downloadFileName) {
        // overwrite not confirmed, stop
        return;
      }

      var client = createGalleryClient(profile.current.getSubscription(options.subscription));
      var result = cli.interaction.withProgress(
        util.format($('Getting gallery resource group template %s'), name),
        function (log, _) {
          return client.items.get(name, _);
        }, _);

      var downloadUrl = groupUtils.getTemplateDownloadUrl(result.item);
      var waitForDownloadEnd = function (stream, callback) {
        stream.on('close', function () {
          callback(null);
        });
        stream.on('error', function (ex) {
          callback(ex);
        });
      };

      return waitForDownloadEnd(request(downloadUrl).pipe(fs.createWriteStream(downloadFileName)), _);
    });

  groupTemplate.command('validate [resource-group]')
    .description($('Validates a template to see whether it\'s using the right syntax, resource providers, resource types, etc.'))
    .usage('[options] <resource-group>')
    .option('-g --resource-group <resource-group>', $('the name of the resource group'))
    .option('-y --gallery-template <gallery-template>', $('the name of the template in the gallery'))
    .option('-f --template-file <template-file>', $('the path to the template file in the file system'))
    .option('--template-uri <template-uri>', $('the uri to the remote template file'))
    .option('--template-version <template-version>', $('the content version of the template'))
    .option('-s --storage-account <storage-account>', $('the storage account where we will upload the template file'))
    .option('-p --parameters <parameters>', $('a JSON-formatted string containing parameters'))
    .option('-e --parameters-file <parametersFile>', $('a file containing parameters'))
    .option('--subscription <subscription>', $('the subscription identifier'))
    .execute(function (resourceGroup, options, _) {
      if (!resourceGroup) {
        return cli.missingArgument('resourceGroup');
      }
      groupUtils.warnOnUsingStorage(options, log);
      groupUtils.validateTemplate(cli, resourceGroup, options, _);
    });
};

function createGalleryClient(subscription) {
  return utils.createClient('createGalleryClient', new azure.AnonymousCloudCredentials(),
    subscription.galleryEndpointUrl);
}
