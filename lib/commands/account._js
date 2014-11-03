//
// Copyright (c) Adam Anderly.  All rights reserved.
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
// NOTICE: Based on azure-cli (https://github.com/Azure/azure-sdk-tools-xplat/)
//
'use strict';

/* jshint unused: false */

var __ = require('underscore');
var util = require('util');
var wrap = require('wordwrap').hard(0, 75);

var Constants = require('../util/constants');
var profile = require('../util/profile');
var tokenCache = require('../util/authentication/dnsimpleAuth').tokenCache;
var utils = require('../util/utils');

var $ = utils.getLocaleString;

var AccountClient = require('./account/accountclient');

exports.init = function (cli) {
  var log = cli.output;

  var account = cli.category('account')
    .description($('Commands to manage your account information'));

  var accountClient = new AccountClient(cli);

  account.command('list')
    .description($('List the currently authenticated accounts'))
    .execute(function (options, _) {
      var subscriptions = __.values(profile.current.subscriptions);
      var cfg = utils.readConfig();
      log.table(subscriptions, function (row, s) {
        row.cell($('Name'), s.name);
        row.cell($('Id'), s.id);
        row.cell($('Current'), s.isDefault);
        row.cell($('Environment'), s.environment.name);
      });
    });

  account.command('show [subscription]')
    .description($('Show details about an account'))
    .option('-s --subscription <subscription>', $('The subscription to show'))
    .option('-d --details', $('Show extra information about the subscription'))
    .execute(function (subscription, options, _) {
      var sub = profile.current.getSubscription(subscription);
      var format = [
        [$('ID'), 'id'],
        [$('Name'), 'name'],
        [$('Is Default'), 'isDefault'],
        [$('Environment'), 'environment.name'],
        [$('Has Access Token'), null, function (value) {
          if (value.user) {
            return $('Yes');
          }
          return $('No');
        }],
        //[$('Username'), 'user.name']
      ];

      var detailsFormat = [
        [$('Registered ASM Providers'), 'registeredProviders'],
        [$('Registered ARM Namespaces'), 'registeredResourceNamespaces']
      ];

      log.report(format.concat(options.details ? detailsFormat : []), sub);
    });

  account.command('set <subscription>')
    .description($('Set the current account'))
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

  account.command('clear')
    .description($('Remove an account or environment, or clear all of the stored account and environment info'))
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
        profile.clearDnsimpleDir();
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
