var redis = require('redis'),
  ShardManager = require('./sharding/shard-manager');

var Engine = function (server, options) {
  var self = this;
  this._server = server;
  this._shardManagers = [];
  this._options = options || {};

  var host = this._options.host || this.DEFAULT_HOST,
      port = this._options.port || this.DEFAULT_PORT,
      database = this._options.database || this.DEFAULT_DATABASE,
      password = this._options.password,
      gc = this._options.gc || this.DEFAULT_GC,
      redisOptions = this._options.redisOptions || { no_ready_check:true, parser:'javascript' },
      shards = this._options.shards || [[{ host: host, port: port, database: database, password: password}]];

  if(!Array.isArray(shards[0])) { // turn it into an array of arrays
    shards = [shards];
  }

  this._ns = this._options.namespace || '';

  function onRedisError(err){
	  self._server.error('Redis error: ?', err.message);
  }

  // connects to each shard and stores it in the shard manager
  function connectToShards(shards, isPrimary) {
    var shardsList = [];
    shards.forEach(function (shard) {
      var client,
          subscriber;

      client = connectRedis(shard, redisOptions, onRedisError);
      if (isPrimary) {
        subscriber = connectRedis(shard, redisOptions, onRedisError);
        subscriber.on('message', function (topic, message) {
          self._server.debug('Got message for ?', message);
          self.emptyQueue(message);
        });
      }

      var shardName = shard.shardName || (shard.host + ':' + shard.port);
      var newShard = {
        redis:client,
        subscriber:subscriber,
        shardName:shardName
      };

      shardsList.push({ shardName:shardName, shard:newShard});
    });

    return new ShardManager(shardsList);
  }

  shards.forEach(function (shards, i) {
    self._shardManagers.push(connectToShards(shards, i === 0));
  });

  this._gc = setInterval(function () {
    self.gc()
  }, gc * 1000);

  this._server.bind('connection:open', function (clientId) {
    self._server.debug('subscribing ? to redis', clientId);
    self._getShard(clientId).subscriber.subscribe(self._ns + '/' + clientId + '/notify');
  });

  this._server.bind('connection:close', function (clientId) {
    self._server.debug('unsubscribing ? to redis', clientId);
    self._getShard(clientId).subscriber.unsubscribe(self._ns + '/' + clientId + '/notify');
  });
};

function setRetryOptions(client, options){
  if(options.retry_delay !== undefined){
    client.retry_delay = options.retry_delay;
  }

  if(options.retry_backoff !== undefined){
    client.retry_backoff = options.retry_backoff;
  }
}

function connectRedis(connection, options, onRedisError){
  var client = redis.createClient(connection.port, connection.host, options);
  client.on('connect', function(){
    setRetryOptions(client, options);
  });

  if(options.handleErrors){
    client.on('error', onRedisError);
  }

  if(connection.password){
    client.auth(connection.password);
  }

  if(connection.database){
    client.select(connection.database);
  }

  setRetryOptions(client, options);
  return client;
}

Engine.create = function (server, options) {
  return new this(server, options);
};

