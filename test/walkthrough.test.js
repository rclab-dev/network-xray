// walkthrough.test.js — scripts/xray-walkthrough.js: the walkthrough format (WALKTHROUGH-CONTRACT.md) is checked, and a valid walkthrough is written as
// one HTML page with the engine inside that loads nothing from outside; the q21 example walkthroughs are valid.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var walkthrough = require('../scripts/xray-walkthrough.js');
var cf = require('../scripts/capture-frames.js');

var ROOT = path.join(__dirname, '..');
var SCRIPT = path.join(ROOT, 'scripts', 'xray-walkthrough.js');
var EXAMPLE = path.join(ROOT, 'demo', 'walkthrough-q21');
var FRAME_A = path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json');
var TOPO = { nodes: [{ name: 'r1', kind: 'linux' }, { name: 'r2', kind: 'linux' }, { name: 'r3', kind: 'linux' }],
  links: [{ source: 'r1', target: 'r2' }, { source: 'r1', target: 'r3' }] };

// a small valid walkthrough: the q21 frame A as the state of one scene, the topology written in the walkthrough
function base() {
  return { walkthrough: '0.1', title: 'one scene', topology: JSON.parse(JSON.stringify(TOPO)),
    scenes: [{ id: 'a', title: 'first', caption: 'r3 wins', state: FRAME_A, show: { node: 'r1', prefix: '8.8.8.0/24' } }] };
}
function problems(s) { return walkthrough.check(s, ROOT).problems; }
function has(list, re) { assert.ok(list.some(function (m) { return re.test(m); }), 'expected a problem like ' + re + ', got: ' + JSON.stringify(list)); }
// the walkthrough data in a built page
function data(html) {
  var m = /<script id="nx-walkthrough" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'no walkthrough data in the page');
  return JSON.parse(m[1]);
}
function cli(args) {
  var r = cp.spawnSync(process.execPath, [SCRIPT].concat(args), { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'nx-walkthrough-test-')); }

test('the q21 example walkthroughs (en, ja) are valid and are built into a page of 4 scenes', function () {
  ['walkthrough.json', 'walkthrough.ja.json'].forEach(function (f) {
    var r = walkthrough.build(path.join(EXAMPLE, f));
    assert.deepStrictEqual(r.problems, [], f);
    var d = data(r.html);
    assert.strictEqual(d.scenes.length, 4, f);
    assert.deepStrictEqual(d.scenes.map(function (s) { return s.id; }), ['fault', 'fix', 'link-down', 'restored'], f);
    d.scenes.forEach(function (s) {
      assert.strictEqual(s.source, 'observed');
      assert.strictEqual(s.show.node, 'r1');
      assert.deepStrictEqual(Object.keys(s.state).sort(), ['r1', 'r2', 'r3']);
    });
    assert.deepStrictEqual(d.topology.nodes.map(function (n) { return n.name; }), ['r1', 'r2', 'r3']);
    assert.strictEqual(d.topology.links.length, 2);
    assert.match(r.html, new RegExp('<html lang="' + d.lang + '">'));
  });
  // the fault scene: on r1 the path via r3 (10.11.0.20) is best, the one via r2 (LocPref 50) is not
  var fault = data(walkthrough.build(path.join(EXAMPLE, 'walkthrough.json')).html).scenes[0].state.r1.bgp_routes;
  assert.deepStrictEqual(fault.filter(function (p) { return p.prefix === '8.8.8.0'; }).map(function (p) { return [p.next_hop, p.best]; }),
    [['10.10.0.20', false], ['10.11.0.20', true]]);
});

