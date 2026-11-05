#!/usr/bin/env node
// Container health check: does the graph server answer on its port?
// The port is the --port argument of the entrypoint (PID 1 is tini -- network-xray ...), else 8600.
'use strict';
const fs = require('fs');
const http = require('http');

let port = 8600;
try {
  const args = fs.readFileSync('/proc/1/cmdline', 'utf8').split('\0');
  const i = args.indexOf('--port');
  if (i >= 0 && /^[0-9]{1,5}$/.test(args[i + 1] || '')) port = Number(args[i + 1]);
} catch (e) { /* keep the default */ }

const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 4000 }, (res) => {
  res.resume();
  process.exit(res.statusCode < 500 ? 0 : 1);
});
req.on('timeout', () => { req.destroy(); process.exit(1); });
req.on('error', () => process.exit(1));
