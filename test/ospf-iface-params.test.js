// ospf-iface-params.test.js — the per-interface OSPF rows (state.ospf_ifaces, DATA-CONTRACT 4.3): read from real FRR 8.4 /
// 10.7.1, Cisco IOL and SR Linux captures, and the two ends of a link put side by side by clab-xray-collect.js
// (remote + mismatch). The collectors in the pairing tests are stubs that copy <NX_STUB_DIR>/<node>.json to --out.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
function runCollector(script, args) {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, script)].concat(args), { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
function frr(ver, node) {
  return runCollector('clab-collect.js', ['--fixtures', path.join('test', 'fixtures', 'frr-ospf-iface', ver, node), '--node', node,
    '--adj', 'eth1:' + (node === 'r1' ? 'r2' : 'r1') + ',eth2:' + (node === 'r1' ? 'r2' : 'r1') + ',eth3:' + (node === 'r1' ? 'r2' : 'r1'), '--proto', 'ospf']).ospf_ifaces;
}

['frr84', 'frr107'].forEach(function (ver) {
  test(ver + ': r1 reports every field of its three OSPF interfaces', function () {
    var o = frr(ver, 'r1');
    assert.deepStrictEqual(Object.keys(o).sort(), ['eth1', 'eth2', 'eth3'], 'lo is left out');
    assert.deepStrictEqual(o.eth1, { peer: 'r2', area: '0.0.0.0', mtu: 9500, hello: 10, dead: 40, network_type: 'broadcast', cost: 10,
      role: 'DR', priority: 100, passive: false, auth: 'md5', neighbors: 1, neighbors_adjacent: 1 });
    assert.strictEqual(o.eth2.network_type, 'point-to-point');
    assert.strictEqual(o.eth2.role, 'P2P');
    assert.strictEqual(o.eth2.hello, 5);
    assert.strictEqual(o.eth2.dead, 20);
    assert.strictEqual(o.eth2.cost, 30);
    assert.strictEqual(o.eth2.auth, 'none', 'no "authentication" field = none');
    assert.strictEqual(o.eth3.auth, 'simple');
  });
  test(ver + ': r2 eth1 is the BDR, eth3 is passive in area 0.0.0.1', function () {
    var o = frr(ver, 'r2');
    assert.strictEqual(o.eth1.role, 'BDR');
    assert.strictEqual(o.eth3.passive, true);
    assert.strictEqual(o.eth3.area, '0.0.0.1');
    assert.strictEqual(o.eth2.passive, false);
  });
});

test('FRR json without the detail fields (hand-made, older): unknown values are null, never guessed', function () {
  var c = require(path.join(ROOT, 'clab-collect.js'));
  var p = c.parseOspfInterfaces({ interfaces: { eth1: { ifUp: true, ospfEnabled: true, ipAddress: '10.1.0.1', ipAddressPrefixlen: 30, area: '0.0.0.0' } } });
  assert.strictEqual(p.eth1.mtu, null);
  assert.strictEqual(p.eth1.auth, null);
  assert.strictEqual(p.eth1.helloKnown, false);
  assert.strictEqual(p.eth1.passiveKnown, false);
});

test('Cisco IOL (real capture): cost, role, priority, counts and "no authentication line" = none; MTU unknown without show ip interface', function () {
  var o = runCollector('clab-iosxe-collect.js', ['--from-dir', path.join('test', 'fixtures', 'iosxe-real-ospf', 'exstart', 'r1'), '--node', 'r1',
    '--adj', 'Ethernet0/1:r2,Ethernet0/2:r2', '--proto', 'ospf']).ospf_ifaces;
  assert.deepStrictEqual(o['Ethernet0/1'], { peer: 'r2', area: '0', mtu: null, hello: 2, dead: 8, network_type: 'broadcast', cost: 10,
    role: 'DROTHER', priority: 0, passive: false, auth: 'none', neighbors: 3, neighbors_adjacent: 2 });
  assert.strictEqual(o['Ethernet0/2'].role, 'DR');
  assert.strictEqual(o['Ethernet0/2'].neighbors_adjacent, 0, 'r2 is stuck below Full on Ethernet0/2 (MTU)');
});

function iol(node) {
  var peer = node === 'r1' ? 'r2' : 'r1';
  return runCollector('clab-iosxe-collect.js', ['--from-dir', path.join('test', 'fixtures', 'iosxe-ospf-iface', node), '--node', node,
    '--adj', 'Ethernet0/1:' + peer + ',Ethernet0/2:' + peer + ',Ethernet0/3:' + peer, '--proto', 'ospf']).ospf_ifaces;
}
test('Cisco IOL (real capture with show ip interface): MTU, md5 / simple / none, point-to-point, passive, area 1', function () {
  var a = iol('r1'), b = iol('r2');
  assert.deepStrictEqual(a['Ethernet0/1'], { peer: 'r2', area: '0', mtu: 1500, hello: 10, dead: 40, network_type: 'broadcast', cost: 10,
    role: 'DR', priority: 100, passive: false, auth: 'md5', neighbors: 1, neighbors_adjacent: 1 });
  assert.strictEqual(a['Ethernet0/2'].network_type, 'point-to-point');
  assert.strictEqual(a['Ethernet0/2'].role, 'P2P');
  assert.strictEqual(a['Ethernet0/2'].hello, 5);
  assert.strictEqual(a['Ethernet0/2'].cost, 30);
  assert.strictEqual(a['Ethernet0/3'].auth, 'simple');
  assert.strictEqual(b['Ethernet0/1'].role, 'BDR');
  assert.strictEqual(b['Ethernet0/3'].mtu, 1400);
  assert.strictEqual(b['Ethernet0/3'].passive, true);
  assert.strictEqual(b['Ethernet0/3'].area, '1');
  assert.strictEqual(b['Ethernet0/3'].auth, 'none');
});

test('Cisco IOS text: authentication lines and the IP MTU from show ip interface', function () {
  var x = require(path.join(ROOT, 'clab-iosxe-collect.js'));
  var hd = 'Ethernet0/1 is up, line protocol is up \n  Internet Address 10.1.12.1/24, Interface ID 3, Area 0\n' +
    '  Process ID 1, Router ID 1.1.1.1, Network Type BROADCAST, Cost: 10\n  Transmit Delay is 1 sec, State DR, Priority 100\n' +
    '  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5\n  Neighbor Count is 1, Adjacent neighbor count is 1 \n' +
    '  Message digest authentication enabled\n    Youngest key id is 1\n' +
    'Ethernet0/3 is up, line protocol is up \n  Internet Address 10.3.12.1/24, Interface ID 5, Area 0\n' +
    '  Process ID 1, Router ID 1.1.1.1, Network Type BROADCAST, Cost: 10\n  Transmit Delay is 1 sec, State DR, Priority 1\n' +
    '  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5\n  Simple password authentication enabled\n';
  var hb = 'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C\n' +
    'Et0/1        1     0               10.1.12.1/24       10    DR    1/1\nEt0/3        1     0               10.3.12.1/24       10    DR    0/0\n';
  var hi = 'Ethernet0/1 is up, line protocol is up\n  Internet address is 10.1.12.1/24\n  MTU is 1500 bytes\n' +
    'Ethernet0/3 is up, line protocol is up\n  Internet address is 10.3.12.1/24\n  MTU is 1400 bytes\n';
  var hib = 'Interface              IP-Address      OK? Method Status                Protocol\n' +
    'Ethernet0/1            10.1.12.1       YES TFTP   up                    up      \nEthernet0/3            10.3.12.1       YES TFTP   up                    up      \n';
  var c = require(path.join(ROOT, 'clab-collect.js'));
  var st = x.collectFromIosxeText({ node: 'r1', proto: 'ospf', adjacency: [{ iface: 'Ethernet0/1', peer: 'r2' }, { iface: 'Ethernet0/3', peer: 'r2' }],
    ospfConfigured: true, ospfInterface: hb, ospfInterfaceDetail: hd, ipInterface: hib, ipInterfaceDetail: hi, route: '', ospfNeighbor: '' }, c.buildState);
  assert.strictEqual(st.ospf_ifaces['Ethernet0/1'].auth, 'md5');
  assert.strictEqual(st.ospf_ifaces['Ethernet0/3'].auth, 'simple');
  assert.strictEqual(st.ospf_ifaces['Ethernet0/1'].mtu, 1500);
  assert.strictEqual(st.ospf_ifaces['Ethernet0/3'].mtu, 1400);
  assert.strictEqual(st.ospf_ifaces['Ethernet0/1'].priority, 100);
});

test('SR Linux (real capture): mtu, timers, type, metric, oper-state; passive / authentication not in the state = null', function () {
  var o = runCollector('clab-srl-collect.js', ['--from-dir', path.join('fixtures', 'srl-collect-sample', 'r1'), '--node', 'r1',
    '--adj', 'ethernet-1/1.0:r2', '--proto', 'ospf']).ospf_ifaces;
  assert.deepStrictEqual(o['ethernet-1/1.0'], { peer: 'r2', area: '0.0.0.0', mtu: 1500, hello: 10, dead: 40, network_type: 'point-to-point',
    cost: 16, role: 'P2P', priority: 1, passive: null, auth: null, neighbors: 1, neighbors_adjacent: 1 });
});

// ---- the two ends side by side (clab-xray-collect.js) ----
var STUB = "var a=process.argv,o=a[a.indexOf('--out')+1],n=a[a.indexOf('--node')+1];" +
  "require('fs').copyFileSync(require('path').join(process.env.NX_STUB_DIR,n+'.json'),o);";
function collectOnce(nodes, links) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-oip-')), out = path.join(dir, 'out'), stub = path.join(dir, 'stub');
  try {
    fs.mkdirSync(out); fs.mkdirSync(stub);
    ['clab-collect.js', 'clab-srl-collect.js'].forEach(function (f) { fs.writeFileSync(path.join(out, f), STUB); });
    var y = 'name: oip\ntopology:\n  nodes:\n';
    Object.keys(nodes).forEach(function (n) {
      y += '    ' + n + ':\n      kind: ' + nodes[n].kind + '\n';
      fs.writeFileSync(path.join(stub, n + '.json'), JSON.stringify(nodes[n].state));
    });
    y += '  links:\n';
    links.forEach(function (l) { y += '    - endpoints: ["' + l[0] + ':' + l[1] + '", "' + l[2] + ':' + l[3] + '"]\n'; });
    fs.writeFileSync(path.join(dir, 'lab.clab.yml'), y);
    var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'clab-xray-collect.js'), path.join(dir, 'lab.clab.yml'), out, 'ospf'],
      { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { NX_STUB_DIR: stub, TMPDIR: dir, TMP: dir, TEMP: dir }), timeout: 120000 });
    assert.strictEqual(r.status, 0, r.stderr);
    var ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(out, 'xray-states.js'), 'utf8'), ctx);
    return JSON.parse(JSON.stringify(ctx.window.LIVE_STATES));   // plain objects (deepStrictEqual compares prototypes)
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}
function row(o) {
  return Object.assign({ peer: '', area: '0.0.0.0', mtu: 1500, hello: 10, dead: 40, network_type: 'broadcast', cost: 10, role: 'DR',
    priority: 1, passive: false, auth: 'none', neighbors: 0, neighbors_adjacent: 0 }, o || {});
}
function st(node, rows) {
  return { success: true, target_node: node, protocol: 'ospf', ospf_configured: true, interfaces: {}, iface_hellos: {}, ospf_ifaces: rows };
}

