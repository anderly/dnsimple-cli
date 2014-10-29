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
'use strict';

/* jshint unused: false */

var __ = require('underscore');
var util = require('util');
var wrap = require('wordwrap').hard(0, 75);

var Constants = require('../util/constants');
var profile = require('../util/profile');
var tokenCache = require('../util/authentication/adalAuth').tokenCache;
var utils = require('../util/utils');

var $ = utils.getLocaleString;

var AccountClient = require('./account/accountclient');

exports.init = function (cli) {
  var log = cli.output;

  var account = cli.category('account')
    .description($('Commands to manage your account information and publish settings'));

  var accountClient = new AccountClient(cli);

  // account.command('download')
  //   .description($('Launch a browser to download your publishsettings file'))
  //   .option('-e, --environment <environment>', $('the publish settings download environment'))
  //   .option('-r, --realm <realm>', $('the organization\'s realm'))
  //   .execute(function (options, _) {
  //     var url = profile.current.getEnvironment(options.environment).getPublishingProfileUrl(options.realm);
  //     cli.interaction.launchBrowser(url, _);
  //     log.help($('Save the downloaded file, then execute the command'));
  //     log.help($('  account import <file>'));
  //   });

  account.command('list')
    .description($('List the imported subscriptions'))
    .execute(function (options, _) {
      var subscriptions = __.values(profile.current.subscriptions);
      var cfg = utils.readConfig();
      log.table(subscriptions, function (row, s) {
        row.cell($('Name'), s.name);
        row.cell($('Id'), s.id);
        row.cell($('Current'), s.isDefault);
      });
    });

  account.command('show [subscription]')
    .description($('Show details about a subscription'))
    .option('-s --subscription <subscription>', $('The subscription to show'))
    .option('-d --details', $('Show extra information about the subscription'))
    .execute(function (subscription, options, _) {
      var sub = profile.current.getSubscription(subscription);
      var format = [
        [$('Name'), 'name'],
        [$('ID'), 'id'],
        [$('Is Default'), 'isDefault'],
        [$('Environment'), 'environment.name'],
        [$('Has Certificate'), null, function (value) {
          if (value.managementCertificate) {
            return $('Yes');
          }
          return $('No');
        }],
        [$('Has Access Token'), null, function (value) {
          if (value.user) {
            return $('Yes');
          }
          return $('No');
        }],
        [$('User name'), 'user.name']
      ];

      var detailsFormat = [
        [$('Registered ASM Providers'), 'registeredProviders'],
        [$('Registered ARM Namespaces'), 'registeredResourceNamespaces']
      ];

      log.report(format.concat(options.details ? detailsFormat : []), sub);
    });

  account.command('set <subscription>')
    .description($('Set the current subscription'))
    .execute(function (subscription, options, _) {
      var newSubscription = profile.current.getSubscription(subscription);
      if (!newSubscription) {
        throw new Error(util.format($('Invalid subscription "%s"'), subscription));
      }
      log.info(util.format($('Setting subscription to "%s"'), subscription));
      profile.current.currentSubscription = newSubscription;
      profile.current.save();
      log.info($('Changes saved'));
    });

  // account.command('import <file>')
  //   .description($('Import a publishsettings file or certificate for your account'))
  //   .option('--skipregister', $('skip registering resources'))
  //   .execute(function (file, options, _) {
  //     profile.current.importPublishSettings(file);
  //     profile.current.save();
  //   });

  account.command('clear')
    .description($('Remove a subscription or environment, or clear all of the stored account and environment info'))
    .option('-s --subscription <subscriptionNameOrId>', $('Subscription name or id to remove'))
    .option('-e --environment <environmentName>', $('Environment name to remove'))
    .option('-q --quiet', $('quiet mode, do not ask for delete confirmation'))
    .execute(function (options, _) {
      var matchSubscription = function () { return false; };
      var matchEnvironment = function () { return false; };
      var clearAll = false;

      if(!options.subscription && !options.environment) {
        clearAll = true;
        var shouldClear = options.quiet || cli.interaction.confirm($('This will clear all account information. Are you sure? '), _);
        if (!shouldClear) {
          return;
        }
        matchSubscription = function () { return true; };
        matchEnvironment = function () { return true; };
      } else {
        if (options.subscription) {
          matchSubscription = function (s) {
            return s.id === options.subscription || utils.ignoreCaseEquals(s.name, options.subscription);
          };
        }
        if (options.environment) {
          matchEnvironment = function (e) {
            return utils.ignoreCaseEquals(e.name, options.environment);
          };
        }
      }

      __.values(profile.current.subscriptions)
        .filter(matchSubscription)
        .forEach(function (subscription) {
          profile.current.deleteSubscription(subscription.name);
        });

      __.values(profile.current.environments)
        .filter(matchEnvironment)
        .forEach(function (env) {
          profile.current.deleteEnvironment(env.name);
        });

      profile.current.save();
      if (clearAll) {
        profile.clearAzureDir();
        tokenCache.clear(_);
      }
    });

  account.registerResourceType = function (resourceName) {
    return accountClient.registerResourceType(resourceName);
  };

  account.knownResourceTypes = function () {
    return accountClient.knownResourceTypes();
  };
};
