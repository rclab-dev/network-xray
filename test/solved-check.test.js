'use strict';
// solved-check.js: evaluates a lab's problem.json `check` against collected states.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const chk = require(path.join(__dirname, '..', 'solved-check.js'));

const P = (all, extra) => Object.assign({ format: 'network-xray-lab/0', check: { all } }, extra || {});

test('nothing to judge -> defined:false', () => {
  for (const p of [null, {}, { check: {} }, { check: { all: [] } }, { check: { all: 'x' } }]) {
    assert.deepStrictEqual(chk.evaluate(p, {}), { defined: false, ok: false, results: [] });
  }
});

test('an unsupported format is not evaluated', () => {
  const r = chk.evaluate(P([['r1', 'x', 'eq', 1]], { format: 'network-xray-lab/9' }), { r1: { x: 1 } });
  assert.strictEqual(r.defined, false);
  // no format at all is accepted
  assert.strictEqual(chk.evaluate({ check: { all: [['r1', 'x', 'eq', 1]] } }, { r1: { x: 1 } }).ok, true);
});

test('scalar operators', () => {
  const st = { r1: { n: 5, s: 'Full', z: null, nested: { a: { b: 2 } } } };
  const cases = [
    [['r1', 'n', 'eq', 5], true], [['r1', 'n', 'eq', '5'], false],
    [['r1', 's', 'ne', 'Down'], true],
    [['r1', 'n', 'gt', 4], true], [['r1', 'n', 'gt', 5], false],
    [['r1', 'n', 'ge', 5], true], [['r1', 'n', 'lt', 6], true], [['r1', 'n', 'le', 4], false],
    [['r1', 's', 'gt', 1], false],                               // non-number never compares
    [['r1', 'n', 'lt', 'x'], false],
    [['r1', 's', 'in', ['Full', '2-Way']], true], [['r1', 's', 'in', 'Full'], false],
    [['r1', 'nested.a.b', 'eq', 2], true], [['r1', 'nested.x.b', 'absent'], true],
    [['r1', 'z', 'exists'], false], [['r1', 'z', 'absent'], true], [['r1', 'n', 'exists'], true],
    [['r1', '', 'exists'], true],                                // empty path = the whole state
  ];
  for (const [c, want] of cases) {
    assert.strictEqual(chk.evaluate(P([c]), st).ok, want, JSON.stringify(c));
  }
});

test('{placeholders} in paths are filled from the state; a missing one never matches', () => {
  const st = { r1: { peer_node: 'r2', r2_has_full: true } };
  assert.strictEqual(chk.evaluate(P([['r1', '{peer_node}_has_full', 'eq', true]]), st).ok, true);
  assert.strictEqual(chk.evaluate(P([['r1', '{nope}_has_full', 'absent']]), st).ok, true);
  assert.strictEqual(chk.evaluate(P([['r1', '{nope}_has_full', 'exists']]), st).ok, false);
});

test('list operators: some / none / count_ge with per-item placeholders', () => {
  const st = { r1: { routes: [
    { prefix: '10.0.0.0/24', proto: 'ospf', selected: true, via: 'r2', r2: 'yes' },
    { prefix: '10.0.1.0/24', proto: 'bgp', selected: false },
    { prefix: '10.0.2.0/24', proto: 'ospf', selected: true },
  ] } };
  const ok = (c) => chk.evaluate(P([c]), st).ok;
  assert.strictEqual(ok(['r1', 'routes', 'some', [['proto', 'eq', 'bgp']]]), true);
  assert.strictEqual(ok(['r1', 'routes', 'some', [['proto', 'eq', 'isis']]]), false);
  assert.strictEqual(ok(['r1', 'routes', 'none', [['proto', 'eq', 'isis']]]), true);
  assert.strictEqual(ok(['r1', 'routes', 'count_ge', [2, [['proto', 'eq', 'ospf'], ['selected', 'eq', true]]]]), true);
  assert.strictEqual(ok(['r1', 'routes', 'count_ge', [3, [['proto', 'eq', 'ospf']]]]), false);
  assert.strictEqual(ok(['r1', 'routes', 'some', [['{via}', 'eq', 'yes']]]), true);
  // not a list: none is vacuously true, the others false
  assert.strictEqual(ok(['r1', 'missing', 'none', [['a', 'eq', 1]]]), true);
  assert.strictEqual(ok(['r1', 'missing', 'some', [['a', 'eq', 1]]]), false);
  assert.strictEqual(ok(['r1', 'missing', 'count_ge', [0, []]]), false);
});

test('broken conditions are not satisfied (never throw)', () => {
  const st = { r1: { routes: [{ a: 1 }], n: 1 } };
  const r = chk.evaluate(P([
    ['r1', 'n'],                                    // too short
    'not-a-list',
    ['r1', 'n', 'regex', '.*'],                     // unknown op
    ['r1', 'routes', 'some', 'x'],                  // conditions not a list
    ['r1', 'routes', 'some', [['a']]],              // broken item condition
    ['r1', 'routes', 'some', [['a', 'bogus', 1]]],  // unknown op inside an item
    ['r1', 'routes', 'count_ge', ['x', [['a', 'eq', 1]]]],   // count not a number
  ]), st);
  assert.deepStrictEqual(r.results, [false, false, false, false, false, false, false]);
  assert.strictEqual(r.defined, true);
  assert.strictEqual(r.ok, false);
});

test('nodes that are missing, failed or unreadable never pass', () => {
  const c = [['r1', 'success', 'exists']];
  assert.strictEqual(chk.evaluate(P(c), {}).ok, false);
  assert.strictEqual(chk.evaluate(P(c), null).ok, false);
  assert.strictEqual(chk.evaluate(P(c), { r1: { success: false } }).ok, false);
  assert.strictEqual(chk.evaluate(P(c), { r1: { success: true, nx_unread: true } }).ok, false);
  assert.strictEqual(chk.evaluate(P(c), { r1: { success: true } }).ok, true);
});

test('tracker: solved only after N consecutive passes; a failure resets the streak', () => {
  const p = P([['r1', 'x', 'eq', 1]]);
  const tr = chk.tracker();
  assert.strictEqual(tr(p, { r1: { x: 1 } }).solved, false);
  assert.strictEqual(tr(p, { r1: { x: 1 } }).solved, true);
  assert.strictEqual(tr(p, { r1: { x: 0 } }).solved, false);
  assert.strictEqual(tr(p, { r1: { x: 1 } }).solved, false);
  assert.strictEqual(tr(p, { r1: { x: 1 } }).solved, true);
  const t1 = chk.tracker(1);
  assert.strictEqual(t1(p, { r1: { x: 1 } }).solved, true);
  assert.strictEqual(t1({}, { r1: { x: 1 } }).solved, false);   // undefined check is never solved
  assert.ok(chk.OPS.includes('count_ge'));
});
