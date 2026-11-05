'use strict';
// The RECORDED REPLAY bar on the static demo pages (demo/replay-bar.js): frame stepping, autoplay
// timing, pause, end-of-replay flag and the keyboard filter.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const bar = require(path.join(__dirname, '..', 'demo', 'replay-bar.js'));

function fakeTimers() {
  const t = { pending: null, delays: [] };
  t.setTimeout = (fn, ms) => { t.pending = fn; t.delays.push(ms); return 1; };
  t.clearTimeout = () => { t.pending = null; };
  t.fire = () => { const f = t.pending; t.pending = null; f(); };
  return t;
}
function make(count, dwell) {
  const seen = [];
  const t = fakeTimers();
  const ctl = bar.createReplay({ count, dwell, onFrame: (i, auto) => seen.push([i, auto]),
    setTimeout: t.setTimeout, clearTimeout: t.clearTimeout });
  return { ctl, t, seen };
}

test('autoplay advances, wraps, and uses per-frame dwell', () => {
  const { ctl, t, seen } = make(3, [100, 200, 300]);
  ctl.start();
  assert.deepStrictEqual(seen, [[0, false]]);
  t.fire(); t.fire(); t.fire();
  assert.deepStrictEqual(seen.map(s => s[0]), [0, 1, 2, 0]);
  assert.ok(seen.slice(1).every(s => s[1] === true));
  assert.deepStrictEqual(t.delays, [100, 200, 300, 100]);
});

test('prev / next / go wrap around and restart the dwell', () => {
  const { ctl, t } = make(4, 2600);
  ctl.start();
  ctl.prev();
  assert.strictEqual(ctl.state.i, 3);
  ctl.next();
  assert.strictEqual(ctl.state.i, 0);
  ctl.go(2);
  assert.strictEqual(ctl.state.i, 2);
  assert.strictEqual(t.delays.length, 4);   // start + three manual steps each re-arm the timer
});

test('pause stops autoplay; manual steps still work; play resumes', () => {
  const { ctl, t } = make(3, 1000);
  ctl.start();
  assert.strictEqual(ctl.toggle(), true);
  assert.strictEqual(t.pending, null);
  ctl.next();
  assert.strictEqual(ctl.state.i, 1);
  assert.strictEqual(t.pending, null);
  assert.strictEqual(ctl.toggle(), false);
  t.fire();
  assert.strictEqual(ctl.state.i, 2);
});

test('controls before start step frames but do not start autoplay', () => {
  const { ctl, t } = make(3, 1000);
  ctl.next();
  assert.strictEqual(ctl.state.i, 1);
  assert.strictEqual(t.pending, null);
});

test('seenEnd turns on once the last frame is shown, and stays on', () => {
  const { ctl, t } = make(3, 1000);
  ctl.start();
  assert.strictEqual(ctl.state.seenEnd, false);
  t.fire(); assert.strictEqual(ctl.state.seenEnd, false);
  t.fire(); assert.strictEqual(ctl.state.seenEnd, true);
  t.fire(); assert.strictEqual(ctl.state.seenEnd, true);
  const b = make(4, 1000);
  b.ctl.go(3);
  assert.strictEqual(b.ctl.state.seenEnd, true);
});

test('keyAction maps arrows and Space, but not in inputs or with modifiers', () => {
  const k = (key, tagName, extra) => bar.keyAction(Object.assign({ key, target: { tagName } }, extra));
  assert.strictEqual(k('ArrowLeft', 'BODY'), 'prev');
  assert.strictEqual(k('ArrowRight', 'DIV'), 'next');
  assert.strictEqual(k(' ', 'BODY'), 'toggle');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
    assert.strictEqual(k('ArrowLeft', tag), null);
    assert.strictEqual(k(' ', tag), null);
  }
  assert.strictEqual(k(' ', 'DIV', { target: { tagName: 'DIV', isContentEditable: true } }), null);
  assert.strictEqual(k(' ', 'BUTTON'), null);       // the browser already clicks a focused button
  assert.strictEqual(k(' ', 'A'), null);
  assert.strictEqual(k('ArrowRight', 'BUTTON'), 'next');
  assert.strictEqual(k('ArrowLeft', 'BODY', { altKey: true }), null);
  assert.strictEqual(k('ArrowLeft', 'BODY', { metaKey: true }), null);
  assert.strictEqual(k('ArrowLeft', 'BODY', { defaultPrevented: true }), null);
  assert.strictEqual(k('a', 'BODY'), null);
  assert.strictEqual(bar.keyAction(null), null);
});

test('every demo page with the replay bar loads replay-bar.js and has the controls', () => {
  const dir = path.join(__dirname, '..', 'demo');
  const pages = fs.readdirSync(dir).filter(f => f.endsWith('.html'))
    .filter(f => fs.readFileSync(path.join(dir, f), 'utf8').includes('id="replaybar"'));
  assert.ok(pages.length >= 3, 'expected the replay demo pages');
  for (const f of pages) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(html.includes('<script src="replay-bar.js"></script>'), f + ': loads replay-bar.js');
    for (const id of ['rb-prev', 'rb-toggle', 'rb-next', 'rb-dots', 'rb-i', 'rb-st'])
      assert.ok(html.includes('id="' + id + '"'), f + ': has #' + id);
    assert.strictEqual((html.match(/xrayReplayBar\.mount\(/g) || []).length, 1, f + ': mounts once');
  }
});

test('dwell left out: autoplay waits the default 2600 ms instead of throwing', () => {
  const { ctl, t } = make(2, undefined);
  ctl.start();
  assert.deepStrictEqual(t.delays, [2600]);
});

test('Shift+Space and Shift+arrows are left to the browser (modifier held)', () => {
  const ev = (key, extra) => Object.assign({ key, target: { tagName: 'BODY' } }, extra);
  assert.strictEqual(bar.keyAction(ev(' ', { shiftKey: true })), null);
  assert.strictEqual(bar.keyAction(ev('ArrowLeft', { shiftKey: true })), null);
  assert.strictEqual(bar.keyAction(ev(' ')), 'toggle');
});
