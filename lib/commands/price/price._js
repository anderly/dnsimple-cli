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
var accounting = require('accounting');

var Constants = require('../../util/constants');
var profile = require('../../util/profile');
var tokenCache = require('../../util/authentication/dnsimpleAuth').tokenCache;
var utils = require('../../util/utils');
var Wildcard = utils.Wildcard;

var $ = utils.getLocaleString;

var PriceClient = require('./prices/priceclient');

exports.init = function (cli) {
  var log = cli.output;

  var price = cli.category('price')
    .description($('Commands list domain prices'));

  var priceClient = new PriceClient(cli);

  price.listCommand = function (name, options, _) {
    var context = {
      subscription: profile.current.getSubscription(options.subscription).id
    };

    context.skipCache = true;
    var prices = price.client(context).getPrices(context, _);

    cli.interaction.formatOutput(prices, function (data) {
      if (data.length > 0) {
        log.table(data, function (row, item) {
          row.cell($('TLD'), '.'+item.tld);
          row.cell($('Minimum Term'), item.minimum_registration);
          row.cell($('Registration Price'), accounting.formatMoney(item.registration_price));
          row.cell($('Renewal Price'), accounting.formatMoney(item.renewal_price));
          row.cell($('Transfer Price'), accounting.formatMoney(item.transfer_price));
        });
      } else {
        log.info($('No prices found.'));
      }
    });
  },

  price.command('list')
    .description($('List domain prices'))
    .execute(price.listCommand);

  price.client = function(options) {
    return new PriceClient(cli, options.subscription);
  };

};
