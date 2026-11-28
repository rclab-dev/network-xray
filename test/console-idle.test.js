// console-idle.test.js — cml-xray --console on a router nobody has touched since it booted: its console log ends with boot
// notices, not a prompt. A log that has not changed for --quiet-wait is woken with ONE return; a log that is changing
// (someone on the line) is left alone; a log at a prompt is read as before. No CML, no ssh: the console is a stub.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var cml = require('../cml-xray.js');

function rig(logs) {
  var calls = [], i = 0;
  var Login = cml.Console.prototype.login, Cmd = cml.Console.prototype.cmd;
  cml.Console.prototype.login = function (lab, wakeMax) { calls.push(wakeMax); this.alive = true; this.host = 'r1'; return Promise.resolve(); };
  cml.Console.prototype.cmd = function () { return Promise.resolve('\nr1#'); };
  var col = new cml.Collector(function () { return { adj: {} }; }, 'L', { quietWait: 0.15, consoleLog: function () { return Promise.resolve(logs[Math.min(i++, logs.length - 1)]); } });
  return { col: col, calls: calls, restore: function () { cml.Console.prototype.login = Login; cml.Console.prototype.cmd = Cmd; } };
}
function read(r) { return r.col.readNodeConsole('r1').then(function () { return 'read'; }, function (e) { return e.busy ? 'busy' : 'error: ' + e.message; }); }
function later(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
var BOOT = 'Press RETURN to get started!\n\n*Nov 27 10:00:01.000: %SYS-5-RESTART: System restarted --\nRemediation: use a key of 2048 bits or more\n';

test('a log that ends with boot notices and does not change: busy at first, then one return after --quiet-wait', async function () {
  var r = rig([BOOT]);
  try {
    assert.strictEqual(await read(r), 'busy', 'first look: wait');
    assert.deepStrictEqual(r.calls, [], 'nothing sent yet');
    await later(200);
    assert.strictEqual(await read(r), 'read');
    assert.deepStrictEqual(r.calls, [1], 'woken with one return');
  } finally { r.restore(); }
});

test('a log that keeps changing (someone typing) is never woken', async function () {
  var r = rig([BOOT + 'r1#sh', BOOT + 'r1#show ip', BOOT + 'r1#show ip ro', BOOT + 'r1#show ip rou']);
  try {
    for (var k = 0; k < 4; k++) { assert.strictEqual(await read(r), 'busy'); await later(100); }
    assert.deepStrictEqual(r.calls, []);
  } finally { r.restore(); }
});

test('a log at the bare prompt is read at once, as before (not the one-return path)', async function () {
  var r = rig([BOOT + 'r1#']);
  try {
    assert.strictEqual(await read(r), 'read');
    assert.deepStrictEqual(r.calls, [0]);
  } finally { r.restore(); }
});
