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

'use strict';

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var util = require('util');

var dnsimpleAuth = require('../authentication/dnsimpleAuth');
var Environment = require('./environment');
var Subscription = require('./subscription');
var publishSettings = require('./publishSettings');
var cacheUtils = require('../cacheUtils');
var log = require('../logging');
var StringSet = require('../set');
var utils = require('../utils');
var $ = utils.getLocaleString;

//
// Profile object - this manages the serialization of environment
// and subscription data for the current user.
//

function Profile() {
  var self = this;
  self.environments = {};
  Environment.publicEnvironments.forEach(function (env) {
    self.addEnvironment(env);
  });
  self.subscriptions = {};

  self.onSubscriptionUpdated = this.save.bind(this);
}

Object.defineProperty(Profile.prototype, 'currentSubscription', {
  enumerable: true,
  get: function () {
    return _.chain(this.subscriptions)
      .values()
      .filter(function (s) { return s.isDefault; })
      .first()
      .value() || null;
  },

  set: function (value) {
    _.values(this.subscriptions)
      .forEach(function (s) { s.isDefault = false; });
    if (value) {
      value.isDefault = true;
    }
  }
});

_.extend(Profile.prototype, {
  addEnvironment: function (env) {
    this.environments[env.name] = env;
  },

  getEnvironment: function (envName) {
    if (!envName) {
      return this.environments.Production;
    }
    var key = _.keys(this.environments)
      .filter(function (env) { return utils.ignoreCaseEquals(env, envName); })[0];
    return this.environments[key];
  },

  deleteEnvironment: function (environmentOrName) {
    if (_.isString(environmentOrName)) {
      delete this.environments[environmentOrName];
    } else {
      delete this.environments[environmentOrName.name];
    }
  },

  addSubscription: function (subscription) {
    var existingSubscription = _.values(this.subscriptions)
      .filter(function (s) { return s.id === subscription.id; })[0];

    if (existingSubscription) {
      existingSubscription.removeListener('updated', this.onSubscriptionUpdated);

      if (subscription.name !== existingSubscription.name) {
        delete this.subscriptions[existingSubscription.name];
      }

      existingSubscription.updateFrom(subscription);
      subscription = existingSubscription;
    }

    if (subscription.isDefault) {
      this.currentSubscription = null;
    }
    this.subscriptions[subscription.name] = subscription;
    subscription.on('updated', this.onSubscriptionUpdated);
  },

  deleteSubscription: function (subscriptionOrName) {
    var subscription = subscriptionOrName;
    if (_.isString(subscriptionOrName)) {
      subscription = this.subscriptions[subscriptionOrName];
    }

    if (subscription.isDefault) {
      var remainingSubscriptions = _.values(this.subscriptions)
        .filter(function (sub) { return sub.name !== subscription.name; });
      if (_.first(remainingSubscriptions)) {
        remainingSubscriptions[0].isDefault = true;
      }
    }

    subscription.removeListener('updated', this.onSubscriptionUpdated);
    delete this.subscriptions[subscription.name];
  },

  logoutUser: function (username, done) {
    var self = this;
    username = username;

    // Helper functions to define process of logout
    function usernameMatches(subscription) {
      return utils.ignoreCaseEquals(subscription.user.name, username);
    }

    function defaultGoesLast(subscription) {
      return subscription.isDefault ? 1 : 0;
    }

    function removeTokenOrSubscription(subscription) {
      if (subscription.user) {
        if (subscription.managementCertificate) {
          delete subscription.user;
        } else {
          self.deleteSubscription(subscription.name);
        }
        return true;
      }
      return false;
    }

    function subscriptionsWereRemoved(wasRemoved) {
      return wasRemoved;
    }

    // First, delete cached access tokens
    dnsimpleAuth.logoutUser(username, function (err) {
      var loggedOut = _.chain(_.values(self.subscriptions))
      .filter(usernameMatches)
      .sortBy(defaultGoesLast)
      .map(removeTokenOrSubscription)
      .any(subscriptionsWereRemoved)
      .value();
      done(err, loggedOut);
    });
  },

  getSubscription: function (idOrName) {
    var subscription;
    if (!idOrName) {
      subscription = this.currentSubscription;
      if (!subscription) {
        throw new Error($('There is no current subscription. Please use the dnsimple login command to set your current subscription.'));
      }
    } else {
      subscription = this.subscriptions[idOrName] ||
      _.values(this.subscriptions)
      .filter(function (s) { return utils.ignoreCaseEquals(s.id, idOrName); })[0];
      if (!subscription) {
        throw new Error(util.format(
          $('The subscription \'%s\' was not found. Please check your spelling, or use the dnsimple login command to set your subscription.'),
          idOrName));
      }
    }
    return subscription;
  },

  importPublishSettings: function (fileName) {
    var self = this;
    _.each(publishSettings.import(fileName), function (subData) {
      var newSubscription = new Subscription(subData, self._findEnvironment(subData));
      self.addSubscription(newSubscription);
      if (!self.currentSubscription) {
        newSubscription.isDefault = true;
      }
    });
  },

  saveToStream: function (stream) {
    stream.write(JSON.stringify(this._getSaveData(), null, 4), 'utf8');
    stream.end();
  },

  save: function (fileName) {
    if (!fileName) {
      fileName = defaultProfileFile;
    }

    fs.writeFileSync(fileName, JSON.stringify(this._getSaveData(), null, 4));
  },

  _getSaveData: function () {
    return {
      environments: _.values(this.environments)
        .filter(function (e) { return !e.isPublicEnvironment; })
        .map(function (e) { return e.toJSON(); }),
      subscriptions: _.values(this.subscriptions).map(function (s) { return s.toJSON(); })
    };
  },

  /**
  * Find an environment with a matching api endpoint
  * @param {object} subscriptionData subscription data from publishsettings file
  *
  * @returns corresponding environment object or throws if not found.
  */
  _findEnvironment: function (subscriptionData) {
    var trimmedEndpoint = utils.stringTrimEnd(subscriptionData.apiEndpointUrl, '/');

    var found = _.values(this.environments).filter(function (e) {
      return utils.ignoreCaseEquals(trimmedEndpoint, utils.stringTrimEnd(e.apiEndpointUrl, '/'));
    });
    if (found.length === 0) {
      throw new Error(util.format(
        $('Could not find an environment with api endpoint %s. Create one and import this publishSettings file again.'),
        subscriptionData.apiEndpointUrl));
    }
    return found[0];
  }
});

