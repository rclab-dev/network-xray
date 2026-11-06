// check-doc-commands.test.js — the commands in README.md, docs/**/*.md, examples/**/README.md must name
// scripts that exist and use options they parse (scripts/check-doc-commands.js), on a small temporary tree
// and on the repository itself.
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var cd = require('../scripts/check-doc-commands.js');

var SCRIPT = path.join(__dirname, '..', 'scripts', 'check-doc-commands.js');

function tree(files) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-doc-commands-'));
  Object.keys(files).forEach(function (rel) {
    var abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  });
  return root;
}

var XRAY_SH = [
  '#!/usr/bin/env bash',
  '# usage: ./xray.sh [--bind <a>] [--interval <s>] [--check]   (--ghost is only in this comment)',
  'while [ $# -gt 0 ]; do',
  '  case "$1" in',
  '    -h|--help) usage; exit 0 ;;',
  '    --check) CHECK=1; shift ;;',
  '    --bind|--interval) shift 2 ;;',
  '    --bind=*) BIND="${1#--bind=}"; shift ;;',
  '    -?*) echo "unknown option: $1"; exit 2 ;;',
  '    *) break ;;',
  '  esac',
  'done',
  'if [ "$1" = --attach ]; then ATTACH=1; fi',
  '',
].join('\n');

var TOOL_JS = [
  "// tool.js --old was removed; '--legacy' is only named in this comment",
  'var argv = process.argv.slice(2);',
  "for (var i = 0; i < argv.length; i++) {",
  "  if (argv[i] === '--watch') watch = true;",
  "  else if (argv[i] === '--out') out = argv[++i];",
  "  else if (/^--format=/.test(argv[i])) format = argv[i].slice(9);",
  '}',
  "console.log('usage: node tool.js [--watch] [--out f] [--documented-only]');",
  '',
].join('\n');

var MAP_JS = [
  'function _argMap(argv) { return {}; }',
  "var a = { stray: 1 }; a.notAnOption = 2;",
  'var a = _argMap(process.argv.slice(2));',
  "if (a['self-test']) selfTest(); else if (a.node) run(a.node, a['from-dir']);",
  '',
].join('\n');

var CLI_JS = [
  'function _cliCheck(argv, known, flags) { return {}; }',
  "var _cli = _cliCheck(process.argv.slice(2), ['lab', 'node', 'exclude-mgmt'], ['exclude-mgmt']);",
  '',
].join('\n');

var ENTRY_SH = [
  '#!/usr/bin/env bash',
  'while [ $# -gt 0 ]; do',
  '  case "$1" in',
  '    --topo|--port) [ $# -ge 2 ] || exit 2 ;;',
  '  esac',
  '  case "$1" in',
  '    --topo) TOPO="$2"; shift ;;',
  '    --port) PORT="$2"; shift ;;',
  '    -h|--help) usage; exit 0 ;;',
  '    *) exit 2 ;;',
  '  esac',
  '  shift',
  'done',
  '',
].join('\n');

function fixture() {
  return tree({
    'xray.sh': XRAY_SH,
    'tool.js': TOOL_JS,
    'scripts/map.js': MAP_JS,
    'cli.js': CLI_JS,
    'docker/entrypoint.sh': ENTRY_SH,
    'README.md': [
      '# Project',                                                                     // 1
      '',                                                                              // 2
      '```sh',                                                                         // 3
      './xray.sh --bind 127.0.0.1 --check lab.clab.yml 8081',                         // 4 ok
      '$ ./xray.sh --port 8081 lab.clab.yml   # --nope in a comment is not checked',  // 5 --port
      'sudo ./xray.sh --attach \\',                                                    // 6 continued:
      '  --verbose lab.clab.yml',                                                      // 7 --verbose (reported on 6)
      'node tool.js --watch --out x.json | node scripts/map.js --self-test --node r1',  // 8 ok
      'node tool.js --format=json --out=x.json --documented-only',                     // 9 --out= and --documented-only
      'node scripts/missing.js --x',                                                   // 10 missing script
      'docker run --rm --name network-xray -p 8600:8600 ghcr.io/acme/network-xray:1 --topo /lab/a.yml --proto bgp',   // 11 --proto
      'node --test && node -e "require(\'./gone.js\')"',                               // 12 not a script run
      '```',                                                                           // 13
      '',                                                                              // 14
      '```yaml',                                                                       // 15
      'cmd: ./xray.sh --not-shell',                                                    // 16 not a shell block
      '```',                                                                           // 17
      '',                                                                              // 18
      'Use `./xray.sh --bind=::1 lab` or `<network-xray>/tool.js --legacy`; `xray.sh` alone is fine.',  // 19 --legacy
      'Also `node /path/to/network-xray/scripts/map.js --notAnOption` and `node /usr/lib/x/other.js --any`.',  // 20
      '',
    ].join('\n'),
    'docs/guide.md': [
      '# Guide',
      '',
      '    ```bash',
      '    node cli.js --lab l --node r1 --exclude-mgmt --mgmt-subnet 10.0.0.0/24',
      '    ```',
      '',
      'Run `xray.sh --interval 3` or `node scripts/map.js --from-dir d --stray`.',
      '',
    ].join('\n'),
    'examples/a/README.md': [
      '# A',
      '',
      '```',
      'node ../../tool.js --watch',
      '../../xray.sh --check',
      'node ../tool.js --watch',
      '```',
      '',
    ].join('\n'),
    'examples/a/notes.md': '`./xray.sh --not-scanned`\n',
  });
}

