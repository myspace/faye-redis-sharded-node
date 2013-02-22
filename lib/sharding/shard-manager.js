var ConsistentHash = require('./consistent-hash');

function ShardManager(shardsList) {
  shardsList = shardsList || [];
  var shards = {};
  var ringNodes = [];
  shardsList.forEach(function (shard) {
    shards[shard.shardName] = shard.shard;
    ringNodes.push(shard.shardName);
  });

  this._shards = shards;
  this._hashRing = new ConsistentHash(ringNodes);
}

// gets the shard the corresponds to the key
ShardManager.prototype.getShard = function (key) {
  var shardName = this._hashRing.getNode(key);
  return this._shards[shardName] || null;
};

// calls the shardEnd function on all shards
ShardManager.prototype.end = function (shardEnd) {
  this.forEach(shardEnd);
  this._shards = {};
};

ShardManager.prototype.forEach = function (func) {
  var self = this;
  Object.keys(this._shards).forEach(function (shardName) {
    func(self._shards[shardName]);
  });
};

module.exports = ShardManager;