test('the page has the engine and the player inside: no script, style or image is loaded from anywhere', function () {
  var html = walkthrough.build(path.join(EXAMPLE, 'walkthrough.json')).html;
  var tags = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');   // the tags only, not the code inside them
  assert.ok(html.length - tags.length > 900000, 'the engine is inside the page');
  assert.doesNotMatch(tags, /<script[^>]+\bsrc=/i);
  assert.doesNotMatch(tags, /<link[^>]+rel=["']?stylesheet/i);
  assert.doesNotMatch(tags, /<img[^>]+\bsrc=["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /<!-- nx-inline:|<!-- nx-walkthrough-data -->/);
  ['xrayCore', 'clabXray', 'XraySkin', 'xrayWalkthrough'].forEach(function (g) { assert.ok(html.indexOf(g) >= 0, g); });
});

test('text from the walkthrough cannot end the data script or become markup', function () {
  var s = base();
  s.title = '</script><img src=x onerror=alert(1)> & "q"';
  s.description = '<!-- not a comment --> </SCRIPT>';
  s.scenes[0].caption = '</script><script>alert(2)</script>';
  var d = tmp(), f = path.join(d, 'walkthrough.json');
  fs.writeFileSync(f, JSON.stringify(s));
  var r = walkthrough.build(f);
  assert.deepStrictEqual(r.problems, []);
  var m = /<script id="nx-walkthrough" type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)[1];
  assert.doesNotMatch(m, /<\/script|<!--/i);
  assert.strictEqual(data(r.html).title, s.title);
  assert.strictEqual(data(r.html).scenes[0].caption, s.scenes[0].caption);
  assert.match(r.html, /<title>&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;q&quot; - network-xray Walkthrough<\/title>/);
});

test('a walkthrough with the topology written in it, or as the graph JSON of containerlab, is valid', function () {
  assert.deepStrictEqual(problems(base()), []);
  var s = base(); s.topology = 'demo/bgp-lp/topo.json';
  assert.deepStrictEqual(problems(s), []);
});

test('defaults: lang en, source unknown, dwell 6000; a scene\'s source wins over the walkthrough\'s; ext is accepted and not passed on', function () {
  var s = base();
  s.ext = { rcl: { anything: [1, 2] } };
  s.scenes[0].ext = { rcl: { engine: ['xray-bgp-established'], panel: [{ type: 'h.title' }] } };
  s.scenes.push({ id: 'b', title: 'second', state: FRAME_A, source: 'answer-example', dwell: 9000 });
  var c = walkthrough.check(s, ROOT);
  assert.deepStrictEqual(c.problems, []);
  assert.strictEqual(c.walkthrough.lang, 'en');
  assert.deepStrictEqual(c.walkthrough.scenes.map(function (x) { return [x.source, x.dwell]; }), [['unknown', 6000], ['answer-example', 9000]]);
  assert.ok(!('ext' in c.walkthrough) && !('ext' in c.walkthrough.scenes[0]));
  s.source = 'illustrative';
  assert.strictEqual(walkthrough.check(s, ROOT).walkthrough.scenes[0].source, 'illustrative');
});

test('unknown keys are refused, except under ext', function () {
  var s = base(); s.color = 'red'; s.scenes[0].note = 'x'; s.scenes[0].show.zoom = 2;
  var p = problems(s);
  has(p, /^walkthrough: unknown key "color"/);
  has(p, /^scenes\[0\]: unknown key "note"/);
  has(p, /^scenes\[0\]\.show: unknown key "zoom"/);
  s = base(); s.scenes[0].show.highlight = { nodes: [], colour: 'x' };
  has(problems(s), /highlight: unknown key "colour"/);
});

test('the version, title, scenes and ids are checked', function () {
  var s = base(); s.walkthrough = '1.0'; has(problems(s), /^walkthrough: must be "0\.1"/);
  s = base(); delete s.title; has(problems(s), /^title: needs text/);
  s = base(); s.title = 'x'.repeat(121); has(problems(s), /^title:/);
  s = base(); s.scenes = []; has(problems(s), /^scenes: needs a list/);
  s = base(); s.scenes = []; for (var i = 0; i < 51; i++) s.scenes.push({ id: 's' + i, title: 't', state: FRAME_A });
  has(problems(s), /^scenes: at most 50/);
  s = base(); s.scenes.push({ id: 'a', title: 'again', state: FRAME_A }); has(problems(s), /"a" is used twice/);
  s = base(); s.scenes[0].id = 'has space'; has(problems(s), /\.id: a plain name/);
  s = base(); s.scenes[0].source = 'measured'; has(problems(s), /\.source: one of observed/);
  s = base(); s.lang = 'fr'; has(problems(s), /^lang: one of en, ja/);
  s = base(); s.scenes[0].dwell = 100; has(problems(s), /\.dwell: whole milliseconds/);
  s = base(); s.scenes[0].dwell = 1500.5; has(problems(s), /\.dwell:/);
  assert.deepStrictEqual(walkthrough.check([], ROOT).problems, ['the walkthrough must be a JSON object']);
});

test('names must be in the topology and the shown router must have a state in the scene', function () {
  var s = base(); s.scenes[0].show.node = 'r9'; has(problems(s), /show\.node: "r9" is not in the topology/);
  s = base(); s.scenes[0].show.highlight = { nodes: ['r4'], links: [['r2', 'r3']] };
  var p = problems(s);
  has(p, /highlight\.nodes\[0\]: "r4" is not in the topology/);
  has(p, /highlight\.links\[0\]: \["r2","r3"\] is not a link of the topology/);
  s = base(); s.scenes[0].show.prefix = '8.8.8.0/24; drop'; has(problems(s), /show\.prefix:/);
  s = base(); var st = JSON.parse(fs.readFileSync(FRAME_A, 'utf8')); delete st.r1; s.scenes[0].state = st;
  has(problems(s), /show\.node: r1 has no state in this scene/);
  s = base(); s.topology = { nodes: [{ name: 'r1' }, { name: 'r2' }], links: [] };
  has(problems(s), /state: router r3 is not in the topology/);
  s = base(); s.topology = { nodes: [{ name: 'r1' }, { name: 'r1' }] }; has(problems(s), /r1 is listed twice/);
  s = base(); s.topology = { nodes: [{ name: 'r1' }], links: [{ source: 'r1', target: 'r2' }] }; has(problems(s), /topology\.links\[0\]:/);
});

test('states are read from a file or written in the walkthrough, and checked against the states schema', function () {
  var s = base(); s.scenes[0].state = 'no/such/frame.json'; has(problems(s), /\.state: cannot read no\/such\/frame\.json/);
  s = base(); s.scenes[0].state = JSON.parse(fs.readFileSync(FRAME_A, 'utf8')); assert.deepStrictEqual(problems(s), []);
  s = base(); var one = JSON.parse(fs.readFileSync(FRAME_A, 'utf8')).r1;   // one router's state = a map of that router
  s.scenes[0].state = one; var c = walkthrough.check(s, ROOT);
  assert.deepStrictEqual(c.problems, []); assert.deepStrictEqual(Object.keys(c.walkthrough.scenes[0].state), ['r1']);
  s = base(); s.scenes[0].state = { r1: { target_node: 'r1', interfaces: 'not an object' } };
  has(problems(s), /scenes\[0\]\.state\/r1/);
  s = base(); s.scenes[0].state = 7; has(problems(s), /\.state: needs a file name or the state itself/);
});

test('command line: --check, --out, a walkthrough that is not valid (exit 1, every problem listed), usage errors (exit 2)', function () {
  var d = tmp();
  var r = cli([path.join(EXAMPLE, 'walkthrough.json'), '--check']);
  assert.strictEqual(r.code, 0, r.stderr); assert.match(r.stdout, /^ok .* \(4 scenes\)/);
  var out = path.join(d, 'q21.html');
  r = cli([path.join(EXAMPLE, 'walkthrough.json'), '--out', out]);
  assert.strictEqual(r.code, 0, r.stderr); assert.ok(fs.statSync(out).size > 100000);
  var bad = base(); bad.walkthrough = '2'; bad.scenes[0].show.node = 'r9'; delete bad.scenes[0].state;
  bad.topology = TOPO; fs.writeFileSync(path.join(d, 'bad.json'), JSON.stringify(bad));
  r = cli([path.join(d, 'bad.json')]);
  assert.strictEqual(r.code, 1); assert.match(r.stdout, /^FAIL /);
  assert.match(r.stdout, /walkthrough: must be/); assert.match(r.stdout, /state: needed/); assert.match(r.stdout, /show\.node/);
  assert.ok(!fs.existsSync(path.join(d, 'bad.html')), 'nothing is written for a walkthrough that is not valid');
  fs.writeFileSync(path.join(d, 'broken.json'), '{ "walkthrough": ');
  r = cli([path.join(d, 'broken.json')]); assert.strictEqual(r.code, 1); assert.match(r.stdout, /not JSON/);
  r = cli([path.join(d, 'missing.json')]); assert.strictEqual(r.code, 2); assert.match(r.stderr, /cannot read/);
  r = cli([]); assert.strictEqual(r.code, 2);
  r = cli(['a.json', '--out']); assert.strictEqual(r.code, 2); assert.match(r.stderr, /--out needs a file name/);
});

test('capture-frames --walkthrough: the draft walkthrough of the frames is valid as it is', function () {
  var d = tmp();
  fs.copyFileSync(FRAME_A, path.join(d, 'frame1.json'));
  fs.copyFileSync(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'), path.join(d, 'frame2.json'));
  var draft = cf.draftWalkthrough('q21-bgp-lp', path.relative(d, path.join(ROOT, 'examples', 'q21-bgp-lp', 'q21.clab.yml')), [
    { frame: 'frame1.json', name: 'steady', settled: true },
    { frame: 'frame2.json', name: 'lp 150 on r2', settled: false }]);
  assert.deepStrictEqual(draft.scenes.map(function (s) { return [s.id, s.title, s.source || '']; }),
    [['s1', 'steady', ''], ['s2', 'lp 150 on r2', 'observed-unsettled']]);
  assert.ok(draft.topology.indexOf('\\') < 0, 'the topology path is written with /');
  fs.writeFileSync(path.join(d, 'walkthrough.json'), JSON.stringify(draft));
  var r = walkthrough.build(path.join(d, 'walkthrough.json'));
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(data(r.html).scenes.map(function (s) { return s.source; }), ['observed', 'observed-unsettled']);
});

test('each scene after the first says what changed from the scene before (heaviest first, at most 3 lines)', function () {
  var en = data(walkthrough.build(path.join(EXAMPLE, 'walkthrough.json')).html).scenes;
  assert.strictEqual(en[0].changes, null);
  assert.deepStrictEqual(en[1].changes.lines.map(function (l) { return l.text; }), [
    'r1 8.8.8.0/24: best path via 10.11.0.20 → via 10.10.0.20 (Local Pref)',
    'r1 8.8.8.0/24: route bgp 10.11.0.20 on eth2 → bgp 10.10.0.20 on eth1']);
  assert.strictEqual(en[1].changes.more, 0);
  assert.deepStrictEqual(en[2].changes.lines.map(function (l) { return [l.text, l.tone]; }).slice(0, 2),
    [['r1 eth1: interface up → down', 'bad'], ['r2 eth1: interface up → down', 'bad']]);
  assert.strictEqual(en[2].changes.lines.length, 3);
  assert.ok(en[2].changes.more > 0);
  var ja = data(walkthrough.build(path.join(EXAMPLE, 'walkthrough.ja.json')).html).scenes;
  assert.match(ja[1].changes.lines[0].text, /^r1 8\.8\.8\.0\/24: 最良経路 via 10\.11\.0\.20 → via 10\.10\.0\.20/);
  // the same state twice: nothing changed
  var s = base(); s.scenes.push({ id: 'b', title: 'same', state: FRAME_A });
  assert.deepStrictEqual(walkthrough.check(s, ROOT).walkthrough.scenes[1].changes, { lines: [], more: 0 });
});

// the MCP server, started in a folder of its own (it reads only under it)
function mcp(cwd, calls) {
  var lines = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }]
    .concat(calls.map(function (a, i) { return { jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name: 'walkthrough_check', arguments: a } }; }))
    .map(function (m) { return JSON.stringify(m); });
  var env = Object.assign({}, process.env); delete env.NX_MCP_ALLOW_ANY_PATH; delete env.NX_MCP_PATH;
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'xray-mcp.js')], { cwd: cwd, input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 20000, env: env });
  assert.strictEqual(r.status, 0, r.stderr);
  var by = {};
  r.stdout.split('\n').filter(Boolean).map(JSON.parse).forEach(function (m) { by[m.id] = m.result; });
  return calls.map(function (_, i) { var x = by[i + 2]; return x.isError ? { error: JSON.parse(x.content[0].text).error } : x.structuredContent; });
}

