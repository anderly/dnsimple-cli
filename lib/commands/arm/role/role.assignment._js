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

var util = require('util');

var adUtils = require('../ad/adUtils');
var rbacClients = require('./rbacClients');
var profile = require('../../../util/profile');
var RoleAssignments = require('./roleAssignments');
var utils = require('../../../util/utils');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;

  var role = cli.category('role');
  var roleAssignment = role.category('assignment')
      .description($('Commands to manage your role assignment'));

  roleAssignment.command('create [objectId] [upn] [mail] [spn] [role] [scope] [resource-group] [resource-type] [resource-name]')
    .description($('create a new role assignment'))
    .option('--objectId <objectId>', $('Object id of an active directory user, group or service principal.'))
    .option('--upn <upn>', $('User principal name.'))
    .option('--mail <mail>', $('Mail of a user or group.'))
    .option('--spn <spn>', $('Service Principal Name.'))
    .option('-o --role <role>', $('Role to assign the principals with.'))
    .option('-c --scope <scope>', $('Scope of the role assignment.'))
    .option('-g --resource-group <resource-group>', $('Resource group to assign the role to.'))
    .option('-r --resource-type <resource-type>', $('Type of the resource to assign the role to.'))
    .option('-u --resource-name <resource-name>', $('Name of the resource to assign the role to.'))
    .option('--parent <parent>', $('Parent resource of the resource to assign the role to, if there is any.'))
    .option('--subscription <subscription>', $('Subscription id or name of where the role assignment will be created.'))
    .execute(function (objectId, upn, mail, spn, role, scope, resourceGroup, resourceType, resourceName, options, _) {
      if (!role) {
        return cli.missingArgument('role');
      }
      adUtils.validateParameters({
        objectId: objectId,
        upn: upn,
        mail: mail,
        spn: spn
      });

      var subscription = profile.current.getSubscription(options.subscription);
      var authzClient = rbacClients.getAuthzClient(subscription);
      var graphClient = adUtils.getADGraphClient(subscription);
      
      scope = RoleAssignments.buildScopeString({
          scope: scope,
          subscriptionId: subscription.id, 
          resourceGroup: resourceGroup,
          resourceType: resourceType, 
          resourceName: resourceName,
          parent: options.parent
      });

      objectId = adUtils.getObjectId(
        {
          objectId: objectId,
          upn: upn,
          mail: mail,
          spn: spn
        }, graphClient, true, _);
      
      var matchedRoles;
      var progress = cli.interaction.progress($('Getting role definition id'));
      try {
        matchedRoles = authzClient.roleDefinitions.list(_);
        matchedRoles = matchedRoles.roleDefinitions.filter(function (r) {
          return utils.ignoreCaseEquals(r.properties.roleName, role);
        });
      } finally {
        progress.end();
      }

      var roleId;
      if (matchedRoles && matchedRoles.length > 0) {
        roleId = matchedRoles[0].id;
      }
      if (!roleId) {
        throw new Error(util.format($('Role of \'%s\' does not exist'), role));
      }

      var parameter = {
        principalId: objectId,
        roleDefinitionId: roleId,
        scope: scope
      };

      var roleAssignmentNameGuid = utils.uuidGen();
      progress = cli.interaction.progress($('Creating role assignment'));
      try {
        authzClient.roleAssignments.create(scope, roleAssignmentNameGuid, parameter, _);
      } finally {
        progress.end();
      }
    });

  roleAssignment.command('list [objectId] [upn] [mail] [spn] [role] [scope] [resource-group] [resource-type] [resource-name]')
    .description($('Get role assignment at a given scope'))
    .option('--objectId <objectId>', $('Object id of an active directory user, group or service principal.'))
    .option('--upn <upn>', $('User principal name.'))
    .option('--mail <mail>', $('Mail of a user or group.'))
    .option('--spn <spn>', $('Service Principal Name.'))
    .option('-o --role <role>', $('Role the principals was assigned to'))
    .option('-c --scope <scope>', $('Scope of the role assignment.'))
    .option('-g --resource-group <resource-group>', $('Resource group to role was assigned to.'))
    .option('-r --resource-type <resource-type>', $('Type of the resource the role was assign to'))
    .option('-u --resource-name <resource-name>', $('The resource the role was assigned to.'))
    .option('--parent <parent>', $('Parent resource of the resource the role was assigned to, if there is any.'))
    .option('--subscription <subscription>', $('Subscription id or name of where the role assignment is from.'))
    .execute(function (objectId, upn, mail, spn, role, scope, resourceGroup, resourceType, resourceName, options, _) {

      adUtils.validateParameters({
        objectId: objectId,
        upn: upn,
        mail: mail,
        spn: spn
      }, false);

      var subscription = profile.current.getSubscription(options.subscription);
      var authzClient = rbacClients.getAuthzClient(subscription);
      var graphClient = adUtils.getADGraphClient(subscription);

      var progress = cli.interaction.progress($('Getting role assignment'));
      var assignmentCollection = new RoleAssignments(authzClient, graphClient);
      var assignments;
      try {
        assignments = assignmentCollection.query(true,
          {
            objectId: objectId,
            upn: upn,
            mail: mail,
            spn: spn
          },
          {
            scope: scope,
            resourceGroup: resourceGroup,
            resourceType: resourceType,
            resourceName: resourceName,
            parent: options.parent,
            subscriptionId: subscription.id
          }, role, _);
      } finally {
        progress.end();
      }

      if (assignments.length === 0) {
        log.info($('No matching role assignments were found'));
        return;
      }
      
      cli.interaction.formatOutput(assignments, function (outputData) {
        for (var i = 0; i < outputData.length; i++) { 
          showRoleAssignment(outputData[i]);
        }        
      });
    });

  roleAssignment.command('delete [objectId] [upn] [mail] [spn] [role] [scope] [resource-group] [resource-type] [resource-name]')
    .description($('delete a role assignment'))
    .option('--objectId <objectId>', $('Object id of an active directory user, group or service principal'))
    .option('--upn <upn>', $('User principal name.'))
    .option('--mail <mail>', $('Mail of a user or group.'))
    .option('--spn <spn>', $('Service Principal Name.'))
    .option('-o --role <role>', $('Role to remove from the principals.'))
    .option('-c --scope <scope>', $('Scope of the role assignment.'))
    .option('-g --resource-group <resource-group>', $('Resource group to role was assigned to.'))
    .option('-r --resource-type <resource-type>', $('Type of the resource the role was assign to'))
    .option('-u --resource-name <resource-name>', $('The resource the role was assigned to.'))
    .option('--parent <parent>', $('Parent resource of the resource the role was assigned to, if there is any.'))
    .option('-q --quiet', $('If specified, won\'t prompt before delete.'))
    .option('--subscription <subscription>', $('Subscription id or name of where the role assignment will be removed.'))
    .execute(function (objectId, upn, mail, spn, role, scope, resourceGroup, resourceType, resourceName, options, _) {
      
      adUtils.validateParameters({
        objectId: objectId,
        upn: upn,
        mail: mail,
        spn: spn
      });

      var subscription = profile.current.getSubscription(options.subscription);
      var authzClient = rbacClients.getAuthzClient(subscription);
      var graphClient = adUtils.getADGraphClient(subscription);
      var assignmentCollection = new RoleAssignments(authzClient, graphClient);

      var progress = cli.interaction.progress($('Getting role assignments to delete'));
      var assignments;
      try {
        assignments = assignmentCollection.query(false,
          {
            objectId: objectId,
            upn: upn,
            mail: mail,
            spn: spn
          },
          {
            scope: scope,
            resourceGroup: resourceGroup,
            resourceType: resourceType,
            resourceName: resourceName,
            parent: options.parent,
            subscriptionId: subscription.id
          }, role, _);
      } finally {
        progress.end();
      }

      if (assignments.length > 0) {
        if (!options.quiet && !cli.interaction.confirm($('Delete role assignments? [y/n] '), _)) {
          return;
        }
        progress = cli.interaction.progress($('Deleting role assignments'));
        try {
          for (var i = 0; i <= assignments.length - 1; i++) {
            authzClient.roleAssignments.delete(assignments[i].properties.scope, assignments[i].name, _);
          }
        } finally {
          progress.end();
        }
      }
      else {
        log.info($('No role assignments are found to delete'));
      }
    });

  function showRoleAssignment(roleAssginment) {
    log.data($('AD Object:'));
    log.data($('  ID:             '), roleAssginment.properties.aADObject.objectId);
    log.data($('  Type:           '), roleAssginment.properties.aADObject.objectType);
    log.data($('  Display Name:   '), roleAssginment.properties.aADObject.displayName);
    log.data($('  Principal Name: '), roleAssginment.properties.aADObject.userPrincipalName);
    log.data($('Scope:            '), roleAssginment.properties.scope);
    log.data($('Role:'));
    log.data($('  Name:           '), roleAssginment.properties.roleName);
    log.data($('  Permissions:'));
    log.data($('    Actions:      ') + roleAssginment.properties.actions);
    log.data($('    NotActions:   ') + roleAssginment.properties.notActions); 
    
    log.data('');
  }
};