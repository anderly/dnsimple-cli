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

var underscore = require('underscore');

var adUtils = require('../ad/adUtils');
var resourceUtils = require('../resource/resourceUtils');
var utils = require('../../../util/utils');

var $ = utils.getLocaleString;

exports = module.exports = RoleAssignments;

function RoleAssignments(authzClient, graphClient) {
  this.authzClient = authzClient;
  this.graphClient = graphClient;
}

underscore.extend(RoleAssignments.prototype, {

  query: function (forDisplayAssignments, principal, scopeInfo, roleName, _) {
    var assignments;
    var scope = RoleAssignments.buildScopeString(scopeInfo);
    var principalId = adUtils.getObjectId(principal, this.graphClient, false, _);
    if (this.optionIsSet(principal)) {
      assignments = this.getAssignmentsFromServer(scope, { atScope: false, principalId: principalId }, _);
      this.filterByScope(assignments, scope);
    } else if (this.shouldShowAllRoleAssignments(scopeInfo, forDisplayAssignments)) {
      assignments = this.getAssignmentsFromServer(scope, { atScope: false, principalId: '' }, _);
      this.filterByPrincipal(assignments, principalId);
    } else { //scope is specified in the command line
      assignments = this.getAssignmentsFromServer(scope, { atScope: true, principalId: '' }, _);
      this.filterByPrincipal(assignments, principalId);
    }

    var roleDefinitions = this.getRoleDefinitions(_);
    assignments = this.filterByRoleName(assignments, roleName, roleDefinitions);

    //Be nice, and fill in logical text information to display
    if (forDisplayAssignments) {
      assignments = this.fillInPrincipalName(assignments, _);
      assignments = this.fillInRoleDetails(assignments, roleDefinitions);
    }

    return assignments;
  },

  getAssignmentsFromServer: function (scope, parameter, _) {
    var result = this.authzClient.roleAssignments.listForScope(scope, parameter, _);
    return result.roleAssignments;
  },

  filterByScope: function (assignments, scope) {
    if (scope) {
      assignments = assignments.forEach(function (assignment) {
        return utils.stringStartsWith(assignment.properties.scope, scope, true);
      });
    }
    return assignments;
  },

  filterByPrincipal: function (assignments, principalId) {
    if (principalId) {
      assignments = assignments.forEach(function (assignment) {
        utils.ignoreCaseEquals(assignment.properties.principalId, principalId);
      });
    }
    return assignments;
  },

  fillInPrincipalName: function (assignments, _) {
    var allIds = underscore.map(assignments, function (assignment) {
      return assignment.properties.principalId;
    });
    if (allIds.length > 0) {
      var objects = [];
      try {
        objects = this.graphClient.objects.getObjectsByObjectIds({ ids: allIds }, _).aADObject;
      } catch (ex) {
        console.log('Warning: failed to retrieve graph object details. Falling back to only display object id. Error:' + ex);
      }
      assignments.forEach(function (assignment) {
        assignment.properties.aADObject = underscore.chain(objects)
          .where({ objectId: assignment.properties.principalId })
          .first().value() || {
            objectId: assignment.properties.principalId,
            objectType: '',
            displayName: '',
            userPrincipalName: ''
          };
      });
    }
    return assignments;
  },

  filterByRoleName: function (assignments, roleName, roleDefinitions) {
    if (roleName) {
      var self = this;
      var roleDefinitionName;
      for (var i = 0; i < roleDefinitions.length; i++) {
        if (utils.ignoreCaseEquals(roleDefinitions[i].properties.roleName, roleName)) {
          roleDefinitionName = roleDefinitions[i].name;
        }
      }
      if (!roleDefinitionName) {
        throw new Error($('Invalid role name was provided'));
      }
      assignments = assignments.filter(function (assignment) {
        return utils.ignoreCaseEquals(self.getRoleDefinitionName(assignment.properties.roleDefinitionId), roleDefinitionName);
      });
    }
    return assignments;
  },

  fillInRoleDetails: function (assignments, roleDefinitions) {
    if (assignments.length > 0) {
      var self = this;
      var rolePermissionActionsList = [];
      var rolePermissionNotActionsList = [];
      var roleNames = [];
      var roleDefinitionId;
      for (var i = 0; i < roleDefinitions.length; i++) {
        var roleDefinition = roleDefinitions[i];
        roleDefinitionId = roleDefinition.name; //Note, the 'name' field here really means the 'id'
        rolePermissionActionsList[roleDefinitionId] = self.serializeActionList(roleDefinition.properties.permissions);
        rolePermissionNotActionsList[roleDefinitionId] = self.serializeNotActionList(roleDefinition.properties.permissions);
        roleNames[roleDefinitionId] = roleDefinition.properties.roleName;
      }

      assignments.forEach(function (assignment) {
        roleDefinitionId = assignment.properties.roleDefinitionId;
        assignment.properties.roleName = roleNames[self.getRoleDefinitionName(roleDefinitionId)];
        assignment.properties.actions = rolePermissionActionsList[self.getRoleDefinitionName(roleDefinitionId)];
        assignment.properties.notActions = rolePermissionNotActionsList[self.getRoleDefinitionName(roleDefinitionId)];
      });
    }

    return assignments;
  },

  getRoleDefinitionName: function (roleDefintionResourceID) {
    //to extract out the <guid> from definition id like '/subscriptions/358f3860-9dbe-4ace-b0c0-3d4f2d861014/providers/.../<guid>'
    return roleDefintionResourceID.substring(roleDefintionResourceID.lastIndexOf('/') + 1);
  },

  getRoleDefinitions: function (_) {
    return this.authzClient.roleDefinitions.list(_).roleDefinitions;
  },

  shouldShowAllRoleAssignments: function (scopeInfo, forDisplayAssignments) {
    var shouldShow = false;
    if (forDisplayAssignments) {
      //we want to check, excluding 'subscription id', do we have other configured?
      var subscriptionId = scopeInfo.subscriptionId;
      scopeInfo.subscriptionId = '';
      var anyOtherSettings = this.optionIsSet(scopeInfo);
      scopeInfo.subscriptionId = subscriptionId;
      shouldShow = !anyOtherSettings;
    }
    return shouldShow;
  },

  optionIsSet: function (option) {
    var properties = option ? Object.keys(option) : [];
    var propertyValues = properties.filter(function (p) {
      return !!option[p];
    });
    return (propertyValues.length > 0);
  },

  serializeActionList: function (permissions) {
    var actions = [];
    for (var i = 0; i < permissions.length; i++) {
      actions = actions.concat(permissions[i].actions);
    }
    return actions.join();
  },

  serializeNotActionList: function (permissions) {
    var notActions = [];
    for (var i = 0; i < permissions.length; i++) {
      notActions = notActions.concat(permissions[i].notActions);
    }
    return notActions.join();
  },
});

RoleAssignments.buildScopeString = function (scopeInfo) {
  if (scopeInfo.scope && (scopeInfo.resourceGroup || scopeInfo.resourceName)) {
    throw new Error($('Specify either \'scope\' or individual resource group and resource names'));
  }
  if (scopeInfo.scope) {
    return scopeInfo.scope;
  }
  var scope = '/subscriptions/' + scopeInfo.subscriptionId;
  if (scopeInfo.resourceGroup) {
    scope = scope + '/resourcegroups/' + scopeInfo.resourceGroup.trim();
    if (scopeInfo.resourceName) {
      if (!scopeInfo.resourceType) {
        throw new Error($('Please specify a valid resource type'));
      }
      var resourceTypeName = resourceUtils.getResourceTypeName(scopeInfo.resourceType);
      var provider = resourceUtils.getProviderName(scopeInfo.resourceType);

      scope = scope + '/providers/' + provider.trim() + '/' + (scopeInfo.parent ? scopeInfo.parent.trim() : '') +
        '/' + resourceTypeName.trim() + '/' + scopeInfo.resourceName.trim();
    }
  }

  return scope;
};