test('pairing: MTU 1500 / 1400 is the one mismatch; the other end is copied as remote; both ends get it', function () {
  var s = collectOnce({
    r1: { kind: 'linux', state: st('r1', { eth1: row({ peer: 'r2' }) }) },
    r2: { kind: 'linux', state: st('r2', { eth1: row({ peer: 'r1', mtu: 1400, role: 'BDR' }) }) }
  }, [['r1', 'eth1', 'r2', 'eth1']]);
  var a = s.r1.ospf_ifaces.eth1, b = s.r2.ospf_ifaces.eth1;
  assert.deepStrictEqual(a.mismatch, ['mtu'], 'role differs but may differ');
  assert.strictEqual(a.peer_iface, 'eth1');
  assert.strictEqual(a.remote.mtu, 1400);
  assert.strictEqual(a.remote.role, 'BDR');
  assert.strictEqual(a.remote.remote, undefined, 'no nesting');
  assert.deepStrictEqual(b.mismatch, ['mtu']);
  assert.strictEqual(b.remote.mtu, 1500);
});

test('pairing: hello + dead differ, area 0 and 0.0.0.0 are the same area, passive on one end counts', function () {
  var s = collectOnce({
    r1: { kind: 'linux', state: st('r1', { eth1: row({ area: '0', hello: 10, dead: 40 }), eth2: row() }) },
    r2: { kind: 'linux', state: st('r2', { eth1: row({ hello: 5, dead: 20 }), eth2: row({ passive: true }) }) }
  }, [['r1', 'eth1', 'r2', 'eth1'], ['r1', 'eth2', 'r2', 'eth2']]);
  assert.deepStrictEqual(s.r1.ospf_ifaces.eth1.mismatch, ['hello', 'dead']);
  assert.deepStrictEqual(s.r1.ospf_ifaces.eth2.mismatch, ['passive']);
  assert.deepStrictEqual(s.r2.ospf_ifaces.eth2.mismatch, ['passive']);
});

