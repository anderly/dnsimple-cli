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
var commander = require('commander');
var StorageUtil = require('../../util/storage.util');
var utils = require('../../util/utils');
var performStorageOperation = StorageUtil.performStorageOperation;
var startProgress = StorageUtil.startProgress;
var endProgress = StorageUtil.endProgress;

var $ = utils.getLocaleString;

/**
* Add storage account command line options
*/
commander.Command.prototype.addStorageAccountOption = function() {
  this.option('-a, --account-name <accountName>', $('the storage account name'));
  this.option('-k, --account-key <accountKey>', $('the storage account key'));
  this.option('-c, --connection-string <connectionString>', $('the storage connection string'));
  this.option('-vv', $('run storage command in debug mode'));
  return this;
};

/**
* Init storage service property command
*/
exports.init = function(cli) {

  //Init StorageUtil
  StorageUtil.init(cli);

  /**
  * Define storage service property command usage
  */
  var storage = cli.category('storage')
    .description($('Commands to manage your Storage objects'));

  var logger = cli.output;

  var logging = storage.category('logging')
    .description($('Commands to manage your Storage logging properties'));

  logging.command('show')
    .description($('Show the logging properties of the storage services '))
    .option('--blob', $('show logging properties for blob service'))
    .option('--table', $('show logging properties for table service'))
    .option('--queue', $('show logging properties for queue service'))
    .addStorageAccountOption()
    .execute(showLoggingProperties);

  logging.command('set')
    .description($('Set the logging properties of the storage service'))
    .option('--blob', $('set logging properties for blob service'))
    .option('--table', $('set logging properties for table service'))
    .option('--queue', $('set logging properties for queue service'))
    .option('--version <version>', $('the version string'))
    .option('--retention <retention>', $('set logging retention in days'))
    .option('--read', $('enable logging for read requests'))
    .option('--read-off', $('disable logging for read requests'))
    .option('--write', $('enable logging for write requests'))
    .option('--write-off', $('disable logging for write requests'))
    .option('--delete', $('enable logging for delete requests'))
    .option('--delete-off', $('disable logging for delete requests'))
    .addStorageAccountOption()
    .execute(setLoggingProperties);

  var metrics = storage.category('metrics')
    .description($('Commands to manage your Storage metrics properties'));

  metrics.command('show')
    .description($('Show the metrics properties of the storage services '))
    .option('--blob', $('show metrics properties for blob service'))
    .option('--table', $('show metrics properties for table service'))
    .option('--queue', $('show metrics properties for queue service'))
    .addStorageAccountOption()
    .execute(showMetricsProperties);

  metrics.command('set')
    .description($('Set the metrics properties of the storage service'))
    .option('--blob', $('set metrics properties for blob service'))
    .option('--table', $('set metrics properties for table service'))
    .option('--queue', $('set metrics properties for queue service'))
    .option('--version <version>', $('the version string'))
    .option('--retention <retention>', $('set metrics retention in days'))
    .option('--hour', $('set hourly metrics properties'))
    .option('--hour-off', $('turn off hourly metrics properties'))
    .option('--minute', $('set minute metrics properties'))
    .option('--minute-off', $('turn off minute metrics properties'))
    .option('--api', $('include API in metrics '))
    .option('--api-off', $('exclude API from metrics'))
    .addStorageAccountOption()
    .execute(setMetricsProperties);

  /**
  * Implement storage service property cli
  */

  /**
  * Show storage logging properties
  * @param {object} options commadline options
  * @param {callback} _ callback function
  */
  function showLoggingProperties(options, _) {
    var types = getServiceTypes(options, false);
    var operations = [];

    types.forEach(function(type) {
      var client = getServiceClient(type, options);
      operations.push(getStorageOperation(client, type, 'getServiceProperties'));
    });

    var tips = util.format($('Getting storage logging properties for service: %s'), types);
    startProgress(tips);

    var serviceProperties = [];
    try {
      for (var index = 0; index < operations.length; index++) {
        var property = performStorageOperation(operations[index], _);
        property.type = operations[index].type;
        serviceProperties.push(property);
      }
    } finally {
      endProgress();
    }

    var output = [];
    serviceProperties.forEach(function(property) {
      property.Logging.Type = property.type;
      output.push(property.Logging);
    });

    cli.interaction.formatOutput(output, function(outputData) {
      logger.table(outputData, function(row, item) {
        row.cell($('Service Type'), item.Type);
        row.cell($('Version'), item.Version);
        row.cell($('Retention Days'), getRetentionString(item.RetentionPolicy));
        row.cell($('Read Requests'), getStatusString(item.Read));
        row.cell($('Write Requests'), getStatusString(item.Write));
        row.cell($('Delete Requests'), getStatusString(item.Delete));
      });
    });
  }

  /**
  * Set storage logging properties
  * @param {object} options commadline options
  * @param {callback} _ callback function
  */
  function setLoggingProperties(options, _) {
    var types = getServiceTypes(options, true);
    var client = getServiceClient(types[0], options);
    var getOperation = getStorageOperation(client, types[0], 'getServiceProperties');
    var setOperation = getStorageOperation(client, types[0], 'setServiceProperties');

    var tips = util.format($('Setting storage logging properties for service: %s'), types);
    startProgress(tips);
    try {
      var serviceProperties = performStorageOperation(getOperation, _);
      generateServiceLoggingProperties(serviceProperties, options);
      performStorageOperation(setOperation, _, serviceProperties);
    } finally {
      endProgress();
    }

    showLoggingProperties(options, _);
  }

  /**
  * Show storage metrics properties
  * @param {object} options commadline options
  * @param {callback} _ callback function
  */
  function showMetricsProperties(options, _) {
    var types = getServiceTypes(options, false);
    var operations = [];

    types.forEach(function(type) {
      var client = getServiceClient(type, options);
      operations.push(getStorageOperation(client, type, 'getServiceProperties'));
    });

    var tips = util.format($('Getting storage metrics properties for service: %s'), types);
    startProgress(tips);

    var serviceProperties = [];
    try {
      for (var index = 0; index < operations.length; index++) {
        var property = performStorageOperation(operations[index], _);
        property.type = operations[index].type;
        serviceProperties.push(property);
      }
    } finally {
      endProgress();
    }

    var output = [];
    serviceProperties.forEach(function(property) {
      var properties = { type: property.type, HourMetrics: [], MinuteMetrics: [] };
      properties.HourMetrics.push(property.HourMetrics);
      properties.MinuteMetrics.push(property.MinuteMetrics);
      output.push(properties);
    });

    cli.interaction.formatOutput(output, function(outputData) {
      outputData.forEach(function(properties) {
        logger.data(util.format($('The metrics properties for %s service are: '), properties.type));
        logger.table(properties.HourMetrics, function(row, item) {
          row.cell($('Metrics Type'), 'Hourly');
          row.cell($('Enabled'), getStatusString(item.Enabled));
          row.cell($('Version'), item.Version);
          row.cell($('Retention Days'), getRetentionString(item.RetentionPolicy));
          row.cell($('Include APIs'), getStatusString(item.IncludeAPIs));
        });
        logger.data('');
        logger.table(properties.MinuteMetrics, function(row, item) {
          row.cell($('Metrics Type'), 'Minute');
          row.cell($('Enabled'), getStatusString(item.Enabled));
          row.cell($('Version'), item.Version);
          row.cell($('Retention Days'), getRetentionString(item.RetentionPolicy));
          row.cell($('Include APIs'), getStatusString(item.IncludeAPIs));
        });
        logger.data('\n');
      });
    });
  }

  /**
  * Set storage metrics properties
  * @param {object} options commadline options
  * @param {callback} _ callback function
  */
  function setMetricsProperties(options, _) {
    var types = getServiceTypes(options, true);
    var client = getServiceClient(types[0], options);
    var getOperation = getStorageOperation(client, types[0], 'getServiceProperties');
    var setOperation = getStorageOperation(client, types[0], 'setServiceProperties');

    var tips = util.format($('Setting storage metric properties for service: %s'), types);
    startProgress(tips);
    try {
      var serviceProperties = performStorageOperation(getOperation, _);
      generateServiceMetricsProperties(serviceProperties, options);
      performStorageOperation(setOperation, _, serviceProperties);
    } finally {
      endProgress();
    }

    showMetricsProperties(options, _);
  }

  /**
  * @ignore
  * Get storage type from options
  * @param {object} options commadline options
  * @param {object} whether the operation is exclusive for one service type
  * @return {types} service types in an array
  */
  function getServiceTypes(options, exclusive) {
    var isBlob = options.blob;
    var isTable = options.table;
    var isQueue = options.queue;

    var count = 0;
    count = isBlob ? count + 1 : count;
    count = isTable ? count + 1 : count;
    count = isQueue ? count + 1 : count;

    if (count === 0) {
      if (exclusive) {
        throw new Error($('Please define the service type'));
      } else {
        isBlob = isTable = isQueue = true;
      }
    } else if (count > 1 && exclusive) {
      throw new Error($('Please define only one service type'));
    }

    var types = [];
    if (isBlob) {
      types.push(StorageUtil.OperationType.Blob);
    }
    if (isTable) {
      types.push(StorageUtil.OperationType.Table);
    }
    if (isQueue) {
      types.push(StorageUtil.OperationType.Queue);
    }
    return types;
  }

  /**
  * @ignore
  * Get service client from user specified credential or env variables
  * @param {string} [type] operation type
  * @param {object} [options] commadline options
  */
  function getServiceClient(type, options) {
    switch (type) {
      case StorageUtil.OperationType.Blob:
        return StorageUtil.getServiceClient(StorageUtil.getBlobService, options);
      case StorageUtil.OperationType.Queue:
        return StorageUtil.getServiceClient(StorageUtil.getQueueService, options);
      case StorageUtil.OperationType.Table:
        return StorageUtil.getServiceClient(StorageUtil.getTableService, options);
    }
  }

  /**
  * @ignore
  * Get Storage blob operation object
  * @param {object} [serviceClient] service client
  * @param {string} [type] operation type
  * @param {string} [operationName] operation name
  * @return {StorageOperation} storage operation
  */
  function getStorageOperation(serviceClient, type, operationName) {
    var operation = new StorageUtil.StorageOperation();
    operation.type = type;
    operation.operation = operationName;
    operation.service = serviceClient;
    return operation;
  }

  /**
  * @ignore
  * Generate service logging properties
  * @param {object} [serviceProperties] current service properties
  * @param {object} [options] commadline options
  * @return {object} service properties
  */
  function generateServiceLoggingProperties(serviceProperties, options) {
    if (options.Version) {
      serviceProperties.Logging.Version = '1.0';
    }

    if (options.retention) {
      if (!StorageUtil.isValidRetention(options.retention)) {
        throw new Error($('--retention must be set with a positive integer'));
      }
      if (typeof options.retention === 'string') {
        options.retention = parseInt(options.retention, 10);
      }
      serviceProperties.Logging.RetentionPolicy = {};
      if (options.retention !== 0) {
        serviceProperties.Logging.RetentionPolicy.Enabled = true;
        serviceProperties.Logging.RetentionPolicy.Days = options.retention;
      } else {
        serviceProperties.Logging.RetentionPolicy.Enabled = false;
        delete serviceProperties.Logging.RetentionPolicy.Days;
      }
    }

    if (options.read && options.readOff) {
      throw new Error($('--read and --read-off cannot be both defined'));
    } else if (options.read) {
      serviceProperties.Logging.Read = true;
    } else if (options.readOff) {
      serviceProperties.Logging.Read = false;
    }

    if (options.write && options.writeOff) {
      throw new Error($('--write and --write-off cannot be both defined'));
    } else if (options.write) {
      serviceProperties.Logging.Write = true;
    } else if (options.writeOff) {
      serviceProperties.Logging.Write = false;
    }

    if (options.delete && options.deleteOff) {
      throw new Error($('--delete and --delete-off cannot be both defined'));
    } else if (options.delete) {
      serviceProperties.Logging.Delete = true;
    } else if (options.deleteOff) {
      serviceProperties.Logging.Delete = false;
    }
  }

  /**
  * @ignore
  * Generate service metrics properties
  * @param {object} [serviceProperties] current service properties
  * @param {object} [options] commadline options
  * @return {object} service properties
  */
  function generateServiceMetricsProperties(serviceProperties, options) {
    if (!options.hour && !options.minute && !options.hourOff && !options.minuteOff) {
      throw new Error($('Please define one of them: --hour, --minute, --hour-off or --minute-off'));
    } else if (options.hour && options.minute) {
      throw new Error($('Only one of --hour and --minute should be defined'));
    }

    if (options.hour && options.hourOff) {
      throw new Error($('--hour and --hour-off cannot be both defined'));
    } else if (options.hour) {
      setMetrics(serviceProperties.HourMetrics, options);
    } else if (options.hourOff) {
      disableMetrics(serviceProperties.HourMetrics);
    }

    if (options.minute && options.minuteOff) {
      throw new Error($('--minute and --minute-off cannot be both defined'));
    } else if (options.minute) {
      setMetrics(serviceProperties.MinuteMetrics, options);
    } else if (options.minuteOff) {
      disableMetrics(serviceProperties.MinuteMetrics);
    }
  }

  /**
  * @ignore
  * Set metrics
  * @param {object} [metrics] metrics to set
  * @param {object} [options] commadline options
  */
  function setMetrics(metrics, options) {
    metrics.Enabled = true;

    if (options.Version) {
      metrics.Version = '1.0';
    }

    if (options.retention) {
      if (!StorageUtil.isValidRetention(options.retention)) {
        throw new Error($('--retention must be set with a positive integer'));
      }
      if (typeof options.retention === 'string') {
        options.retention = parseInt(options.retention, 10);
      }
      metrics.RetentionPolicy = {};
      if (options.retention !== 0) {
        metrics.RetentionPolicy.Enabled = true;
        metrics.RetentionPolicy.Days = options.retention;
      } else {
        metrics.RetentionPolicy.Enabled = false;
        delete metrics.RetentionPolicy.Days;
      }
    }

    if (options.api && options.apiOff) {
      throw new Error($('--api and --api-off cannot be both defined'));
    } else if (options.api) {
      metrics.IncludeAPIs = true;
    } else if (options.apiOff) {
      metrics.IncludeAPIs = false;
    }
  }

  /**
  * @ignore
  * Disable metrics
  * @param {object} [metrics] metrics to disable
  */
  function disableMetrics(metrics) {
    if (metrics) {
      metrics.Enabled = false;
      delete metrics.IncludeAPIs;
    }
  }

  /**
  * @ignore
  * Get status string
  * @param {boolean} [isOn] whether it is turned on
  * @return {string} the status string
  */
  function getStatusString(isOn) {
    return isOn ? $('on') : $('off');
  }

  /**
  * @ignore
  * Get retention setting string
  * @param {boolean} [isOn] whether it is turned on
  * @return {string} the status string
  */
  function getRetentionString(retention) {
    if (retention && retention.Enabled) {
      return retention.Days.toString();
    } else {
      return $('Not set');
    }
  }
};
