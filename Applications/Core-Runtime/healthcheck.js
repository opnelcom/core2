'use strict';
const http = require('http');

const {readConfig} = require('./config');
const port = readConfig().port;
const req = http.get({host: '127.0.0.1', port, path: '/health', timeout: 2000}, res => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.on('error', () => process.exit(1));
