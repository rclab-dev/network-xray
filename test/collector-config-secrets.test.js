'use strict';
/* The FRR collector reads `show running-config` to learn a few facts (static routes, router ospf / ospf6, router bgp + AS,
   whether a neighbor exists). Only those parsed facts may leave the collector: no configuration line, password, key or
   community may reach the state file or xray-states.js. A fake vtysh (on PATH, reached through XRAY_VTY_SOCK_DIR) answers
   with a configuration full of secrets; the real collectors run against it end to end. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = [];
process.on('exit', () => DIRS.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

const SECRETS = [
  'ZebraPwCanary1', 'EnablePwCanary2', 'KeyStringCanary3', 'OspfAuthCanary4', 'Md5KeyCanary5',
  'BgpPwCanary6', 'SnmpCommunityCanary7', '65001:31337', 'RM-CANARY-OUT', 'CL-CANARY', 'KC-CANARY', 'PL-CANARY', 'DescCanary8'
];
const CONFIG = [
  'Building configuration...', '', 'Current configuration:', '!', 'frr version 8.4', 'frr defaults traditional',
  'hostname r1', 'password ZebraPwCanary1', 'enable password EnablePwCanary2', 'service integrated-vtysh-config', '!',
  'ip route 192.0.2.0/24 10.1.0.2', '!',
  'key chain KC-CANARY', ' key 1', '  key-string KeyStringCanary3', ' exit', 'exit', '!',
  'interface eth1', ' description DescCanary8', ' ip address 10.1.0.1/24',
  ' ip ospf authentication-key OspfAuthCanary4', ' ip ospf message-digest-key 1 md5 Md5KeyCanary5', 'exit', '!',
  'router bgp 65001', ' neighbor 10.1.0.2 remote-as 65002', ' neighbor 10.1.0.2 password BgpPwCanary6',
  ' address-family ipv4 unicast', '  neighbor 10.1.0.2 route-map RM-CANARY-OUT out', ' exit-address-family', 'exit', '!',
  'router ospf', ' area 0 authentication message-digest', 'exit', '!',
  'bgp community-list standard CL-CANARY seq 5 permit 65001:31337', '!',
  'ip prefix-list PL-CANARY seq 5 permit 192.0.2.0/24', '!',
  'route-map RM-CANARY-OUT permit 10', ' set community 65001:31337', 'exit', '!',
  'snmp-server community SnmpCommunityCanary7', '!', 'end', ''
].join('\n');
// the same secrets on a static-only router (no router bgp / ospf): the configured static is then read for the target
const STATIC_CONFIG = (function () {
  let skip = false;
  return CONFIG.split('\n').filter(l => {
    if (/^router (bgp|ospf)\b/.test(l)) skip = true;
    const keep = !skip;
    if (skip && l === 'exit') skip = false;
    return keep;
  }).join('\n');
})();

// answers `vtysh --vty_socket <s> -c <cmd> [-c <cmd> ...]`: the config above for show running-config, json for the rest
const FAKE_VTYSH = `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const a = process.argv.slice(2), cmds = [];
for (let i = 0; i < a.length; i++) if (a[i] === '-c') cmds.push(a[++i]);
const IFACE = { eth1: { administrativeStatus: 'up', operationalStatus: 'up', ipAddresses: [{ address: '10.1.0.1/24' }], vrfName: 'default' } };
const out = cmds.map(function (c) {
  if (c === 'show running-config') return fs.readFileSync(process.env.FAKE_CFG, 'utf8');
  if (/^show interface/.test(c)) return JSON.stringify(IFACE);
  return '{}';
});
process.stdout.write(out.join('\\n') + '\\n');
`;

function setup(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-cfg-secrets-'));
  DIRS.push(dir);
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'vtysh'), FAKE_VTYSH, { mode: 0o755 });
  const cfg = path.join(dir, 'running-config.txt'); fs.writeFileSync(cfg, config || CONFIG);
  const env = Object.assign({}, process.env, {
    PATH: bin + path.delimiter + process.env.PATH, XRAY_VTY_SOCK_DIR: path.join(dir, 'sock'), FAKE_CFG: cfg
  });
  return { dir, env };
}

function assertNoConfigText(text, where) {
  SECRETS.forEach(s => assert.ok(!text.includes(s), where + ' must not contain ' + JSON.stringify(s)));
  CONFIG.split('\n').map(l => l.trim()).filter(l => l.length >= 16).forEach(l =>
    assert.ok(!text.includes(l), where + ' must not contain the config line ' + JSON.stringify(l)));
}

function runCollector(config, proto) {
  const { dir, env } = setup(config);
  const out = path.join(dir, 'r1.json');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-collect.js'), '--lab', 't', '--node', 'r1', '--proto', proto,
    '--adj', 'eth1:r2', '--out', out], { env, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, 'collector exit 0 (' + proto + '): ' + (r.error ? r.error.message : r.stderr));
  const text = fs.readFileSync(out, 'utf8');
  assertNoConfigText(text, 'state (' + proto + ')');
  assertNoConfigText(r.stdout + r.stderr, 'collector output (' + proto + ')');
  return JSON.parse(text);
}

test('FRR collector: only the parsed running-config facts reach the state file', { skip: process.platform === 'win32' }, () => {
  for (const proto of ['bgp', 'ospf']) {
    const st = runCollector(CONFIG, proto);
    assert.strictEqual(st.bgp_configured, true, 'bgp_configured from router bgp + neighbor');
    assert.strictEqual(st.ospf_configured, true, 'ospf_configured from router ospf');
  }
});

test('FRR collector: a configured static is kept as prefix + next hop only', { skip: process.platform === 'win32' }, () => {
  assert.ok(!/^router /m.test(STATIC_CONFIG) && STATIC_CONFIG.includes('ZebraPwCanary1'), 'static-only config still has the secrets');
  const st = runCollector(STATIC_CONFIG, 'ospf');
  assert.strictEqual(st.bgp_configured, false);
  assert.strictEqual(st.ospf_configured, false);
  const rr = st.route_resolution || {};
  assert.deepStrictEqual([rr.matched_prefix, rr.next_hop, rr.target, rr.resolved], ['192.0.2.0/24', '10.1.0.2', '192.0.2.0', false],
    'configured static (not in the RIB) is the target');
});

test('FRR collector: xray-states.js holds no running-config text', { skip: process.platform === 'win32' }, () => {
  const { dir, env } = setup();
  const work = path.join(dir, 'work'); fs.mkdirSync(work);
  fs.copyFileSync(path.join(ROOT, 'clab-collect.js'), path.join(work, 'clab-collect.js'));
  const topo = path.join(dir, 't.clab.yml');
  fs.writeFileSync(topo, 'name: t\ntopology:\n  nodes:\n    r1:\n      kind: linux\n    r2:\n      kind: linux\n  links:\n    - endpoints: ["r1:eth1", "r2:eth1"]\n');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), topo, work, 'bgp'], { env, encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, 'clab-xray-collect exit 0: ' + (r.error ? r.error.message : r.stderr));
  const js = fs.readFileSync(path.join(work, 'xray-states.js'), 'utf8');
  assertNoConfigText(js, 'xray-states.js');
  assertNoConfigText(r.stdout + r.stderr, 'clab-xray-collect output');
  assert.ok(/"bgp_configured":true/.test(js), 'the parsed facts reach the page');
});

/* nx_policy_optin: policy_config (route-map / prefix-list names and prefixes) only when asked - --policy-config or XRAY_POLICY_CONFIG=1.
   Even then no password, key, description, key chain, community-list or community value reaches the state. */
