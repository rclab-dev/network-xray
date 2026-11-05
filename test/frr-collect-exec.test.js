'use strict';
// frr-collect.js: the --exec path (argv built without a local shell), --proto auto, --from-dir file names, and the CLI.
// A fake `vtysh` / `ssh` on PATH answers from the bundled fixture, so no FRR is needed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const frr = require('../frr-collect.js');

const CLI = path.join(__dirname, '..', 'frr-collect.js');
const SAMPLE = path.join(__dirname, '..', 'fixtures', 'frr-collect-sample', 'r1');

// fake tools: log their argv, answer `vtysh -c '<show> json'` from SAMPLE (missing file -> exit 1)
function fakeBin(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-frr-exec-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'argv.log');
  const answer =
    "const fs=require('fs'),path=require('path');\n" +
    'function answer(show){show=show.replace(/ json$/,"");' +
    'try{process.stdout.write(fs.readFileSync(path.join(' + JSON.stringify(SAMPLE) + ',show.replace(/\\s+/g,"_")+".json")));}' +
    'catch(e){process.exit(1);}}\n';
  const vtysh = '#!' + process.execPath + '\n' + answer +
    'fs.appendFileSync(' + JSON.stringify(log) + ',JSON.stringify(["vtysh"].concat(process.argv.slice(2)))+"\\n");\n' +
    'if(process.argv[2]!=="-c"||process.argv.length!==4)process.exit(2);answer(process.argv[3]);\n';
  // ssh <host> "vtysh -c 'show … json'": one remote string, as a remote shell would receive it
  const ssh = '#!' + process.execPath + '\n' + answer +
    'fs.appendFileSync(' + JSON.stringify(log) + ',JSON.stringify(["ssh"].concat(process.argv.slice(2)))+"\\n");\n' +
    "const m=/^vtysh -c '([^']+)'$/.exec(process.argv[3]||'');if(process.argv.length!==4||!m)process.exit(2);answer(m[1]);\n";
  fs.writeFileSync(path.join(dir, 'vtysh'), vtysh, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'ssh'), ssh, { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = dir + path.delimiter + oldPath;
  t.after(() => { process.env.PATH = oldPath; });
  return { dir, calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] };
}

// the fake vtysh is a #!/bin/sh file: these run on Linux / macOS only (like test/xray-sh.test.js)
const POSIX_ONLY = process.platform === 'win32' ? 'POSIX only' : false;

test('execVtyshJson: local vtysh gets the show command as one argument', { skip: POSIX_ONLY }, (t) => {
  const fb = fakeBin(t);
  const j = frr.execVtyshJson('', 'show ip ospf neighbor');
  assert.ok(j && j.neighbors, 'parsed JSON from vtysh');
  assert.deepStrictEqual(fb.calls(), [['vtysh', '-c', 'show ip ospf neighbor json']]);
});

test('execVtyshJson: ssh prefix sends one remote command string', { skip: POSIX_ONLY }, (t) => {
  const fb = fakeBin(t);
  const j = frr.execVtyshJson('  ssh   myrtr ', 'show ip route');
  assert.ok(j && typeof j === 'object');
  assert.deepStrictEqual(fb.calls(), [['ssh', 'myrtr', "vtysh -c 'show ip route json'"]]);
});

test('execVtyshJson: unsafe show commands are refused before anything runs', (t) => {
  const fb = fakeBin(t);
  for (const bad of ["show ip route'; rm -rf /", 'show $(id)', 'show ip route | x', 'show\nip', '']) {
    assert.strictEqual(frr.execVtyshJson('', bad), null, JSON.stringify(bad));
  }
  assert.deepStrictEqual(fb.calls(), []);
});

test('execVtyshJson: command failure, missing binary and non-JSON output -> null', { skip: POSIX_ONLY }, (t) => {
  fakeBin(t);
  assert.strictEqual(frr.execVtyshJson('', 'show ip bgp summary'), null);        // fake vtysh exits 1
  assert.strictEqual(frr.execVtyshJson('nx-no-such-binary-xyz', 'show ip route'), null);
  assert.strictEqual(frr.execVtyshJson('echo', 'show ip route'), null);          // prints plain text
});

test('collectViaExec: end-to-end through the exec path matches --from-dir', { skip: POSIX_ONLY }, (t) => {
  fakeBin(t);
  const opts = { node: 'r1', proto: 'auto', adjacency: [{ iface: 'eth0', peer: 'r2' }] };
  const viaExec = frr.collectViaExec(Object.assign({ exec: '' }, opts));
  const viaDir = frr.collectFromDir(Object.assign({ fromDir: SAMPLE }, opts));
  assert.strictEqual(viaExec.proto, 'ospf');
  assert.strictEqual(viaExec.state.r2_has_full, true);
  assert.deepStrictEqual(viaExec.state, viaDir.state);
});

