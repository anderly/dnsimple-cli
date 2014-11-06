# DNSimple CLI for Windows, Mac and Linux

[![NPM version](http://img.shields.io/npm/v/dnsimple-cli.svg?style=flat)](https://npmjs.org/package/dnsimple-cli)
[![Build Status](http://img.shields.io/travis/anderly/dnsimple-cli.svg?style=flat)](https://travis-ci.org/anderly/dnsimple-cli)
[![License](http://img.shields.io/badge/license-Apache-red.svg?style=flat)](http://opensource.org/licenses/Apache-2.0)

This project provides a cross-platform command line interface for [DNSimple][0]. Specifically, it uses the [DNSimple REST API][2] via [nodejs-dnsimple](https://github.com/fvdm/nodejs-dnsimple) and its associated npm package [dnsimple](https://www.npmjs.org/package/dnsimple).

This project's command line interface is based on the [azure-cli](https://github.com/Azure/azure-sdk-tools-xplat), although its features and functionality are entirely different and not related to [azure](http://azure.microsoft.com/) whatsoever.

Installation
------------

The release on npm is the latest stable version:

```bash
npm install -g dnsimple-cli
```

The code on Github is the most recent version, but can be unstable:

```bash
npm install anderly/dnsimple-cli
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

### Download Source Code

To get the source code of the SDK via **git** just type:

```bash
git clone https://github.com/anderly/dnsimple-cli.git
cd ./dnsimple-cli
npm install
```

Usage
-----

Just type `dnsimple` or `dns` at a command prompt to get started and see available commands. Please see the [command reference][3] and [wiki][4] for more details.

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
info:    Tool version 0.3.0
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

Authentication
-----

Authentication by **email + password** and **email + token** are both supported. If you authenticate using **email + password**, your account api token is retrieved and used for all subsequent calls. All credentials are securely stored in OS-specific secure credential stores such as OS X Keychain or Windows Credential Manager.

The DNSimple [sandbox][1] environment is supported in addition to [production][0].

### Password Authentication

```bash
# This will prompt for your password in the console
dnsimple login -u <your dnsimple account email address>
```
or
```bash
# Specifying the -e --environment parameter allows you to login to the Sanbox enivonrment. 
# Production is the default.
dnsimple login -u <your dnsimple account email address> -e Sandbox
```

### Token Authentication

```bash
dnsimple login -u <your dnsimple account email address> -t <your dnsimple account api token>
```

Commands
--------
Once authenticated, you can begin using the following top-level command categories:
```
# Command Categories:
account        Commands to manage your account information
domain         Commands to manage domains
contact        Commands to manage your account contacts
service        Commands to manage your domain services
template       Commands to manage dns record templates
user           Commands to manage your users
subscription   Commands to manage account subscriptions
price          Commands to view domain pricing
```
Please see the [command reference][3] and [wiki][4] for more details.

## Setting up Fiddler for CLI

You need to set the following environment variables to capture the HTTP traffic generated from the execution of dnsimple cli commands

```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
set HTTPS_PROXY=http://127.0.0.1:8888
```

## Learn More
Please see the [command reference][3] and [wiki][4] for details and examples of all commands.

For more information on the DNSimple REST API, please see the [DNSimple API Documentation][2].

## Contribute Code or Provide Feedback

If you would like to contribute to this project please [fork](https://github.com/anderly/dnsimple-cli/fork) the repo and submit a PR with any contributions.

If you encounter any bugs with the library please file an issue in the [Issues](https://github.com/anderly/dnsimple-cli/issues) section of the project.

[0]:http://dnsimple.com
[1]:http://sandbox.dnsimple.com
[2]:http://developer.dnsimple.com/
[3]:https://github.com/anderly/dnsimple-cli/blob/master/command-reference.md
[4]:https://github.com/anderly/dnsimple-cli/wiki