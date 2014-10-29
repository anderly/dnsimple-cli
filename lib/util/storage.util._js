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

var azureCommon = require('azure-common');
var storage = require('azure-storage');
var http = require('http');
var BlobUtilities = storage.BlobUtilities;
var connectionStringParser = azureCommon.ConnectionStringParser;
var flows = require('streamline/lib/util/flows');
var os = require('os');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var getStorageSettings = storage.StorageServiceClient.getStorageSettings;
var util = require('util');
var utils = require('./utils');
var profile = require('./profile');
var validation = require('./validation');
var ExponentialRetryPolicyFilter = storage.ExponentialRetryPolicyFilter;

var __ = require('underscore');
var $ = utils.getLocaleString;

/**
* Module variables
*/
var cli = null;
var logger = null;
var progress = null;

/**
* Limit the concurrent REST calls
*/
var restFunnel = null;

/**
* Storage rest operation time out
*/
var operationTimeout = null;

/**
* Storage Utilities for storage blob/queue/table command
*/
var StorageUtil = {};

/**
* Storge connection string environment variable name and it's also used azure storage powershell.
*/
StorageUtil.ENV_CONNECTIONSTRING_NAME = 'AZURE_STORAGE_CONNECTION_STRING';
StorageUtil.ENV_SDK_ACCOUNT_NAME = 'AZURE_STORAGE_ACCOUNT';
StorageUtil.ENV_SDK_ACCOUNT_KEY = 'AZURE_STORAGE_ACCESS_KEY';
StorageUtil.CONCURRENTCY_CONFIG_KEY_NAME = 'azure_storage_concurrency';
StorageUtil.OPERATION_TIMEOUT_CONFIG_KEY_NAME = 'azure_storage_timeout'; //Milliseconds

/**
* Storage Operation Type
*/
StorageUtil.OperationType = {
  Blob: 'blob',
  Queue: 'queue',
  Table: 'table',
  File: 'file',
};

/**
* Storage access type
*/
StorageUtil.AccessType = {
  Container: 'container',
  Blob: 'blob',
  Queue: 'queue',
  Table: 'table',
};

/**
* Storage container permission
*/
StorageUtil.ContainerPermission = {
  Read: 'r',
  Write: 'w',
  Delete: 'd',
  List: 'l',
};

/**
* Storage blob permission
*/
StorageUtil.BlobPermission = {
  Read: 'r',
  Write: 'w',
  Delete: 'd',
};

/**
* Storage table permission
*/
StorageUtil.TablePermission = {
  Query: 'r',
  Add: 'a',
  Update: 'u',
  Delete: 'd',
};

/**
* Storage queue permission
*/
StorageUtil.QueuePermission = {
  Read: 'r',
  Add: 'a',
  Update: 'u',
  Process: 'p',
};

/**
* ContinuationToken arg index in different listing functions
*/
StorageUtil.ListContinuationTokenArgIndex = {
  Container: 1,
  Blob: 2,
  Share: 1,
  File: 2,
  Queue: 1,
  Table: 1,
};

/**
* Init cli module
*/
StorageUtil.init = function(azureCli) {
  cli = azureCli;
  logger = cli.output;
  var cfg = utils.readConfig();
  var restConcurrency = getRestConcurrency(cfg);
  http.globalAgent.maxSockets = restConcurrency;
  restFunnel = flows.funnel(restConcurrency);
  operationTimeout = getRestOperationTimeout(cfg);
};

/**
* Create an Storage operation
* @constructor
* @param {OperationType} [type] Storage operation type
* @param {string} [operation] Operation name
*/
StorageUtil.StorageOperation = function(type, operation) {
  this.type = type;
  this.operation = operation;
};

/**
* Get blob service with the specified or default connection string
* @param {string|object} [connection] Storage connection string or options with access information
* @return {BlobService} BlobService object from node sdk
*/
StorageUtil.getBlobService = function(connection) {
  var serviceSettings = getStorageServiceSettings(connection);
  var service = null;
  if (serviceSettings === null) {
    //Use the default blob service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    service = storage.createBlobService();
  } else if (serviceSettings._sasToken) {
    service = storage.createBlobServiceWithSas(serviceSettings._blobEndpoint.primaryHost, serviceSettings._sasToken);
  } else {
    service = storage.createBlobService(serviceSettings._name, serviceSettings._key, serviceSettings._blobEndpoint.primaryHost);
  }
  return service.withFilter(new ExponentialRetryPolicyFilter());
};

