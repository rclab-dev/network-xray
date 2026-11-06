#!/usr/bin/env node
/* build-replay-bgp.js — build a recorded BGP replay page from a page template, a topology,
 * captured frame*.json files and one config file that holds each frame's label, caption and
 * dwell time plus the next-step link. Same approach as build-replay.js: the template's
 * {{ .Name }} / {{ .Data }} are filled in and the replay driver goes in right before </body>.
 *
 *   node demo/build-replay-bgp.js [config.json]     (default: demo/bgp-lp/replay.json)
 *
 * Paths in the config are relative to the config file. The page is written to its "output".
 */
var fs = require('fs');
var path = require('path');
var shell = require('./replay-shell.js');

var DEFAULT_CONFIG = path.join(__dirname, 'bgp-lp', 'replay.json');

// the caption box shown under the bar, placed just before the overview (#ov)
var CAPTION_BOX = 'var cap=document.createElement("div");cap.id="rb-cap";'
  + 'cap.style.cssText="display:block;margin:8px auto 2px;max-width:560px;background:rgba(16,32,44,0.94);border:1px solid #26c6da;border-radius:6px;color:#cfe8ee;font:12.5px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:5px 14px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.4)";'
  + '(function(){var _ov=document.getElementById("ov");if(_ov&&_ov.parentNode)_ov.parentNode.insertBefore(cap,_ov);else document.body.appendChild(cap);})();';

// a JSON value placed inside a <script>: keep "</script>" or "<!--" in recorded text from ending it
function js(v) { return JSON.stringify(v).replace(/</g, '\\u003c'); }

function build(configPath) {
  configPath = path.resolve(configPath || DEFAULT_CONFIG);
  var base = path.dirname(configPath);
  function rd(f) { return fs.readFileSync(path.resolve(base, f), 'utf8'); }
  var cfg = JSON.parse(rd(configPath));
  if (!Array.isArray(cfg.frames) || !cfg.frames.length) throw new Error(configPath + ': "frames" must be a non-empty list');
  var frames = cfg.frames.map(function (f) { return JSON.parse(rd(f.file)); });
  var labels = cfg.frames.map(function (f) { return String(f.label || ''); });
  var caps = cfg.frames.map(function (f) { return String(f.caption || ''); });
  var dwell = cfg.frames.map(function (f) { return Number(f.dwell) || 2600; });
  var topo = rd(cfg.topology).trim();
  JSON.parse(topo);   // fail early on a broken topology file

  var html = shell.fill(rd(cfg.template), String(cfg.name), topo);
  var driver = shell.CSS + shell.bar(frames.length)
    + '<script>(function(){'
    + 'var FRAMES=' + js(frames) + ';'
    + 'var LABELS=' + js(labels) + ';'
    + 'var CAPS=' + js(caps) + ';'
    + CAPTION_BOX
    + 'window.xrayReplayBar.mount({frames:FRAMES,labels:LABELS,dwell:' + js(dwell) + ',focus:' + js(String(cfg.focus || 'r1')) + ','
    + 'caption:function(i){cap.textContent=CAPS[i];},'
    + 'cta:' + js(cfg.cta) + '});'
    + '})();<\/script>\n'
    + shell.MOBILE;
  if (html.indexOf('</body>') < 0) throw new Error(cfg.template + ': no </body>');
  html = html.replace('</body>', function () { return driver + '\n</body>'; });
  return { html: html, output: path.resolve(base, cfg.output), frames: frames, topo: topo };
}

if (require.main === module) {
  var _a = process.argv.slice(2);
  if (_a.indexOf('-h') >= 0 || _a.indexOf('--help') >= 0) {
    console.log('usage: node demo/build-replay-bgp.js [config.json]\n'
      + '  build a recorded BGP replay page from a template, a topology and captured frame*.json\n'
      + '  config.json  labels, captions, dwell times and the output file (default: demo/bgp-lp/replay.json)\n'
      + '  -h, --help   show this help');
    process.exit(0);
  }
  var _bad = _a.filter(function (x) { return x[0] === '-'; })[0];
  if (_bad) { console.error('build-replay-bgp.js: unknown option: ' + _bad); console.error("Try 'node demo/build-replay-bgp.js --help'."); process.exit(2); }
  var r = build(_a[0]);
  fs.writeFileSync(r.output, r.html);
  var leftover = (r.html.match(/\{\{/g) || []).length;
  console.log(path.basename(r.output) + ' written: ' + r.html.length + ' bytes, frames=' + r.frames.length
    + ', topo nodes=' + (JSON.parse(r.topo).nodes || []).length + ', leftover {{=' + leftover);
}

module.exports = { build: build, DEFAULT_CONFIG: DEFAULT_CONFIG };
