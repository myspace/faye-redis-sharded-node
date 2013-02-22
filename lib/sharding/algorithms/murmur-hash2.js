/**
 * JS Implementation of MurmurHash2
 *
 * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
 * @see http://github.com/garycourt/murmurhash-js
 * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
 * @see http://sites.google.com/site/murmurhash/
 *
 */

function MurmurHash2(seed){
	this.seed = seed || 0xc58f1a7b;
}

MurmurHash2.prototype.getHash = function(key){
	var l = key.length,
	    h = this.seed ^ l,
	    i = 0,
	    k;

	  while (l >= 4) {
	  	k =
	  	  ((key.charCodeAt(i) & 0xff)) |
	  	  ((key.charCodeAt(++i) & 0xff) << 8) |
	  	  ((key.charCodeAt(++i) & 0xff) << 16) |
	  	  ((key.charCodeAt(++i) & 0xff) << 24);

	    k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));
	    k ^= k >>> 24;
	    k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));

		h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16)) ^ k;

	    l -= 4;
	    ++i;
	  }

	  switch (l) {
	  case 3: h ^= (key.charCodeAt(i + 2) & 0xff) << 16;
	  case 2: h ^= (key.charCodeAt(i + 1) & 0xff) << 8;
	  case 1: h ^= (key.charCodeAt(i) & 0xff);
	          h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
	  }

	  h ^= h >>> 13;
	  h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
	  h ^= h >>> 15;

	  return h >>> 0;
};

module.exports = MurmurHash2;