var crypto = require('crypto');

function CryptoHash(algorithm){
  this.algorithm = algorithm || 'md5';
}

CryptoHash.prototype.getHash = function(key){
  return crypto.createHash(this.algorithm).update(key).digest('hex');
};

module.exports = CryptoHash;