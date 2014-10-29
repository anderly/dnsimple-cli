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

var _ = require('underscore');
var os = require('os');
var path = require('path');
var util = require('util');
var dnsimple = require('dnsimple');
var constants = require('../constants');

var utils = require('../utils');
var defaultTokenCacheFile = path.join(utils.dnsimpleDir(), 'accessTokens.json');

var TokenStorage;
if (os.platform() === 'darwin') {
  TokenStorage = require('./osx-token-storage');
} else if (os.platform() === 'win32') {
  TokenStorage = require('./win-token-storage');
} else {
  TokenStorage = require('./file-token-storage');
}
var TokenCache = require('./token-cache');

var logging = require('../logging');
var $ = utils.getLocaleString;

function turnOnLogging() {
  var log = adal.Logging;
  log.setLoggingOptions(
  {
    level : log.LOGGING_LEVEL.VERBOSE,
    log : function(level, message, error) {
      logging.info(message);
      if (error) {
        logging.error(error);
      }
    }
  });
}

if (process.env['AZURE_ADAL_LOGGING_ENABLED']) {
  turnOnLogging();
}

//
// A list of known azure test endpoints for active directory.
// Turn off authority verification if authority is one of these.
//
var knownTestEndpoints = [
  'https://login.windows-ppe.net',
  'https://sts.login.windows-int.net'
];

function isKnownTestEndpoint(authorityUrl) {
  return _.some(knownTestEndpoints, function (endpoint) {
    return utils.ignoreCaseEquals(endpoint, authorityUrl);
  });
}

/**
* Given a user name derive the tenant id
*
* @param {string} username name of user
*
* @returns {string} tenant Id
*/
function tenantIdForUser(username) {
  var match = username.match(/@(.*)+$/);
  if (match === null) {
    throw new Error(util.format($('No tenant found in username %s'), username));
  }

  var tenant = match[1];
  if (tenant.indexOf('.') === -1) {
    tenant = tenant + '.onmicrosoft.com';
  }
  return tenant;
}

/**
* Add the '.onmicrosoft.com' suffix to the user name
* if it's required and not present.
*
* @param {string} username The original user name
*
* @returns {string} the updated if necessary username
*/
function normalizeUserName(username) {
  return username;
}

function createAuthenticationContext(authConfig) {
  var authorityUrl = authConfig.authorityUrl;
  var validateAuthority = !isKnownTestEndpoint(authConfig.authorityUrl);

  return new adal.AuthenticationContext(authorityUrl, validateAuthority, exports.tokenCache);
}

function DnsimpleAccessToken(authConfig, userId) {
  this.authConfig = authConfig;
  this.userId = userId;
}

_.extend(DnsimpleAccessToken.prototype, {
  authenticateRequest: function (authorizer) {
    var self = this;
    loadAccessToken(self.authConfig, self.userId, function (err, key) {
      if (err) {
        return authorizer(new Error(util.format($('No service key found for userId %s'), self.userId)));
      }
      // This commented out code will come into play when dnsimple implements oauth
      //var context = createAuthenticationContext(this.authConfig);
      //context.acquireToken(this.authConfig.resourceId, this.userId, this.authConfig.clientId, function (err, result) {
        // if (err) {
        //   authorizer(new Error($('Credentials have expired, please reauthenticate')));
        // } else {
          authorizer(null, 'Bearer', key);
      //   }
      // });
    });
  },
});

//
// Functions to store api token in the
// token cache. We're borrowing the token cache for this
// because it's already using OS-specific credential
// management functions.
//
function saveAccessToken(authConfig, username, key, callback) {
  var entry = {
    _authority: authConfig.authorityUrl,
    _clientId: constants.DNSIMPLE_CLI_CLIENT_ID,
    // token cache implementations specifically look
    // for these two keys to store as the secret,
    // so we use them to store the key.
    accessToken: key,
    expiresIn: '', // stubbing out for oauth
    expiresOn: '', // stubbing out for oauth
    refreshToken: key, // '' // setting refreshToken same as api token for now until oauth
    resource: authConfig.resourceId,
    tokenType: 'Bearer', // anticipating oauth
    userId: username
  };

  exports.tokenCache.add([entry], callback);
}

function loadAccessToken(authConfig, userId, callback) {
  var query = {
    userId: userId,
    resource: authConfig.resourceId
  };

  exports.tokenCache.find(query, function (err, entries) {
    if (err) { return callback(err); }

    if (entries.length === 0) {
      return callback(new Error('No access token found'));
    }

    callback(null, entries[0].accessToken);
  });
}

//
// Functions to store service principal keys in the
// token cache. We're borrowing the token cache for this
// because it's already using OS-specific credential
// management functions.
//
function saveServicePrincipalKey(appId, tenantId, key, callback) {
  var entry = {
    servicePrincipalId: appId,
    servicePrincipalTenant: tenantId,
    // token cache implementations specifically look
    // for these two keys to store as the secret,
    // so we use them to store the key.
    accessToken: key,
    refreshToken: ''
  };

  exports.tokenCache.add([entry], callback);
}

