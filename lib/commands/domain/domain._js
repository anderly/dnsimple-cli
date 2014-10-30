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

var async = require('async');
var __ = require('underscore');
var util = require('util');
var wrap = require('wordwrap').hard(0, 75);
var datejs = require('datejs');
var accounting = require('accounting');

var Constants = require('../../util/constants');
var profile = require('../../util/profile');
var tokenCache = require('../../util/authentication/dnsimpleAuth').tokenCache;
var utils = require('../../util/utils');
var Wildcard = utils.Wildcard;

var $ = utils.getLocaleString;

var DomainClient = require('./domains/domainclient');

exports.init = function (cli) {
  var log = cli.output;

  var domain = cli.category('domain')
    .description($('Commands to manage domains'));

  var domainClient = new DomainClient(cli);

  function sortByName(a, b) {
    var nameA=a.name.toLowerCase(), nameB=b.name.toLowerCase();
    if (nameA < nameB) { //sort string ascending
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    return 0; //default return value (no sorting)
  }

  domain.listCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      expiring: options.expiring
    };

    context.skipCache = true;
    var domains = domain.doDomainsGet(context, _);

    if (name) {

      domains = domains.filter(function (s) {
        if (Wildcard.containWildcards(name)) {
          return Wildcard.isMatch(s.name, name);
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

  domain.deleteCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      }
    };

    var self = this;
    self.lookupDomainName(context, _);

    var shouldDelete = options.quiet || cli.interaction.confirm($('This will permanently remove the domain from your account and cannot be undone. Are you sure? '), _);
    if (!shouldDelete) {
      return;
    }

    return domain.doDomainDelete(context, _);
  },

  domain.checkCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      }
    };

    promptForDomainName(_);

    var domains = context.domain.name.split(',');
    var results = [];
    if (domains.length > 1) {
      // var checks = [];
      // var contexts = [];
      // __.each(domains, function(d) {
      //   contexts.push({
      //     subscription: context.subscription,
      //     domain: {
      //       name: d
      //     }
      //   });
      // });

      // __.each(contexts, function(c) {
      //   checks.push(function(_) {
      //     return domain.doDomainCheck(c, _);
      //   });
      // });

      results = async.map(domains, function(d, _) {
        domain.doDomainCheck({
            subscription: context.subscription,
            domain: {
              name: d
            }
          }, _);
      }, _);
      results = results.sort(sortByName);
      //results = async.parallel(checks, _);
    } else {
      results = [domain.doDomainCheck(context, _)];
    }

    var format = [
      [$('Name'), 'name'],
      [$('Status'), 'status'],
      [$('Price'), null, function (value) {
        return accounting.formatMoney(value.price, value.currency_symbol);
      }]
    ];

    //log.report(format, d);

    log.table(results, function (row, item) {
        //var parsedName = WebsitesClient.parseSiteName(item.name);
        row.cell($('Name'), item.name);
        row.cell($('Status'), item.status);
        row.cell($('Price'), accounting.formatMoney(item.price, item.currency_symbol));
      });

    function promptForDomainName(_) {
      log.silly('promptForDomainName');
      if (context.domain.name === undefined) {
        log.help($('Need a domain name'));
        context.domain.name = cli.interaction.prompt($('Domain: '), _);
      }
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

  domain.command('delete [name]')
    .description($('Remove a domain from your account.'))
    .option('-q --quiet', $('quiet mode, do not ask for delete confirmation'))
    .execute(domain.deleteCommand);

  domain.command('check [name]')
    .description($('Check if a domain is available for registration..'))
    .execute(domain.checkCommand);

  domain.doDomainsGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getDomains(options, callback);
  };

  domain.doDomainGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getDomain(options, callback);
  };

  domain.doDomainAdd = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.addDomain(options, callback);
  };

  domain.doDomainDelete = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.deleteDomain(options, callback);
  };

  domain.doDomainCheck = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.checkDomain(options, callback);
  };

  domain.doRecordsGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getRecords(options, callback);
  };

  domain.doRecordGet = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.getRecord(options, callback);
  };

  domain.doRecordAdd = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.addRecord(options, callback);
  };

  domain.doRecordUpdate = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.updateRecord(options, callback);
  };

  domain.doRecordDelete = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.deleteRecord(options, callback);
  };

  // TODO: remove all these "site."" function and just call websiteClient directly.
  domain.lookupDomainName = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.lookupDomainName(options, callback);
  };

};
