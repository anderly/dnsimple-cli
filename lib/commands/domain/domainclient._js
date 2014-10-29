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

var util = require('util');
var url = require('url');

var async = require('async');

var profile = require('../../util/profile');
var cacheUtils = require('../../util/cacheUtils');

var __ = require('underscore');

var utils = require('../../util/utils');

//var dnsimple = require('dnsimple');

var $ = utils.getLocaleString;

function DomainClient(cli, subscription) {
  this.cli = cli;
  this.subscription = subscription;
}

__.extend(DomainClient.prototype, {
  getDomains: function (context, _) {
    var self = this;

    var progress;

    var dns = self.createDnsimpleClient(context.subscription);

    // //self.ensureSpaces(context, _);
    // //blah

    progress = self.cli.interaction.progress($('Getting domains'));
    try {
      var domains = dns.proxy(_).domains.list(false, _);

    // var domains = [
    //   {
    //     id: 1,
    //     name: "anderly.com",
    //     record_count: 5,
    //     expires_on: "2015-01-16"
    //   }
    // ];

      // self.cli.output.json('verbose', domains);
      cacheUtils.saveDomains(context.subscription, domains, _);
      return domains.sort(function(a, b){
         var nameA=a.name.toLowerCase(), nameB=b.name.toLowerCase()
         if (nameA < nameB) //sort string ascending
          return -1 
         if (nameA > nameB)
          return 1
         return 0 //default return value (no sorting)
        });
    }
    finally {
      progress.end();
    }
  },

  createDnsimpleClient: function() {
    return utils._createDnsimpleClient(profile.current.getSubscription(this.subscription), this.cli.output);
  }
});

module.exports = DomainClient;