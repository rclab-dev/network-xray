/* xray-embed.js — put network-xray on your page inside an iframe.
 *
 * The engine (xray-core.js) styles the whole page it runs in: while X-Ray is on, the page gets a dark background and
 * light text, and class names the page shares with the engine are restyled. Inside an iframe that stays in the frame, and your page's CSS does not
 * reach the picture either. This file runs on YOUR page; embed.html (with xray-embed-frame.js) runs in the frame.
 *
 *   <div id="xray"></div>
 *   <script src="xray-embed.js"></script>
 *   var x = xrayEmbed.mount('#xray', { src: 'embed.html', height: 520 });   // src: where embed.html is served
 *   x.render(config, { topology: topo, trace: trace });   // config / state shapes: DATA-CONTRACT.md
 *   x.applyState(state);
 *   x.openDeepDive();  x.closeDeepDive();
 *   x.startPolling(() => fetch('/api/state').then(r => r.json()), 3000);   // polls here, sends each state to the frame
 *   x.on('deepdive', e => console.log(e.open));   // also 'ready', 'size', 'error'
 *   x.destroy();
 *
 * Messages go only to the frame's origin and are taken only from the frame. Calls made before the frame is ready are
 * queued and sent in order. Nothing is fetched by this file.
 */
(function (root) {
  'use strict';
  var KEY = 'xray-embed', VERSION = 1;

  function targetOf(origin) { return origin && origin !== 'null' ? origin : '*'; }   // file:// pages have an opaque origin

  function mount(target, opts) {
    opts = opts || {};
    var doc = root.document;
    var host = typeof target === 'string' ? doc.querySelector(target) : target;
    if (!host) throw new Error('xrayEmbed.mount: container not found: ' + target);

    var url = new root.URL(opts.src || 'embed.html', doc.baseURI);
    url.searchParams.set('origin', root.location.origin);
    var frameOrigin = url.origin;

    var frame = doc.createElement('iframe');
    frame.src = url.href;
    frame.title = opts.title || 'network-xray';
    frame.style.cssText = 'display:block;width:100%;border:0;height:' + (opts.height || 520) + 'px';

    var ready = false, queue = [], handlers = {}, pollTimer = null, alive = true;

    function post(msg) { frame.contentWindow.postMessage(msg, targetOf(frameOrigin)); }
    function send(cmd, args) {
      if (!alive) return;
      var msg = { cmd: cmd, args: args || [] }; msg[KEY] = VERSION;
      if (ready) post(msg); else queue.push(msg);
    }
    function emit(ev, data) { (handlers[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) {} }); }

    function onMessage(e) {
      if (!frame.contentWindow || e.source !== frame.contentWindow) return;
      if (frameOrigin !== 'null' && e.origin !== frameOrigin) return;
      var d = e.data;
      if (!d || typeof d !== 'object' || d[KEY] !== VERSION || typeof d.ev !== 'string') return;
      if (d.ev === 'ready' && !ready) { ready = true; queue.splice(0).forEach(post); }
      if (d.ev === 'size' && opts.autoHeight && typeof d.height === 'number' && d.height > 0) frame.style.height = Math.ceil(d.height) + 'px';
      emit(d.ev, d);
    }
    root.addEventListener('message', onMessage);
    host.appendChild(frame);

    function stopPolling() { if (pollTimer) { root.clearInterval(pollTimer); pollTimer = null; } }

    return {
      iframe: frame,
      render: function (config, renderOpts) { send('render', [config, renderOpts || {}]); },
      applyState: function (state) { send('applyState', [state]); },
      setTopology: function (topo) { send('setTopology', [topo]); },
      setTrace: function (trace) { send('setTrace', [trace]); },
      openDeepDive: function () { send('openDeepDive', []); },
      openDeepDiveFor: function (nodeId) { send('openDeepDiveFor', [nodeId]); },
      closeDeepDive: function () { send('closeDeepDive', []); },
      startPolling: function (fetcher, ms) {
        stopPolling();
        function tick() {
          var p; try { p = fetcher(); } catch (e) { emit('error', { ev: 'error', message: String(e && e.message || e) }); return; }
          Promise.resolve(p).then(function (s) { if (s) send('applyState', [s]); },
            function (e) { emit('error', { ev: 'error', message: String(e && e.message || e) }); });
        }
        tick();
        pollTimer = root.setInterval(tick, ms || 3000);
        return stopPolling;
      },
      stopPolling: stopPolling,
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
      destroy: function () {
        alive = false; stopPolling();
        root.removeEventListener('message', onMessage);
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }
    };
  }

  root.xrayEmbed = { mount: mount, version: VERSION };
})(typeof window !== 'undefined' ? window : this);