/**
* Get table service with the specified or default connection string
* @param {string} [connection] Storage connection string
* @return {TableService} TableService object from node sdk
*/
StorageUtil.getTableService = function(connection) {
  var serviceSettings = getStorageServiceSettings(connection);
  var service = null;
  if (serviceSettings === null) {
    //Use the default table service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    service = storage.createTableService();
  } else if (serviceSettings._sasToken) {
    service = storage.createTableServiceWithSas(serviceSettings._tableEndpoint.primaryHost, serviceSettings._sasToken);
  } else {
    service = storage.createTableService(serviceSettings._name, serviceSettings._key, serviceSettings._tableEndpoint.primaryHost);
  }
  return service.withFilter(new ExponentialRetryPolicyFilter());
};

/**
* Get queue service with the specified or default connection string
* @param {string} [connection] Storage connection string
* @return {QueueService} QueueService object from node sdk
*/
StorageUtil.getQueueService = function(connection) {
  var serviceSettings = getStorageServiceSettings(connection);
  var service = null;
  if (serviceSettings === null) {
    //Use the default queue service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    service = storage.createQueueService();
  } else if (serviceSettings._sasToken) {
    service = storage.createQueueServiceWithSas(serviceSettings._queueEndpoint.primaryHost, serviceSettings._sasToken);
  } else {
    service = storage.createQueueService(serviceSettings._name, serviceSettings._key, serviceSettings._queueEndpoint.primaryHost);
  }
  return service.withFilter(new ExponentialRetryPolicyFilter());
};

/**
* Get file service with the specified or default connection string
* @param {string} [connectionString] Storage connection string
* @return {FileService} FileService object from node sdk
*/
StorageUtil.getFileService = function(connectionString) {
  var serviceSettings = getStorageServiceSettings(connectionString);
  var service = null;
  if (serviceSettings === null) {
    //Use the default queue service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    service = storage.createFileService();
  } else {
    service = storage.createFileService(serviceSettings._name, serviceSettings._key, serviceSettings._fileEndpoint.primaryHost);
  }
  return service.withFilter(new ExponentialRetryPolicyFilter());
};

/**
* Perform Storage REST operation, this function accepts dynamic parameters
* All parameters except the first one will be treated as the parameters of the specified operation
* @param {StorageOperation} storageOperation Storage operation
* @param {Callback} _ call back function
*/
StorageUtil.performStorageOperation = function(storageOperation, _) {
  if (!storageOperation) return;
  var service = storageOperation.service;
  if (!service) {
    throw new Error('Service client can\'t be null');
  }

  var operation = storageOperation.operation || '';

  if (!service[operation] || !isFunction(service[operation])) {
    throw 'Invalid operation ' + operation;
  }

  //The number of the explicitly defined parameters for this method
  var definedParameterCount = 2;
  var operationArgs = Array.prototype.slice.call(arguments).slice(definedParameterCount, arguments.length);

  var result = null;
  try {
    restFunnel(_, function(_) {
      /*jshint camelcase:false*/
      result = service[operation].apply_(_, service, operationArgs);
      /*jshint camelcase:true*/
    });
  } catch (e) {
    StorageUtil.endProgress();
    throw e;
  }
  return result;
};

/**
* Start cli operation progress
*/
StorageUtil.startProgress = function(tips) {
  if (progress !== null) {
    StorageUtil.endProgress();
  }
  progress = cli.interaction.progress(tips);
};

/**
* End cli operation progress
*/
StorageUtil.endProgress = function() {
  if (progress !== null) {
    progress.end();
  }
  progress = null;
};

/**
* Set REST operation time out
*/
StorageUtil.setOperationTimeout = function(options) {
  if (options.timeoutintervalInMs === undefined &&
  operationTimeout !== null && !isNaN(operationTimeout) && operationTimeout > 0) {
    options.timeoutIntervalInMs = operationTimeout;
  }
};

/**
* Convert string to container access level
*/
StorageUtil.stringToContainerAccessLevel = function(str) {
  var accessType = BlobUtilities.BlobContainerPublicAccessType;
  var accessLevel = accessType.OFF;
  if (str) {
    str = str.toLowerCase();
    switch (str) {
      case 'blob':
        accessLevel = accessType.BLOB;
        break;
      case 'container':
        accessLevel = accessType.CONTAINER;
        break;
      case 'off':
        accessLevel = accessType.OFF;
        break;
      default:
        if (str) {
          throw new Error(util.format('Invalid container public access level %s', str));
        }
        break;
    }
  }
  return accessLevel;
};

