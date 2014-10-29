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
var tokenCache = require('../util/authentication/adalAuth').tokenCache;
var utils = require('../util/utils');

var $ = utils.getLocaleString;

var DomainClient = require('./domain/domainclient');

exports.init = function (cli) {
  var log = cli.output;

  var domain = cli.category('domain')
    .description($('Commands to manage domains'));

  var domainClient = new DomainClient(cli);

  domain.command('list')
    .description($('List domains'))
    .execute(function (options, _) {
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id
      };

      context.skipCache = true;
      var domains = domain.doDomainsGet(context, _);

      // if (name) {
      //   domains = domains.filter(function (s) {
      //     var currentSiteName = WebsitesClient.parseSiteName(s.name);
      //     return utils.ignoreCaseEquals(currentSiteName.name, name);
      //   });
      // }

      cli.interaction.formatOutput(domains, function (data) {
        if (data.length > 0) {
          log.table(data, function (row, item) {
            //var parsedName = WebsitesClient.parseSiteName(item.name);
            row.cell($('Name'), item.name);
            row.cell($('Records'), item.record_count);
            row.cell($('Expires'), item.expires_on);
            row.cell($('Auto-Renew'), item.auto_renew);
            row.cell($('Whois-Protected'), item.whois_protected);
            // row.cell($('Location'), getSiteLocation(context.spaces, item));
            // row.cell($('Mode'), getSiteMode(item));
            // row.cell($('URL'), item.hostNames);
          });
        } else {
          log.info($('No domains added yet. You can add new domains using "dnsimple domain add" or through the portal'));
        }
      });
    });

  domain.command('show [domain]')
    .description($('Show details about a domain'))
    .option('-s --domain <domain>', $('The domain to show'))
    .option('-d --details', $('Show extra information about the domain'))
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

  domain.command('add <domain>')
    .description($('Add the domain to your account'))
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

  domain.command('delete')
    .description($('Remove a domain from your account.'))
    .option('-s --domain <domain>', $('Domain name or id to remove'))
    .option('-q --quiet', $('quiet mode, do not ask for delete confirmation'))
    .execute(function (options, _) {
      var matchSubscription = function () { return false; };
      var matchEnvironment = function () { return false; };
      var clearAll = false;

      if(!options.subscription && !options.environment) {
        clearAll = true;
        var shouldClear = options.quiet || cli.interaction.confirm($('This will clear all domain information. Are you sure? '), _);
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

  domain.doDomainsGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getDomains(options, callback);
  };

};
