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
    var domains = domain.client(context).getDomains(context, _);

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
    var d = domain.client(context).getDomain(context, _);
    
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

    var d = domain.client(context).addDomain(context, _);

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

    var shouldContinue = options.quiet || cli.interaction.confirm($('This will permanently remove the domain from your account and cannot be undone. Are you sure? '), _);
    if (!shouldContinue) {
      log.warn('Domain delete cancelled.');
      return;
    }

    return domain.client(context).deleteDomain(context, _);
  },

  domain.resetCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      }
    };

    var self = this;
    self.promptForDomainName(context, _);

    var domains = context.domain.name.split(',');
    var results = [];
    var domainClient = domain.client(context);
    var shouldContinue = options.quiet || cli.interaction.confirm($('This will reset the domain token and prevent api access with the current token.\nYou will need to access the api using the new domain token.\nAre you sure? '), _);
    if (!shouldContinue) {
      log.warn('Domain token reset cancelled.');
      return;
    }
    if (domains.length > 1) {

      results = async.map(domains, function(d, _) {
        domainClient.resetToken({
            subscription: context.subscription,
            domain: {
              name: d
            }
          }, _);
      }, _);
      results = results.sort(sortByName);
    } else {
      results = [domainClient.resetToken(context, _)];
    }
    log.info('Successfully reset domain token:');
    log.table(results, function (row, item) {
        row.cell($('Id'), item.id);
        row.cell($('Name'), item.name);
        row.cell($('Token'), item.token);
      });

  },

  domain.pushCommand = function (useremail, contactid, name, options, _) {
    useremail = cli.interaction.promptIfNotGiven($('The new account\'s email address: '), useremail, _);
    contactid = cli.interaction.promptIfNotGiven($('The new account\'s registrant ID: '), contactid, _);

    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      },
      push: {
        new_user_email: useremail,
        contact_id: contactid
      }
    };

    var self = this;
    self.promptForDomainName(context, _);

    var domains = context.domain.name.split(',');
    var results = [];
    var domainClient = domain.client(context);
    var shouldContinue = options.quiet || cli.interaction.confirm($('Once a domain is pushed you will no longer be able to access it through your account.\nYou will need to access it using the new account\'s credentials.\nAre you sure? '), _);
    if (!shouldContinue) {
      log.warn('Domain push cancelled.');
      return;
    }

    if (domains.length > 1) {

      results = async.map(domains, function(d, _) {
        domainClient.pushDomain({
            subscription: context.subscription,
            domain: {
              name: d
            },
            push: context.push
          }, _);
      }, _);
      results = results.sort(sortByName);
    } else {
      results = [domainClient.pushDomain(context, _)];
    }
    log.info('Successfully pushed the following domains:');
    log.table(results, function (row, item) {
        row.cell($('Id'), item.id);
        row.cell($('Name'), item.name);
        row.cell($('New Account'), useremail);
      });

  },

  domain.checkCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id,
      domain: {
        name: name
      }
    };

    var self = this;
    self.promptForDomainName(context, _);

    var domains = context.domain.name.split(',');
    var results = [];
    var domainClient = domain.client(context);
    if (domains.length > 1) {

      results = async.map(domains, function(d, _) {
        domainClient.checkDomain({
            subscription: context.subscription,
            domain: {
              name: d
            }
          }, _);
      }, _);
      results = results.sort(sortByName);
    } else {
      results = [domainClient.checkDomain(context, _)];
    }

    log.table(results, function (row, item) {
        row.cell($('Name'), item.name);
        row.cell($('Status'), item.status);
        row.cell($('Price'), accounting.formatMoney(item.price, item.currency_symbol));
      });

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

  domain.command('reset [name]')
    .description($('Reset a domain token'))
    .option('-q --quiet', $('quiet mode, do not ask for confirmation'))
    .execute(domain.resetCommand);

  domain.command('push [useremail] [contactid] [name]')
    .usage('[options] <useremail> <contactid> [name]')
    .description($('Move a domain from the current account to another'))
    .option('-u --useremail <useremail>', $('The new account\'s email address.'))
    .option('-c --contactid <contactid>', $('The new account\'s registrant ID.'))
    .option('-q --quiet', $('quiet mode, do not ask for confirmation'))
    .execute(domain.pushCommand);

  domain.command('check [name]')
    .description($('Check if a domain is available for registration'))
    .execute(domain.checkCommand);

  domain.client = function(options) {
    return new DomainClient(cli, options.subscription);
  };

  domain.promptForDomainName = function (context, _) {
    log.silly('promptForDomainName');
    if (context.domain.name === undefined) {
      log.help($('Need a domain name'));
      context.domain.name = cli.interaction.prompt($('Domain: '), _);
    }
  }

  // TODO: remove all these "domain."" function and just call domainClient directly.
  domain.lookupDomainName = function (options, callback) {
    var domainClient = new DomainClient(cli, options.subscription);
    return domainClient.lookupDomainName(options, callback);
  };

};
