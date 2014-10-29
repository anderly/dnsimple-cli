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

var _ = require('underscore');
var azureCommon = require('azure-common');
var util = require('util');

var log = require('../logging');
var StringSet = require('../set');
var utils = require('../utils');
var $ = utils.getLocaleString;

function subscriptionRegistrationFilter(subscription) {
  return function (request, next, callback) {
    var stream = azureCommon.requestPipeline.interimStream(function (input, output) {
      input.pause();
      output.on('error', function () { });

      registerUnregisteredAsmProviders(subscription, function (err) {
        if (err) {
          output.emit('error', err);
          return callback(err);
        }
        registerUnregisteredResourceNamespaces(subscription, function (err) {
          if (err) {
            output.emit('error', err);
            return callback(err);
          }

          var s = next(request, callback);
          input.pipe(s).pipe(output);
          input.resume();
        });
      });

    });
    return stream;
  };
}

function register(subscription, registerMethod, alreadyRegistered, allToRegister, callback) {
  var profile = require('./profile');
  var providersToRegister = new StringSet(profile.providerKeyTransform)
    .add(allToRegister)
    .delete(alreadyRegistered);

  log.silly(util.format($('All known providers: %s'), allToRegister.join(', ')));
  log.silly(util.format($('Already registered providers: %s'), alreadyRegistered.join(', ')));
  log.silly(util.format($('Providers to register via %s: %s'), registerMethod, providersToRegister.keys().join(',')));

  if (providersToRegister.size() === 0) {
    return callback();
  }

  var registerDone = _.after(providersToRegister.size(), callback);

  providersToRegister.forEach(function (p) {
    log.verbose(util.format($('Registering %s with function %s'), p, registerMethod));
    subscription[registerMethod](p, function () {
      registerDone();
    });
  });
}

function registerUnregisteredAsmProviders(subscription, callback) {
  var profile = require('./profile');
  register(subscription, 'registerProvider',
    subscription.registeredProviders,
    profile.knownProviders(),
    callback);
}

function registerUnregisteredResourceNamespaces(subscription, callback) {
  var profile = require('./profile');
  register(subscription, 'registerResourceNamespace',
    subscription.registeredResourceNamespaces,
    profile.knownResourceNamespaces(),
    callback);
}

module.exports = subscriptionRegistrationFilter;
