/* replay-bar.js — the "RECORDED REPLAY" bar used by the static demo pages (demo/index*.html).
 * Plays a fixed list of captured frames through window.xrayCore.applyState(), the same in-place
 * update the live poll uses. Autoplay is the default; prev / next / pause buttons, clickable frame
 * dots and Left / Right / Space keys let a visitor step through it. After the last frame has been
 * shown once, the bar reveals the page's primary next-step link.
 * No dependencies; loads in a browser (window.xrayReplayBar) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  // Pure controller: frame index, pause state and timing. Timers are injected so tests can drive it.
  function createReplay(opts) {
    var count = opts.count;
    var dwell = opts.dwell;                       // number (ms) or array of ms per frame
    var onFrame = opts.onFrame || function () {};
    var setT = opts.setTimeout || setTimeout;
    var clearT = opts.clearTimeout || clearTimeout;
    var s = { i: 0, paused: false, running: false, seenEnd: count <= 1 };
    var timer = null;

    function wait() { return typeof dwell === 'number' ? dwell : ((dwell && dwell[s.i]) || 2600); }   // dwell left out = 2600 ms
    function arm() {
      if (timer !== null) { clearT(timer); timer = null; }
      if (!s.running || s.paused) return;
      timer = setT(function () { timer = null; go(s.i + 1, true); }, wait());
    }
    function go(n, auto) {
      s.i = ((n % count) + count) % count;
      if (s.i === count - 1) s.seenEnd = true;
      onFrame(s.i, !!auto);
      arm();                                      // a manual step restarts the dwell of the new frame
    }
    return {
      state: s,
      start: function () { s.running = true; onFrame(s.i, false); arm(); },
      next: function () { go(s.i + 1); },
      prev: function () { go(s.i - 1); },
      go: function (n) { go(n); },
      toggle: function () { s.paused = !s.paused; arm(); return s.paused; }
    };
  }

  // Key -> action, or null. Never acts while focus is in a text field, and leaves Space alone on
  // buttons/links (the browser already clicks them) and when a modifier is held.
  function keyAction(e) {
    if (!e || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
    var t = e.target || {};
    var tag = String(t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return null;
    var k = e.key;
    if (k === 'ArrowLeft') return 'prev';
    if (k === 'ArrowRight') return 'next';
    if (k === ' ' || k === 'Spacebar') return (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') ? null : 'toggle';
    return null;
  }

  // Browser wiring. cfg: {frames, labels, dwell, focus, caption(i)->void, cta:{href,text}}
  function mount(cfg) {
    var doc = root.document;
    var FRAMES = cfg.frames, LABELS = cfg.labels;
    var $ = function (id) { return doc.getElementById(id); };
    var bar = $('replaybar');
    root.LIVE_STATES = FRAMES[0];

    var dots = $('rb-dots'), dotEls = [];
    for (var d = 0; d < FRAMES.length; d++) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'frame ' + (d + 1) + ': ' + LABELS[d]);
      b.title = 'frame ' + (d + 1);
      b.onclick = (function (n) { return function () { ctl.go(n); }; })(d);
      dots.appendChild(b); dotEls.push(b);
    }

    var cta = null;
    if (cfg.cta && cfg.cta.href) {
      cta = doc.createElement('a');
      cta.id = 'rb-cta';
      cta.href = cfg.cta.href;
      cta.textContent = cfg.cta.text;
      cta.hidden = true;
      bar.insertBefore(cta, bar.querySelector('.src'));
    }

    function paint() {
      var i = ctl.state.i;
      $('rb-i').textContent = (i + 1);
      $('rb-st').textContent = LABELS[i];
      if (cfg.caption) cfg.caption(i);
      for (var k = 0; k < dotEls.length; k++) {
        dotEls[k].className = (k === i ? 'on' : '');
        if (k === i) dotEls[k].setAttribute('aria-current', 'step'); else dotEls[k].removeAttribute('aria-current');
      }
      if (cta && ctl.state.seenEnd) cta.hidden = false;
      fitPad();
    }
    function apply(i) {
      root.LIVE_STATES = FRAMES[i];
      var n = root.__xrayCurNode, st = n && FRAMES[i] && FRAMES[i][n], core = root.xrayCore;
      if (st && core && typeof core.applyState === 'function') {
        try { core.applyState(st); } catch (e) { if (root.__xrayShowNode) root.__xrayShowNode(n); }
      } else if (n && root.__xrayShowNode) { root.__xrayShowNode(n); }
      paint();
    }
    var ctl = createReplay({ count: FRAMES.length, dwell: cfg.dwell, onFrame: apply });

    /* the bar is fixed at the top and wraps to 2-3 lines on narrower screens (caption, buttons, link):
       keep the page's top padding at least as tall as the bar so the heading is never under it.
       On phones the page's CSS makes the bar static (in the flow) = the inline padding is removed. */
    var wrap = doc.querySelector('.wrap'), pad0 = null;
    function fitPad() {
      if (!wrap || !bar || !root.getComputedStyle) return;
      if (root.getComputedStyle(bar).position !== 'fixed') { wrap.style.paddingTop = ''; return; }
      if (pad0 === null) { wrap.style.paddingTop = ''; pad0 = parseFloat(root.getComputedStyle(wrap).paddingTop) || 0; }
      var need = bar.offsetHeight + 8;
      wrap.style.paddingTop = need > pad0 ? need + 'px' : '';
    }
    if (root.addEventListener) root.addEventListener('resize', function () { pad0 = null; fitPad(); });
    if (typeof root.ResizeObserver === 'function' && bar) new root.ResizeObserver(fitPad).observe(bar);

    var tog = $('rb-toggle');
    function syncToggle() { tog.textContent = ctl.state.paused ? 'play' : 'pause'; tog.setAttribute('aria-pressed', String(ctl.state.paused)); }
    tog.onclick = function () { ctl.toggle(); syncToggle(); };
    $('rb-prev').onclick = function () { ctl.prev(); };
    $('rb-next').onclick = function () { ctl.next(); };
    doc.addEventListener('keydown', function (e) {
      var a = keyAction(e);
      if (!a) return;
      e.preventDefault();
      if (a === 'toggle') { ctl.toggle(); syncToggle(); } else ctl[a]();
    });

    paint();
    var focus = cfg.focus || 'r1';
    var poll = setInterval(function () {
      var core = root.xrayCore;
      if (core && typeof core.applyState === 'function' && root.__xrayCurNode) {
        clearInterval(poll);
        if (root.__xrayShowNode && FRAMES[0] && FRAMES[0][focus]) root.__xrayShowNode(focus);
        ctl.start();
      }
    }, 150);
    return ctl;
  }

  var api = { createReplay: createReplay, keyAction: keyAction, mount: mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.xrayReplayBar = api;
})(typeof window !== 'undefined' ? window : this);
