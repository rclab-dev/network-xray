'use strict';
// Synthesized vs collected: the decision the graph pages use to show the "Example state" badge and to draw
// adjacencies as unknown (clab-xray-bridge.js isSynthesizedState).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const bridge = require(path.join(__dirname, '..', 'clab-xray-bridge.js'));
const isSynth = bridge.isSynthesizedState;

test('no collected states at all -> synthesized', () => {
  assert.strictEqual(isSynth(undefined, 'r1'), true);
  assert.strictEqual(isSynth(null, 'r1'), true);
  assert.strictEqual(isSynth({}, 'r1'), true);   // xray-states.js as shipped: window.LIVE_STATES = {};
  assert.strictEqual(isSynth('not an object', 'r1'), true);
});

test('collected state for the node -> not synthesized', () => {
  const live = { r1: { success: true, target_node: 'r1', r2_has_full: true } };
  assert.strictEqual(isSynth(live, 'r1'), false);
});

test('collected states for other nodes only -> this node is synthesized', () => {
  const live = { r2: { success: true } };
  assert.strictEqual(isSynth(live, 'r1'), true);
  assert.strictEqual(isSynth(live, 'r2'), false);
});

test('a missing or empty entry counts as not collected', () => {
  assert.strictEqual(isSynth({ r1: null }, 'r1'), true);
  assert.strictEqual(isSynth({ r1: undefined }, 'r1'), true);
});

test('a collected entry that marks the router unread is still collected (the page shows its own note)', () => {
  assert.strictEqual(isSynth({ r1: { nx_unread: 'timeout', success: false } }, 'r1'), false);
});

test('badge: what it is / what is not real / how to see the real state (graph and paste page)', () => {
  const B = bridge.SYNTHETIC_BADGE;
  assert.strictEqual(B.en.title, 'Sample view — not connected to the routers');
  assert.strictEqual(B.ja.title, '見本の図 — ルータにはつないでいません');
  for (const l of ['en', 'ja']) for (const v of ['body', 'paste']) assert.match(B[l][v], /xray\.sh/);
  assert.match(B.en.paste, /never connects to routers/);
  // the words the owner could not read are not used
  for (const l of ['en', 'ja']) for (const k of ['title', 'body', 'paste']) assert.doesNotMatch(B[l][k], /collector|read from|読/);
  assert.strictEqual(bridge.SYNTHETIC_TAG.en, '(sample)');
  assert.strictEqual(bridge.SYNTHETIC_TAG.ja, '(見本)');
});

test('markSynthetic does nothing without a page (node)', () => {
  assert.doesNotThrow(() => bridge.markSynthetic(true, 'ja'));
});