test('reads the options each kind of script parses (and not those only in comments or help text)', function () {
  var sh = cd.shOptions(XRAY_SH);
  assert.deepStrictEqual(Array.from(sh.names).sort(), ['--attach', '--bind', '--check', '--help', '--interval']);
  assert.deepStrictEqual(Array.from(sh.eq), ['--bind']);
  var js = cd.jsOptions(TOOL_JS);
  assert.deepStrictEqual(Array.from(js.names).sort(), ['--out', '--watch']);
  assert.deepStrictEqual(Array.from(js.eq), ['--format']);
  assert.deepStrictEqual(Array.from(cd.jsOptions(MAP_JS).names).sort(), ['--from-dir', '--node', '--self-test']);
  assert.deepStrictEqual(Array.from(cd.jsOptions(CLI_JS).names).sort(), ['--exclude-mgmt', '--lab', '--node']);
});

test('reports each missing script and unknown option with file:line', function () {
  var root = fixture();
  try {
    assert.deepStrictEqual(cd.checkAll(root), [
      'README.md:5: ./xray.sh: unknown option --port (not parsed by xray.sh)',
      'README.md:6: ./xray.sh: unknown option --verbose (not parsed by xray.sh)',
      'README.md:9: tool.js: --out=<value> form not parsed by tool.js (use --out <value>)',
      'README.md:9: tool.js: unknown option --documented-only (not parsed by tool.js)',
      'README.md:10: scripts/missing.js: script not found (scripts/missing.js)',
      'README.md:11: docker run ghcr.io/acme/network-xray:1: unknown option --proto (not parsed by docker/entrypoint.sh)',
      'README.md:19: <network-xray>/tool.js: unknown option --legacy (not parsed by tool.js)',
      'README.md:20: /path/to/network-xray/scripts/map.js: unknown option --notAnOption (not parsed by scripts/map.js)',
      'docs/guide.md:4: cli.js: unknown option --mgmt-subnet (not parsed by cli.js)',
      'docs/guide.md:7: scripts/map.js: unknown option --stray (not parsed by scripts/map.js)',
      'examples/a/README.md:6: ../tool.js: script not found (../tool.js)',
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
    assert.strictEqual(bad.stdout.split('\n').filter(function (l) { return /^\S+:\d+: /.test(l); }).length, 11);

    fs.writeFileSync(path.join(root, 'README.md'), '# P\n\n```sh\n./xray.sh --check lab.yml\nnode tool.js --watch\n```\n');
    fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Guide\n\n`node cli.js --lab l --node r1`\n');
    fs.writeFileSync(path.join(root, 'examples/a/README.md'), '# A\n\n`node ../../tool.js --out f`\n');
    var ok = cp.spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.strictEqual(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /check-doc-commands: OK/);

    var opt = cp.spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
    assert.strictEqual(opt.status, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the repository docs and examples show only commands the scripts accept', function () {
  assert.deepStrictEqual(cd.checkAll(), []);   // README included: a mismatch in it must fail this test too
});

test('a script named but not run (echo / grep) and a quoted option value are not checked; a real run still is', function () {
  var root = tree({
    'xray.sh': XRAY_SH,
    'tool.js': "var a = process.argv; if (a.indexOf('--out') >= 0) {}\n",
    'README.md': ['# t', '', '```sh',
      'echo ./xray.sh --bogus',
      'grep xray.sh --line-number README.md',
      'node tool.js --out "--literal"',
      'sudo NX=1 ./xray.sh --nope',
      '```', ''].join('\n')
  });
  try {
    assert.deepStrictEqual(cd.checkAll(root), ['README.md:7: ./xray.sh: unknown option --nope (not parsed by xray.sh)'], 'echo / grep are not a run of the script');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
