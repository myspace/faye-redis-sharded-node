var engine = require('../index')

var REDIS_HOST = 'localhost',
    REDIS_PORT = 6379,
    NUM_SHARDS = 10;

JS.Test.describe("Redis Sharded engine", function() { with(this) {
  before(function() {
    var shards = [];
    for (var i = 1; i <= NUM_SHARDS; i++) {
      shards.push({
        shardName: 'redis' + i,
        host: REDIS_HOST,
        port: REDIS_PORT,
        database: i
      });
    }

    this.engineOpts = {
      type: engine,
      shards: shards
    };
  })

  after(function(resume) { with(this) {
    engine.disconnect()
    var redis = require('redis').createClient(REDIS_PORT, REDIS_HOST, { no_ready_check: true })

    var toClear = [];
    for (var i = 1; i <= NUM_SHARDS; i++) {
      toClear.push(i);
    }

    var clear = function(remaining) {
      var db = remaining.pop();
      redis.select(db, function() {
        redis.flushdb(function() {
          if (remaining.length > 0) {
            clear(remaining);
          }
          else {
            redis.end();
            resume();
          }
        });
      });
    };
    clear(toClear);
  }});

  itShouldBehaveLike("faye engine")

  describe("distribution", function() { with(this) {
    itShouldBehaveLike("distributed engine")
  }})
}})
