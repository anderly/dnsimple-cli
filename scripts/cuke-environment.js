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

'use strict';

// Setup or tear down the cucumber temp environment

var fs = require('fs');
var path = require('path');

if (!fs.existsSync) {
  fs.existsSync = path.existsSync;
}

var options = {
  setup: function setup() {
    if (!fs.existsSync('credentials')) {
      fs.mkdirSync('credentials');
    }
    var files = fs.readdirSync('credentials');
    files
      .map(function (f) { return path.join('credentials', f); } )
      .forEach(function (file) { fs.unlinkSync(file); } );
  },

  teardown: function teardown() {
    var files = fs.readdirSync('credentials');
    files
      .map(function (f) { return path.join('credentials', f); } )
      .forEach(function (file) { fs.unlinkSync(file); } );
    fs.rmdirSync('credentials');
  }
};

options[process.argv[2]]();


