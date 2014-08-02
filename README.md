# faye-redis-sharded [![Build Status](https://travis-ci.org/zwily/faye-redis-sharded-node.svg?branch=master)](https://travis-ci.org/zwily/faye-redis-sharded-node)

This plugin provides a Redis-based backend for the [Faye](http://faye.jcoglan.com)
messaging server. It allows a single Faye service to be distributed across many
front-end web servers by storing state and routing messages through a
[Redis](http://redis.io) database server.

In addition to the normal [faye-redis engine](https://github.com/faye/faye-redis-node),
faye-redis-sharded provides the ability to split keys across multiple redis servers via consistent hashing,
and even supports publishes to different redis server clusters.

## Installation

    npm install faye-redis-sharded


## Usage

Pass in the engine and any settings you need when setting up your Faye server.

```js
var faye  = require('faye'),
    redis = require('faye-redis-sharded'),
    http  = require('http');

var server = http.createServer();

var bayeux = new faye.NodeAdapter({
  mount:    '/',
  timeout:  25,
  engine: {
    type:  redis,
    shards: [{
      host: 'redis-server-1',
      port: 6397
    }, {
      host: 'redis-server-1',
      port: 6380
    }, {
      host: 'redis-server-2',
      port: 6379
    }]
    // more options
  }
});

bayeux.attach(server);
server.listen(8000);
```

The full list of settings is as follows.

* <b><tt>host</tt></b> - hostname of your Redis instance
* <b><tt>port</tt></b> - port number, default is `6379`
* <b><tt>password</tt></b> - password, if `requirepass` is set
* <b><tt>database</tt></b> - number of database to use, default is `0`
* <b><tt>shards</tt></b> - an array of shards to instead of a single redis instance. Each shard has the following options:
     host, port, password, database, shardName.
     See the Shards section for more info.
* <b><tt>namespace</tt></b> - prefix applied to all keys, default is `''`

### Shards

The shards option can take two forms:

```js
  // a flat array -- each member of the array will be a redis instance to connect to
  var shards = [
    {
      shardName: 'redis-1', // unique shard name used for consistent hashing -- if not supplied, will default to "host + ':' + port"
      host: 'redis-server-1.example.com', // required
      port: 6397, // required
      password: 'password', // optional
      database: 0, // optional
    },
    {
      shardName: 'redis-2',
      host: 'redis-server-2.example.com',
      port: 6398
    }
  ];

  // an array of arrays -- the first nested array will be treated as the "primary" shard cluster
  // all nested arrays after the first one will be treated as "secondary" clusters and will only receive publishes
  // this version is useful if you have Faye running in multiple datacenters and publishes must be pushed to both
  var shards = [
    [{ // primary shard
      host: 'datacenter1-redis.example.com',
      port: 6397
    },
    {
      host: 'datacenter1-redis.example.com',
      port: 6398
    }],
    [{ // secondary shard
      host: 'datacenter2-redis.example.com',
      port: 6397
    },
    {
      host: 'datacenter2-redis.example.com',
      port: 6398
    }],
    [{ // secondary shard
      host: 'datacenter3-redis.example.com',
      port: 6397
    },
    {
      host: 'datacenter3-redis.example.com',
      port: 6398
    }],
  ];
```

### Sharding

The default Shard Manager uses consistent hashing using MurmurHash3 to hash the key.
In most cases, the key lookup will be performed using a clientId when available instead of the actual redis key value.
This is done to be able to maintain a client list per redis server so that the client list does not become a hot spot on
one server.

## TODO

1. Add tests/benchmarks
2. Pull consistent hashing into its own package
3. Ability to specify server weights via the hosts field.
4. Ability to provide a custom shard manager so users can add their own implementations.
5. Ability to perform resharding of keys when hosts change

## Running Tests

```bash
$ make
$ npm test
```

## License

(The MIT License)

Copyright (c) 2011-2012 James Coglan

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the 'Software'), to deal in
the Software without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
