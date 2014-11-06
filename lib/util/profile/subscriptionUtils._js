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
var __ = require('underscore');
var util = require('util');

var AccessTokenCloudCredentials = require('../authentication/accessTokenCloudCredentials');
var utils = require('../utils');

function getSubscriptions(environment, username, token, password, _) {
  var accessToken = environment.acquireToken(username, password, token, _);
  username = crossCheckUserNameWithToken(username, accessToken.userId);
  //var dns = environment.getDnsimpleClient(createCredential(accessToken));
  var dns = environment.getDnsimpleClient(accessToken);

  var all = [];
  // var armClient = environment.getArmClient(createCredential(accessToken));
  // var tenants = armClient.tenants.list(_);
  // var tenantAccessToken;
  // for (var i = 0; i < tenants.tenantIds.length; i++) {
  //   var tenantId = tenants.tenantIds[i].tenantId;
  //   tenantAccessToken = undefined;
  //   try{
  //     tenantAccessToken = environment.acquireToken(username, password, tenantId, _);
  //   } catch (e) {
  //     if (e.message && e.message.match(new RegExp('.*\"error_codes\":\\[50034|50000\\].*'))) {
  //       console.log(util.format('Due to current limitation, we will skip retrieving subscriptions from the external tenant \'%s\'', tenantId));
  //     } else {
  //       throw e;
  //     }
  //   }
  //   if (tenantAccessToken) {
  //     var tenantSubscriptions = getSubscriptionsInTenant(environment, username, tenantId, tenantAccessToken, _);
  //     all = all.concat(tenantSubscriptions);
  //   }
  // }
  var subscription = dns.subscription(_);
  subscription.id = new String(subscription.id);
  subscription['name'] = username;//util.format('%s-%s', subscription.user_id, subscription.id);
  all.push(subscription);
  return all;
}

function crossCheckUserNameWithToken(usernameFromCommandline, userIdFromToken) {
  //to maintain the casing consistency between 'azureprofile.json' and token cache. (RD 1996587)
  //use the 'userId' here, which should be the same with "username" except the casing.
  if (utils.ignoreCaseEquals(usernameFromCommandline, userIdFromToken)) {
    return userIdFromToken;
  } else {
    throw new Error(util.format('invalid user name %s', usernameFromCommandline));
  }
}

function createCredential(accessToken) {
  return new AccessTokenCloudCredentials(accessToken, 'notUsed');
}

__.extend(exports, {
  getSubscriptions: getSubscriptions,
});
