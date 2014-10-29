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

var path = require('path');
var fs = require('fs');

var util = require('util');

var profile = require('../../util/profile');
var utils = require('../../util/utils');
var WebsitesClient = require('./websites/websitesclient');

var $ = utils.getLocaleString;

exports.init = function (cli) {
  var log = cli.output;
  var site = cli.category('site');
  var siteCertificates = site.category('cert')
    .description($('Commands to manage your Web Site certificates'));

  siteCertificates.command('list [name]')
    .usage('[options] [name]')
    .description($('Show your site certificates'))
    .option('--slot <slot>', $('the name of the slot'))
    .option('-s, --subscription <id>', $('the subscription id'))
    .execute(function (name, options, _) {
      var parsedSiteName = WebsitesClient.parseSiteName(name);
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        site: {
          name: parsedSiteName.name,
          slot: options.slot ? options.slot : parsedSiteName.slot
        },
      };

      site.lookupSiteNameAndWebSpace(context, _);

      var siteConfigurations = site.doSiteGet(context, _);
      cli.interaction.formatOutput(siteConfigurations.sslCertificates, function (data) {
        if (data.length > 0) {
          log.table(data, function (row, item) {
            row.cell($('Subject'), item.subjectName);
            row.cell($('Expiration Date'), item.expirationDate);
            row.cell($('Thumbprint'), item.thumbprint);
          });
        } else {
          log.info($('No certificates defined yet'));
        }
      });
    });

  siteCertificates.command('add [certificate-path] [name]')
    .usage('[options] <certificate-path> [name]')
    .description($('Add a site certificate in pfx format'))
    .option('--slot <slot>', $('the name of the slot'))
    .option('-c, --certificate-path <certificate-path>', $('the certificate path'))
    .option('-k, --key <key>', $('the certificate key'))
    .option('-s, --subscription <id>', $('the subscription id'))
    .execute(function (certificatePath, name, options, _) {
      certificatePath = cli.interaction.promptIfNotGiven($('Certificate path: '), certificatePath, _);

      if (!fs.existsSync(certificatePath)) {
        throw new Error(util.format($('Invalid certificate file path %s'), certificatePath));
      }

      if (path.extname(certificatePath) !== '.pfx') {
        throw new Error($('Only pfx certificates are supported'));
      }

      key = cli.interaction.promptPasswordOnceIfNotGiven($('Certificate key: '), options.key, _);

      var parsedSiteName = WebsitesClient.parseSiteName(name);
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        site: {
          name: parsedSiteName.name,
          slot: options.slot ? options.slot : parsedSiteName.slot
        },
      };

      site.lookupSiteNameAndWebSpace(context, _);

      var siteConfigurations = site.doSiteGet(context, _);
      var certificateContent = fs.readFile(certificatePath, _);

      var newCertificate = {
        password: key,
        pfxBlob: certificateContent
      };

      siteConfigurations.sslCertificates.push(newCertificate);

      site.doSitePUT(context, {
        sslCertificates: siteConfigurations.sslCertificates
      }, _);
    });

  siteCertificates.command('delete [thumbprint] [name]')
    .usage('[options] <thumbprint> [name]')
    .description($('Delete a site certificate'))
    .option('--slot <slot>', $('the name of the slot'))
    .option('-t, --thumbprint <thumbprint>', $('the certificate thumbprint'))
    .option('-q, --quiet', $('quiet mode, do not ask for delete confirmation'))
    .option('-s, --subscription <id>', $('the subscription id'))
    .execute(function (thumbprint, name, options, _) {
      thumbprint = cli.interaction.promptIfNotGiven($('Certificate thumbprint: '), thumbprint, _);

      var parsedSiteName = WebsitesClient.parseSiteName(name);
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        site: {
          name: parsedSiteName.name,
          slot: options.slot ? options.slot : parsedSiteName.slot
        },
      };

      site.lookupSiteNameAndWebSpace(context, _);

      var siteConfigurations = site.doSiteGet(context, _);
      var match = siteConfigurations.sslCertificates.filter(function (c) {
        return utils.ignoreCaseEquals(c.thumbprint, thumbprint);
      })[0];

      if (match) {
        if (!options.quiet && !cli.interaction.confirm(util.format($('Delete certificate with subject %s? [y/n] '), match.subjectName), _)) {
          return;
        }

        match.isToBeDeleted = 'true';

        site.doSitePUT(context, {
          sslCertificates: siteConfigurations.sslCertificates
        }, _);
      } else {
        throw new Error(util.format('Certificate with thumbprint "%s" does not exist.', thumbprint));
      }
    });

  siteCertificates.command('show [thumbprint] [name]')
    .usage('[options] <thumbprint> [name]')
    .description($('Show a site certificate'))
    .option('--slot <slot>', $('the name of the slot'))
    .option('-t, --thumbprint <thumbprint>', $('the certificate thumbprint'))
    .option('-s, --subscription <id>', $('the subscription id'))
    .execute(function (thumbprint, name, options, _) {
      thumbprint = cli.interaction.promptIfNotGiven($('Certificate thumbprint: '), thumbprint, _);

      var parsedSiteName = WebsitesClient.parseSiteName(name);
      var context = {
        subscription: profile.current.getSubscription(options.subscription).id,
        site: {
          name: parsedSiteName.name,
          slot: options.slot ? options.slot : parsedSiteName.slot
        },
      };

      site.lookupSiteNameAndWebSpace(context, _);

      var siteConfigurations = site.doSiteGet(context, _);

      var match = siteConfigurations.sslCertificates.filter(function (c) {
        return utils.ignoreCaseEquals(c.thumbprint, thumbprint);
      })[0];

      if (match) {
        cli.interaction.formatOutput(match, function (data) {
          cli.interaction.logEachData($('Certificate'), data);
        });
      } else {
        throw new Error(util.format($('Certificate with thumbprint "%s" does not exist.'), thumbprint));
      }
    });
};