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

var profile = require('../../util/profile');
var utils = require('../../util/utils');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;
  var domain = cli.category('domain');
  var domainRecords = domain.category('record')
    .description($('Commands to manage your domain dns records'));

  domainRecords.listCommand = function (name, options, _) {
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        }
      };

      domain.lookupDomainName(context, _);

      var records = domain.doRecordsGet(context, _);

      cli.interaction.formatOutput(records, function (data) {
        if (data.length > 0) {
          log.table(data, function (row, item) {
            row.cell($('ID'), item.id);
            row.cell($('Type'), item.record_type);
            row.cell($('Name'), item.name);
            row.cell($('TTL'), item.ttl);
            row.cell($('Content'), item.content);
          });
        } else {
          log.info($('No records defined yet'));
        }
      });
    };

  domainRecords.command('list [name]')
    .usage('[options] [name]')
    .description($('Show your domain dns records'))
    .execute(domainRecords.listCommand);

};