const NEVER = ['ZebraPwCanary1', 'EnablePwCanary2', 'KeyStringCanary3', 'OspfAuthCanary4', 'Md5KeyCanary5', 'BgpPwCanary6',
  'SnmpCommunityCanary7', '65001:31337', 'KC-CANARY', 'CL-CANARY', 'DescCanary8'];

test('FRR collector --policy-config: the policy names reach the state, still no secret', { skip: process.platform === 'win32' }, () => {
  const { dir, env } = setup(CONFIG);
  const out = path.join(dir, 'r1.json');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-collect.js'), '--lab', 't', '--node', 'r1', '--proto', 'bgp',
    '--adj', 'eth1:r2', '--policy-config', '--out', out], { env, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, 'collector exit 0: ' + (r.error ? r.error.message : r.stderr));
  const text = fs.readFileSync(out, 'utf8'), st = JSON.parse(text);
  NEVER.forEach(s => assert.ok(!(text + r.stdout + r.stderr).includes(s), 'state must not contain ' + JSON.stringify(s)));
  assert.deepStrictEqual(st.policy_config.bgp.neighbors['10.1.0.2'].route_map, { out: 'RM-CANARY-OUT' });
  assert.deepStrictEqual(st.policy_config.prefix_lists['PL-CANARY'].map(e => [e.seq, e.action, e.prefix]), [[5, 'permit', '192.0.2.0/24']]);
});

test('collector: policy_config is kept only with XRAY_POLICY_CONFIG=1 (any OS)', () => {
  const C = require('../clab-collect.js'), P = require('../policy-parse.js');
  const pc = P.parse(CONFIG.split('\n').map(l => l.trim()));
  const run = () => C.collectFromJson({ node: 'r1', id: 't', proto: 'bgp', adjacency: [], policyConfig: pc });
  const old = process.env.XRAY_POLICY_CONFIG;
  try {
    delete process.env.XRAY_POLICY_CONFIG;
    assert.strictEqual(run().policy_config, undefined, 'off by default');
    process.env.XRAY_POLICY_CONFIG = '1';
    assert.ok(run().policy_config.route_maps['RM-CANARY-OUT'], 'on when asked');
    assert.ok(!NEVER.some(s => JSON.stringify(run().policy_config).includes(s)), 'no secret in it');
  } finally { if (old === undefined) delete process.env.XRAY_POLICY_CONFIG; else process.env.XRAY_POLICY_CONFIG = old; }
});
