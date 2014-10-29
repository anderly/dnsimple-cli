//
// Copyright (c) Microsoft and contributors.  All rights reserved.
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

var util = require('util');

var _ = require('underscore');

var utils = require('../../util/utils');

var $ = utils.getLocaleString;

function AccountClient(cli) {
  this.cli = cli;
}

// Dealing with registering resource providers on subscriptions

var knownResourceTypes = [];
var REQUIRED_API_VERSION = '2012-08-01';

_.extend(AccountClient.prototype, {
  registerResourceType: function (resourceName) {
    var self = this;

    self.cli.output.silly(util.format($('Registering resource type %s'), resourceName));
    knownResourceTypes.push(resourceName);
  },

  knownResourceTypes: function () {
    return knownResourceTypes.slice(0);
  },

  registerKnownResourceTypes: function (subscriptionId, callback) {
    var self = this;
    var service = utils.createServiceManagementService(self.getCurrentSubscription(subscriptionId), self.cli.output, REQUIRED_API_VERSION);

    function registerNextResource(resourceNames, errors, cb) {
      var errorString;
      if (resourceNames.length === 0) {
        self.cli.output.verbose($('Resource registration on account complete'));
        if (errors.length > 0) {
          errorString = 'The following resources failed to register: ' + errors.join(',');
          // Ignore failing registrations for now, resource provider may not
          // exist. Update when we have a reliable way to detect this case.
          cb();
        } else {
          cb();
        }
      } else {
        self.cli.output.verbose(util.format($('Registering resource type %s'), resourceNames[0]));
        service.registerResourceProvider(resourceNames[0], function (err) {
          if (err) {
            self.cli.output.verbose(util.format($('Registration of resource type %s failed'), resourceNames[0]));
            errors.push(resourceNames[0]);
          }
          registerNextResource(resourceNames.slice(1), errors, cb);
        });
      }
    }

    function listResourceTypes(typesToList, validTypes, callback) {
      if (typesToList.length === 0) {
        return callback(null, validTypes);
      }

      service.listResourceTypes([typesToList[0]], function (err, resources) {
        if (err) {
          if (err.code === 'BadRequest' && err.message.search(/Service type\s+\S+\s+is invalid./) !== -1) {
            // Unknown resource type, just go on to the next one
            self.cli.output.silly(util.format($('Listing resource type error: %s'), err.message));
            listResourceTypes(typesToList.slice(1), validTypes, callback);
          } else {
            // It's a real error, bail
            callback(err);
          }
        } else {
          validTypes.push(resources[0]);
          listResourceTypes(typesToList.slice(1), validTypes, callback);
        }
      });
    }

    listResourceTypes(knownResourceTypes, [], function (err, resources) {
      if (err) {
        return callback(err);
      }
      self.cli.output.silly('Registered resource types = ', util.inspect(resources, false, null));
      var resourcesToRegister = resources
        .filter(function (r) { return r.state.toUpperCase() === 'UNREGISTERED'; })
        .map(function (r) { return r.type; });

      registerNextResource(resourcesToRegister, [], callback);
    });
  }
});

module.exports = AccountClient;