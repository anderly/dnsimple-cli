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
var datejs = require('datejs');

var Constants = require('../../util/constants');
var profile = require('../../util/profile');
var tokenCache = require('../../util/authentication/dnsimpleAuth').tokenCache;
var utils = require('../../util/utils');

var $ = utils.getLocaleString;

var DomainClient = require('./domains/domainclient');

exports.init = function (cli) {
  var log = cli.output;

  var domain = cli.category('domain')
    .description($('Commands to manage domains'));

  var domainClient = new DomainClient(cli);

  domain.listCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      expiring: options.expiring
    };

    context.skipCache = true;
    var domains = domain.doDomainsGet(context, _);

    if (name) {

      domains = domains.filter(function (s) {
        if (name.indexOf('*') !== -1) {
          var pattern = '^'+name.replace(/\*/gi,'(.*)')+'$';
          var regEx = new RegExp(pattern, 'gi');
          return regEx.test(s.name);
        } else {
          return utils.ignoreCaseEquals(s.name, name);
        }
      });
    }

    if (options.expiring) {
      domains = domains.filter(function (s) {
        var within30Days = (30).days().fromNow();
        var expires = Date.parse(s.expires_on);
        return expires >= Date.today() && expires <= within30Days;
      });
    }

    cli.interaction.formatOutput(domains, function (data) {
      if (data.length > 0) {
        log.table(data, function (row, item) {
          //var parsedName = WebsitesClient.parseSiteName(item.name);
          row.cell($('Name'), item.name);
          row.cell($('Records'), item.record_count);
          row.cell($('Expires'), item.expires_on);
          row.cell($('Auto-Renew'), item.auto_renew ? 'Yes' : 'No');
          row.cell($('Whois-Protected'), item.whois_protected ? 'Yes' : 'No');
        });
      } else {
        log.info($('No domains added yet. You can add new domains using "dnsimple domain add" or through the portal'));
      }
    });
  },

  domain.showCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      }
    };

    var self = this;

    self.lookupDomainName(context, _);

    context.skipCache = true;
    var d = domain.doDomainGet(context, _);
    
    var format = [
      [$('Id'), 'id'],
      [$('Name'), 'name'],
      [$('State'), 'state'],
      [$('Records'), 'record_count'],
      [$('Services'), 'service_count'],
      [$('Auto-Renew'), null, function (value) {
        if (value.auto_renew) {
          return $('Yes');
        }
        return $('No');
      }],
      [$('Whois-Protected'), null, function (value) {
        if (value.whois_protected) {
          return $('Yes');
        }
        return $('No');
      }],
      [$('Expires'), 'expires_on']
    ];

    var detailsFormat = [
      [$('Domain Token'), 'token']
    ];

    log.report(format.concat(options.details ? detailsFormat : []), d);
  },

  domain.addCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      },
      flags: { }
    };

    promptForDomainName(_);

    determineIfDomainExists(_);

    if (context.flags.domainExists) {
      throw new Error(util.format($('Can\'t add domain %s because it already exists.'), context.domain.name));
    }

    var d = domain.doDomainAdd(context, _);

    var format = [
      [$('Id'), 'id'],
      [$('Name'), 'name'],
      [$('State'), 'state'],
      [$('Records'), 'record_count'],
      [$('Services'), 'service_count'],
      [$('Auto-Renew'), null, function (value) {
        if (value.auto_renew) {
          return $('Yes');
        }
        return $('No');
      }],
      [$('Whois-Protected'), null, function (value) {
        if (value.whois_protected) {
          return $('Yes');
        }
        return $('No');
      }],
      [$('Expires'), 'expires_on']
    ];

    log.info('Successfully added domain:');
    log.report(format, d);

    function promptForDomainName(_) {
      log.silly('promptForDomainName');
      if (context.domain.name === undefined) {
        log.help($('Need a domain name'));
        context.domain.name = cli.interaction.prompt($('Name: '), _);
      }
    }

    function determineIfDomainExists(_) {
      log.silly('determineIfDomainExists');
      var d = null;
      try {
        d = domain.doDomainGet(context, _);
      } catch (e) {
        // domain does not exist
      }

      if (d) {
        context.flags.domainExists = true;
      }
      
    }
    
  },

  domain.deleteCommand = function (options, _) {
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
      profile.clearDnsimpleDir();
      tokenCache.clear(_);
    }
  },

  domain.command('list [name]')
    .description($('List domains'))
    .option('-e --expiring', $('only show expiring domains'))
    .execute(domain.listCommand);

  domain.command('show [name]')
    .description($('Show details about a domain'))
    .option('-d --details', $('Show extra information about the domain'))
    .execute(domain.showCommand);

  domain.command('add [name]')
    .description($('Add a domain to your account'))
    .execute(domain.addCommand);

  domain.command('delete')
    .description($('Remove a domain from your account.'))
    .option('-s --domain <domain>', $('Domain name or id to remove'))
    .option('-q --quiet', $('quiet mode, do not ask for delete confirmation'))
    .execute(domain.deleteCommand);

  domain.doDomainGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getDomain(options, callback);
  };

  domain.doDomainAdd = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.addDomain(options, callback);
  };

  domain.doDomainsGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getDomains(options, callback);
  };

  domain.doRecordsGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getRecords(options, callback);
  };

  // TODO: remove all these "site."" function and just call websiteClient directly.
  domain.lookupDomainName = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.lookupDomainName(options, callback);
  };

};
