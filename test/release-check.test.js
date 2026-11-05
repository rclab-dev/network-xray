'use strict';
/* scripts/release-check.js on a small temporary tree: a clean release passes, each kind of problem is reported
   with file:line and exit 1. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'release-check.js');
const TODO_REL = 'TODO ' + 'release';

// every fixture folder is removed when the tests end (pass or fail)
const TMPS = [];
test.after(() => { for (const d of TMPS) fs.rmSync(d, { recursive: true, force: true }); });

function fixture(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-release-check-'));
  TMPS.push(root);
  const files = Object.assign({
    'CHANGELOG.md': '# Changelog\n\n## [1.1.7] - 2026-11-04\n- fixes\n\n## [1.1.6] - 2026-10-20\n- earlier\n',
    'docker/Dockerfile': 'FROM node:22-alpine\nARG CLAB_VERSION=0.82.0\nLABEL org.opencontainers.image.version="1.1.7"\n',
    'docker/netlab-defaults.yml': 'tools:\n  network_xray:\n    up: docker run ghcr.io/rclab-dev/network-xray:1 --topo /lab/clab.yml\n',
    'release/run.sh': '#!/bin/sh\nVERSION=1.1.7\necho start\n',
    'demo/index.html': '<footer>network-xray v1.1.7</footer>\n',
    'docs/install.md': 'Pull `ghcr.io/rclab-dev/network-xray:1.1.7` or `network-xray:1`.\n',
    'examples/README.md': '| Folder | Lab file | Routers | Problem |\n|---|---|---|---|\n' +
      '| `q1-static` / `q1-static-solved` | `q1.clab.yml` | 3 | Problem 1 |\n\n' +
      'IOL versions: `q5-ospf-iol` / `q5-ospf-iol-solved`.\nStart: `./xray.sh examples/q1-static/q1.clab.yml`\n',
    'examples/q1-static/q1.clab.yml': 'name: q1\n',
    'examples/q1-static-solved/q1.clab.yml': 'name: q1-solved\n',
    'examples/q5-ospf-iol/README.md': '# q5\n',
    'examples/q5-ospf-iol-solved/README.md': '# q5\n',
    'clab-collect.js': "console.log('self-test: ok');\nconsole.log('wrote ' + out);\n",
    'test/data.test.js': "var v = 'network-xray v0.0.1';\n",   // test data: not read for versions
  }, over);
  for (const [f, s] of Object.entries(files)) {
    if (s === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), s);
  }
  return root;
}

function check(root, ...args) {
  // GIT_CEILING_DIRECTORIES: the fixture in the temp folder is not a git checkout even when the temp folder sits inside one
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8', env: Object.assign({}, process.env, { GIT_CEILING_DIRECTORIES: path.dirname(root) }) });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.split('\n').filter(Boolean) };
}

function gitOk() { return spawnSync('git', ['--version']).status === 0; }
function git(root, ...a) {
  const r = spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...a], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
}

test('a consistent tree passes: every line OK, exit 0', () => {
  const r = check(fixture(), '1.1.7');
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(r.lines.length >= 6);
  for (const l of r.lines) assert.match(l, /^(OK|SKIP) /);
  assert.match(r.out, /CHANGELOG\.md:3: entry for 1\.1\.7/);
  assert.match(r.out, /version strings: 4 agree on 1\.1\.7 .*docker\/Dockerfile:3.*release\/run\.sh:2/);
  assert.match(r.out, /major image tags: 2 use :1/);
  assert.match(r.out, /SKIP collectors: not a git checkout/);
});

test('a leading v is accepted; a version that is not x.y.z is refused', () => {
  assert.strictEqual(check(fixture(), 'v1.1.7').code, 0);
  const r = check(fixture(), '1.1');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /FAIL version: "1\.1" is not like 1\.2\.3/);
});

test('usage errors exit 2', () => {
  assert.strictEqual(check(fixture()).code, 2);
  assert.strictEqual(spawnSync(process.execPath, [SCRIPT, '1.1.7', '--root'], { encoding: 'utf8' }).status, 2);
  assert.strictEqual(spawnSync(process.execPath, [SCRIPT, '1.1.7', '--bogus'], { encoding: 'utf8' }).status, 2);
});

test('each problem is one FAIL line with file:line, exit 1', () => {
  const root = fixture({
    'docker/Dockerfile': 'FROM node:22-alpine\nLABEL org.opencontainers.image.version="1.1.6"\n',
    'release/run.sh': '#!/bin/sh\n\nVERSION="1.1.5"\n',
    'demo/index.html': '<p>x</p>\n<footer>network-xray v1.1.6</footer>\n',
    'docker/netlab-defaults.yml': 'a\nimage: ghcr.io/rclab-dev/network-xray:2\n',
    'examples/q5-ospf-iol-solved/README.md': null,
    'examples/q1-static-solved/q1.clab.yml': null,
    'clab-collect.js': "console.log('ok');\nconsole.log('debug', st);\n",
    'xray-api.js': '// ' + TODO_REL + ': bump\n',
  });
  fs.mkdirSync(path.join(root, 'examples', 'q1-static-solved'), { recursive: true });
  const r = check(root, '1.1.7');
  assert.strictEqual(r.code, 1, r.out);
  const fails = r.lines.filter((l) => l.startsWith('FAIL'));
  const want = [
    /^FAIL docker\/Dockerfile:2: image version label says 1\.1\.6, not 1\.1\.7$/,
    /^FAIL release\/run\.sh:3: VERSION variable says 1\.1\.5, not 1\.1\.7$/,
    /^FAIL demo\/index\.html:2: name and version says 1\.1\.6, not 1\.1\.7$/,
    /^FAIL docker\/netlab-defaults\.yml:2: image tag network-xray:2, the release is major 1$/,
    /^FAIL examples\/README\.md:3: examples\/q1-static-solved\/q1\.clab\.yml does not exist$/,
    /^FAIL examples\/README\.md:5: example examples\/q5-ospf-iol-solved\/ does not exist$/,
    /^FAIL clab-collect\.js:2: debug console\.log$/,
    /^FAIL xray-api\.js:1: TODO release$/,
  ];
  for (const re of want) assert.ok(fails.some((l) => re.test(l)), `${re} in\n${r.out}`);
  assert.strictEqual(fails.length, want.length, r.out);
  assert.ok(!/test\/data\.test\.js/.test(r.out), 'test/ is not read for versions');
});

test('CHANGELOG: missing file, missing entry, entry that is not the newest', () => {
  let r = check(fixture({ 'CHANGELOG.md': null }), '1.1.7');
  assert.strictEqual(r.code, 0);   // no CHANGELOG = SKIP (network-xray keeps its notes in the GitHub releases)
  assert.match(r.out, /SKIP CHANGELOG: no CHANGELOG\.md/);
  r = check(fixture({ 'CHANGELOG.md': '# Changelog\n\n## v1.1.6\n' }), '1.1.7');
  assert.match(r.out, /FAIL CHANGELOG\.md: no entry for 1\.1\.7 \(newest: 1\.1\.6 at CHANGELOG\.md:3\)/);
  r = check(fixture({ 'CHANGELOG.md': '## 1.2.0\n\n## 1.1.7\n' }), '1.1.7');
  assert.match(r.out, /FAIL CHANGELOG\.md:3: the entry for 1\.1\.7 is not the newest \(1\.2\.0 at CHANGELOG\.md:1\)/);
});

test('console.log added to a collector since the previous tag is reported, unless marked', { skip: !gitOk() && 'git not available' }, () => {
  const root = fixture();
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'tag', 'v1.1.6');
  let r = check(root, '1.1.7');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /OK   collectors: no console\.log added since v1\.1\.6/);

  fs.writeFileSync(path.join(root, 'clab-collect.js'), "console.log('self-test: ok');\nconsole.log(state);\nconsole.log('wrote ' + out);\n");
  fs.writeFileSync(path.join(root, 'notes.js'), "console.log('not a collector');\n");
  r = check(root, '1.1.7');
  assert.strictEqual(r.code, 1, r.out);
  assert.deepStrictEqual(r.lines.filter((l) => l.startsWith('FAIL')), ['FAIL clab-collect.js:2: console.log added since v1.1.6']);

  fs.writeFileSync(path.join(root, 'clab-collect.js'), "console.log('self-test: ok');\nconsole.log(state);   // release-check: ok\nconsole.log('wrote ' + out);\n");
  assert.strictEqual(check(root, '1.1.7').code, 0);
  r = check(root, '1.1.7', '--since', 'no-such-ref');
  assert.match(r.out, /SKIP collectors: no-such-ref is not available/);
});

test('examples/README.md in the link form [q1-static](q1-static/) / [q1-static-solved](q1-static-solved/): a missing folder is found', () => {
  const table = '| Lab | Protocol |\n|---|---|\n| [q1-static](q1-static/) / [q1-static-solved](q1-static-solved/) | static |\n\nSee [the guide](../docs/guide.md) and [notes](NOTES.md).\n';
  let r = check(fixture({ 'examples/README.md': table }), '1.1.7');
  assert.match(r.out, /OK {3}examples\/README\.md: 2 listed examples exist/, r.out);   // both folders counted; the .md links are not folders
  r = check(fixture({ 'examples/README.md': table, 'examples/q1-static-solved/q1.clab.yml': null }), '1.1.7');
  assert.match(r.out, /^FAIL examples\/README\.md:3: example examples\/q1-static-solved\/ does not exist$/m, r.out);
});
