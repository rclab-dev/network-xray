'use strict';
// Checks the CCNA OSPF adjacency walkthrough (ccna-ospf.html + ccna-data.js)
// against the neighbor state machine of RFC 2328 section 10.1 (states) and 10.3 (transitions).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'ccna-ospf.html'), 'utf8');

function loadData() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'ccna-data.js'), 'utf8'), sandbox);
  return sandbox.window;
}
const W = loadData();

// RFC 2328 10.1 neighbor states.
const RFC_STATES = ['Down', 'Attempt', 'Init', '2-Way', 'ExStart', 'Exchange', 'Loading', 'Full'];

// RFC 2328 10.3 state-changing transitions: [from, event, to]. "*" = any state.
// ">=2-Way" / ">=ExStart" / ">=Exchange" expand to the states at or above.
const RFC_TRANSITIONS = [
  ['Down', 'Start', 'Attempt'],                 // NBMA only
  ['Attempt', 'HelloReceived', 'Init'],
  ['Down', 'HelloReceived', 'Init'],
  ['Init', '2-WayReceived', '2-Way'],           // adjacency not (yet) wanted
  ['Init', '2-WayReceived', 'ExStart'],         // adjacency wanted
  ['2-Way', 'AdjOK?', 'ExStart'],               // e.g. after DR/BDR election
  ['ExStart', 'NegotiationDone', 'Exchange'],
  ['Exchange', 'ExchangeDone', 'Loading'],      // link state request list not empty
  ['Exchange', 'ExchangeDone', 'Full'],         // request list empty
  ['Loading', 'LoadingDone', 'Full'],
  ['>=ExStart', 'AdjOK?', '2-Way'],             // adjacency no longer wanted
  ['>=Exchange', 'SeqNumberMismatch', 'ExStart'],
  ['>=Exchange', 'BadLSReq', 'ExStart'],
  ['>=2-Way', '1-WayReceived', 'Init'],
  ['*', 'KillNbr', 'Down'],
  ['*', 'LLDown', 'Down'],
  ['*', 'InactivityTimer', 'Down']
];

function fromMatches(spec, state) {
  if (spec === '*') return true;
  if (spec.startsWith('>=')) return RFC_STATES.indexOf(state) >= RFC_STATES.indexOf(spec.slice(2));
  return spec === state;
}
function isRfcTransition(from, event, to) {
  return RFC_TRANSITIONS.some(([f, e, t]) => e === event && t === to && fromMatches(f, from));
}

// Step buttons in the order the page shows them.
const BUTTONS = [...HTML.matchAll(/<button([^>]*)data-s="([a-z0-9]+)"[^>]*>([^<]+)<\/button>/g)]
  .map((m) => ({ key: m[2], label: m[3].trim(), fault: /class="fault"/.test(m[1]) }));
const STEPS = BUTTONS.filter((b) => !b.fault);
const FAULTS = BUTTONS.filter((b) => b.fault);

// Each transition the walkthrough shows, with the RFC 2328 event that causes it.
// Listed in docs/dev/ospf-walkthrough-rfc.md.
const SHOWN = [
  { from: 'down', to: 'init', event: 'HelloReceived' },
  { from: 'init', to: 'twoway', event: '2-WayReceived' },
  { from: 'twoway', to: 'exstart', event: 'AdjOK?' },
  { from: 'exstart', to: 'exchange', event: 'NegotiationDone' },
  { from: 'exchange', to: 'loading', event: 'ExchangeDone' },
  { from: 'loading', to: 'full', event: 'LoadingDone' },
  { from: 'full', to: 'linkdown', event: 'KillNbr' } // interface down -> KillNbr (LLDown also valid)
];

test('walkthrough data and buttons are present', () => {
  assert.ok(W.CCNA_STATES && W.CCNA_DESC, 'ccna-data.js defines CCNA_STATES and CCNA_DESC');
  assert.ok(STEPS.length >= 6, 'step buttons found in ccna-ospf.html');
  for (const b of BUTTONS) {
    assert.ok(W.CCNA_STATES[b.key], `button ${b.key} has a state`);
    assert.ok(W.CCNA_DESC[b.key], `button ${b.key} has a caption`);
  }
});

test('every shown neighbor_state is an RFC 2328 10.1 state name and matches its button', () => {
  for (const b of BUTTONS) {
    const ns = W.CCNA_STATES[b.key].neighbor_state;
    assert.ok(RFC_STATES.includes(ns), `${b.key}: "${ns}" is an RFC 2328 state`);
    if (!b.fault) assert.strictEqual(b.label, ns, `button label "${b.label}" = neighbor_state "${ns}"`);
    assert.ok(W.CCNA_DESC[b.key].startsWith(b.fault ? 'Link Down' : ns), `${b.key}: caption starts with the state name`);
  }
});

