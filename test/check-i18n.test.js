'use strict';
// scripts/check-i18n.js: the repo passes, and each kind of gap (missing key, missing language,
// mismatched placeholders) makes it fail.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-i18n.js');
const FILES = ['xray-graph.html', 'xray-graph-nextui.html', 'decision-bracket.html', 'xray-i18n.js',
  'xray-core.js', 'xray-api.js', 'clab-xray-bridge.js', 'xray-skin.js', 'xray-unified.js',
  'xray-node-panel.js', 'xray-topo-overlay.js'];

function run(root) {
  const env = Object.assign({}, process.env);
  if (root) env.CHECK_I18N_ROOT = root; else delete env.CHECK_I18N_ROOT;
  const r = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8', timeout: 60000 });
  if (r.error) throw r.error;   // e.g. the time limit
  return { code: r.status, out: r.stdout + r.stderr };
}

// copy of the checked files with one edit applied; returns the checker result
function runEdited(file, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-i18n-'));
  try {
    FILES.forEach((f) => { if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); });
    const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8');
    assert.ok(src.includes(from), file + ' should contain ' + JSON.stringify(from));
    fs.writeFileSync(p, src.replace(from, to));
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('check-i18n: repo passes', () => {
  const r = run();
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /check-i18n: OK/);
});

test('check-i18n: unchanged copy passes', () => {
  const r = runEdited('decision-bracket.html', "rid:'Router ID'", "rid:'Router ID'");
  assert.strictEqual(r.code, 0, r.out);
});

test('check-i18n: key missing in ja fails', () => {
  const r = runEdited('decision-bracket.html', "routeA:'経路A', ", '');
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /"routeA" is in en but not in ja/);
  assert.match(r.out, /T\.routeA has no Japanese entry/);
});

test('check-i18n: key missing in en fails', () => {
  const r = runEdited('decision-bracket.html', "routeA:'Path A', ", '');
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /"routeA" is in ja but not in en/);
});

test('check-i18n: mismatched {placeholder} in a page table fails', () => {
  const r = runEdited('decision-bracket.html', '（{a} {op} {b}）', '（{a} {op}）');
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /"why" placeholders differ/);
});

test('check-i18n: mismatched %s in the engine dictionary fails', () => {
  const r = runEdited('xray-i18n.js', '"(直通)": "(direct)"', '"(直通)": "(direct %s)"');
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /placeholders differ: ja \(none\) \/ en %s/);
});

test('check-i18n: inline { en, ja } pair missing a side fails', () => {
  const r = runEdited('clab-xray-bridge.js', "SYNTHETIC_TAG = { en: '(sample)', ja: '(見本)' }", "SYNTHETIC_TAG = { en: '(sample)' }");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /\{ en: … \} has no ja text/);
});

test('check-i18n: inline pair using an outside name is still checked', () => {
  // xray-graph-nextui.html: cta = { en: { t: pj.cta_label_en || …, u: url + … }, ja: { … } } (pj / url come from outside)
  const r = runEdited('xray-graph-nextui.html', "ja: { t: pj.cta_label_ja ||", "jx: { t: pj.cta_label_ja ||");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /has no ja text/);
});

test('check-i18n: an inline pair that cannot be evaluated fails (not skipped)', () => {
  const r = runEdited('xray-topo-overlay.js', "  'use strict';", "  'use strict'; var zz = { en: 'a', ja: 'b' + };");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /could not be checked/);
});

test('check-i18n: a brace inside a string does not hide a pair', () => {
  const r = runEdited('xray-topo-overlay.js', "  'use strict';", "  'use strict'; var zz = { t: '}', en: 'a', ja: '' };");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /has no Japanese text/);
});

test('check-i18n: a pair in a comment or a string is not checked', () => {
  const r = runEdited('xray-topo-overlay.js', "  'use strict';", "  'use strict'; // e.g. { en: 'x' }\n  var zz = \"{ ja: 'y' }\";");
  assert.strictEqual(r.code, 0, r.out);
});

test('check-i18n: a language choice whose branch goes on is not taken as a plain pick', () => {
  const r = runEdited('xray-topo-overlay.js', "  'use strict';", "  'use strict'; var zz = function (ja, x) { return ja ? 'あ {n}' : 'a' || '{n}'; };");
  assert.strictEqual(r.code, 0, r.out);
});

test('check-i18n: inline pair with different nested keys fails', () => {
  const r = runEdited('clab-xray-bridge.js', "paste: 'トポロジ", "pasted: 'トポロジ");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /\.paste is in en but not in ja/);
});

test('check-i18n: language ternary with mismatched placeholders fails', () => {
  const r = runEdited('xray-api.js', "'See all decision steps' : '判定の全ステップを見る'",
    "'See all {n} decision steps' : '判定の全ステップを見る'");
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /language choice placeholders differ/);
});