test('collectViaExec: unreachable router still yields a state (no throw)', () => {
  const r = frr.collectViaExec({ node: 'r1', exec: 'nx-no-such-binary-xyz', proto: 'ospf' });
  assert.strictEqual(r.proto, 'ospf');
  assert.strictEqual(r.state.target_node, 'r1');
  assert.strictEqual(r.state.full_count, 0);
  assert.strictEqual(r.state.ospf_lsdb, undefined);
});

test('resolveProto: explicit, auto -> ospf / bgp (wrapped or flat summary) / default', () => {
  const get = (m) => (cmd) => (m[cmd] === undefined ? null : m[cmd]);
  assert.strictEqual(frr.resolveProto(get({}), 'BGP'), 'bgp');
  assert.strictEqual(frr.resolveProto(get({}), undefined), 'ospf');
  assert.strictEqual(frr.resolveProto(get({ 'show ip ospf neighbor': { neighbors: { '2.2.2.2': [] } } }), 'auto'), 'ospf');
  assert.strictEqual(frr.resolveProto(get({ 'show ip ospf neighbor': { neighbors: {} },
    'show ip bgp summary': { ipv4Unicast: { peers: { '10.0.0.2': {} } } } }), 'auto'), 'bgp');
  assert.strictEqual(frr.resolveProto(get({ 'show ip bgp summary': { peers: { '10.0.0.2': {} } } }), 'AUTO'), 'bgp');
  assert.strictEqual(frr.resolveProto(get({ 'show ip bgp summary': { ipv4Unicast: { peers: {} } } }), 'auto'), 'ospf');
});

test('collectFromDir: bgp proto reads the bgp files and skips the OSPF LSDB', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-frr-bgp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(SAMPLE, 'show_ip_ospf_database.json'), path.join(dir, 'show_ip_ospf_database.json'));
  fs.writeFileSync(path.join(dir, 'bgp-summary.json'), JSON.stringify({ ipv4Unicast: { peers: { '10.1.0.20': { state: 'Established', remoteAs: 65002 } } } }));
  const r = frr.collectFromDir({ node: 'r1', fromDir: dir, proto: 'auto' });
  assert.strictEqual(r.proto, 'bgp');
  assert.strictEqual(r.state.ospf_lsdb, undefined);
});

test('readShowFromDir: canonical name, clab-style alias, broken JSON and missing files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-frr-dir-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'route.json'), '{"alias":true}');
  fs.writeFileSync(path.join(dir, 'show_interface.json'), '{not json');
  fs.writeFileSync(path.join(dir, 'interface.json'), '{"alias":"iface"}');
  assert.deepStrictEqual(frr.readShowFromDir(dir, 'show ip route'), { alias: true });
  assert.deepStrictEqual(frr.readShowFromDir(dir, 'show interface'), { alias: 'iface' });   // broken canonical -> alias
  assert.strictEqual(frr.readShowFromDir(dir, 'show ip bgp neighbors'), null);
  assert.strictEqual(frr.readShowFromDir(path.join(dir, 'nope'), 'show ip route'), null);
});

test('CLI: --from-dir to stdout and --out, --adj mapping, mgmt flags, usage', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-frr-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const r = spawnSync(process.execPath, [CLI, '--node', 'r1', '--from-dir', SAMPLE, '--adj', 'eth0:r2', '--exclude-mgmt'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const st = JSON.parse(r.stdout);
  assert.strictEqual(st.target_node, 'r1');
  assert.strictEqual(st.r2_iface, 'eth0');

  const out = path.join(dir, 'state.json');
  const w = spawnSync(process.execPath, [CLI, '--node', 'r1', '--id', 'lab', '--from-dir', SAMPLE, '--mgmt-subnet', '192.0.2.0/24', '--out', out], { encoding: 'utf8' });
  assert.strictEqual(w.status, 0, w.stderr);
  assert.match(w.stdout, /wrote /);
  assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).target_node, 'r1');

  // --exec with no value = local vtysh; here the binary is missing, so a down-node state comes back
  const env = Object.assign({}, process.env, { PATH: dir });
  const e = spawnSync(process.execPath, [CLI, '--node', 'r1', '--exec', '--proto', 'ospf', '--out', out], { encoding: 'utf8', env: env });
  assert.strictEqual(e.status, 0, e.stderr);
  assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).full_count, 0);
  const e2 = spawnSync(process.execPath, [CLI, '--node', 'r1', '--exec', 'nx-no-such-binary-xyz'], { encoding: 'utf8', env: env });
  assert.strictEqual(e2.status, 0, e2.stderr);
  assert.strictEqual(JSON.parse(e2.stdout).target_node, 'r1');

  const u = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.strictEqual(u.status, 0);
  assert.match(u.stdout, /usage:/);
});
