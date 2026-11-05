// check-links.test.js — offline link check of README.md, docs/**/*.md, examples/**/README.md
// (scripts/check-links.js), on a small temporary tree and on the repository itself.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var cl = require('../scripts/check-links.js');

var SCRIPT = path.join(__dirname, '..', 'scripts', 'check-links.js');

function tree(files) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-links-'));
  Object.keys(files).forEach(function (rel) {
    var abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  });
  return root;
}

function fixture() {
  return tree({
    'README.md': [
      '# Project',
      '',
      '## Quick start',
      '',
      'See [setup](docs/setup.md#install-it), [faq](docs/faq.md) and [up](#quick-start).',
      'Broken: [gone](docs/missing.md) and [bad anchor](docs/setup.md#nope).',
      '![logo](img/logo.png) ![no logo](img/none.png)',
      'Web: [site](https://example.com/a) and <https://example.org/b>, also **http://localhost:8080/**.',
      '```',
      '[in code](not/checked.md)',
      '```',
      'Inline `[code](not/checked.md)` too.',
      '',
    ].join('\n'),
    'img/logo.png': 'x',
    'docs/setup.md': [
      '# Setup',
      '',
      '## Install it!',
      '',
      '## Install it!',
      '',
      'Other',
      '-----',
      '',
      '<a id="custom"></a>',
      'Links: [dup](#install-it-1), [setext](#other), [html](#custom), [x](#missing-here).',
      '[ref]: ../README.md#project',
      '[badref]: ./nothing.md',
      '',
    ].join('\n'),
    'docs/faq.md': '# FAQ\n\n[back](/README.md#quick-start) [folder](../img/)\n<img src="../img/gone.svg">\n',
    'examples/a/README.md': '# A\n\n[faq](../../docs/faq.md#faq) [out](../../../elsewhere.md)\n',
    'examples/a/notes.md': '[not scanned](missing.md)\n',
  });
}

test('slug follows GitHub heading anchors', function () {
  assert.strictEqual(cl.slug('Install it!'), 'install-it');
  assert.strictEqual(cl.slug('▶ Live lab — GitHub Codespaces'), '-live-lab--github-codespaces');
  assert.strictEqual(cl.slug('Use `xray.sh` [here](x.md)'), 'use-xraysh-here');
  assert.strictEqual(cl.slug('ノード 一覧'), 'ノード-一覧');
});

test('reports each broken link, anchor and image with file:line and lists external URLs', function () {
  var root = fixture();
  try {
    var r = cl.checkAll(root);
    assert.deepStrictEqual(r.files.map(function (f) { return path.relative(root, f).split(path.sep).join('/'); }),
      ['README.md', 'docs/faq.md', 'docs/setup.md', 'examples/a/README.md']);
    assert.deepStrictEqual(r.problems, [
      'README.md:6: docs/missing.md: docs/missing.md does not exist',
      'README.md:6: docs/setup.md#nope: no heading #nope in docs/setup.md',
      'README.md:7: img/none.png: image img/none.png does not exist',
      'docs/faq.md:4: ../img/gone.svg: image img/gone.svg does not exist',
      'docs/setup.md:11: #missing-here: no such heading',
      'docs/setup.md:13: ./nothing.md: docs/nothing.md does not exist',
      'examples/a/README.md:3: ../../../elsewhere.md: points outside the repository',
    ]);
    assert.deepStrictEqual(r.external, [
      'README.md:8: https://example.com/a',
      'README.md:8: https://example.org/b',
      'README.md:8: http://localhost:8080/',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the command prints one line per problem and exits 1, or exits 0 on a clean tree', function () {
  var root = fixture();
  try {
    var bad = cp.spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.strictEqual(bad.stdout.split('\n').filter(function (l) { return /^\S+:\d+: /.test(l); }).length, 7);
    assert.match(bad.stdout, /external URLs \(not fetched\): 3/);

    fs.writeFileSync(path.join(root, 'README.md'), '# P\n\n[setup](docs/setup.md#install-it)\n');
    fs.writeFileSync(path.join(root, 'docs/setup.md'), '# Setup\n\n## Install it\n');
    fs.writeFileSync(path.join(root, 'docs/faq.md'), '# FAQ\n');
    fs.writeFileSync(path.join(root, 'examples/a/README.md'), '# A\n');
    var ok = cp.spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.strictEqual(ok.status, 0, ok.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the repository docs and examples have no broken relative links', function () {
  var r = cl.checkAll();
  assert.deepStrictEqual(r.problems, []);   // README included: a broken link in it must fail this test too
});
