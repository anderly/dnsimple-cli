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

var fs = require('fs');
var path = require('path');
//var moment = require('moment');
var utils = require('./utils');

var PluginCache = {};

function getPluginsFile() {
  return path.join(utils.azureDir(), 'plugins.json');
}

function read() {
  // var pluginsFile = getPluginsFile();
  // if (utils.pathExistsSync(pluginsFile)) {
  //   var data = fs.readFileSync(pluginsFile);
  //   var cachedPlugins = JSON.parse(data);
  //   if (cachedPlugins && !expiredPlugins(cachedPlugins)) {
  //     return cachedPlugins;
  //   }
  // }

  return null;
}

function save(plugins) {
  plugins.timestamp = new Date();
  plugins.cliVersion = utils.moduleVersion;

  var pluginsFile = getPluginsFile();
  fs.writeFileSync(pluginsFile, JSON.stringify(plugins));
  return plugins;
}

//function expiredPlugins(plugins) {
  // var minutesDifference = moment(plugins.timestamp).diff(new Date(), 'minutes');
  // if (plugins.timestamp && minutesDifference > 5) {
  //   return true;
  // }

  // var helpCommand = plugins.commands.filter(function (c) {
  //   return c.name === 'help';
  // })[0];

  // if (helpCommand) {
  //   if (!utils.pathExistsSync(helpCommand.filePath)) {
  //     return true;
  //   }
  // }

  // if (plugins.cliVersion &&
  //     utils.moduleVersion !== plugins.cliVersion) {
  //   return true;
  // }

  // return false;
//}

function clear() {
  var pluginsFile = getPluginsFile();
  try {
    fs.unlinkSync(pluginsFile);
  } catch (e) {
    // intentionally do nothing
  }
}

PluginCache.read = read;
PluginCache.save = save;
PluginCache.clear = clear;

module.exports = PluginCache;