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
  var domainMembers = domain.category('member')
    .description($('Commands to manage your domain members'));

  domainMembers.listCommand = function (name, options, _) {
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        }
      };

      domain.lookupDomainName(context, _);

      var members = domain.client(context).getMembers(context, _);

      cli.interaction.formatOutput(members, function (data) {
        if (data.length > 0) {
          log.info($('Domain Members:'));
          log.table(members, function (row, item) {
            //if (options.details) {
              row.cell($('Membership Id'), item.id);
            //}
            row.cell($('User Id'), item.user_id);
            row.cell($('Created At'), item.created_at);
            row.cell($('Updated At'), item.updated_at);
          });
        } else {
          log.info($('No members defined yet'));
        }
      });
    };

  domainMembers.addCommand = function (member, name, options, _) {
      member = cli.interaction.promptIfNotGiven($('Email address of the person to add: '), member, _);

      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        },
        member: member
      };

      domain.lookupDomainName(context, _);

      var member = domain.client(context).addMember(context, _);

      var format = [
        [$('Membership Id'), 'id'],
        [$('Domain Id'), 'domain_id'],
        [$('User Id'), 'user_id'],
        [$('Created At'), 'created_at'],
      ];

      log.info(util.format($('Successfully added member %s to domain %s:'), context.member, name));
      log.report(format, member);

    },

  domainMembers.deleteCommand = function (member, name, options, _) {
      member = cli.interaction.promptIfNotGiven($('Member email address or membership id: '), member, _);

      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        domain: {
          name: name
        },
        member: member
      };

      domain.lookupDomainName(context, _);

      var shouldContinue = options.quiet || cli.interaction.confirm(util.format($('This will permanently remove member %s from domain %s. Are you sure? '), context.member, context.domain.name), _);
      if (!shouldContinue) {
        log.warn('Domain member delete cancelled.');
        return;
      }

      domain.client(context).deleteMember(context, _);

    },

  domainMembers.command('list [name]')
    .usage('[options] [name]')
    .description($('Show domain members'))
    .option('-t --type <type>', $('Only show records of this type'))
    .option('-f --filter <filter>', $('Only show records whose content matches this filter'))
    .option('-d --details', $('Show extra information about the records'))
    .execute(domainMembers.listCommand);

  domainMembers.command('add [member] [name]')
    .usage('[options] <member> [name]')
    .description($('Grant a user access to a domain'))
    .option('-m --member <member>', $('Email address for the person to add.'))
    .execute(domainMembers.addCommand);

  domainMembers.command('delete [member] [name]')
    .usage('[options] <member> [name]')
    .description($('Revoke a user\'s access for a domain'))
    .option('-m --member <member>', $('The member email or membership id. Use dnsimple domain member list [domain] to see existing members.'))
    .option('-q --quiet', $('quiet mode, do not ask for delete confirmation'))
    .execute(domainMembers.deleteCommand);

};