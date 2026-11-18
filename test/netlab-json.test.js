'use strict';
/* netlab's own verdict (network_xray/validate.json, written by netlab's network_xray tool plugin from
   `netlab validate --format json`): netlab-validate.js readNetlabJson / fromNetlabJson, and the collector's band from it.
   The JSON shape is the plugin's file (netlab_validate / collected_at / exit_status) around netlab's output (version 1). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');
const nv = require('../netlab-validate.js');

const NOW = Date.parse('2026-11-14T08:00:30Z');
function netlabDoc(results, extra) {
  return Object.assign({ version: 1, netlab_version: '26.10', started: '2026-11-14T08:00:20Z', exit_code: 0, aborted: false,
    summary: {}, results: results }, extra || {});
}
function writeLab(dir, body) {
  fs.mkdirSync(path.join(dir, 'network_xray'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'network_xray', 'validate.json'), typeof body === 'string' ? body : JSON.stringify(body));
}
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'nx-nlj-')); }
const ADJ = { adj: { description: 'r1 sees r2 as an OSPF neighbor', level: null, result: 'pass', message: 'Test succeeded in 7.0 seconds',
  nodes: { r1: { device: 'frr', result: 'pass', message: 'OSPFv2 neighbor 10.0.0.2 is in state Full/-' } } } };

test('the plugin file (wrapped) is read; collected_at with +0000 is understood', function () {
  const d = tmp();
  writeLab(d, { netlab_validate: netlabDoc(ADJ), collected_at: '2026-11-14T08:00:25+0000', exit_status: 0 });
  const nj = nv.readNetlabJson(d, NOW);
  assert.ok(nj, 'read');
  assert.strictEqual(nj.at, Date.parse('2026-11-14T08:00:25Z'));
  assert.ok(nj.doc.results.adj);
});

test('the bare `netlab validate --format json` output is read too (file time as its age)', function () {
  const d = tmp();
  writeLab(d, netlabDoc(ADJ));
  assert.ok(nv.readNetlabJson(d), 'read with the file time');
});

test('no file, half a file, another version or no results -> null (the band falls back)', function () {
  const d = tmp();
  assert.strictEqual(nv.readNetlabJson(d, NOW), null, 'no file');
  writeLab(d, '{"netlab_validate": {"version": 1, "resu');
  assert.strictEqual(nv.readNetlabJson(d, NOW), null, 'half written');
  writeLab(d, { netlab_validate: netlabDoc(ADJ, { version: 2 }), collected_at: '2026-11-14T08:00:25+0000' });
  assert.strictEqual(nv.readNetlabJson(d, NOW), null, 'version 2');
  writeLab(d, { netlab_validate: { version: 1, results: [] }, collected_at: '2026-11-14T08:00:25+0000' });
  assert.strictEqual(nv.readNetlabJson(d, NOW), null, 'results not an object');
});

test('an old file is still read (the page shows its age and dims it; it is not taken away)', function () {
  const d = tmp();
  writeLab(d, { netlab_validate: netlabDoc(ADJ), collected_at: '2026-11-14T07:58:00+0000' });
  const nj = nv.readNetlabJson(d, NOW);
  assert.ok(nj, 'read');
  assert.strictEqual(nv.fromNetlabJson(nj, 'lab1', null).netlab_at, '2026-11-14T07:58:00.000Z');
});

test('netlab results become the band rows: netlab\'s statuses (error stays error, skipped stays skipped), counts, the failing node\'s message', function () {
  const nj = { doc: netlabDoc({
    s1: { description: 'EBGP session with x1', result: 'pass', message: 'ok',
      nodes: { rtr: { device: 'frr', result: 'pass', message: 'The neighbor 10.1.0.2 (x1) is in state Established' } } },
    p1: { description: 'Prefix 192.168.42.0/24', result: 'fail', message: 'Test failed',
      nodes: { rtr: { device: 'eos', result: 'fail', message: 'The prefix 192.168.42.0/24 is not in the BGP table' } } },
    w1: { description: 'Optional check', level: 'warning', result: 'warning', message: 'w', nodes: {} },
    k1: { description: 'Not for this device', result: 'skipped', message: 'Test not available for device type eos', nodes: {} },
    e1: { description: 'Broken', result: 'error', message: 'Plugin error', nodes: { rtr: { device: 'frr', result: 'error', message: 'x' } } },
  }) };
  const r = nv.fromNetlabJson(nj, 'lab1', null);
  assert.strictEqual(r.source, 'netlab');
  assert.strictEqual(r.lab, 'lab1');
  assert.deepStrictEqual(r.tests.map(function (t) { return t.name + '=' + t.status; }), ['s1=pass', 'p1=fail', 'w1=warning', 'k1=skip', 'e1=error']);
  assert.strictEqual(r.tests[1].message, 'rtr: The prefix 192.168.42.0/24 is not in the BGP table');
  assert.strictEqual(r.tests[3].message, 'Test not available for device type eos');
  assert.strictEqual(r.tests[4].message, 'rtr: x');
  assert.deepStrictEqual(r.counts, { total: 4, pass: 1, fail: 1, warning: 1, error: 1, pending: 0, settling: 0, unsupported: 0, skip: 1, checked: 4 });
  assert.strictEqual(r.converging, false);
  assert.strictEqual(r.tests[0].marks.length, 0, 'no marks without the test definitions');
});

test('with network-xray.json too: graph marks and the lab\'s pass / fail text come from the test definitions', function () {
  const lab = { name: 'lab1', topo: {}, nodes: { rtr: { bgp: { neighbors: [{ name: 'x1', ipv4: '10.1.0.2', type: 'ebgp' }] } }, x1: {} },
    tests: [{ name: 's1', plugin: 'bgp_neighbor(node.bgp.neighbors,"x1")', pass: 'The session is up', fail: 'Check the neighbor' },
            { name: 'p1', plugin: 'bgp_prefix("192.168.42.0/24")', fail: 'Advertise the prefix' }] };
  const nj = { doc: netlabDoc({
    s1: { description: 'EBGP session', result: 'pass', message: 'ok', nodes: { rtr: { device: 'frr', result: 'pass', message: 'up' } } },
    p1: { description: 'Prefix', result: 'fail', message: 'no', nodes: { rtr: { device: 'frr', result: 'fail', message: 'not there' } } } }) };
  const r = nv.fromNetlabJson(nj, 'lab1', lab);
  assert.deepStrictEqual(r.tests[0].marks, [{ node: 'rtr', ok: true, link: ['rtr', 'x1'] }]);
  assert.deepStrictEqual(r.tests[1].marks, [{ node: 'rtr', ok: false, prefix: '192.168.42.0/24' }]);
  assert.strictEqual(r.tests[0].text, 'The session is up');
  assert.strictEqual(r.tests[1].text, 'Advertise the prefix');
});

/* the collector: a lab folder with network_xray/validate.json and no --validate -> window.XRAY_VALIDATE from netlab */
const SKIP = process.platform === 'win32' ? 'POSIX shell needed (fake docker)' : false;
test('collector: netlab\'s file alone gives the band (no network-xray.json, no --validate)', { skip: SKIP }, function () {
  const dir = tmp(), out = path.join(dir, 'out'), bin = path.join(dir, 'bin');
  fs.mkdirSync(out); fs.mkdirSync(bin);
  const STUB = "var a=process.argv,fs=require('fs'),g=function(k){var i=a.indexOf(k);return i>=0?a[i+1]:null;};" +
    "fs.writeFileSync(g('--out'),JSON.stringify({success:true,target_node:g('--node'),protocol:'ospf',interfaces:{},iface_hellos:{}}));";
  ['clab-collect.js', 'clab-srl-collect.js'].forEach(function (f) { fs.writeFileSync(path.join(out, f), STUB); });
  fs.writeFileSync(path.join(bin, 'docker.js'), "if(process.argv[2]==='ps')process.stdout.write('');");
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(bin, 'docker.js') + '" "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'clab.yml'), 'name: nl\ntopology:\n  nodes:\n    r1:\n      kind: linux\n    r2:\n      kind: linux\n  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n');
  writeLab(dir, { netlab_validate: netlabDoc(ADJ), collected_at: new Date().toISOString().replace(/\.\d+Z$/, '+0000'), exit_status: 0 });
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'clab-xray-collect.js'), path.join(dir, 'clab.yml'), out, 'ospf'],
    { cwd: dir, encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, TMPDIR: dir }) });
  assert.strictEqual(r.status, 0, r.stderr);
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), ctx);
  const v = JSON.parse(JSON.stringify(ctx.window.XRAY_VALIDATE || null));   /* out of the vm realm, so deepStrictEqual compares plain arrays */
  assert.ok(v, 'XRAY_VALIDATE written');
  assert.strictEqual(v.source, 'netlab');
  assert.deepStrictEqual(v.tests.map(function (t) { return t.name + '=' + t.status; }), ['adj=pass']);
  assert.match(r.stdout, /validate: 1\/1 passed/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('collector: no netlab file and no --validate -> no band, as before', { skip: SKIP }, function () {
  const dir = tmp(), out = path.join(dir, 'out'), bin = path.join(dir, 'bin');
  fs.mkdirSync(out); fs.mkdirSync(bin);
  const STUB = "var a=process.argv,fs=require('fs'),g=function(k){var i=a.indexOf(k);return i>=0?a[i+1]:null;};" +
    "fs.writeFileSync(g('--out'),JSON.stringify({success:true,target_node:g('--node'),protocol:'ospf',interfaces:{},iface_hellos:{}}));";
  ['clab-collect.js', 'clab-srl-collect.js'].forEach(function (f) { fs.writeFileSync(path.join(out, f), STUB); });
  fs.writeFileSync(path.join(bin, 'docker.js'), "if(process.argv[2]==='ps')process.stdout.write('');");
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(bin, 'docker.js') + '" "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'clab.yml'), 'name: nl\ntopology:\n  nodes:\n    r1:\n      kind: linux\n  links: []\n');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'clab-xray-collect.js'), path.join(dir, 'clab.yml'), out, 'ospf'],
    { cwd: dir, encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, TMPDIR: dir }) });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), /XRAY_VALIDATE/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the plugin\'s interval (validate_interval, seconds) is passed on: the page dims only past two runs of it, else past a minute', function () {
  const d = tmp();
  writeLab(d, { netlab_validate: netlabDoc(ADJ), collected_at: '2026-11-14T07:58:00+0000', exit_status: 0, interval: 300 });
  assert.strictEqual(nv.fromNetlabJson(nv.readNetlabJson(d, NOW), 'lab1', null).netlab_interval_s, 300);
  [{}, { interval: 0 }, { interval: 'x' }, { interval: -5 }].forEach(function (extra) {
    writeLab(d, Object.assign({ netlab_validate: netlabDoc(ADJ), collected_at: '2026-11-14T07:58:00+0000' }, extra));
    assert.strictEqual(nv.fromNetlabJson(nv.readNetlabJson(d, NOW), 'lab1', null).netlab_interval_s, null, JSON.stringify(extra));
  });
  const page = fs.readFileSync(path.join(__dirname, '..', 'xray-graph-nextui.html'), 'utf8');
  assert.match(page, /Math\.max\(60000, 2000 \* \(Number\(v\.netlab_interval_s\) \|\| 0\)\)/, 'the page uses max(1 min, 2 x interval)');
});

test('the band says how often netlab\'s loop runs next to the age (en / ja), and nothing when the file has no interval', function () {
  const page = fs.readFileSync(path.join(__dirname, '..', 'xray-graph-nextui.html'), 'utf8');
  const m = page.match(/var ivS = [\s\S]*?ageTxt \+= ivTxt;/);
  assert.ok(m, 'the interval text is in the page');
  const run = (ja, age, iv) => { const c = { ja: ja, ageTxt: age, v: { netlab_interval_s: iv } }; vm.runInNewContext(m[0], c); return c.ageTxt; };
  assert.strictEqual(run(false, '3 min ago', 30), '3 min ago (runs every 30 s)');
  assert.strictEqual(run(true, '3 分前', 30), '3 分前 (30 秒ごとに実行)');
  assert.strictEqual(run(false, 'just now', 300), 'just now (runs every 5 min)');
  assert.strictEqual(run(true, 'たった今', 300), 'たった今 (5 分ごとに実行)');
  assert.strictEqual(run(false, '2 min ago', 90), '2 min ago (runs every 90 s)');
  assert.strictEqual(run(false, '2 min ago', null), '2 min ago');
  assert.strictEqual(run(false, '', 30), '');
});
