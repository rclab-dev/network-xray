/* xray-skin.js — X-Ray Core skin layer (Phase 1: colors + protocolOrder)
 *
 * The representation layer for the X-Ray gallery. A "skin" is a small plain object
 * (frozen shape = SKIN-CONTRACT.md) that picks colors + process stacking order.
 *
 * Two ways it is used:
 *   1. Gallery demos: include this script (one line). On load it reads the user's chosen
 *      skin from localStorage['xray.skin'] and applies it — via xrayCore.setSkin() when the
 *      engine hook is present, and always by setting the --xto-* CSS variables on :root
 *      (so overlays/pages that already read --xto-* pick up the colors immediately).
 *   2. The skin editor (skin.html): imports XraySkin.* to normalize / persist / export / import.
 *
 * Contract rules honored here (see SKIN-CONTRACT.md §5/§6):
 *   - The UI normalizes; the engine trusts. normalize() always returns a complete, valid object.
 *   - Presets are DATA ONLY. Nothing here (and nothing in the engine) switches on `id`.
 *   - Missing keys fall back to the signature default; unknown keys are ignored (reserved keys
 *     are preserved for Phase-2 forward-compat but never invented).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'xray.skin';
  var COLOR_KEYS = ['ospf', 'bgp', 'static', 'link', 'idle', 'down'];

  // ── the signature (default) skin = the engine's built-in look ──
  var SIGNATURE = {
    id: 'signature',
    colors: { ospf: '#39ff14', bgp: '#a855f7', static: '#888888', link: '#00e5ff', idle: '#ff8c00', down: '#555555' },
    protocolOrder: 'bgp-top',
    engineShape: 'cylinder', processGlyph: 'double-circle', rules: {}
  };

  // Bundled presets (default + 2). Data only — adding one is a data change, no engine code.
  var PRESETS = [
    SIGNATURE,
    {
      // Flat / Docs — calm palette for slides/blog embeds. (Phase 1 = colors only; box shape is Phase 2.)
      id: 'flat-docs',
      colors: { ospf: '#2e7d32', bgp: '#6a1b9a', static: '#757575', link: '#0277bd', idle: '#ef6c00', down: '#9e9e9e' },
      protocolOrder: 'bgp-top', engineShape: 'cylinder', processGlyph: 'double-circle', rules: {}
    },
    {
      // Accessible — Okabe-Ito CVD-safe hues; idle/down also easily distinguishable, not color-only.
      id: 'accessible',
      colors: { ospf: '#009e73', bgp: '#cc79a7', static: '#000000', link: '#56b4e9', idle: '#e69f00', down: '#999999' },
      protocolOrder: 'bgp-top', engineShape: 'cylinder', processGlyph: 'double-circle', rules: {}
    }
  ];

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Normalize any raw input into a complete, valid skin. This is where "the UI normalizes" lives.
  function normalize(raw) {
    raw = (raw && typeof raw === 'object') ? raw : {};
    var out = {
      id: (typeof raw.id === 'string' && raw.id) ? raw.id : 'custom',
      colors: {},
      protocolOrder: raw.protocolOrder === 'ospf-top' ? 'ospf-top' : 'bgp-top',
      engineShape: SIGNATURE.engineShape,
      processGlyph: SIGNATURE.processGlyph,
      rules: {}
    };
    var c = (raw.colors && typeof raw.colors === 'object') ? raw.colors : {};
    COLOR_KEYS.forEach(function (k) {
      out.colors[k] = isHex(c[k]) ? c[k].toLowerCase() : SIGNATURE.colors[k];
    });
    // preserve reserved keys if the incoming object already carries them (Phase-2 forward-compat),
    // but never invent values — Phase 1 does not read these.
    if (typeof raw.engineShape === 'string') out.engineShape = raw.engineShape;
    if (typeof raw.processGlyph === 'string') out.processGlyph = raw.processGlyph;
    if (raw.rules && typeof raw.rules === 'object') out.rules = clone(raw.rules);
    return out;
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return clone(PRESETS[i]);
    return null;
  }

  // Is `skin` identical (in Phase-1 fields) to a known preset? Used by the editor to show
  // "Custom" once the user edits away from a preset.
  function matchPresetId(skin) {
    var s = normalize(skin);
    for (var i = 0; i < PRESETS.length; i++) {
      var p = normalize(PRESETS[i]);
      if (p.protocolOrder !== s.protocolOrder) continue;
      var same = true;
      for (var j = 0; j < COLOR_KEYS.length; j++) {
        if (p.colors[COLOR_KEYS[j]] !== s.colors[COLOR_KEYS[j]]) { same = false; break; }
      }
      if (same) return PRESETS[i].id;
    }
    return null;
  }

  function load() {
    try {
      var s = global.localStorage.getItem(STORAGE_KEY);
      return s ? normalize(JSON.parse(s)) : normalize(SIGNATURE);
    } catch (e) { return normalize(SIGNATURE); }
  }

  function save(skin) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(skin))); } catch (e) {}
  }

  function hexToRgb(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? (parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16)) : '';
  }

  // Drive the color tokens as CSS variables on :root. Inline style on documentElement beats the
  // page's own :root rule, so this makes the color axis effective even before the engine's literal
  // migration lands (and it powers the skin.html editor preview, which reads --xto-* directly).
  // Emits both forms the engine uses: hex (--xto-ospf) and an rgb triplet (--xto-ospf-rgb) for
  // rgba() shadows — matching worker1's engine token set (<style id="xray-skin-vars">).
  function applyCssVars(s) {
    var doc = global.document; if (!doc || !doc.documentElement) return;
    var r = doc.documentElement.style;
    COLOR_KEYS.forEach(function (k) {
      r.setProperty('--xto-' + k, s.colors[k]);
      var rgb = hexToRgb(s.colors[k]);
      if (rgb) r.setProperty('--xto-' + k + '-rgb', rgb);
    });
  }

  // Apply a skin: hand it to the engine, and always set the CSS vars.
  // Engine global (canonical) = window.xraySetSkin(skin). The xrayCore.setSkin facade (present only
  // when the OSS wrapper is loaded) is a 1:1 shim over it — call whichever is available.
  function apply(skin) {
    var s = normalize(skin);
    if (typeof global.xraySetSkin === 'function') { try { global.xraySetSkin(s); } catch (e) {} }
    else if (global.xrayCore && typeof global.xrayCore.setSkin === 'function') { try { global.xrayCore.setSkin(s); } catch (e) {} }
    applyCssVars(s);
    return s;
  }

  // Reader entry point: read stored skin and apply it. Called automatically on DOM ready.
  function init() { return apply(load()); }

  // export/import helpers (the editor uses these; the UI owns validation).
  function toJson(skin) { return JSON.stringify(normalize(skin), null, 2); }
  function fromJson(text) {
    var raw = JSON.parse(text);           // may throw — caller shows the error
    return normalize(raw);
  }

  global.XraySkin = {
    STORAGE_KEY: STORAGE_KEY,
    COLOR_KEYS: COLOR_KEYS,
    SIGNATURE: SIGNATURE,
    PRESETS: PRESETS,
    isHex: isHex,
    normalize: normalize,
    presetById: presetById,
    matchPresetId: matchPresetId,
    load: load,
    save: save,
    apply: apply,
    applyCssVars: applyCssVars,
    toJson: toJson,
    fromJson: fromJson,
    init: init
  };

  // Auto-apply on load (the "one line per demo" behavior). The editor page can re-drive via apply().
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
  }
})(typeof window !== 'undefined' ? window : this);
