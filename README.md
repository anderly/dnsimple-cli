# DNSimple CLI for Windows, Mac and Linux

[![Build Status](https://travis-ci.org/anderly/dnsimple-cli.png?branch=master)](https://travis-ci.org/anderly/dnsimple-cli)

This project provides a cross-platform command line interface for [DNSimple][0]. Specifically, it uses the [DNSimple REST API][2] via [nodejs-dnsimple](https://github.com/fvdm/nodejs-dnsimple) and its associated npm package [dnsimple](https://www.npmjs.org/package/dnsimple).

This project's command line interface is based on the [azure-cli](https://github.com/Azure/azure-sdk-tools-xplat), although its features and functionality are entirely different and not related to [azure](http://azure.microsoft.com/) whatsoever.

## Current Features

* Accounts
    * Secure authentication for multiple DNSimple accounts/subscriptions
    * List authenticated accounts/subscriptions
    * Select current account/subscription
* Domains
    * List domains in your account
    * List domains in your account that match a wildcard filter (e.g. *.com)
    * Show details for a specific domain in your account
* Contacts
* Services
* Templates
* Extended Attributes
* Users
* Subscriptions
* Prices

## Installation

### Install from npm (coming soon)

You can install the dnsimple-cli npm package directly.
```bash
npm install -g dnsimple-cli
```
### Install from GitHub
You can install the latest code (could be unstable) directly from GitHub.
```bash
npm install anderly/dnsimple-cli
```

### Download Source Code

To get the source code of the SDK via **git** just type:

```bash
git clone https://github.com/anderly/dnsimple-cli.git
cd ./dnsimple-cli
npm install
```

### Configure auto-complete

Auto-complete is supported for Mac and Linux.

To enable it in zsh, run:

```bash
echo '. <(dnsimple --completion)' >> .zshrc
```

To enable it in bash, run:

```bash
dnsimple --completion >> ~/dnsimple.completion.sh
echo 'source ~/dnsimple.completion.sh' >> .bash_profile
```

## Get Started

In general, following are the steps:

* Login to your DNSimple account.
* Use the commands

The first step can be different for different environments you are targeting. The DNSimple [sandbox][1] is supported in addition to [production][0].

### Login directly from dnsimple-cli

```bash
# This will prompt for your password in the console
dnsimple login -u <your dnsimple account email address>

# use the commands to manage your domains/dns/services/templates
dnsimple domain list
```

### dnsimple cli on Ubuntu
If you want to run dnsimple cli on Ubuntu, then you should install **nodejs-legacy** instead of **nodejs**. For more information please check the following links:
- [why there is a problem with nodejs installation on ubuntu](http://stackoverflow.com/questions/14914715/express-js-no-such-file-or-directory/14914716#14914716)
- [how to solve the nodejs installation problem on ubuntu](https://github.com/expressjs/keygrip/issues/7)

Please perform the installation steps in following order:
```bash
sudo apt-get install nodejs-legacy
sudo apt-get install npm
npm install -g dnsimple-cli
```
    
## Setting up Fiddler for CLI

You need to set the following environment variables to capture the HTTP traffic generated from the execution of dnsimple cli commands

```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
set HTTPS_PROXY=http://127.0.0.1:8888
```

## Learn More
Please see the DNSimple CLI [command reference](https://github.com/anderly/dnsimple-cli/blob/master/command-reference.md) for details on current and anticipated commands.

For more information on the DNSimple REST API, please see the [DNSimple API Documentation][2].

## Contribute Code or Provide Feedback

If you would like to contribute to this project please [fork](https://github.com/anderly/dnsimple-cli/fork) the repo and submit a PR with any contributions.

If you encounter any bugs with the library please file an issue in the [Issues](https://github.com/anderly/dnsimple-cli/issues) section of the project.

[0]:http://dnsimple.com
[1]:http://sandbox.dnsimple.com
[2]:http://developer.dnsimple.com/
