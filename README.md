# DNSimple CLI for Windows, Mac and Linux

[![NPM version](https://badge.fury.io/js/dnsimple-cli.png)](http://badge.fury.io/js/dnsimple-cli) [![Build Status](https://travis-ci.org/anderly/dnsimple-cli.png?branch=master)](https://travis-ci.org/anderly/dnsimple-cli)

This project provides a cross-platform command line interface for [DNSimple][0]. Specifically, it uses the [DNSimple REST API][2] via [nodejs-dnsimple](https://github.com/fvdm/nodejs-dnsimple) and its associated npm package [dnsimple](https://www.npmjs.org/package/dnsimple).

This project's command line interface is based on the [azure-cli](https://github.com/Azure/azure-sdk-tools-xplat), although its features and functionality are entirely different and not related to [azure](http://azure.microsoft.com/) whatsoever.

## Current Features

See the [command reference][3] for complete planned command structure.

---
* Accounts: `(command: dnsimple account)`
    * Secure authentication for multiple DNSimple accounts/subscriptions
    * List authenticated accounts/subscriptions
    * Set current account/subscription

---
* Domains: `(command: dnsimple domain)`
    * List domains in your account `(command: dnsimple domain list)`
    * List domains in your account that match a wildcard filter (e.g. *.com) `(command: dnsimple domain list *.com)`
    * Show details for a specific domain in your account `(command: dnsimple domain show)`
    * Add a domain to your account `(command: dnsimple domain add)`
    * Delete a domain from your account `(command: dnsimple domain delete)`
    * Reset a domain token for one or more domains`(command: dnsimple domain reset)`
    * Push one or more domains from the current account to another `(command: dnsimple domain push)`
    * Check availability of one or more domains `(command: dnsimple domain check)`
    * Register one or more domains `(command: dnsimple domain register)`
    * Records: `(command: dnsimple domain record)`
        * Show DNS Records for a specific domain `(command: dnsimple domain record list)`
        * Show DNS Records of a specific type (A, CNAME, TXT, NS, etc.) for a specific domain  `(command: dnsimple domain record list -t CNAME)`
        * Show DNS Records whose content matches a specific filter (e.g. \*spf\*)  `(command: dnsimple domain record list -f *spf*)`
        * Add DNS Records to a domain `(command: dnsimple domain record add)`
        * Show details for a domain DNS Record `(command: dnsimple domain record show)`
        * Update DNS Records for a domain `(command: dnsimple domain record update)`
        * Delete DNS Records for a domain `(command: dnsimple domain record delete)`

---
* Contacts:  `(command: dnsimple contact)`

---
* Services:  `(command: dnsimple service)`

---
* Templates:  `(command: dnsimple template)`

---
* Extended Attributes:  `(command: dnsimple extattr)`

---
* Users:  `(command: dnsimple user)`

---
* Subscriptions:  `(command: dnsimple subscription)`

---
* Prices:  `(command: dnsimple price)`
	* List all domain prices

---
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

Just type `dnsimple` at a command prompt to get started and see available commands. For more details see the [command reference][3].

```bash
user@host:~$ dnsimple
info:         _           _                 _      
info:        | |         (_)               | |     
info:      __| |_ __  ___ _ _ __ ___  _ __ | | ___ 
info:     / _` | '_ \/ __| | '_ ` _ \| '_ \| |/ _ \
info:    | (_| | | | \__ \ | | | | | | |_) | |  __/
info:     \__,_|_| |_|___/_|_| |_| |_| .__/|_|\___|
info:                                | |           
info:                                |_|           
info:    
info:    DNSimple: We make DNS simple.
info:    
info:    Tool version 0.0.1
help:    
help:    Display help for a given command
help:      help [options] [command]
help:    
help:    Log in to a DNSimple account.
help:      login [options]
help:    
help:    Log out from DNSimple.
help:      logout [options] [username]
help:    
help:    Open the DNSimple portal in a browser
help:      portal [options]
help:    
help:    Commands:
help:      account        Commands to manage your account information
help:      config         Commands to manage your local settings
help:      domain         Commands to manage domains
help:      contact        Commands to manage your account contacts
help:      service        Commands to manage your domain services
help:      template       Commands to manage dns record templates
help:      user           Commands to manage your users
help:      subscription   Commands to manage account subscriptions
help:      price          Commands to view domain pricing
help:    
help:    Options:
help:      -h, --help     output usage information
help:      -v, --version  output the application version
```

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
Please see the DNSimple CLI [command reference][3] for details on current and anticipated commands.

For more information on the DNSimple REST API, please see the [DNSimple API Documentation][2].

## Contribute Code or Provide Feedback

If you would like to contribute to this project please [fork](https://github.com/anderly/dnsimple-cli/fork) the repo and submit a PR with any contributions.

If you encounter any bugs with the library please file an issue in the [Issues](https://github.com/anderly/dnsimple-cli/issues) section of the project.

[0]:http://dnsimple.com
[1]:http://sandbox.dnsimple.com
[2]:http://developer.dnsimple.com/
[3]:https://github.com/anderly/dnsimple-cli/blob/master/command-reference.md