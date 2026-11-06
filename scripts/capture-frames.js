#!/usr/bin/env node
// capture-frames.js — record replay frames from a running containerlab lab (Node built-ins only)
//
//   node scripts/capture-frames.js <topo.clab.yml> <steps.json> <out-dir> [options]
//
// For each step in <steps.json>, in order:
//   1. run the step's command on its node (docker exec clab-<lab>-<node> sh -c '<run>'), or nothing for "none"
//   2. read the lab with the collector (clab-xray-collect.js, one round) every --interval seconds until the
//      state has been the same --settle reads in a row (or --timeout passes)
//   3. write <out-dir>/frame<N>.json (the window.LIVE_STATES object the replay pages use)
// At the end <out-dir>/captions.json lists each frame with its step name.
//
// The only commands that change the lab are the ones in the steps file. To read the state, the collector also runs
// its own read-only commands on every node (FRR: vtysh show ...; Cisco IOS: an SSH login, terminal settings and
// show ...). Everything is checked (steps, nodes, out-dir) before the first command runs. The collector writes into
// a private temporary folder that is removed afterwards; nothing else is written. A step that does not settle in
// time (--timeout, collector reads included) is saved as the last read, marked "settled": false, and the next step
// still runs; the exit code is 1 at the end. If the lab cannot be read at all, no further step is run (exit 1).
//
// steps.json:
//   { "proto": "bgp",
//     "steps": [ { "name": "steady", "run": "none" },
//                { "name": "r1 eth1 down", "node": "r1", "run": "ip link set eth1 down", "wait": 3 } ] }
//   wait = seconds to wait after the command before the first read (default: --min-wait)
//   settle = this step's --settle (e.g. 1 = keep the first read: a state that lasts only a few seconds, such as an
//            OSPF adjacency that is coming back; the caption should then say "the first read", not a settled state)
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var parseYaml = require('./check-example-topologies.js').parseYaml;

var ROOT = path.resolve(__dirname, '..');
var ME = 'capture-frames.js';
var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
var PROTOS = ['ospf', 'bgp', 'static'];
var COLLECTOR_SCRIPTS = ['clab-collect.js', 'clab-srl-collect.js', 'clab-iosxe-collect.js'];
var IGNORE_KEYS = ['nx_stale_since'];   // changes on every read while a router is stale; not part of the state

var USAGE = 'usage: node scripts/capture-frames.js <topo.clab.yml> <steps.json> <out-dir> [options]\n' +
  '  record one replay frame (frameN.json) per step from a running lab, plus captions.json\n' +
  '  --proto <p>         ospf | bgp | static (default: "proto" in the steps file, else ospf)\n' +
  '  --interval <secs>   seconds between reads while waiting for the state to settle (default: 2)\n' +
  '  --settle <n>        the same state this many reads in a row = settled (default: 3)\n' +
  '  --timeout <secs>    longest wait for one step to settle, collector reads included (default: 90);\n' +
  '                      a step that does not settle is saved as its last read, the next step still runs,\n' +
  '                      and the exit code is 1 at the end\n' +
  '  --min-wait <secs>   wait after a step\'s command before the first read (default: 3; a step\'s "wait" wins)\n' +
  '  --collector <cmd>   collector command, run as <cmd> <topo> <dir> <proto> --exclude-mgmt\n' +
  '                      (default: node clab-xray-collect.js)\n' +
  '  --force             replace frame*.json / captions.json already in <out-dir>\n' +
  '  --dry-run           check everything and print the commands, run nothing\n' +
  '  -h, --help          show this help';
var HINT = "Try 'node scripts/" + ME + " --help'.";

function die(msg, code) { process.stderr.write(ME + ': ' + msg + '\n'); process.exit(code == null ? 2 : code); }
function log(msg) { process.stderr.write(msg + '\n'); }

