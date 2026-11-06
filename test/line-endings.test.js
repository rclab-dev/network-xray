// line-endings.test.js — tracked text files must use LF line endings (no CR characters),
// and .gitattributes must pin eol=lf for the main text file types.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');

var TEXT_EXT = [
  '.sh', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md',
  '.html', '.css', '.svg', '.txt', '.conf', '.cfg'
];
var TEXT_NAMES = ['Dockerfile', 'daemons', 'LICENSE', '.gitignore', '.dockerignore', '.gitattributes'];

function isText(rel) {
  var base = path.posix.basename(rel);
  return TEXT_NAMES.indexOf(base) !== -1 || TEXT_EXT.indexOf(path.posix.extname(rel).toLowerCase()) !== -1;
}

function trackedFiles() {
  try {
    var out = cp.execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024
    });
    return out.split('\0').filter(Boolean);
  } catch (e) {
    return null;
  }
}

var files = trackedFiles();

test('tracked text files contain no CR characters', { skip: files ? false : 'not a git checkout' }, function () {
  var bad = [];
  files.filter(isText).forEach(function (rel) {
    var abs = path.join(ROOT, rel);
    var buf;
    try { buf = fs.readFileSync(abs); } catch (e) { return; } // deleted in working tree
    var n = 0;
    for (var i = 0; i < buf.length; i++) if (buf[i] === 0x0d) n++;
    if (n) bad.push(rel + ' (' + n + ' CR)');
  });
  assert.deepStrictEqual(bad, [],
    'These tracked text files contain CR characters; convert them to LF line endings:\n  ' +
    bad.join('\n  '));
});

test('.gitattributes pins eol=lf for shell, JS, YAML, Markdown and JSON', function () {
  var src = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.ok(src.indexOf('\r') === -1, '.gitattributes itself must use LF line endings');
  var lines = src.split('\n').map(function (l) { return l.trim(); })
    .filter(function (l) { return l && l[0] !== '#'; });
  var missing = ['*.sh', '*.js', '*.yml', '*.yaml', '*.md', '*.json'].filter(function (pat) {
    return !lines.some(function (l) {
      var parts = l.split(/\s+/);
      return parts[0] === pat && parts.indexOf('eol=lf') !== -1;
    });
  });
  assert.deepStrictEqual(missing, [], '.gitattributes lacks "eol=lf" for: ' + missing.join(', '));
});
