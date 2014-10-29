/**
* Copyright (c) Microsoft.  All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

var permissionsUtils = require('./permissionsUtils');
var profile = require('../../../util/profile');
var utils = require('../../../util/utils');

var rbacClients = require('./rbacClients');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;

  var role = cli.category('role')
    .description($('Commands to manage your Azure roles'));

  role.command('list')
    .description($('Get all available role definitions'))
    .execute(function (options, _) {
      var subscription = profile.current.getSubscription(options.subscription);
      var client = rbacClients.getAuthzClient(subscription);
      var progress = cli.interaction.progress($('Listing role definitions'));
      var result;
      try {
        result = client.roleDefinitions.list(_);
      } finally {
        progress.end();
      }

      cli.interaction.formatOutput(result.roleDefinitions, function (data) {
        if (data.length === 0) {
          log.info($('No role definition defined'));
        } else {
          log.table(data, displayARoleDefinition);
        }
      });
    });

  role.command('show [name]')
    .description($('Get an available role definition'))
    .option('-n --name <name>', $('the role definition name'))
    .execute(function (name, options, _) {
    if (!name) {
      return cli.missingArgument('name');
    }
    var subscription = profile.current.getSubscription(options.subscription);
    var client = rbacClients.getAuthzClient(subscription);
    var progress = cli.interaction.progress($('Getting role definitions'));
    var result;
    try {
      //'roleDefinitions.get' only takes guid, so we just do list and find by name ourselves
      result = client.roleDefinitions.list(_);
    } finally {
      progress.end();
    }

    var roles = result.roleDefinitions.filter(function (r) {
      return utils.ignoreCaseEquals(r.properties.roleName, name);
    });

    cli.interaction.formatOutput(roles, function (data) {
      if (data.length === 0) {
        log.info($('No role definition found'));
      } else {
        log.table(data, displayARoleDefinition);
      }
    });
  });
};

function displayARoleDefinition(row, role) {
  row.cell($('Name'), role.properties.roleName);
  var permissionDetails = permissionsUtils.getPermissionDetails(role.properties.permissions);
  row.cell($('Actions'), permissionDetails.actions);
  row.cell($('NotActions'), permissionDetails.notActions);
}