test('pairing: areas in IOS form (0 / 1) and dotted form (0.0.0.1) compare by value', function () {
  var c = require(path.join(ROOT, 'clab-collect.js'));
  var mk = function (a1, a2) {
    var s = { r1: st('r1', { e1: row({ area: a1 }) }), r2: st('r2', { e1: row({ area: a2 }) }) };
    c.pairOspfIfaces(s, { r1: [{ iface: 'e1', peer: 'r2', peerIface: 'e1' }], r2: [{ iface: 'e1', peer: 'r1', peerIface: 'e1' }] });
    return s.r1.ospf_ifaces.e1.mismatch;
  };
  assert.deepStrictEqual(mk('0', '1'), ['area']);
  assert.deepStrictEqual(mk('1', '0.0.0.1'), []);
  assert.deepStrictEqual(mk('0', '0.0.0.0'), []);
  assert.deepStrictEqual(mk('0.0.0.1', '0.0.0.2'), ['area']);
});

test('pairing: a value one end did not report is not compared; an SR Linux end is found by the name it prints', function () {
  var s = collectOnce({
    r1: { kind: 'linux', state: st('r1', { eth1: row({ mtu: 9500, auth: 'md5' }) }) },
    s1: { kind: 'nokia_srlinux', state: st('s1', { 'ethernet-1/1.0': row({ mtu: null, auth: null, network_type: 'point-to-point' }) }) }
  }, [['r1', 'eth1', 's1', 'e1-1']]);
  var a = s.r1.ospf_ifaces.eth1;
  assert.strictEqual(a.peer_iface, 'ethernet-1/1.0');
  assert.deepStrictEqual(a.mismatch, ['network_type'], 'mtu / auth unknown on s1 -> not compared');
  assert.strictEqual(s.s1.ospf_ifaces['ethernet-1/1.0'].peer_iface, 'eth1');
});

test('pairing: no ospf_ifaces on the peer (older collector) -> peer_iface only, no remote / mismatch', function () {
  var s = collectOnce({
    r1: { kind: 'linux', state: st('r1', { eth1: row() }) },
    r2: { kind: 'linux', state: { success: true, target_node: 'r2', protocol: 'ospf', interfaces: {}, iface_hellos: {} } }
  }, [['r1', 'eth1', 'r2', 'eth1']]);
  assert.strictEqual(s.r1.ospf_ifaces.eth1.peer_iface, 'eth1');
  assert.strictEqual(s.r1.ospf_ifaces.eth1.remote, undefined);
  assert.strictEqual(s.r1.ospf_ifaces.eth1.mismatch, undefined);
});