//
// Profile loading functions
//

function load(fileNameOrData) {
  var profile = new Profile();
  if (_.isUndefined(fileNameOrData) || fileNameOrData === defaultProfileFile) {
    return loadDefaultProfile(profile);
  } else if (_.isString(fileNameOrData)) {
    return loadProfileFromFile(profile, fileNameOrData);
  } else {
    return loadProfileFromObject(profile, fileNameOrData);
  }
}

function loadDefaultProfile(profile) {
  profile.fileName = defaultProfileFile;
  if (utils.pathExistsSync(defaultProfileFile)) {
    return loadProfileFromFile(profile, defaultProfileFile);
  }
  return profile;
}

function loadProfileFromFile(profile, fileName) {
  profile.fileName = fileName;
  if (!utils.pathExistsSync(fileName)) {
    throw new Error(util.format($('Profile file %s does not exist'), fileName));
  }
  return loadProfileFromObject(profile, JSON.parse(fs.readFileSync(fileName, 'utf8')));
}

function loadProfileFromObject(profile, data) {
  if (data.environments) {
    data.environments.forEach(function (envData) {
      var e = new Environment(envData);
      profile.addEnvironment(e);
    });
  }
  if (data.subscriptions) {
    data.subscriptions.forEach(function (subData) {
      profile.addSubscription(new Subscription(subData, profile.environments[subData.environmentName]));
    });
    if(!profile.currentSubscription && data.subscriptions.length > 0) {
      profile.getSubscription(data.subscriptions[0].id).isDefault = true;
    }
  }
  return profile;
}

function clearDnsimpleDir() {
  function deleteIfExists(file, isDir) {
    if (utils.pathExistsSync(file)) {
      log.silly(util.format($('Removing %s'), file));
      (isDir ? fs.rmdirSync : fs.unlinkSync)(file);
      return true;
    } else {
      log.silly(util.format($('%s does not exist'), file));
    }
  }

  var dnsimpleDirectory = utils.dnsimpleDir();
  
  var isDeleted = utils.clearConfig() || isDeleted;
  isDeleted = cacheUtils.clear() || isDeleted;
  isDeleted = deleteIfExists(defaultProfileFile) || isDeleted;
  isDeleted = deleteIfExists(dnsimpleAuth.defaultTokenCacheFile) || isDeleted;

  try {
    deleteIfExists(dnsimpleDirectory, true);
  } catch (err) {
    log.warn(util.format($('Couldn\'t remove %s'), dnsimpleDirectory));
  }

  log.info(isDeleted ? $('Account settings cleared successfully')
      : $('Account settings are already clear'));
}

var defaultProfileFile = path.join(utils.dnsimpleDir(), 'dnsimpleProfile.json');

var currentProfile = load(defaultProfileFile);

//
// Resource management
//
function toLowerCase(s) { return s.toLowerCase(); }

var knownResourceNamespaces = new StringSet(toLowerCase);
var knownProviders = new StringSet(toLowerCase);

function addKnownResourceNamespace() {
  knownResourceNamespaces.add(Array.prototype.slice.call(arguments, 0));
}

function addKnownProvider() {
  knownProviders.add(Array.prototype.slice.call(arguments, 0));
}

_.extend(module.exports, {
  load: load,
  defaultProfileFile: defaultProfileFile,
  Profile: Profile,
  Subscription: Subscription,
  Environment: Environment,
  current: currentProfile,
  clearDnsimpleDir: clearDnsimpleDir,
  getSubscription: function (subscription) {
    return currentProfile.getSubscription(subscription);
  },
  addKnownResourceNamespace: addKnownResourceNamespace,
  addKnownProvider: addKnownProvider,
  knownResourceNamespaces: function () { return knownResourceNamespaces.keys(); },
  knownProviders: function() { return knownProviders.keys(); },
  providerKeyTransform: toLowerCase
});
