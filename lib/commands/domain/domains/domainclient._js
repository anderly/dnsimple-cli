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
var profile = require('../../../util/profile');
var cacheUtils = require('../../../util/cacheUtils');

var __ = require('underscore');

var utils = require('../../../util/utils');
var util = require('util');

var $ = utils.getLocaleString;

function DomainClient(cli, subscription) {
  this.cli = cli;
  this.subscription = subscription;
}

__.extend(DomainClient.prototype, {

  getDomains: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domains;
    var progress = self.cli.interaction.progress(util.format($('Getting%s domains'), context.expiring ? $(' expiring') : ''));
    try {
      domains = dns.domains.list(false, _);

      //self.cli.output.json('verbose', domains);
      cacheUtils.saveDomains(context.subscription, domains, _);
      domains = domains.sort(function(a, b){
        var nameA=a.name.toLowerCase(), nameB=b.name.toLowerCase();
        if (nameA < nameB) { //sort string ascending
          return -1;
        }
        if (nameA > nameB) {
          return 1;
        }
        return 0; //default return value (no sorting)
      });
    }
    finally {
      progress.end();
    }
    return domains;
  },

  getDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;

    var domain;
    var progress = self.cli.interaction.progress(util.format($('Getting details for domain %s'), domainName));
    try {
      domain = dns.domains.show(domainName, _);
    }
    finally {
      progress.end();
    }
    return domain;
  },

  addDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    var domain;
    var progress = self.cli.interaction.progress(util.format($('Adding domain %s'), domainName));
    try {
      domain = dns.domains.add(domainName, _);
    }
    finally {
      progress.end();
    }
    return domain;
  },

  deleteDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    var progress = self.cli.interaction.progress(util.format($('Deleting domain %s'), domainName));
    try {
      dns.domains.delete(domainName, _);
    }
    finally {
      progress.end();
    }
  },

  resetToken: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;

    var result;
    var progress = self.cli.interaction.progress(util.format($('Resetting token for domain %s'), domainName));
    try {
      result = dns.domains.resetToken(domainName, _);
    }
    finally {
      progress.end();
    }
    return result;
  },

  pushDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;
    var newAccountEmail = context.push.new_user_email;
    var newAccountContact = context.push.contact_id;

    var result;
    var progress = self.cli.interaction.progress(util.format($('Pushing domain %s to account %s'), domainName, newAccountEmail));
    try {
      result = dns.domains.push(domainName, newAccountEmail, newAccountContact, _).domain;
    }
    finally {
      progress.end();
    }
    return result;
  },

  checkDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;

    var result;
    var progress = self.cli.interaction.progress(util.format($('Checking availability of domain %s'), domainName));
    try {
      result = dns.domains.check(domainName, _);
    }
    finally {
      progress.end();
    }
    return result;
  },

  registerDomain: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;
    var registrantId = context.domain.registrant_id;

    var result;
    var progress = self.cli.interaction.progress(util.format($('Registering domain %s'), domainName));
    try {
      result = dns.domains.register(domainName, registrantId, _);
    }
    finally {
      progress.end();
    }
    return result;
  },

  getRecords: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    var records;
    var progress = self.cli.interaction.progress(util.format($('Getting records for domain %s'), domainName));
    try {
      records = dns.dns.list(domainName, _);      
    }
    finally {
      progress.end();
    }
    return records;
  },

  getRecord: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var recordId = context.record.id;

    var record;
    var progress = self.cli.interaction.progress(util.format($('Getting record %s for domain %s'), recordId, domainName));
    try {
      record = dns.dns.show(domainName, recordId, _);
    }
    finally {
      progress.end();
    }
    return record;
  },

  addRecord: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var r = context.record;

    var record;
    var progress = self.cli.interaction.progress(util.format($('Adding record to domain %s'), domainName));
    try {
      record = dns.dns.add(domainName, r, _);
    }
    finally {
      progress.end();
    }
    return record;
  },

  updateRecord: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var r = context.record;

    var record;
    var progress = self.cli.interaction.progress(util.format($('Updating record %s for domain %s'), r.id, domainName));
    try {
      record = dns.dns.update(domainName, r.id, r, _);
    }
    finally {
      progress.end();
    }
    return record;
  },

  deleteRecord: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var recordId = context.record.id;

    var progress = self.cli.interaction.progress(util.format($('Deleting record %s for domain %s'), recordId, domainName));
    try {
      dns.dns.delete(domainName, recordId, _);
    }
    finally {
      progress.end();
    }
  },

  createDnsimpleClient: function() {
    return utils._createDnsimpleClient(profile.current.getSubscription(this.subscription), this.cli.output);
  },

  lookupDomainName: function (context, _) {
    var self = this;

    if (context.domain.name !== undefined) {
      // no need to read further
      return;
    }

    var cfg = self.readConfig(_);
    if (cfg && cfg.name) {
      // using the name from current location
      context.domain.name = cfg.name;
      return;
    }

    context.domain.name = self.cli.interaction.prompt($('Domain name: '), _);

    if (!context.domain.name) {
      throw new Error($('Invalid domain name'));
    }

    return context;
  },

  /////////////////
  // config and settings

  readConfig: function (_) {
    var self = this;

    return {
      name: self.readConfigValue('dnsimple.domain.name', _)
    };
  },

  writeConfig: function (cfg, _) {
    var self = this;

    self.writeConfigValue('dnsimple.domain.name', cfg.name, _);
  },

  readConfigValue: function (name, _) {
    var self = this;

    try {
      var result = exec('git config --get ' + name, _);
      return (result.stdout + result.stderr).trim();
    }
    catch (err) {
      self.cli.output.silly($('Unable to read config'), err);
      return '';
    }
  },

  writeConfigValue: function (name, value, _) {
    exec('git config ' + name + ' ' + value, _);
  }
});

/////////////////
// helper methods

function exec(cmd, cb) {
  /*jshint camelcase:false*/
  child_process.exec(cmd, function (err, stdout, stderr) {
    cb(err, {
      stdout: stdout,
      stderr: stderr
    });
  });
}

module.exports = DomainClient;