// story.test.js — scripts/xray-story.js: the story format (STORY-CONTRACT.md) is checked, and a valid story is written as
// one HTML page with the engine inside that loads nothing from outside; the q21 example stories are valid.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var story = require('../scripts/xray-story.js');
var cf = require('../scripts/capture-frames.js');

var ROOT = path.join(__dirname, '..');
var SCRIPT = path.join(ROOT, 'scripts', 'xray-story.js');
var EXAMPLE = path.join(ROOT, 'demo', 'story-q21');
var FRAME_A = path.join(ROOT, 'demo', 'bgp-lp', 'frameA.json');
var TOPO = { nodes: [{ name: 'r1', kind: 'linux' }, { name: 'r2', kind: 'linux' }, { name: 'r3', kind: 'linux' }],
  links: [{ source: 'r1', target: 'r2' }, { source: 'r1', target: 'r3' }] };

// a small valid story: the q21 frame A as the state of one scene, the topology written in the story
function base() {
  return { story: '0.1', title: 'one scene', topology: JSON.parse(JSON.stringify(TOPO)),
    scenes: [{ id: 'a', title: 'first', caption: 'r3 wins', state: FRAME_A, show: { node: 'r1', prefix: '8.8.8.0/24' } }] };
}
function problems(s) { return story.check(s, ROOT).problems; }
function has(list, re) { assert.ok(list.some(function (m) { return re.test(m); }), 'expected a problem like ' + re + ', got: ' + JSON.stringify(list)); }
// the story data in a built page
function data(html) {
  var m = /<script id="nx-story" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'no story data in the page');
  return JSON.parse(m[1]);
}
function cli(args) {
  var r = cp.spawnSync(process.execPath, [SCRIPT].concat(args), { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'nx-story-test-')); }