function parseArgs(argv) {
  var o = { pos: [], proto: '', interval: 2, settle: 3, timeout: 90, minWait: 3, collector: '', force: false, dryRun: false };
  var VALUED = ['--proto', '--interval', '--settle', '--timeout', '--min-wait', '--collector'];
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '-h' || argv[i] === '--help') return { help: true };
    if (VALUED.indexOf(argv[i]) >= 0) i++;
  }
  function num(flag, v, min) {
    var n = Number(v);
    if (v == null || v === '' || !isFinite(n) || n < min) die(flag + ' needs a number >= ' + min + '\n' + HINT);
    return n;
  }
  for (i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--proto') o.proto = argv[++i] || '';
    else if (a === '--interval') o.interval = num(a, argv[++i], 0.1);
    else if (a === '--settle') o.settle = Math.floor(num(a, argv[++i], 2));
    else if (a === '--timeout') o.timeout = num(a, argv[++i], 1);
    else if (a === '--min-wait') o.minWait = num(a, argv[++i], 0);
    else if (a === '--collector') { o.collector = argv[++i] || ''; if (!o.collector) die('--collector needs a command\n' + HINT); }
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a.charAt(0) === '-' && a.length > 1) die('unknown option: ' + a + '\n' + HINT);
    else o.pos.push(a);
  }
  return o;
}

// the lab name and node names from the topology; the container of node n is clab-<lab>-<n>
function readTopology(file) {
  var y;
  try { y = parseYaml(fs.readFileSync(file, 'utf8')); } catch (e) { die('cannot read topology ' + file + ': ' + e.message); }
  if (!y || typeof y.name !== 'string' || !SAFE_NAME.test(y.name)) die('topology ' + file + ': no usable lab name (name:)');
  if (y.prefix != null && y.prefix !== 'clab') die('topology ' + file + ': only the default container names (clab-<lab>-<node>) are supported, not prefix: ' + JSON.stringify(y.prefix));
  var nodes = y.topology && y.topology.nodes && typeof y.topology.nodes === 'object' ? Object.keys(y.topology.nodes) : [];
  if (!nodes.length) die('topology ' + file + ': no nodes under topology.nodes');
  return { lab: y.name, nodes: nodes };
}

function readSteps(file, nodes) {
  var j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die('cannot read steps file ' + file + ': ' + e.message); }
  var steps = Array.isArray(j) ? j : (j && j.steps);
  if (!Array.isArray(steps) || !steps.length) die('steps file ' + file + ': needs a non-empty "steps" list');
  var seen = {};
  steps.forEach(function (s, i) {
    var where = 'steps file ' + file + ', step ' + (i + 1) + ': ';
    if (!s || typeof s !== 'object') die(where + 'must be an object');
    Object.keys(s).forEach(function (k) { if (['name', 'node', 'run', 'wait', 'settle'].indexOf(k) < 0) die(where + 'unknown key "' + k + '"'); });
    if (typeof s.name !== 'string' || !s.name.trim()) die(where + 'needs a "name"');
    if (seen[s.name]) die(where + 'the name "' + s.name + '" is used twice');
    seen[s.name] = true;
    if (typeof s.run !== 'string' || !s.run.trim()) die(where + '"run" must be a command or "none"');
    if (s.wait != null && !(typeof s.wait === 'number' && s.wait >= 0)) die(where + '"wait" must be a number of seconds');
    if (s.settle != null && !(Number.isInteger(s.settle) && s.settle >= 1)) die(where + '"settle" must be a whole number (1 or more)');
    if (s.run === 'none') { if (s.node != null) die(where + '"node" is given but "run" is "none"'); return; }
    if (typeof s.node !== 'string' || !s.node) die(where + 'a command needs a "node"');
    if (nodes.indexOf(s.node) < 0) die(where + 'node "' + s.node + '" is not in the topology (' + nodes.join(', ') + ')');
    if (!SAFE_NAME.test(s.node)) die(where + 'node name "' + s.node + '" is not a plain name');
  });
  return { proto: j && !Array.isArray(j) ? j.proto : undefined, steps: steps };
}

