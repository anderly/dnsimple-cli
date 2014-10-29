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

'use strict';

var dnsimple = require('dnsimple');

// Factory class that wraps the dnsimple client to provide call-time token credentials
function DnsimpleClientFactory(credentials) {
  this.credentials = credentials;
}

DnsimpleClientFactory.prototype.create = function (callback) {
  var self = this;
  this.credentials.authenticateRequest(function (err, scheme, token) {
    if (err) { return callback(err); }
    var dns = new dnsimple({ email: self.credentials.userId, token: token });
    callback(null, dns);
  });
};

module.exports = DnsimpleClientFactory;