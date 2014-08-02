JS = require('jstest');
Faye = require('../vendor/faye/build/node/faye-node');

require('../vendor/faye/spec/javascript/engine_spec');
require('./faye_redis_sharded_spec')

JS.Test.autorun({ test: null})