/**
* Convert file to blob name
*/
StorageUtil.convertFileNameToBlobName = function(name) {
  return name.replace(/\\/img, '/');
};

/**
* Convert container access level to string
*/
StorageUtil.containerAccessLevelToString = function(accessType) {
  var publicAccessType = BlobUtilities.BlobContainerPublicAccessType;
  var str = 'Off';
  switch (accessType) {
    case publicAccessType.BLOB:
      str = 'Blob';
      break;
    case publicAccessType.CONTAINER:
      str = 'Container';
      break;
    case publicAccessType.OFF:
      str = 'Off';
      break;
    default:
      if (accessType) {
        throw new Error(util.format('Invalid Container public access type %s', accessType));
      }
      break;
  }
  return str;
};

/**
* Parse json parameter to object
*/
StorageUtil.parseKvParameter = function(str) {
  if (str) {
    return connectionStringParser.parse(str);
  }
};

/**
* Is not found exception
*/
StorageUtil.isNotFoundException = function(e) {
  return e.code === 'NotFound' || e.code === 'ResourceNotFound';
};

/**
* Is blob exists exception
*/
StorageUtil.isBlobExistsException = function(e) {
  return e.code === 'BlobAlreadyExists';
};

/**
* Is file not found exception
*/
StorageUtil.isFileNotFoundException = function(e) {
  return e.code === 'ENOENT';
};

