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
// NOTICE: Based-on azure-cli (https://github.com/Azure/azure-sdk-tools-xplat/)
//

'use strict';

var _ = require('underscore');
var url = require('url');
var util = require('util');

var dnsimpleAuth = require('../authentication/dnsimpleAuth');
var dnsimple = require('dnsimple');
var constants = require('../constants');
var Subscription = require('./subscription');
var subscriptionUtils = require('./subscriptionUtils');

var $ = require('../utils').getLocaleString;

function nulls(properties) {
  return properties.reduce(function (acc, prop) { acc[prop] = null; return acc; }, {});
}

function Environment(envData) {
  var self = this;

  self.name = envData.name;
  var values = envData;
  _.defaults(values, nulls(_.pluck(Environment.parameters, 'name')));

  Environment.parameters.forEach(function (param) {
    Object.defineProperty(self, param.name, param.propertyDescriptor(self));
  });

  Object.defineProperties(self, {
    isPublicEnvironment: {
      enumerable: true,
      configurable: false,
      get: function () {
        return _.chain(Environment.publicEnvironments).pluck('name').contains(this.name).value();
      }
    },

    values: {
      enumerable: false,
      configurable: false,
      get: function () { return values; }
    },

    authConfig: {
      enumerable: false,
      configurable: false,
      get: function () {
        return this.getAuthConfig();
      }
    }
  });
}

function EnvironmentParameter(name, environmentVariable, description) {
  this.name = name;
  this.environmentVariable = environmentVariable;
  this.description = $(description);
}

_.extend(EnvironmentParameter.prototype, {
  propertyDescriptor: function (env) {
    var self = this;
    return {
      enumerable: true,
      configurable: false,
      get: function () {
        var val = process.env[self.environmentVariable] || env.values[self.name];
        if (val === null) {
          throw new Error(util.format(
            $('The endpoint field %s is not defined in this environment.' +
              ' Either this feature is not supported or the endpoint needs to be set using \'dnsimple account env set\''),
            self.name));
        }
        return val;
      },
      set: function (value) { this.values[self.name] = value; }
    };
  }
});

Environment.parameters = [
  // new EnvironmentParameter('portalUrl', 'AZURE_PORTAL_URL', 'the management portal URL'),
  // new EnvironmentParameter('publishingProfileUrl', 'AZURE_PUBLISHINGPROFILE_URL', 'the publish settings file URL'),
  // new EnvironmentParameter('managementEndpointUrl', 'AZURE_MANAGEMENTENDPOINT_URL', 'the management service endpoint'),
  // new EnvironmentParameter('resourceManagerEndpointUrl', 'AZURE_RESOURCEMANAGERENDPOINT_URL', 'the resource management endpoint'),
  // new EnvironmentParameter('sqlManagementEndpointUrl', 'AZURE_SQL_MANAGEMENTENDPOINT_URL', 'the sql server management endpoint for mobile commands'),
  // new EnvironmentParameter('sqlServerHostnameSuffix', 'AZURE_SQL_SERVER_HOSTNAME_SUFFIX', 'the dns suffix for sql servers'),
  // new EnvironmentParameter('activeDirectoryEndpointUrl', 'AZURE_ACTIVEDIRECTORY_ENDPOINT_URL', 'the Active Directory login endpoint'),
  // new EnvironmentParameter('activeDirectoryResourceId', 'AZURE_ACTIVEDIRECTORY_RESOURCE_ID', 'The resource ID to obtain AD tokens for'),
  // new EnvironmentParameter('commonTenantName', 'AZURE_ACTIVEDIRECTORY_COMMON_TENANT_NAME', 'the Active Directory common tenant name'),
  // new EnvironmentParameter('galleryEndpointUrl', 'AZURE_GALLERY_ENDPOINT_URL', 'the template gallery endpoint'),
  // new EnvironmentParameter('activeDirectoryGraphResourceId', 'AZURE_ACTIVEDIRECTORY_GRAPH_RESOURCE_ID', 'the Active Directory resource ID'),
  // new EnvironmentParameter('activeDirectoryGraphApiVersion', 'AZURE_ACTIVEDIRECTORY_GRAPH_API_VERSION', 'the Active Directory api version')
  new EnvironmentParameter('portalUrl', 'DNSIMPLE_PORTAL_URL', 'the management portal URL'),
  new EnvironmentParameter('apiEndpointUrl', 'DNSIMPLE_API_ENDPOINT_URL', 'the api endpoint URL'),
  new EnvironmentParameter('apiVersion', 'DNSIMPLE_API_VERSION', 'the api version'),
  new EnvironmentParameter('apiTokenEndpointUrl', 'DNSIMPLE_API_TOKEN_ENDPOINT_URL', 'the api token endpoint URL')
];