// window.LIVE_STATES = {...};  -> the object (null when the file holds no such line)
function parseStates(text) {
  var line = String(text).split('\n').filter(function (l) { return l.indexOf('window.LIVE_STATES = ') === 0; })[0];
  if (!line) return null;
  var v = JSON.parse(line.slice('window.LIVE_STATES = '.length).replace(/;\s*$/, ''));
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

// a stable text for comparing two reads: keys sorted, IGNORE_KEYS dropped
function stateKey(v) {
  return JSON.stringify(v, function (k, x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      var o = {};
      Object.keys(x).sort().forEach(function (kk) { if (IGNORE_KEYS.indexOf(kk) < 0) o[kk] = x[kk]; });
      return o;
    }
    return x;
  });
}
// a read where a router did not answer in time is not a settled picture of the lab
function hasTimeout(v) { return Object.keys(v).some(function (n) { return v[n] && v[n].nx_unread === 'timeout'; }); }

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function run(cmd, args, opts) {
  return new Promise(function (resolve) {
    cp.execFile(cmd, args, Object.assign({ maxBuffer: 64 * 1024 * 1024 }, opts), function (err, stdout, stderr) {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, err: err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

// the collector writes <work>/xray-states.js and looks for the per-node collectors next to it: <work> holds links
// to the repository's copies. TMPDIR=<work>/tmp keeps its per-node files away from a collector already running.
function makeWorkDir() {
  var work = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-capture-'));
  fs.mkdirSync(path.join(work, 'tmp'));
  COLLECTOR_SCRIPTS.forEach(function (f) {
    var src = path.join(ROOT, f);
    if (!fs.existsSync(src)) return;
    // a link where the system allows it; Windows without developer mode refuses symlinks (EPERM): copy instead
    try { fs.symlinkSync(src, path.join(work, f)); } catch (e) { fs.copyFileSync(src, path.join(work, f)); }
  });
  return work;
}

function collectorCommand(o, topo, work, proto) {
  var args = [topo, work, proto, '--exclude-mgmt'];
  return o.collector ? { cmd: o.collector, args: args } : { cmd: process.execPath, args: [path.join(ROOT, 'clab-xray-collect.js')].concat(args) };
}

async function readLab(o, topo, work, proto, deadline) {
  var c = collectorCommand(o, topo, work, proto), dest = path.join(work, 'xray-states.js');
  try { fs.unlinkSync(dest); } catch (e) { /* not there yet */ }
  var env = Object.assign({}, process.env, { TMPDIR: path.join(work, 'tmp') });
  // one collector round may take up to 120 s, but never past the step's --timeout
  var left = deadline ? Math.max(1000, Math.min(120000, deadline - Date.now())) : 120000;
  var r = await run(c.cmd, c.args, { env: env, timeout: left, killSignal: 'SIGKILL' });
  if (r.err && r.err.killed) return { error: 'collector gave no answer within ' + Math.round(left / 1000) + 's' };
  if (r.code !== 0) return { error: 'collector exited ' + r.code + (r.stderr.trim() ? ': ' + r.stderr.trim().split('\n').pop() : '') };
  try {
    var v = parseStates(fs.readFileSync(dest, 'utf8'));
    return v ? { states: v } : { error: 'collector output has no window.LIVE_STATES' };
  } catch (e) { return { error: 'cannot read collector output: ' + e.message }; }
}

// read until the same state comes back o.settle times in a row; {states, settled, reads} or {error}
async function waitSettled(o, topo, work, proto, settle) {
  var t0 = Date.now(), last = null, lastKey = '', same = 0, reads = 0, lastErr = '';
  for (;;) {
    var r = await readLab(o, topo, work, proto, t0 + o.timeout * 1000);
    reads++;
    if (r.error) { lastErr = r.error; same = 0; }
    else {
      var k = stateKey(r.states);
      if (last && k === lastKey && !hasTimeout(r.states)) same++; else same = hasTimeout(r.states) ? 0 : 1;
      last = r.states; lastKey = k;
      if (same >= (settle || o.settle)) return { states: last, settled: true, reads: reads };
    }
    if (Date.now() - t0 + o.interval * 1000 > o.timeout * 1000) {
      return last ? { states: last, settled: false, reads: reads } : { error: lastErr || 'no read' };
    }
    await sleep(o.interval * 1000);
  }
}

function shq(s) { return /^[A-Za-z0-9_.\/:=@%+-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'"; }

async function main() {
  var o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(USAGE); process.exit(0); }   // release-check: ok (the --help text)
  if (o.pos.length !== 3) die('needs <topo.clab.yml> <steps.json> <out-dir>\n' + HINT);
  var topo = path.resolve(o.pos[0]), outDir = path.resolve(o.pos[2]);
  var t = readTopology(topo), s = readSteps(o.pos[1], t.nodes);
  var proto = o.proto || s.proto || 'ospf';
  if (PROTOS.indexOf(proto) < 0) die('proto must be one of ' + PROTOS.join(' | ') + ', not ' + JSON.stringify(proto));

  var outFiles = s.steps.map(function (_, i) { return path.join(outDir, 'frame' + (i + 1) + '.json'); });
  var capFile = path.join(outDir, 'captions.json');
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) die('out-dir is not a directory: ' + outDir);
  if (!o.force) {
    var there = outFiles.concat(capFile).filter(function (f) { return fs.existsSync(f); });
    if (there.length) die('already in out-dir (use --force to replace): ' + there.map(function (f) { return path.basename(f); }).join(', '));
  }

  var execs = s.steps.map(function (st) { return st.run === 'none' ? null : ['exec', 'clab-' + t.lab + '-' + st.node, 'sh', '-c', st.run]; });
  log('lab=' + t.lab + ' proto=' + proto + ' steps=' + s.steps.length + ' out=' + outDir);
  if (o.dryRun) {
    s.steps.forEach(function (st, i) {
      log('  frame' + (i + 1) + ' "' + st.name + '": ' + (execs[i] ? 'docker ' + execs[i].map(shq).join(' ') : '(no command)'));
    });
    var c = collectorCommand(o, topo, '<tmp>', proto);
    log('  read after each step: ' + [c.cmd].concat(c.args).map(shq).join(' '));
    return 0;
  }

  fs.mkdirSync(outDir, { recursive: true });
  var work = makeWorkDir(), captions = [], unsettled = 0, code = 0;
  try {
    for (var i = 0; i < s.steps.length; i++) {
      var st = s.steps[i], name = 'frame' + (i + 1) + '.json';
      if (execs[i]) {
        log('[' + (i + 1) + '/' + s.steps.length + '] ' + st.name + ': ' + st.node + '$ ' + st.run);
        var r = await run('docker', execs[i], { timeout: 120000 });
        if (r.code !== 0) {
          log('!! the command failed on ' + st.node + ' (exit ' + r.code + ')' + (r.stderr.trim() ? ': ' + r.stderr.trim() : '') + ' - stopping, no further step is run');
          code = 1; break;
        }
        var wait = st.wait != null ? st.wait : o.minWait;
        if (wait > 0) await sleep(wait * 1000);
      } else log('[' + (i + 1) + '/' + s.steps.length + '] ' + st.name + ' (no command)');
      var w = await waitSettled(o, topo, work, proto, st.settle);
      if (w.error) { log('!! cannot read the lab: ' + w.error + ' - stopping, no further step is run'); code = 1; break; }
      fs.writeFileSync(outFiles[i], JSON.stringify(w.states) + '\n');
      captions.push({ frame: name, name: st.name, settled: w.settled });
      if (!w.settled) unsettled++;
      log('   ' + name + (w.settled ? ' settled' : ' NOT settled within ' + o.timeout + 's (saved the last read; going on with the next step, exit 1 at the end)') + ' after ' + w.reads + ' read(s)');
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  if (captions.length) fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + '\n');
  log('wrote ' + captions.length + ' frame(s)' + (captions.length ? ' + captions.json' : '') + ' to ' + outDir);
  if (unsettled) { log('!! ' + unsettled + ' frame(s) did not settle'); code = 1; }
  return code;
}

module.exports = { parseStates: parseStates, stateKey: stateKey };

if (require.main === module) {
  main().then(function (c) { process.exit(c); }, function (e) { die(e && e.stack || String(e), 1); });
}
