#!/usr/bin/env node
// Container health check: does the graph server answer on its port?
// The port is the --port argument of the entrypoint (PID 1 is tini -- network-xray ...), else 8600.
'use strict';
const fs = require('fs');
const http = require('http');

const DEFAULT_PORT = 8600;

// The port from a NUL-separated command line. The entrypoint keeps the last --port it is given.
function portFromCmdline(cmdline) {
  const args = String(cmdline || '').split('\0');
  const i = args.lastIndexOf('--port');
  const v = i >= 0 ? (args[i + 1] || '') : '';
  return /^[0-9]{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? Number(v) : DEFAULT_PORT;
}

// Resolves true when http://<host>:<port>/ answers with 2xx or 3xx within timeoutMs, else false.
function check(port, opts) {
  const o = opts || {};
  const timeoutMs = o.timeoutMs || 4000;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; clearTimeout(timer); req.destroy(); resolve(ok); } };
    const req = http.get({ host: o.host || '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      finish(res.statusCode >= 200 && res.statusCode < 400);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
    req.on('timeout', () => finish(false));
    req.on('error', () => finish(false));
  });
}

if (require.main === module) {
  let cmdline = '';
  try { cmdline = fs.readFileSync('/proc/1/cmdline', 'utf8'); } catch (e) { /* keep the default */ }
  check(portFromCmdline(cmdline)).then((ok) => process.exit(ok ? 0 : 1));
}

module.exports = { portFromCmdline, check, DEFAULT_PORT };