/**
* Recursive mkdir
*/
StorageUtil.recursiveMkdir = function(root, specifiedPath) {
  if (utils.isWindows()) {
    //'\' will be converted to '//' both in client and azure storage
    specifiedPath = specifiedPath.replace(/\//g, '\\');
  }
  var dirs = specifiedPath.split(path.sep);
  var dirPath = root || '';
  var dirName = '';
  for (var i = 0; i < dirs.length; i++) {
    dirName = utils.escapeFilePath(dirs[i]);
    dirPath = path.join(dirPath, dirName);
    if (!StorageUtil.doesPathExist(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  }
  return dirPath;
};

StorageUtil.doesPathExist = function(dirPath) {
  var existFunc = fs.existsSync || path.existsSync; //For node 0.10 and 0.6
  if (path) {
    return existFunc(dirPath);
  }
  return true;
};

/**
* Get file system structure from blob name
*/
StorageUtil.getStructureFromBlobName = function(blobName) {
  var structure = { fileName: undefined, dirName: undefined };
  if (blobName[blobName.length - 1] === '/') {
    var lastIndex = blobName.lastIndexOf('/', blobName.length - 2);
    structure.fileName = blobName.substr(lastIndex + 1);
    structure.dirName = blobName.substr(0, lastIndex);
  } else {
    structure.fileName = path.basename(blobName);
    structure.dirName = path.dirname(blobName);
  }
  return structure;
};

/**
* Calculate the md5hash for the specified file
*/
StorageUtil.calculateFileMd5 = function(path, cb) {
  var stream = fs.createReadStream(path);
  var digest = crypto.createHash('md5');
  stream.on('data', function(d) { digest.update(d); });
  stream.on('end', function() {
    var md5 = digest.digest('base64');
    cb(null, md5);
  });
};

/**
* Format blob properties
*/
StorageUtil.formatBlobProperties = function(properties, target) {
  if (!properties) return;
  var propertyNames = ['contentType', 'contentEncoding', 'contentLanguage', 'cacheControl'];
  var getPropertyIndex = function(key) {
    for (var i = 0; i < propertyNames.length; i++) {
      if (propertyNames[i].toLowerCase() == key.toLowerCase()) {
        return i;
      }
    }
    return -1;
  };

  var index = -1;
  for (var item in properties) {
    index = getPropertyIndex(item);
    if (index == -1) {
      throw new Error(util.format($('Invalid value: %s. Options are: %s'), item, propertyNames));
    }
    target[propertyNames[index]] = properties[item];
    if (item.toLowerCase() === 'contenttype') {
      target['contentType'] = properties[item];
    }
  }
};

/**
* List azure storage objects with continuation
*/
StorageUtil.listWithContinuation = function(listFunc, storageServiceObject, continuationTokenIndexInArg) {
  var allItems = {};
  function listCallback(error, result) {
    if (error) throw error;

    if (result.entries instanceof Array) {
      if (!(allItems instanceof Array)) {
        allItems = [];
      }

      allItems = allItems.concat(result.entries);
    }
    else {
      for (var property in result.entries) {
        if (result.entries.hasOwnProperty(property)) {
          if (!allItems[property]) {
            allItems[property] = [];
          }

          allItems[property] = allItems[property].concat(result.entries[property]);
        }
      }
    }

    if (result.continuationToken) {
      callArguments[continuationTokenIndexInArg] = result.continuationToken;
      listFunc.apply(storageServiceObject, callArguments);
    } else {
      callback(error, allItems);
      allItems = null;
    }
  }
  var callback = arguments[arguments.length - 1];
  var callArguments = Array.prototype.slice.call(arguments).slice(3, arguments.length - 1);
  callArguments.push(listCallback);
  listFunc.apply(storageServiceObject, callArguments);
};

/**
* Get file service account from user specified credential or env variables
*/
StorageUtil.getServiceClient = function(getServiceClientFunc, options) {
  var isNameDefined = options.accountName !== undefined;
  var isKeyDefined = options.accountKey !== undefined;
  var isSasDefined = options.sas !== undefined;
  var isConnectionStringDefined = options.connectionString !== undefined;
  var isAccountDefined = isNameDefined || isKeyDefined;
  var isUserDefined = isAccountDefined || isSasDefined;

  if (isConnectionStringDefined && isUserDefined) {
    throw new Error($('Please only define one of them: 1. --connection-string. 2 --account-name and --account-key. 3. --account-name and --sas'));
  } else {
    var serviceClient = null;
    if (isConnectionStringDefined) {
      serviceClient = getServiceClientFunc(options.connectionString);
    } else if (isUserDefined) {
      if (isNameDefined) {
        if (isKeyDefined && isSasDefined) {
          throw new Error($('Please only define --account-key or --sas when --account-name is defined'));
        } else if (isKeyDefined) {
          var connString = util.format('DefaultEndpointsProtocol=https;AccountName=%s;AccountKey=%s', options.accountName, options.accountKey);
          serviceClient = getServiceClientFunc(connString);
        } else {
          serviceClient = getServiceClientFunc(options);
        }
      } else {
        throw new Error($('Please set --account-name and --account-key or --account-name and --sas'));
      }
    } else {
      //Use environment variable
      serviceClient = getServiceClientFunc();
    }
    if (options.verbose === true) {
      serviceClient.logger.level = azureCommon.Logger.LogLevels.DEBUG;
    }

    return serviceClient;
  }
};

/**
* Get a printer for speed summary
*/
StorageUtil.getSpeedPrinter = function(summary) {
  var clearBuffer = new Buffer(79, 'utf8');
  clearBuffer.fill(' ');
  clearBuffer = clearBuffer.toString();
  var done = false;
  return function(newline) {
    if (logger.format().json || done) return;
    var tips = util.format($('Percentage: %s%% (%s/%s) Average Speed: %s Elapsed Time: %s '), summary.getCompletePercent(),
      summary.getCompleteSize(), summary.getTotalSize(), summary.getAverageSpeed(), summary.getElapsedSeconds());
    fs.writeSync(1, '\r' + clearBuffer + '\r');
    process.stdout.write(tips);
    if (newline) {
      process.stdout.write('\n');
      done = true;
    }
  };
};

/**
* Get storage settings
*/
StorageUtil.getStorageServiceSettings = getStorageServiceSettings;

/**
* Get Storage default operation options
*/
StorageUtil.getStorageOperationDefaultOption = function() {
  var option = {};
  StorageUtil.setOperationTimeout(option);
  return option;
};

StorageUtil.validatePermissions = function(accessType, permissions) {
  switch (accessType) {
    case StorageUtil.AccessType.Container:
      validatePermisionsAndOrder(permissions, StorageUtil.ContainerPermission);
      break;
    case StorageUtil.AccessType.Blob:
      validatePermisionsAndOrder(permissions, StorageUtil.BlobPermission);
      break;
    case StorageUtil.AccessType.Table:
      validatePermisionsAndOrder(permissions, StorageUtil.TablePermission);
      break;
    case StorageUtil.AccessType.Queue:
      validatePermisionsAndOrder(permissions, StorageUtil.QueuePermission);
      break;
  }
};

StorageUtil.getSharedAccessPolicy = function(permissions, start, expiry, tableField, policyId) {
  var sharedAccessPolicy = {};
  if (policyId) {
    if (permissions || expiry || start) {
      throw new Error($('Permissions, start and expiry cannot be specified with a stored policy'));
    }
    sharedAccessPolicy.Id = policyId;
  } else {
    if (utils.stringIsNullOrEmpty(permissions)) {
      throw new Error($('Permissions or policy ID is required'));
    }
    if (!expiry) {
      throw new Error($('Expiry or policy ID is required'));
    }
    if (start && !__.isDate(start)) {
      throw new Error($('Start is not a valid date'));
    }
    if (!__.isDate(expiry)) {
      throw new Error($('Expiry is not a valid date'));
    }

    sharedAccessPolicy = {
      AccessPolicy: {
        Expiry: expiry
      }
    };

    // Get the permission symbols
    var sharedAccessPermissions = '';
    for (var index = 0; index < permissions.length; index++) {
      var symbol = permissions[index].toLowerCase();
      if (-1 == sharedAccessPermissions.indexOf(symbol)) {
        sharedAccessPermissions += symbol;
      }
    }
    sharedAccessPolicy.AccessPolicy.Permissions = sharedAccessPermissions;

    // Get the start time
    if (start) {
      if (start.getTime() >= expiry.getTime()) {
        throw new Error($('The expiry time of the specified access policy should be greater than start time'));
      }
      sharedAccessPolicy.AccessPolicy.Start = start;
    }
  }

  // Get the table fields
  if (tableField) {
    if (tableField.startRk && !tableField.startPk) {
      throw new Error($('Starting partition key must accompany starting row key'));
    }
    if (tableField.endRk && !tableField.endPk) {
      throw new Error($('Ending partition key must accompany ending row key'));
    }

    if (tableField.startPk) {
      sharedAccessPolicy.AccessPolicy.StartPk = tableField.startPk;
    }
    if (tableField.startRk) {
      sharedAccessPolicy.AccessPolicy.StartRk = tableField.startRk;
    }
    if (tableField.endPk) {
      sharedAccessPolicy.AccessPolicy.EndPk = tableField.endPk;
    }
    if (tableField.endRk) {
      sharedAccessPolicy.AccessPolicy.EndRk = tableField.endRk;
    }
  }

  return sharedAccessPolicy;
};

/**
* Operation concurrency.
*   -1 means operations are fully parallelized.
*   However the concurrent REST calls are limited by performStorageOperation
*/
StorageUtil.opConcurrency = -1;

/**
* Threads count in an operation.
*   The value indicates the max socket count of the http/https agent
*/
StorageUtil.threadsInOperation = 5;

/**
* Extract the storage account options from the specified options
* @param {object} options command line options
*/
StorageUtil.getStorageAccountOptions = function(options) {
  return {
    accountName: options.accountName,
    accountKey: options.accountKey,
    connectionString: options.connectionString,
    sas: options.sas
  };
};

/**
* Check if the given value is a valid retention value.
*
* @param {object} value The value to validate.
*/
StorageUtil.isValidRetention = function(value) {
  return validation.isInt(value) && parseInt(value, 10) >= 0;
};

/**
* Check if the permissions string matchs the allow operations with the correct order
* @param {permissions} permission symbols
* @param {allowOps} allowed operations
*/
function validatePermisionsAndOrder(permissions, allowOps) {
  var getEnumValues = function(enumObj) {
    var values = [];
    for (var prop in enumObj) {
      values.push(enumObj[prop]);
    }
    return values;
  };

  var getPermissionOrder = function(symbol, values) {
    for (var index = 0; index < values.length; index++) {
      if (symbol.toLowerCase() === values[index]) {
        return index;
      }
    }
    return -1;
  };

  var current = -1;
  var values = getEnumValues(allowOps);
  for (var index = 0; index < permissions.length; index++) {
    var symbol = permissions[index];
    validation.isValidEnumValue(symbol, values);

    var order = getPermissionOrder(symbol, values);
    if (order >= current) {
      current = order;
    } else {
      throw new Error(util.format($('Permission designations must be in the fixed order of: %s'), values));
    }
  }
}

/**
* Check whether the specified parameter is a function
* @param {object} func An arbitrary javascript object
* @return {bool} true if the specified object is function, otherwise false
*/
function isFunction(func) {
  return typeof func === 'function';
}

/**
* Get storage service settings with the specified or default connection string
* @param {string|object} [connection] Storage connection string
* @return {StorageServiceSettings} return the storage service settings if the connection string is applied, otherwise return null.
*/
function getStorageServiceSettings(connection) {
  var connectionString;
  var template = 'DefaultEndpointsProtocol=https;AccountName=%s;AccountKey=%s';
  if (typeof connection === 'string') {
    connectionString = connection;
  } else if (connection) {
    var options = connection;
    if (options.connectionString) {
      connectionString = options.connectionString;
    } else {
      if (options.accountName && options.accountKey) {
        connectionString = util.format(template, options.accountName, options.accountKey);
      } else {
        var sas = options.sas || options.sourceSas;
        if (options.accountName && sas) {
          return getStorageServiceSettingWithSAS(options.accountName, sas);
        }
      }
    }
  }

  if (!connectionString) {
    connectionString = process.env[StorageUtil.ENV_CONNECTIONSTRING_NAME];
  }
  if (!connectionString) {
    if (!process.env[StorageUtil.ENV_SDK_ACCOUNT_NAME] || !process.env[StorageUtil.ENV_SDK_ACCOUNT_KEY]) {
      throw new Error($('Please set the storage account parameters or one of the following two environment variables to use storage command. 1.AZURE_STORAGE_CONNECTION_STRING, 2. AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY'));
    } else {
      connectionString = util.format(template, process.env[StorageUtil.ENV_SDK_ACCOUNT_NAME], process.env[StorageUtil.ENV_SDK_ACCOUNT_KEY]);
    }
  }
  return getStorageSettings(connectionString);
}

/**
* Get storage service settings with the account name and shared access signature
* @param {string} [accountName] Storage account name
* @param {string} [sasToken] Storage shared access signature
* @return {StorageServiceSettings} return the storage service settings if the shared access signature is applied, otherwise return null.
*/
function getStorageServiceSettingWithSAS(accountName, sasToken) {
  var service = utils._createStorageClient(profile.current.getSubscription());
  var uri = service.baseUri;
  var protocol = uri.substring(0, uri.indexOf('/') + 2);
  var endpoint = uri.substring(uri.indexOf('.'), uri.length);

  var serviceSettings = {};
  serviceSettings._name = accountName;
  serviceSettings._sasToken = sasToken;
  serviceSettings._blobEndpoint = {};
  serviceSettings._blobEndpoint.primaryHost = protocol + accountName + '.' + StorageUtil.OperationType.Blob + endpoint;
  serviceSettings._tableEndpoint = {};
  serviceSettings._tableEndpoint.primaryHost = protocol + accountName + '.' + StorageUtil.OperationType.Table + endpoint;
  serviceSettings._queueEndpoint = {};
  serviceSettings._queueEndpoint.primaryHost = protocol + accountName + '.' + StorageUtil.OperationType.Queue + endpoint;
  serviceSettings._fileEndpoint = {};
  serviceSettings._fileEndpoint.primaryHost = protocol + accountName + '.' + StorageUtil.OperationType.File + endpoint;

  return serviceSettings;
}

/**
* Get REST operation time out
*/
function getRestOperationTimeout(cfg) {
  var radix = 10;
  var definedTimeout = parseInt(cfg[StorageUtil.OPERATION_TIMEOUT_CONFIG_KEY_NAME], radix);
  if (isNaN(definedTimeout) || definedTimeout <= 0) {
    return null;
  } else {
    return definedTimeout;
  }
}

/**
* Get the REST conccurency
*/
function getRestConcurrency(cfg) {
  var radix = 10;
  var definedConcurrency = parseInt(cfg[StorageUtil.CONCURRENTCY_CONFIG_KEY_NAME], radix);
  if (isNaN(definedConcurrency) || definedConcurrency === 0) {
    return getDefaultRestConcurrency();
  } else {
    return definedConcurrency;
  }
}

/**
* Get the default REST concurrency
*/
function getDefaultRestConcurrency() {
  var cpuCount = os.cpus().length;
  //Hard code number for default task amount per core
  var asyncTasksPerCoreMultiplier = 1;
  return cpuCount * asyncTasksPerCoreMultiplier;
}

module.exports = StorageUtil;