test('the q21 example stories (en, ja) are valid and are built into a page of 4 scenes', function () {
  ['story.json', 'story.ja.json'].forEach(function (f) {
    var r = story.build(path.join(EXAMPLE, f));
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
  var fault = data(story.build(path.join(EXAMPLE, 'story.json')).html).scenes[0].state.r1.bgp_routes;
  assert.deepStrictEqual(fault.filter(function (p) { return p.prefix === '8.8.8.0'; }).map(function (p) { return [p.next_hop, p.best]; }),
    [['10.10.0.20', false], ['10.11.0.20', true]]);
});

test('the page has the engine and the player inside: no script, style or image is loaded from anywhere', function () {
  var html = story.build(path.join(EXAMPLE, 'story.json')).html;
  var tags = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');   // the tags only, not the code inside them
  assert.ok(html.length - tags.length > 900000, 'the engine is inside the page');
  assert.doesNotMatch(tags, /<script[^>]+\bsrc=/i);
  assert.doesNotMatch(tags, /<link[^>]+rel=["']?stylesheet/i);
  assert.doesNotMatch(tags, /<img[^>]+\bsrc=["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /<!-- nx-inline:|<!-- nx-story-data -->/);
  ['xrayCore', 'clabXray', 'XraySkin', 'xrayStory'].forEach(function (g) { assert.ok(html.indexOf(g) >= 0, g); });
});

test('text from the story cannot end the data script or become markup', function () {
  var s = base();
  s.title = '</script><img src=x onerror=alert(1)> & "q"';
  s.description = '<!-- not a comment --> </SCRIPT>';
  s.scenes[0].caption = '</script><script>alert(2)</script>';
  var d = tmp(), f = path.join(d, 'story.json');
  fs.writeFileSync(f, JSON.stringify(s));
  var r = story.build(f);
  assert.deepStrictEqual(r.problems, []);
  var m = /<script id="nx-story" type="application\/json">([\s\S]*?)<\/script>/.exec(r.html)[1];
  assert.doesNotMatch(m, /<\/script|<!--/i);
  assert.strictEqual(data(r.html).title, s.title);
  assert.strictEqual(data(r.html).scenes[0].caption, s.scenes[0].caption);
  assert.match(r.html, /<title>&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;q&quot; - network-xray story<\/title>/);
});

test('a story with the topology written in it, or as the graph JSON of containerlab, is valid', function () {
  assert.deepStrictEqual(problems(base()), []);
  var s = base(); s.topology = 'demo/bgp-lp/topo.json';
  assert.deepStrictEqual(problems(s), []);
});

test('defaults: lang en, source unknown, dwell 6000; a scene\'s source wins over the story\'s; ext is accepted and not passed on', function () {
  var s = base();
  s.ext = { rcl: { anything: [1, 2] } };
  s.scenes[0].ext = { rcl: { engine: ['xray-bgp-established'], panel: [{ type: 'h.title' }] } };
  s.scenes.push({ id: 'b', title: 'second', state: FRAME_A, source: 'answer-example', dwell: 9000 });
  var c = story.check(s, ROOT);
  assert.deepStrictEqual(c.problems, []);
  assert.strictEqual(c.story.lang, 'en');
  assert.deepStrictEqual(c.story.scenes.map(function (x) { return [x.source, x.dwell]; }), [['unknown', 6000], ['answer-example', 9000]]);
  assert.ok(!('ext' in c.story) && !('ext' in c.story.scenes[0]));
  s.source = 'illustrative';
  assert.strictEqual(story.check(s, ROOT).story.scenes[0].source, 'illustrative');
});

test('unknown keys are refused, except under ext', function () {
  var s = base(); s.color = 'red'; s.scenes[0].note = 'x'; s.scenes[0].show.zoom = 2;
  var p = problems(s);
  has(p, /^story: unknown key "color"/);
  has(p, /^scenes\[0\]: unknown key "note"/);
  has(p, /^scenes\[0\]\.show: unknown key "zoom"/);
  s = base(); s.scenes[0].show.highlight = { nodes: [], colour: 'x' };
  has(problems(s), /highlight: unknown key "colour"/);
});

test('the version, title, scenes and ids are checked', function () {
  var s = base(); s.story = '1.0'; has(problems(s), /^story: must be "0\.1"/);
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
  assert.deepStrictEqual(story.check([], ROOT).problems, ['the story must be a JSON object']);
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

test('states are read from a file or written in the story, and checked against the states schema', function () {
  var s = base(); s.scenes[0].state = 'no/such/frame.json'; has(problems(s), /\.state: cannot read no\/such\/frame\.json/);
  s = base(); s.scenes[0].state = JSON.parse(fs.readFileSync(FRAME_A, 'utf8')); assert.deepStrictEqual(problems(s), []);
  s = base(); var one = JSON.parse(fs.readFileSync(FRAME_A, 'utf8')).r1;   // one router's state = a map of that router
  s.scenes[0].state = one; var c = story.check(s, ROOT);
  assert.deepStrictEqual(c.problems, []); assert.deepStrictEqual(Object.keys(c.story.scenes[0].state), ['r1']);
  s = base(); s.scenes[0].state = { r1: { target_node: 'r1', interfaces: 'not an object' } };
  has(problems(s), /scenes\[0\]\.state\/r1/);
  s = base(); s.scenes[0].state = 7; has(problems(s), /\.state: needs a file name or the state itself/);
});

test('command line: --check, --out, a story that is not valid (exit 1, every problem listed), usage errors (exit 2)', function () {
  var d = tmp();
  var r = cli([path.join(EXAMPLE, 'story.json'), '--check']);
  assert.strictEqual(r.code, 0, r.stderr); assert.match(r.stdout, /^ok .* \(4 scenes\)/);
  var out = path.join(d, 'q21.html');
  r = cli([path.join(EXAMPLE, 'story.json'), '--out', out]);
  assert.strictEqual(r.code, 0, r.stderr); assert.ok(fs.statSync(out).size > 100000);
  var bad = base(); bad.story = '2'; bad.scenes[0].show.node = 'r9'; delete bad.scenes[0].state;
  bad.topology = TOPO; fs.writeFileSync(path.join(d, 'bad.json'), JSON.stringify(bad));
  r = cli([path.join(d, 'bad.json')]);
  assert.strictEqual(r.code, 1); assert.match(r.stdout, /^FAIL /);
  assert.match(r.stdout, /story: must be/); assert.match(r.stdout, /state: needed/); assert.match(r.stdout, /show\.node/);
  assert.ok(!fs.existsSync(path.join(d, 'bad.html')), 'nothing is written for a story that is not valid');
  fs.writeFileSync(path.join(d, 'broken.json'), '{ "story": ');
  r = cli([path.join(d, 'broken.json')]); assert.strictEqual(r.code, 1); assert.match(r.stdout, /not JSON/);
  r = cli([path.join(d, 'missing.json')]); assert.strictEqual(r.code, 2); assert.match(r.stderr, /cannot read/);
  r = cli([]); assert.strictEqual(r.code, 2);
  r = cli(['a.json', '--out']); assert.strictEqual(r.code, 2); assert.match(r.stderr, /--out needs a file name/);
});

test('capture-frames --story: the draft story of the frames is valid as it is', function () {
  var d = tmp();
  fs.copyFileSync(FRAME_A, path.join(d, 'frame1.json'));
  fs.copyFileSync(path.join(ROOT, 'demo', 'bgp-lp', 'frameB.json'), path.join(d, 'frame2.json'));
  var draft = cf.draftStory('q21-bgp-lp', path.relative(d, path.join(ROOT, 'examples', 'q21-bgp-lp', 'q21.clab.yml')), [
    { frame: 'frame1.json', name: 'steady', settled: true },
    { frame: 'frame2.json', name: 'lp 150 on r2', settled: false }]);
  assert.deepStrictEqual(draft.scenes.map(function (s) { return [s.id, s.title, s.source || '']; }),
    [['s1', 'steady', ''], ['s2', 'lp 150 on r2', 'observed-unsettled']]);
  assert.ok(draft.topology.indexOf('\\') < 0, 'the topology path is written with /');
  fs.writeFileSync(path.join(d, 'story.json'), JSON.stringify(draft));
  var r = story.build(path.join(d, 'story.json'));
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(data(r.html).scenes.map(function (s) { return s.source; }), ['observed', 'observed-unsettled']);
});
