var DefaultHasher = require('./algorithms').MurmurHash3;

var defaultOptions = {
  vnodes:2000
};

function ConsistentHash(nodes, hasher, options) {
  nodes = nodes || [];
  options = options || {};
  this._hasher = hasher || new DefaultHasher();
  this._hashRing = [];
  this._nodeList = [];
  this._options = options || {};
  this._options.vnodes = this._options.vnodes || defaultOptions.vnodes;
  var vnodes = this._options.vnodes;
  var nodeList = constructNodes(nodes);
  for (var i = 0; i < nodeList.length; ++i) {
    var node = nodeList[i];
    this._nodeList.push(node.id);
    var factor = vnodes * node.weight;
    for (var v = 0; v < factor; ++v) {
      this._hashRing.push(this._createNode(node.id, i, v));
    }
  }

  this._sortRing();
}

ConsistentHash.prototype.getNodePosition = ConsistentHash.prototype.position = function (key) {
  var hash = this._hasher.getHash(key);
  var index = binarySearch(this._hashRing, new Node(hash, 0), Node.compare);
  if (index < 0) {
    index = ~index;
    return index >= this._hashRing.length ? 0 : index;
  }

  // if there is an exact match, find first node in nodeList that matches it
  for (var i = 0; i < this._hashRing.length; ++i) {
    --index;
    if (index < 0) {
      index = this._hashRing.length - 1;
    }
    if (this._hashRing[index].hash !== hash) {
      return index + 1;
    }
  }

  // all nodes are the same
  return 0;
};

ConsistentHash.prototype.getNode = ConsistentHash.prototype.get = function (key) {
  var position = this.getNodePosition(key);
  return this._nodeList[this._hashRing[position].nodeIndex];
};

ConsistentHash.prototype.replaceNode = ConsistentHash.prototype.replace = function replace(oldNode, newNode) {
  var nodeIndex = this._nodeList.indexOf(oldNode);
  if (nodeIndex < 0) return;
  this._nodeList[nodeIndex] = newNode;
};

ConsistentHash.prototype.addNode = ConsistentHash.prototype.add = function add(node) {
  var newNode = constructNode(node);
  var newNodeIndex = this._nodeList.length;
  this._nodeList.push(newNode.id);
  var factor = this._options.vnodes * node.weight;
  for (var v = 0; v < factor; ++v) {
    this._hashRing.push(this._createNode(node.id, newNodeIndex, v));
  }

  this._sortRing(); // TODO - insert in sorted order instead of resorting?
};

ConsistentHash.prototype.removeNode = ConsistentHash.prototype.remove = function remove(node) {
  var nodeIndex = this._nodeList.indexOf(node);
  if (nodeIndex < 0) return;

  for (var i = this._hashRing.length - 1; i >= 0; --i) {
    var currentNodeIndex = this._hashRing[i].nodeIndex;
    var diff = currentNodeIndex - nodeIndex;
    if (diff > 0) {
      this._hashRing[i].nodeIndex = currentNodeIndex - 1;
    } else if (diff === 0) {
      this._hashRing.splice(i, 1);
    }
  }

  this._nodeList.splice(nodeIndex, 1);
};

ConsistentHash.prototype._createNode = function (node, nodeIndex, vNode) {
  var hashData = node + '-' + vNode;
  var hash = this._hasher.getHash(hashData);
  return new Node(hash, nodeIndex);
};

ConsistentHash.prototype._sortRing = function () {
  var self = this;
  this._hashRing.sort(function (a, b) {
    var c = Node.compare(a, b);
    if (c !== 0) return c;

    var aName = self._nodeList[a.nodeIndex];
    var bName = self._nodeList[b.nodeIndex];

    if (aName === bName) {
      return 0;
    } else {
      return aName < bName ? -1 : 1;
    }
  });
};

module.exports = ConsistentHash;

function constructNodes(nodes) {
  if (Array.isArray(nodes)) {
    return constructNodesArray(nodes);
  }

  return constructNodesObject(nodes);
}

function constructNodesArray(nodes) {
  return nodes.map(constructNode);
}

function constructNodesObject(nodes) {
  return Object.keys(nodes).map(function (node) {
    var opts = nodes[node],
      weight = 1;
    if (typeof opts === 'number') {
      weight = opts;
    } else {
      weight = opts.weight || 1;
    }
    return { id:node, weight:weight };
  });
}

function constructNode(node) {
  if (typeof node === 'string') {
    return { id:node, weight:1 };
  } else {
    return constructNodesObject(node)[0];
  }
}

function Node(hash, nodeIndex) {
  this.hash = hash;
  this.nodeIndex = nodeIndex;
}

Node.compare = function (x, y) {
  if (x.hash < y.hash) return -1;
  if (x.hash > y.hash) return 1;
  return 0;
};

// does a binary search to find the element in the array
// if the return value is negative, the 2s complement (~return) is the index of the next highest element
function binarySearch(array, find, comparator) {
  var low = 0, high = array.length - 1, i, comparison;
  while (low <= high) {
    i = Math.floor((low + high) / 2);
    comparison = comparator(array[i], find);
    if (comparison < 0) {
      low = i + 1;
      continue;
    }
    if (comparison > 0) {
      high = i - 1;
      continue;
    }
    return i;
  }
  return ~low;
}