_.extend(Environment.prototype, {
  getPortalUrl: function () {
    return this.portalUrl;
  },

  toJSON: function () {
    return _.extend({ name: this.name }, this.values);
  },

  getAuthConfig: function (token) {
    // if (!token) {
    //   token = this.commonTenantName;
    // }
    return {
      // authorityUrl: this.activeDirectoryEndpointUrl,
      // tenantId: tenantId,
      // resourceId: this.activeDirectoryResourceId,
      // clientId: constants.XPLAT_CLI_CLIENT_ID
      authorityUrl: this.apiTokenEndpointUrl,
      apiVersion: this.apiVersion,
      //token: token,
      resourceId: this.apiEndpointUrl,
      clientId: constants.DNSIMPLE_CLI_CLIENT_ID
    };
  },

  addAccount: function (username, token, password, callback) {
    var self = this;

    if (_.isFunction(password)) {
      callback = password;
      password = token;
      token = null;
    }

    username = username;
    var authType = 'password';

    if (token) {
      authType = 'token';
    }

    function processSubscriptions(err, subscriptions) {
      if (err) { return callback(err); }
      var subs = _.map(subscriptions, function (s) {
        return new Subscription({
          id: s.id,
          name: s.name,
          user: {
            name: username,
            type: authType
          },
        }, self);
      });

      callback(null, subs);
    }

    if (!token) {
       subscriptionUtils.getSubscriptions(self, username, password, processSubscriptions);
    } else {
      dnsimpleAuth.acquireServicePrincipalToken(self.getAuthConfig(token), username, password, function (err, token) {
        if (err) { return callback(err); }
        subscriptionUtils.getSubscriptionsInTenant(self, username, tenant, token, processSubscriptions);
      });
    }
  },

  acquireToken : function (username, password, token, callback) {
    dnsimpleAuth.acquireToken(this.getAuthConfig(token), username, password, callback);
  },

  getDnsimpleClient: function (credentials) {
    return new dnsimple({ email: credentials.userId, token: credentials.accessToken, hostname: this.apiEndpointUrl.replace('https://','') });
    //return resourceClient.createResourceSubscriptionClient(credentials, this.resourceManagerEndpointUrl);
  }
});

Environment.publicEnvironments = [
  // new Environment({
  //   name: 'AzureCloud',
  //   portalUrl: 'http://go.microsoft.com/fwlink/?LinkId=254433',
  //   publishingProfileUrl: 'http://go.microsoft.com/fwlink/?LinkId=254432',
  //   managementEndpointUrl: 'https://management.core.windows.net',
  //   resourceManagerEndpointUrl: 'https://management.azure.com/',
  //   sqlManagementEndpointUrl: 'https://management.core.windows.net:8443/',
  //   sqlServerHostnameSuffix: '.database.windows.net',
  //   galleryEndpointUrl: 'https://gallery.azure.com/',
  //   activeDirectoryEndpointUrl: 'https://login.windows.net',
  //   activeDirectoryResourceId: 'https://management.core.windows.net/',
  //   commonTenantName: 'common',
  //   activeDirectoryGraphResourceId: 'https://graph.windows.net/',
  //   activeDirectoryGraphApiVersion: '2013-04-05'
  // }),
  // new Environment({
  //   name: 'AzureChinaCloud',
  //   publishingProfileUrl: 'http://go.microsoft.com/fwlink/?LinkID=301774',
  //   portalUrl: 'http://go.microsoft.com/fwlink/?LinkId=301902',
  //   managementEndpointUrl: 'https://management.core.chinacloudapi.cn',
  //   sqlServerHostnameSuffix: '.database.chinacloudapi.cn',
  //   activeDirectoryEndpointUrl: 'https://login.chinacloudapi.cn',
  //   activeDirectoryResourceId: 'https://management.core.chinacloudapi.cn/',
  //   commonTenantName: 'common',
  //   activeDirectoryGraphResourceId: 'https://graph.windows.net/',
  //   activeDirectoryGraphApiVersion: '2013-04-05'
  // })
  new Environment({
    name: 'Production',
    portalUrl: 'http://dnsimple.com',
    apiEndpointUrl: 'https://api.dnsimple.com',
    apiVersion: 'v1',
    apiTokenEndpointUrl: 'https://api.dnsimple.com/v1/user'
  }),
  new Environment({
    name: 'Sandbox',
    portalUrl: 'http://sandbox.dnsimple.com',
    apiEndpointUrl: 'https://api.sandbox.dnsimple.com',
    apiVersion: 'v1',
    apiTokenEndpointUrl: 'https://api.sandbox.dnsimple.com/v1/user'
  })
];

module.exports = Environment;
