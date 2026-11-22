// embed-state-url.test.js — embed.html?state=<URL>&poll=<s>: the frame reads one JSON and draws it, with no JavaScript on the
// embedding page. Only this frame's own origin is read, or an origin listed in embed-allow.json next to embed.html.
// Run: node --test   (from the repo root; Node >= 18, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRAME_SRC = fs.readFileSync(path.join(__dirname, '..', 'xray-embed-frame.js'), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }

const CFG = { nodes: [{ id: 'r1', target: true }, { id: 'r2' }] };
const SNAP = { version: 1, config: CFG, topology: { subnets: [] }, state: { protocol: 'ospf', neighbors: [] } };

// embed.html at https://xray.example/static/embed.html?<search>; files = { url: body | {status, body, url} }
function frame(search, files) {
  const calls = [], fetched = [], intervals = [], msgs = [];
  const view = {};
  ['applyState', 'setTopology', 'setTrace', 'openDeepDive', 'openDeepDiveFor', 'closeDeepDive'].forEach((n) => { view[n] = (...a) => calls.push([n, ...a]); });
  let msgEl = null;
  const body = { firstChild: null, insertBefore(el) { msgEl = el; }, scrollHeight: 600 };
  const win = {
    location: { origin: 'https://xray.example', href: 'https://xray.example/static/embed.html' + search, search },
    URL, URLSearchParams, Promise, JSON,
    parent: null,
    document: {
      readyState: 'complete', hidden: false, body, documentElement: { scrollHeight: 640 },
      addEventListener() {}, getElementById: (id) => (id === 'nx-state-msg' ? msgEl : null),
      createElement: () => ({ style: {}, setAttribute() {}, textContent: '' }),
    },
    addEventListener() {},
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    fetch: (u, opts) => {
      fetched.push({ u, opts });
      const f = files[u];
      if (f === 'REJECT') return Promise.reject(new TypeError('Failed to fetch'));   // what fetch does on a redirect with redirect: 'error'
      if (f === undefined) return Promise.resolve({ ok: false, status: 404, url: u, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
      const o = typeof f === 'string' ? { status: 200, body: f } : f;
      return Promise.resolve({ ok: o.status === 200, status: o.status, url: o.url || u, text: () => Promise.resolve(o.body), json: () => Promise.resolve(JSON.parse(o.body)) });
    },
    xrayCore: { renderTopology: (sel, config, opts) => { calls.push(['render', sel, config, opts]); return view; } },
  };
  win.parent = win;   // standalone (no embedding page): tell() sends nothing
  win.window = win;
  vm.runInNewContext(FRAME_SRC, win);
  return { win, calls, fetched, intervals, msg: () => (msgEl ? msgEl.textContent : null) };
}

const URL_SNAP = 'https://xray.example/static/xray-snapshot.json';

test('?state=<same-origin file> is read once without cookies and drawn: render + applyState', async () => {
  const t = frame('?state=xray-snapshot.json', { [URL_SNAP]: JSON.stringify(SNAP) });
  await settle();
  assert.deepStrictEqual(t.fetched.map((f) => f.u), [URL_SNAP]);   // same origin -> embed-allow.json is not asked for
  assert.strictEqual(t.fetched[0].opts.credentials, 'omit');
  assert.deepStrictEqual(t.calls.map((c) => c[0]), ['render', 'applyState']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.calls[0][2])), CFG);
  assert.strictEqual(t.calls[1][1].protocol, 'ospf');
  assert.strictEqual(t.intervals.length, 0);   // no poll
});

test('another origin, javascript: and data: are not read; the page says why', async () => {
  for (const bad of ['https://evil.example/s.json', 'javascript:alert(1)', 'data:application/json,{}', '//evil.example/s.json']) {
    const t = frame('?state=' + encodeURIComponent(bad), {});
    await settle();
    assert.ok(!t.fetched.some((f) => f.u.indexOf('evil') >= 0 || /^(javascript|data):/.test(f.u)), bad + ': ' + JSON.stringify(t.fetched));
    assert.deepStrictEqual(t.calls, [], bad);
    assert.match(t.msg(), /reads \?state= only from its own site/, bad);
  }
});

test('embed-allow.json next to embed.html adds an origin; a link cannot', async () => {
  const other = 'https://grafana.example/api/xray.json';
  const allow = 'https://xray.example/static/embed-allow.json';
  let t = frame('?state=' + encodeURIComponent(other), { [allow]: JSON.stringify({ origins: ['https://grafana.example'] }), [other]: JSON.stringify(SNAP) });
  await settle();
  assert.deepStrictEqual(t.fetched.map((f) => f.u), [allow, other]);
  assert.deepStrictEqual(t.calls.map((c) => c[0]), ['render', 'applyState']);
  // entries that are not a bare origin are ignored
  t = frame('?state=' + encodeURIComponent(other), { [allow]: JSON.stringify({ origins: ['https://grafana.example/path', '*', 'https://a@grafana.example'] }), [other]: JSON.stringify(SNAP) });
  await settle();
  assert.deepStrictEqual(t.fetched.map((f) => f.u), [allow]);
  // an ?allow= / ?origins= in the link does nothing
  t = frame('?state=' + encodeURIComponent(other) + '&allow=https://grafana.example&origins=https://grafana.example', { [other]: JSON.stringify(SNAP) });
  await settle();
  assert.deepStrictEqual(t.calls, []);
});

