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
// NOTICE: Modified for dnsimple-cli. Based-on azure-cli (https://github.com/Azure/azure-sdk-tools-xplat/)
//
'use strict';

/* jshint unused: false */

var __ = require('underscore');
var util = require('util');
var wrap = require('wordwrap').hard(0, 75);

var dnsimpleAuth = require('../util/authentication/dnsimpleAuth');
var tokenCache = dnsimpleAuth.tokenCache;
var profile = require('../util/profile');
var utils = require('../util/utils');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;

  cli.command('login')
    .description($('Log in to a DNSimple account. Currently, the user can login only via username/password'))
    .option('-e --environment [environment]', $('Environment to authenticate against (Sandbox|Production). Defaults to Production.'))
    .option('-u --user <username>', $('dnsimple account username (email address), will prompt if not given'))
    .option('-p --password <password>', $('dnsimple account password, will prompt if not given'))
    .option('-t --token <token>', $('If given, log in with api token rather than password'))
    .option('-q --quiet', $('do not prompt for confirmation of PII storage'))
    .execute(function(options, _) {

      var piiWarningText = wrap($('If you choose to continue, dnsimple command-line interface will cache your ' +
        'authentication information. Note that this sensitive information will be stored in ' +
        'plain text on the file system of your computer at %s. Ensure that you take suitable ' +
        'precautions to protect your computer from unauthorized access in order to minimize the ' +
        'risk of that information being disclosed.' +
        '\nDo you wish to continue: (y/n) '));

      var environmentName = options.environment || 'Production';
      var environment = profile.current.getEnvironment(environmentName);
      if (!environment) {
        throw new Error(util.format($('Unknown environment %s'), environmentName));
      }

      if (!options.hasOwnProperty('password')) {
        options.password = undefined;
      }

      if (!options.hasOwnProperty('token')) {
        options.token = undefined;
      }

      var supportedLoginTypeText = $('Please note that currently you can only login via username/password or username/token. ' +
        'To create an account, visit http://dnsimple.com.');
      log.warn(supportedLoginTypeText);

      var username = cli.interaction.promptIfNotGiven('Username: ', options.user, _);

      var token = options.token;

      if (!tokenCache.isSecureCache) {
        var haveSeenBefore = __.values(profile.current.subscriptions).some(function (s) {
          return utils.ignoreCaseEquals(username, s.username);
        });

        if (!options.quiet && !haveSeenBefore) {
          if (!cli.interaction.confirm(util.format(piiWarningText, profile.defaultProfileFile), _)) {
            log.info($('Login cancelled'));
            return;
          }
        }
      }

      var tokenOrPassword = options.token || options.password;

      var password = cli.interaction.promptPasswordOnceIfNotGiven('Password: ', tokenOrPassword, _);

      var progress = cli.interaction.progress($('Authenticating...'));
      try {
        dnsimpleAuth.logoutUser(username, _);
        var newSubscriptions = environment.addAccount(username, token, password, _);
        if (newSubscriptions.length > 0) {
          newSubscriptions[0].isDefault = true;

          newSubscriptions.forEach(function (s) {
            profile.current.addSubscription(s);
            log.info(util.format($('Added subscription %s'), s.name));
            if (s.isDefault) {
              log.info(util.format($('Setting subscription %s as default'), s.name));
            }
          });
          profile.current.save();
        } else {
          log.info(util.format($('No subscriptions found for this account')));
        }
      } catch (e) {
        progress.end();
        throw (e);
      }finally {
        progress.end();
      }
    });

  cli.command('logout [username]')
    .description($('Log out from DNSimple.'))
    .option('-u --username <username>', $('Required. Username (email address) used to log out from DNSimple.'))
    .execute(function (username, options, _) {
    if (!username){
      return cli.missingArgument('username');
    }
    if (profile.current.logoutUser(username, _)) {
      profile.current.save();
      log.info($('You have logged out.'));
    } else {
      log.info(util.format($('You are not logging in as \'%s\'. Quitting.'), username));
    }
  });
};