function loadServicePrincipalKey(appId, tenantId, callback) {
  var query = {
    servicePrincipalId: appId,
    servicePrincipalTenant: tenantId
  };

  exports.tokenCache.find(query, function (err, entries) {
    if (err) { return callback(err); }

    if (entries.length === 0) {
      return callback(new Error('No service principal key found'));
    }

    callback(null, entries[0].accessToken);
  });
}

function ServicePrincipalAccessToken(authConfig, appId) {
  this.authConfig = authConfig;
  this.appId = appId;
}

_.extend(ServicePrincipalAccessToken.prototype, {
  authenticateRequest: function (authorizer) {
    var self = this;
    loadServicePrincipalKey(self.appId, self.authConfig.tenantId, function (err, key) {
      if (err) {
        return authorizer(new Error(util.format($('No service key found for appid %s'), self.appId)));
      }

      var context = createAuthenticationContext(self.authConfig);
      context.acquireTokenWithClientCredentials(self.authConfig.resourceId, self.appId, key,
        function (err, result) {
          if (err) {
            return new Error($('Unable to acquire token from Azure Active Directory'));
          }
          authorizer(null, 'Bearer', result.accessToken);
        });
    });
  }
});

/**
* Call to dnsimple api to get a token back.
* Returns accessToken object via callback.
*
* @param {AuthenticationConfig} authConfig Connection details for AD
*
* @param {string} authConfig.apiEndpointUrl URL to authenticate against
* @param {string} authConfig.apiVersion     API Version (currently v1)
* @param {string} authConfig.clientId     Client ID that is requesting authentication
* @param {string} authConfig.resourceId   Id of resoure being accessed
*
* @param {string} username                user identifier
* @param {string} password                the password
* @param {function} callback              callback function (err, accessToken)
*
*/
function acquireToken(authConfig, username, password, callback) {
  //var context = createAuthenticationContext(authConfig);
  var dns = new dnsimple({ email: username, password: password });

  dns.talk('GET', 'user', function(err, response) {
    if (err) { return callback(err); }
    saveAccessToken(authConfig, username, response.user.single_access_token, function (err) {
      if (err) { return callback(err); }
      callback(null, new DnsimpleAccessToken(authConfig, response.user.email));
    });
  });

  //context.acquireTokenWithUsernamePassword(authConfig.resourceId, username, password, authConfig.clientId, function (err, response) {
  //});
}

/**
* Call to Active Directory tenant to get a token for a service principal back.
* Returns accessToken object via callback.
*
* @param {AuthenticationConfig} authConfig Connection details for AD
*
* @param {string} authConfig.authorityUrl Url for AD tenant to authenticate against
* @param {string} authConfig.tenantId     Active directory tenant ID or domain
* @param {string} authConfig.clientId     Client ID that is requesting authentication
* @param {string} authConfig.resourceId   Id of resoure being accessed
*
* @param {string} appId                   AppId for the service principal
* @param {string} serviceKey              Service Principal's secret key
* @param {function} callback              callback function (err, accessToken)
*
*/
function acquireServicePrincipalToken(authConfig, appId, serviceKey, callback) {
  saveServicePrincipalKey(appId, authConfig.tenantId, serviceKey, function (err) {
    if (err) { return callback(err); }

    callback(null, new ServicePrincipalAccessToken(authConfig, appId, authConfig.tenantId));
  });
}

/**
* This is the callback passed to the logoutUser method
* @callback LogoutUserCallback
* @param {Error} [err] Any errors that occur are passed here.
*/

/**
* Logs out a user, deleting any cached users for that username.
*
* @param {string}             username  username to remove tokens for.
* @param {TokenCache}         [cache]   cache to delete from, optional, uses
*                                       default cache if not given
* @param {LogoutUserCallback} done      completion callback
*/
function logoutUser(username, cache, done) {
  if (typeof cache === 'function') {
    done = cache;
    cache = exports.tokenCache;
  }
  cache.find({userId: username}, function (err, found) {
    if (err) { return done(err); }
    cache.remove(found, done);
  });
}

_.extend(exports, {
  defaultTokenCacheFile: defaultTokenCacheFile,
  tokenCache: new TokenCache(new TokenStorage(defaultTokenCacheFile)),
  tenantIdForUser: tenantIdForUser,
  normalizeUserName: normalizeUserName,
  DnsimpleAccessToken: DnsimpleAccessToken,
  ServicePrincipalAccessToken: ServicePrincipalAccessToken,
  acquireToken: acquireToken,
  acquireServicePrincipalToken: acquireServicePrincipalToken,
  logoutUser: logoutUser
});