Engine.prototype = {
  DEFAULT_HOST:'localhost',
  DEFAULT_PORT:6379,
  DEFAULT_DATABASE:0,
  DEFAULT_GC:60,
  LOCK_TIMEOUT:120,

  disconnect:function () {
    function endShard(shard) {
      shard.redis.end();
      if (shard.subscriber) {
        shard.subscriber.unsubscribe();
        shard.subscriber.end();
      }
    }

    clearInterval(this._gc);

    this._shardManagers.forEach(function (shardManager) {
      shardManager.end(endShard);
    });
  },

  createClient:function (callback, context) {
    var clientId = this._server.generateId(), self = this;
    this._getShard(clientId).redis.zadd(this._ns + '/clients', 0, clientId, function (error, added) {
      if (added === 0) return self.createClient(callback, context);
      self._server.debug('Created new client ?', clientId);
      self._server.trigger('handshake', clientId);
      callback.call(context, clientId);
    });
  },

  clientExists:function (clientId, callback, context) {
    var redis = this._getShard(clientId).redis;
    redis.zscore(this._ns + '/clients', clientId, function (error, score) {
      callback.call(context, score !== null);
    });
  },

  destroyClient:function (clientId, callback, context) {
    var self = this,
      shard = this._getShard(clientId),
      redis = shard.redis,
      subscriber = shard.subscriber;

    subscriber.unsubscribe(self._ns + '/' + clientId + '/notify');
    redis.smembers(this._ns + '/clients/' + clientId + '/channels', function (err, channels) {
      if (err) {
        if (callback) callback.call(context);
        return;
      }

      var n = channels.length, i = 0;
      if (i === n) return self._afterSubscriptionsRemoved(clientId, callback, context);

      var unsubscribeError = null;
      channels.forEach(function (channel) {
        self.unsubscribe(clientId, channel, function (err) {
          unsubscribeError = unsubscribeError || err;
          i += 1;
          if (i === n) {
            if (unsubscribeError) {
              if (callback) callback.call(context);
            } else {
              self._afterSubscriptionsRemoved(clientId, callback, context);
            }
          }
        });
      });
    });
  },

  _afterSubscriptionsRemoved:function (clientId, callback, context) {
    var self = this,
      redis = this._getShard(clientId).redis;
    redis.del(this._ns + '/clients/' + clientId + '/messages', function (err) {
      if (err) {
        if (callback) callback.call(context);
        return;
      }

      redis.zrem(self._ns + '/clients', clientId, function () {
        self._server.debug('Destroyed client ?', clientId);
        self._server.trigger('disconnect', clientId);
        if (callback) callback.call(context);
      });
    });
  },

  ping:function (clientId) {
    var timeout = this._server.timeout,
      redis = this._getShard(clientId).redis;

    if (typeof timeout !== 'number') return;

    var time = new Date().getTime();

    this._server.debug('Ping ?, ?', clientId, time);
    redis.zadd(this._ns + '/clients', time, clientId);
  },

  subscribe:function (clientId, channel, callback, context) {
    var self = this, channelRedis = this._getShard(channel).redis, clientRedis = this._getShard(clientId).redis;
    clientRedis.sadd(this._ns + '/clients/' + clientId + '/channels', channel, function (error, added) {
      if (added === 1) self._server.trigger('subscribe', clientId, channel);
    });
    channelRedis.sadd(this._ns + '/channels' + channel, clientId, function () {
      self._server.debug('Subscribed client ? to channel ?', clientId, channel);
      if (callback) callback.call(context);
    });
  },

  unsubscribe:function (clientId, channel, callback, context) {
    var self = this, channelRedis = self._getShard(channel).redis;
    channelRedis.srem(self._ns + '/channels' + channel, clientId, function (err) {
      if (err) {
        if (callback) callback.call(context, err);
        return;
      }

      self._server.debug('Unsubscribed client ? from channel ?', clientId, channel);

      var clientRedis = self._getShard(clientId).redis;
      clientRedis.srem(self._ns + '/clients/' + clientId + '/channels', channel, function (err, removed) {
        if (removed === 1) self._server.trigger('unsubscribe', clientId, channel);
        if (callback) callback.call(context, err);
      });
    });
  },

  publish:function (message, channels) {
    var self = this;

    function publish(message, channels, shardManager) {
      var shardMap = {};
      channels.forEach(function (channel) { // performance improvement -- channels that map to the same shard only need one publish
        var shard = self._getShard(channel, shardManager),
          shardName = shard.shardName;
        shardMap[shardName] = shardMap[shardName] || { shard:shard, channels:[] };
        shardMap[shardName].channels.push(channel);
      });

      Object.keys(shardMap).forEach(function (shardName) {
        var map = shardMap[shardName],
          shard = map.shard,
          channels = map.channels;

        self._publish(message, channels, shard, shardManager);
      });
    }

    // publish to all shard managers
    function broadcast(message, channels) {
      self._shardManagers.forEach(function (shardManager) {
        publish(message, channels, shardManager);
      })
    }

    broadcast(message, channels);

    this._server.debug('Publishing message ?', message);
    this._server.trigger('publish', message.clientId, message.channel, message.data);
  },

  _publish:function (message, channels, channelShard, shardManager) {
    var self = this,
      jsonMessage = JSON.stringify(message),
      keys = channels.map(function (c) {
        return self._ns + '/channels' + c;
      });

    var notify = function (error, clients) {
      if (error) return;

      clients.forEach(function (clientId) {
        var shard = self._getShard(clientId, shardManager),
          redis = shard.redis;
        self._server.debug('Queueing for client ?: ?', clientId, message);
        redis.rpush(self._ns + '/clients/' + clientId + '/messages', jsonMessage, function (err, result) {
          redis.publish(self._ns + '/' + clientId + '/notify', clientId);
          self._server.debug('Published for client ? - ? - to server ?', clientId, message, shard.shardName);
        });
      });
    };

    keys.push(notify);
    channelShard.redis.sunion.apply(channelShard.redis, keys); // get all clients subscribed to the channels on that shard, then call notify on them
  },

  emptyQueue:function (clientId) {
    if (!this._server.hasConnection(clientId)) {
      this._server.debug('Does not have connection for: ?', clientId);
      return;
    }

    var key = this._ns + '/clients/' + clientId + '/messages',
      self = this,
      redis = this._getShard(clientId).redis,
      multi = redis.multi();

    multi.lrange(key, 0, -1, function (error, jsonMessages) {
      if (error) {
        return;
      }

      var messages = jsonMessages.map(function (json) {
        return JSON.parse(json)
      });
      self._server.deliver(clientId, messages);
    });

    multi.del(key);
    multi.exec();
  },

  gc:function () {
    var self = this;
    var timeout = this._server.timeout;
    if (typeof timeout !== 'number') return;

    this._shardManagers[0].forEach(function (shard) {
      self._withLock('gc', shard.redis, function (releaseLock) {
        var cutoff = new Date().getTime() - 1000 * 2 * timeout,
          self = this;

        shard.redis.zrangebyscore(this._ns + '/clients', 0, cutoff, function (error, clients) {
          if (error) return releaseLock();

          var i = 0, n = clients.length;
          if (i === n) return releaseLock();

          clients.forEach(function (clientId) {
            this.destroyClient(clientId, function () {
              i += 1;
              if (i === n) releaseLock();
            }, this);
          }, self);
        });
      }, self);
    });
  },

  _withLock:function (lockName, redis, callback, context) {
    var lockKey = this._ns + '/locks/' + lockName,
      currentTime = new Date().getTime(),
      expiry = currentTime + this.LOCK_TIMEOUT * 1000 + 1;

    var releaseLock = function () {
      if (new Date().getTime() < expiry) redis.del(lockKey);
    };

    redis.setnx(lockKey, expiry, function (error, set) {
      if (set === 1) return callback.call(context, releaseLock);

      redis.get(lockKey, function (error, timeout) {
        if (!timeout) return;

        var lockTimeout = parseInt(timeout, 10);
        if (currentTime < lockTimeout) return;

        redis.getset(lockKey, expiry, function (error, oldValue) {
          if (oldValue !== timeout) return;
          callback.call(context, releaseLock);
        });
      });
    });
  },


  // gets the correct shard for the given key
  // key -- the key to choose the shard for -- required
  // shardManager - an array of shards to choose from, defaults to the primary shard manager
  _getShard:function (key, shardManager) {
    var manager = shardManager || this._shardManagers[0];
    return manager.getShard(key);
  }
};

module.exports = Engine;

