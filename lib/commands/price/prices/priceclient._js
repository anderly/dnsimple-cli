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

function PriceClient(cli, subscription) {
  this.cli = cli;
  this.subscription = subscription;
}

__.extend(PriceClient.prototype, {

  getPrices: function (context, _) {
    var self = this;

    var dns = self.createDnsimpleClient(context.subscription).create(_);

    var prices;
    var progress = self.cli.interaction.progress($('Getting price list'));
    try {
      prices = dns.prices(_);

      //self.cli.output.json('verbose', domains);
      //cacheUtils.saveDomains(context.subscription, domains, _);
      prices = prices.sort(function(a, b){
        var nameA=a.tld, nameB=b.tld;
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
    return prices;
  },

  createDnsimpleClient: function() {
    return utils._createDnsimpleClient(profile.current.getSubscription(this.subscription), this.cli.output);
  }

});

module.exports = PriceClient;