test('a redirect to another origin is not drawn', async () => {
  const t = frame('?state=xray-snapshot.json', { [URL_SNAP]: { status: 200, body: JSON.stringify(SNAP), url: 'https://evil.example/x.json' } });
  await settle();
  assert.deepStrictEqual(t.calls, []);
  assert.match(t.msg(), /redirected/);
});

test('not JSON / not a network-xray file / HTTP error: nothing drawn, the reason is shown as text', async () => {
  for (const [body, re] of [['<script>alert(1)</script>', /state: /], [JSON.stringify({ config: CFG }), /version/], [{ status: 500, body: '' }, /HTTP 500/]]) {
    const t = frame('?state=xray-snapshot.json', { [URL_SNAP]: body });
    await settle();
    assert.deepStrictEqual(t.calls, []);
    assert.match(t.msg(), re);
  }
});

test('?poll= reads again every N s (2..300); the same text is not drawn again; a new state is applied without a re-render', async () => {
  const files = { [URL_SNAP]: JSON.stringify(SNAP) };
  const t = frame('?state=xray-snapshot.json&poll=0.5', files);
  await settle();
  assert.strictEqual(t.intervals.length, 1);
  assert.strictEqual(t.intervals[0].ms, 2000);   // below 2 s -> 2 s
  t.intervals[0].fn(); await settle();
  assert.deepStrictEqual(t.calls.map((c) => c[0]), ['render', 'applyState']);   // same text: nothing
  files[URL_SNAP] = JSON.stringify(Object.assign({}, SNAP, { state: { protocol: 'ospf', neighbors: [{ id: 'r2' }] } }));
  t.intervals[0].fn(); await settle();
  assert.deepStrictEqual(t.calls.map((c) => c[0]), ['render', 'applyState', 'setTopology', 'applyState']);
  files[URL_SNAP] = JSON.stringify(Object.assign({}, SNAP, { config: { nodes: [{ id: 'r1', target: true }] } }));
  t.intervals[0].fn(); await settle();
  assert.strictEqual(t.calls.filter((c) => c[0] === 'render').length, 2);   // a new config draws the picture again
  assert.strictEqual(frame('?state=x.json&poll=9999', {}).intervals[0].ms, 300000);
});

test('states per router: the target router\'s state is applied; a ?node= link opens a router with its own state, only one in the picture', async () => {
  const snap = { version: 1, config: CFG, states: { r1: { n: 1 }, r2: { n: 2 } } };
  const t = frame('?state=xray-snapshot.json', { [URL_SNAP]: JSON.stringify(snap) });
  await settle();
  assert.strictEqual(t.calls[1][0], 'applyState');
  assert.strictEqual(t.calls[1][1].n, 1);
  t.win.xrayDeepLinkOpenNode('r2');
  t.win.xrayDeepLinkOpenNode('r9');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.calls.slice(2))), [['openDeepDiveFor', 'r2', { n: 2 }]]);
});

test('embed-state-example.json (next to embed.html) is a network-xray state file: embed.html?state=embed-state-example.json', () => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'embed-state-example.json'), 'utf8'));
  assert.strictEqual(j.version, 1);
  assert.ok(Array.isArray(j.config.nodes) && j.config.nodes.some((n) => n.target));
  assert.ok(j.topology && j.trace && j.state);
});

test('no redirect is followed: both reads ask fetch to fail on a redirect (it would already reach a site that is not allowed)', async () => {
  const other = 'https://grafana.example/api/xray.json';
  const allow = 'https://xray.example/static/embed-allow.json';
  const t = frame('?state=' + encodeURIComponent(other), { [allow]: JSON.stringify({ origins: ['https://grafana.example'] }), [other]: JSON.stringify(SNAP) });
  await settle();
  assert.deepStrictEqual(t.fetched.map((f) => [f.u, f.opts.redirect, f.opts.credentials]), [[allow, 'error', 'omit'], [other, 'error', 'omit']]);
});

test('a fetch that fails (as a redirect does with redirect: error) draws nothing and says so as text', async () => {
  const t = frame('?state=xray-snapshot.json', { [URL_SNAP]: 'REJECT' });
  await settle();
  assert.deepStrictEqual(t.calls, []);
  assert.match(t.msg(), /state: Failed to fetch/);
});
