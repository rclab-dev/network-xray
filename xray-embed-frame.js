/* xray-embed-frame.js — runs inside embed.html. Takes the calls that xray-embed.js sends from the embedding page
 * (postMessage) and passes them to the xrayCore facade (xray-api.js). Only the facade's own calls are accepted, only
 * from the parent window and only from the origin given in ?origin= (xray-embed.js sets it); without ?origin= only
 * this frame's own origin is trusted. Tells the page: 'ready', 'deepdive' {open}, 'size' {height}, 'error' {message}.
 */
(function (root) {
  'use strict';
  var KEY = 'xray-embed', VERSION = 1;
  var CALLS = { applyState: 1, setTopology: 1, setTrace: 1, openDeepDive: 1, openDeepDiveFor: 1, closeDeepDive: 1 };
  var doc = root.document;
  var parentOrigin = '';
  try { parentOrigin = new root.URLSearchParams(root.location.search).get('origin') || ''; } catch (e) {}
  if (!parentOrigin) parentOrigin = root.location.origin;
  var view = null;

  function tell(msg) {
    if (!root.parent || root.parent === root) return;
    msg[KEY] = VERSION;
    root.parent.postMessage(msg, parentOrigin && parentOrigin !== 'null' ? parentOrigin : '*');
  }
  function fail(message) { tell({ ev: 'error', message: String(message) }); }

  function handle(cmd, args) {
    var core = root.xrayCore;
    if (!core) return fail('xrayCore is not loaded');
    if (cmd === 'render') {
      view = core.renderTopology('#topo', args[0] || {}, args[1] || {});
      return;
    }
    if (!CALLS[cmd]) return fail('unknown call: ' + cmd);
    if (!view) return fail(cmd + ' before render');
    view[cmd].apply(view, args);
  }

  root.addEventListener('message', function (e) {
    if (e.source !== root.parent || root.parent === root) return;
    if (e.origin !== parentOrigin) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d[KEY] !== VERSION || typeof d.cmd !== 'string') return;
    try { handle(d.cmd, Array.isArray(d.args) ? d.args : []); } catch (err) { fail(err && err.message || err); }
  });

  doc.addEventListener('xraycore:deepdive', function (e) { tell({ ev: 'deepdive', open: !!(e && e.detail && e.detail.open) }); });

  var lastH = 0;
  function sendSize() {
    var h = Math.max(doc.documentElement.scrollHeight || 0, doc.body ? doc.body.scrollHeight || 0 : 0);
    if (h && h !== lastH) { lastH = h; tell({ ev: 'size', height: h }); }
  }
  if (typeof root.ResizeObserver === 'function') {
    try { new root.ResizeObserver(sendSize).observe(doc.documentElement); } catch (e) {}
  }

  function ready() { tell({ ev: 'ready' }); sendSize(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();
})(typeof window !== 'undefined' ? window : this);
