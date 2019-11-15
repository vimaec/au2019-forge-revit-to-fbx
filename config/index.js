const _ = require('underscore');
const defaultConfig = require('./default.json');
let devConfig;

// Looks if there is a credential file for 2-legged workflow
try {
  devConfig = require('./dev.default.json');
}
catch (e)
{
  if (e.code === 'MODULE_NOT_FOUND') {
      devConfig = {};
  }
  else {
    throw new Error('Error reading setup config file');
  }
}

module.exports = _.defaults(devConfig, defaultConfig);