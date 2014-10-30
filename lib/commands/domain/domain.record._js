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
var Wildcard = utils.Wildcard;

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

      if (options.type) {
        console.log(options.type);
        records = records.filter(function (r) {
          return utils.ignoreCaseEquals(r.record_type, options.type);
        });
      }

      if (options.filter) {
        records = records.filter(function (r) {
          if (Wildcard.containWildcards(options.filter)) {
            return Wildcard.isMatch(r.content, options.filter);
          } else {
            return utils.ignoreCaseEquals(r.content, name);
          }
        });
      }

      cli.interaction.formatOutput(records, function (data) {
        if (data.length > 0) {
          log.table(data, function (row, item) {
            //if (options.details) {
              row.cell($('Id'), item.id);
            //}
            row.cell($('Type'), item.record_type);
            row.cell($('Name'), item.name || context.domain.name);
            row.cell($('TTL'), item.ttl);
            row.cell($('Content'), item.content.length > 50 ? item.content.substr(0,50) + '...' : item.content);
          });
        } else {
          log.info($('No records defined yet'));
        }
      });
    };

  domainRecords.addCommand = function (recordname, type, content, name, options, _) {
      recordname = cli.interaction.promptIfNotGiven($('Record Name (Leave blank to create a record for the root domain.): '), recordname, _);
      type = cli.interaction.chooseIfNotGiven($('Record Type: '), $('Getting types'), type,
          function (cb) {
            cb(null, [ 'A', 'ALIAS', 'CNAME', 'MX', 'SPF', 'URL', 'TXT', 'NS', 'SRV', 'NAPTR', 'PTR', 'AAAA', 'SSHFP', 'HINFO', 'POOL' ]);
          }, _);

      if (utils.ignoreCaseEquals(type, 'A')) {
        type = 'A';
      } else if (utils.ignoreCaseEquals(type, 'ALIAS')) {
        type = 'ALIAS';
      } else if (utils.ignoreCaseEquals(type, 'CNAME')) {
        type = 'CNAME';
      } else if (utils.ignoreCaseEquals(type, 'MX')) {
        type = 'MX';
      } else if (utils.ignoreCaseEquals(type, 'SPF')) {
        type = 'SPF';
      } else if (utils.ignoreCaseEquals(type, 'URL')) {
        type = 'URL';
      } else if (utils.ignoreCaseEquals(type, 'TXT')) {
        type = 'TXT';
      } else if (utils.ignoreCaseEquals(type, 'NS')) {
        type = 'NS';
      } else if (utils.ignoreCaseEquals(type, 'SRV')) {
        type = 'SRV';
      } else if (utils.ignoreCaseEquals(type, 'NAPTR')) {
        type = 'NAPTR';
      } else if (utils.ignoreCaseEquals(type, 'PTR')) {
        type = 'PTR';
      } else if (utils.ignoreCaseEquals(type, 'AAAA')) {
        type = 'AAAA';
      } else if (utils.ignoreCaseEquals(type, 'SSHFP')) {
        type = 'SSHFP';
      } else if (utils.ignoreCaseEquals(type, 'HINFO')) {
        type = 'HINFO';
      } else if (utils.ignoreCaseEquals(type, 'POOL')) {
        type = 'POOL';
      } else {
        throw new Error($('Invalid record type. Valid types are: A, ALIAS, CNAME, MX, SPF, URL, TXT, NS, SRV, NAPTR, PTR, AAAA, SSHFP, HINFO, POOL'));
      }
      content = cli.interaction.promptIfNotGiven($('Record Content: '), content, _);

      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        },
        record: {}
      };

      var recordName = options.recordname || '';

      var r = {
        name: recordName,
        record_type: type,
        content: content
      };

      if (options.ttl) {
        r['ttl'] = options.ttl;
      }

      if (options.priority) {
        r['prio'] = options.priority;
      }

      context.record = r;
      domain.lookupDomainName(context, _);

      var record = domain.doRecordAdd(context, _);

      var format = [
        [$('Id'), 'id'],
        [$('Name'), 'name'],
        [$('Type'), 'record_type'],
        [$('TTL'), 'ttl'],
        [$('Content'), 'content'],
      ];

      log.info('Successfully added record:');
      log.report(format, record);

    },

  domainRecords.showCommand = function (recordid, name, options, _) {
      recordid = cli.interaction.promptIfNotGiven($('Record ID: '), recordid, _);

      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        },
        record: {
          id: recordid
        }
      };

      domain.lookupDomainName(context, _);

      var record = domain.doRecordGet(context, _);

      var format = [
        [$('Id'), 'id'],
        [$('Name'),  null, function (value) {
          if (value.name) {
            return value.name;
          }
          return context.domain.name;
        }],
        [$('Type'), 'record_type'],
        [$('TTL'), 'ttl'],
        [$('Content'), 'content'],
        [$('Priority'), 'prio'],
      ];

      log.report(format, record);

    },

  domainRecords.command('list [name]')
    .usage('[options] [name]')
    .description($('Show your domain dns records'))
    .option('-t --type <type>', $('Only show records of this type'))
    .option('-f --filter <filter>', $('Only show records whose content matches this filter'))
    .option('-d --details', $('Show extra information about the records'))
    .execute(domainRecords.listCommand);

  domainRecords.command('add [recordname] [type] [content] [name]')
    .usage('[options] <recordname> <type> <content> [name]')
    .description($('Add a dns record to your domain'))
    .option('-r --recordname <recordname>', $('Record name. Use an empty string to create a record for the root domain.'))
    .option('-t --type <type>', $('Type of record to add (A, CNAME, MX, etc.)'))
    .option('-c --content <content>', $('Record content.'))
    .option('-ttl --ttl <ttl>', $('Record TTL.'))
    .option('-p --priority <priority>', $('Record Priority.'))
    .execute(domainRecords.addCommand);

  domainRecords.command('show [recordid] [name]')
    .usage('[options] <recordid> [name]')
    .description($('Show a dns record for a domain'))
    .option('-i --id <recordid>', $('The record id. Use dnsimple domain record list [domain] to see dns records and ids.'))
    .execute(domainRecords.showCommand);

};