test('MCP walkthrough_check: the scenes and their changes, the files it names read only under the server\'s folder, nothing written', function () {
  var d = tmp(), lab = path.join(d, 'lab');
  fs.mkdirSync(lab);
  ['frameA.json', 'frameB.json'].forEach(function (f) { fs.copyFileSync(path.join(ROOT, 'demo', 'bgp-lp', f), path.join(lab, f)); });
  fs.copyFileSync(path.join(ROOT, 'demo', 'bgp-lp', 'topo.json'), path.join(lab, 'topo.json'));
  var good = { walkthrough: '0.1', title: 'q21', topology: 'topo.json', scenes: [
    { id: 'a', title: 'fault', state: 'frameA.json', show: { node: 'r1', prefix: '8.8.8.0/24' } },
    { id: 'b', title: 'fix', state: 'frameB.json', source: 'answer-example' }] };
  fs.writeFileSync(path.join(lab, 'walkthrough.json'), JSON.stringify(good));
  var outside = JSON.parse(JSON.stringify(good)); outside.scenes[1].state = FRAME_A;   // a file outside the folder
  fs.writeFileSync(path.join(lab, 'outside.json'), JSON.stringify(outside));
  fs.writeFileSync(path.join(lab, 'secret.json'), '{"token": "TOP-SECRET-VALUE", "target_node": 7}');
  var leak = JSON.parse(JSON.stringify(good)); leak.scenes[1].state = 'secret.json'; leak.topology = 'secret.json';
  fs.writeFileSync(path.join(lab, 'leak.json'), JSON.stringify(leak));
  fs.writeFileSync(path.join(lab, 'notjson.txt'), 'TOP-SECRET-VALUE is not JSON');
  var before = fs.readdirSync(lab).sort();
  var r = mcp(d, [{ walkthrough: 'lab/walkthrough.json' }, { walkthrough: 'lab/outside.json' }, { walkthrough: 'lab/leak.json' }, { walkthrough: 'lab/notjson.txt' },
    { walkthrough: FRAME_A }, { walkthrough: 'lab/none.json' }]);
  assert.strictEqual(r[0].ok, true);
  assert.deepStrictEqual(r[0].scenes.map(function (s) { return [s.id, s.source, s.node, s.prefix]; }), [['a', 'unknown', 'r1', '8.8.8.0/24'], ['b', 'answer-example', null, null]]);
  assert.deepStrictEqual(r[0].scenes[0].changes, []);
  assert.match(r[0].scenes[1].changes[0], /^r1 8\.8\.8\.0\/24: best path via 10\.11\.0\.20 → via 10\.10\.0\.20/);
  assert.match(r[0].page, /^node scripts\/xray-walkthrough\.js lab\/walkthrough\.json --out /);
  assert.strictEqual(r[1].ok, false);
  has(r[1].problems, /scenes\[1\]\.state: cannot read .*: outside the folder this server reads/);
  assert.strictEqual(r[2].ok, false);
  assert.ok(JSON.stringify(r[2]).indexOf('TOP-SECRET') < 0, 'nothing of the file is quoted: ' + JSON.stringify(r[2]));
  has(r[2].problems, /^topology: needs nodes/);
  has(r[2].problems, /scenes\[1\]\.state: secret\.json: not a network-xray state file/);
  assert.deepStrictEqual(r[3], { error: 'not a walkthrough file (a JSON object, see WALKTHROUGH-CONTRACT.md)' });
  assert.match(r[4].error, /^outside the folder this server reads/);
  assert.match(r[5].error, /^not found: /);
  assert.deepStrictEqual(fs.readdirSync(lab).sort(), before, 'nothing written');
});

test('./xray.sh walkthrough is scripts/xray-walkthrough.js', { skip: process.platform === 'win32' ? 'bash' : false }, function () {
  var r = cp.spawnSync('bash', [path.join(ROOT, 'xray.sh'), 'walkthrough', path.join(EXAMPLE, 'walkthrough.json'), '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ok .* \(4 scenes\)/);
  r = cp.spawnSync('bash', [path.join(ROOT, 'xray.sh'), 'walkthrough', '--help'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0); assert.match(r.stdout, /^usage: node scripts\/xray-walkthrough\.js/);
});