test('normal adjacency order is Down, Init, [2-Way], ExStart, Exchange, Loading, Full', () => {
  const order = STEPS.map((b) => W.CCNA_STATES[b.key].neighbor_state);
  const without2Way = order.filter((s) => s !== '2-Way');
  assert.deepStrictEqual(without2Way, ['Down', 'Init', 'ExStart', 'Exchange', 'Loading', 'Full']);
  // 2-Way, if shown, may only sit between Init and ExStart (broadcast/NBMA: wait for DR/BDR election).
  const i = order.indexOf('2-Way');
  if (i >= 0) {
    assert.strictEqual(order[i - 1], 'Init');
    assert.strictEqual(order[i + 1], 'ExStart');
    assert.match(W.CCNA_DESC.twoway, /DROther/, '2-Way caption says DROther-DROther pairs stay in 2-Way');
    assert.match(W.CCNA_DESC.twoway, /AdjOK\?/, '2-Way caption names the AdjOK? decision');
  }
});

test('the SHOWN table covers exactly the transitions the page steps through', () => {
  const pairs = [];
  for (let i = 1; i < STEPS.length; i++) pairs.push(`${STEPS[i - 1].key}>${STEPS[i].key}`);
  for (const f of FAULTS) pairs.push(`full>${f.key}`);
  assert.deepStrictEqual(SHOWN.map((t) => `${t.from}>${t.to}`), pairs);
});

test('every shown transition is a valid RFC 2328 10.3 (state, event, next state)', () => {
  for (const t of SHOWN) {
    const from = W.CCNA_STATES[t.from].neighbor_state;
    const to = W.CCNA_STATES[t.to].neighbor_state;
    assert.ok(isRfcTransition(from, t.event, to), `${from} --${t.event}--> ${to}`);
  }
});

test('fault step (link down) is valid from every shown state', () => {
  for (const f of FAULTS) {
    const to = W.CCNA_STATES[f.key].neighbor_state;
    assert.strictEqual(to, 'Down');
    assert.strictEqual(W.CCNA_STATES[f.key].interfaces.eth0.up, false);
    for (const b of STEPS) {
      const from = W.CCNA_STATES[b.key].neighbor_state;
      assert.ok(isRfcTransition(from, 'KillNbr', to) && isRfcTransition(from, 'LLDown', to), `${from} -> Down`);
    }
  }
});

test('invalid shortcuts are rejected by the RFC table (self-check)', () => {
  assert.ok(!isRfcTransition('Down', 'HelloReceived', '2-Way'));
  assert.ok(!isRfcTransition('Init', 'NegotiationDone', 'Exchange'));
  assert.ok(!isRfcTransition('ExStart', 'ExchangeDone', 'Loading'));
  assert.ok(!isRfcTransition('2-Way', 'LoadingDone', 'Full'));
  assert.ok(!isRfcTransition('Init', 'SeqNumberMismatch', 'ExStart'));
});

test('state fields agree with the RFC meaning of each state', () => {
  const S = W.CCNA_STATES;
  assert.strictEqual(S.down.peer_sending_hello, false, 'Down: nothing heard from the neighbor');
  for (const k of ['init', 'twoway', 'exstart', 'exchange', 'loading', 'full']) {
    assert.strictEqual(S[k].peer_sending_hello, true, `${k}: neighbor Hello seen`);
    assert.strictEqual(S[k].has_full, k === 'full', `${k}: has_full only at Full`);
  }
  assert.match(W.CCNA_DESC.init, /not yet appear/, 'Init: we are not in the neighbor\'s Hello yet');
  assert.match(W.CCNA_DESC.exstart, /negotiation/i, 'ExStart: Master/Slave is negotiated, not yet decided');
  assert.match(W.CCNA_DESC.exstart, /NegotiationDone/, 'ExStart: NegotiationDone leads to Exchange');
  assert.match(W.CCNA_DESC.exchange, /DBD/, 'Exchange: DBD summaries');
  assert.match(W.CCNA_DESC.loading, /LSR/, 'Loading: LS Requests');
});

test('page text: only Exchange/Loading drive the LSA gather; bidirectional indicator starts at 2-Way', () => {
  assert.ok(!/ExStart\/\s*Exchange\/Loading drive/.test(HTML), 'ExStart does not exchange LSA summaries');
  const m = HTML.match(/var biDir = \[([^\]]+)\]/);
  assert.ok(m, 'biDir list found');
  const biDir = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepStrictEqual(biDir, RFC_STATES.slice(RFC_STATES.indexOf('2-Way')));
});
