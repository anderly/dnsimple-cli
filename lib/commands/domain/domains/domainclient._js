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

    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    progress = self.cli.interaction.progress(util.format($('Getting%s domains'), context.expiring ? $(' expiring') : ''));
    try {
      var domains = dns.domains.list(false, _);

      // self.cli.output.json('verbose', domains);
      cacheUtils.saveDomains(context.subscription, domains, _);
      return domains.sort(function(a, b){
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
  },

  getDomain: function (context, _) {
    var self = this;

    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var domainName = context.domain.name;

    progress = self.cli.interaction.progress(util.format($('Getting details for domain %s'), domainName));
    try {
      var domain = dns.domains.show(domainName, _);

      // self.cli.output.json('verbose', domains);
      return domain;
    }
    finally {
      progress.end();
    }
  },

  addDomain: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    progress = self.cli.interaction.progress(util.format($('Adding domain %s'), domainName));
    try {
      var domain = dns.domains.add(domainName, _);

      // self.cli.output.json('verbose', domains);
      return domain;
    }
    finally {
      progress.end();
    }
  },

  deleteDomain: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    progress = self.cli.interaction.progress(util.format($('Deleting domain %s'), domainName));
    try {
      return dns.domains.delete(domainName, _);
    }
    finally {
      progress.end();
    }
  },

  getRecords: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;

    progress = self.cli.interaction.progress(util.format($('Getting records for domain %s'), domainName));
    try {
      var records = dns.dns.list(domainName, _);

      return records;
    }
    finally {
      progress.end();
    }
  },

  getRecord: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var recordId = context.record.id;

    progress = self.cli.interaction.progress(util.format($('Getting record %s for domain %s'), recordId, domainName));
    try {
      var record = dns.dns.show(domainName, recordId, _);

      return record;
    }
    finally {
      progress.end();
    }
  },

  addRecord: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var r = context.record;

    progress = self.cli.interaction.progress(util.format($('Adding record to domain %s'), domainName));
    try {
      var record = dns.dns.add(domainName, r, _);

      return record;
    }
    finally {
      progress.end();
    }
  },

  updateRecord: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var r = context.record;

    progress = self.cli.interaction.progress(util.format($('Updating record %s for domain %s'), r.id, domainName));
    try {
      var record = dns.dns.update(domainName, r.id, r, _);

      return record;
    }
    finally {
      progress.end();
    }
  },

  deleteRecord: function (context, _) {
    var self = this;
    var progress;

    var dns = self.createDnsimpleClient(context.subscription).create(_);
    var domainName = context.domain.name;
    var recordId = context.record.id;

    progress = self.cli.interaction.progress(util.format($('Deleting record %s for domain %s'), recordId, domainName));
    try {
      return dns.dns.delete(domainName, recordId, _);
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