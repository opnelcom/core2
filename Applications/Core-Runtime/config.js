'use strict';
const fs = require('node:fs');
const configFile = '/app/content/config/config.json';
function readConfig(file = configFile) {
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error('Unable to read Runtime configuration ' + file + ': ' + error.message); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Runtime configuration must be an object');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error('Runtime port must be an integer from 1 to 65535');
  if (config.maxBodyBytes !== undefined && (!Number.isInteger(config.maxBodyBytes) || config.maxBodyBytes <= 0))
    throw new Error('Runtime maxBodyBytes must be a positive integer');
  return config;
}
module.exports = {readConfig};
