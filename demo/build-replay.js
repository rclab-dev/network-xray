#!/usr/bin/env node
/* build-replay.js — bake the OSS containerlab graph template into a single static
 * "recorded replay" demo (index.html) that runs on GitHub Pages / file:// with NO
 * containerlab, NO FRR, NO collector. The engine/bridge JS stay the real product code;
 * only the DATA SOURCE is swapped: instead of polling a live xray-states.js, we replay
 * a sequence of REAL captured frames (Full -> r1 isolated -> recovering -> Full) by
 * calling the same window.xrayCore.applyState() the live poll uses. Honest = labeled
 * "recorded from a real FRR/containerlab lab".
 */
var fs = require('fs');
var shell = require('./replay-shell.js');
var dir = __dirname;
// -h / --help and an unknown option answer before anything is written (index.html is rewritten on every plain run)
(function () {
  var a = process.argv.slice(2);
  if (a.indexOf('-h') >= 0 || a.indexOf('--help') >= 0) {
    console.log('usage: node demo/build-replay.js\n'
      + '  rebuild demo/index.html (the recorded OSPF replay) from xray-graph.html, topo.json and frame{A..D}.json in demo/\n'
      + '  (copy the template in first: cp ../xray-graph.html . )\n'
      + '  -h, --help   show this help');
    process.exit(0);
  }
  if (a.length) { console.error('build-replay.js: unknown option: ' + a[0]); console.error("Try 'node demo/build-replay.js --help'."); process.exit(2); }
})();
var NAME = 'xray-ospf';
function rd(f){ return fs.readFileSync(dir + '/' + f, 'utf8'); }
function rdj(f){ return JSON.parse(rd(f)); }

var html  = rd('xray-graph.html');
var topo  = rd('topo.json').trim();
var FRAMES = ['frameA.json','frameB.json','frameC.json','frameD.json'].map(rdj);
// primary next step, revealed in the bar once the last frame has played
var CTA = { href: '../index.html', text: 'Next: explore the other demos →' };
var LABELS = [
  'steady — all OSPF adjacencies Full',
  'r2 eth1 down — r1 isolated (neighbor Down, route lost)',
  'r2 eth1 back up — re-forming: r2 already hears r1 (Init), r1 has no neighbor yet',
  'converged — back to Full'
];

// 1) fill the Go-template placeholders with the real captured topology + name
html = shell.fill(html, NAME, topo);
// the page lives in demo/ and loads the published engine from the gallery one level up (demo/README.md):
// the template looks under static/ (containerlab graph) and next to itself (GitHub Pages) - point the first one at ../
if (html.split("loadSeq('static/'").length !== 2) throw new Error("xray-graph.html: expected one loadSeq('static/' in the loader");
html = html.replace("loadSeq('static/'", "loadSeq('../'");

// 1b) a recorded replay never loads xray-states.js (replay-bar.js seeds window.LIVE_STATES from FRAMES); without this
//     the page asked Pages for demo/static/xray-states.js and logged a 404. Same as index-bgp.html.
function once(re, to, what) {
  var m = html.match(new RegExp(re.source, 'g'));
  if (!m || m.length !== 1) throw new Error('xray-graph.html: expected one ' + what);
  html = html.replace(re, function () { return to; });
}
once(/  function withStates\(base, done\)\{\n[^\n]*createElement\('script'\);\n(?:[^\n]*\n){5}  \}/,
  '  function withStates(base, done){\n'
  + '    // nx_demo_no_states_fetch: this is a RECORDED replay — replay-bar.js seeds window.LIVE_STATES from the\n'
  + '    // baked-in FRAMES, so a live xray-states.js is never needed here. Skip loading it (no console 404 on Pages,\n'
  + "    // and a stray xray-states.js next to the page can't override the recording). Same as index-bgp.html.\n"
  + '    done();\n'
  + '  }', 'withStates() loader');
// 1c) a line to the Best-Path Decision demo (English / Japanese), and the topology box fits a phone
once(/  <div class="ov" id="ov"><\/div>\n/,
  '  <style>.nx-next a{color:#4dd0e1}</style>\n'
  + '  <p class="sub nx-next" data-i18n="next_demo">Why one BGP path wins over another: the <a href="index-bgp-lp.html">Best-Path Decision demo</a>.</p>\n'
  + '  <div class="ov" id="ov"></div>\n'
  + '<script>/* nx_demo_fit_ov: on a narrow screen (a phone) the 560px topology box is zoomed to the page width, so it no\n'
  + '   longer spills sideways (the DeepDive below keeps its own sideways scroll and the note about it). */\n'
  + "(function(){ function fit(){ var o = document.getElementById('ov'); if (!o) return;\n"
  + "  var w = document.documentElement.clientWidth - 16; o.style.zoom = w < 562 ? (w / 562).toFixed(3) : ''; }\n"
  + "  fit(); window.addEventListener('resize', fit); })();</script>\n", 'overview box');
once(/(X-Ray adds the per-node DeepDive\.',\n)(      footer:)/,
  "X-Ray adds the per-node DeepDive.',\n"
  + "      next_demo: 'Why one BGP path wins over another: the <a href=\"index-bgp-lp.html\">Best-Path Decision demo</a>.',\n"
  + '      footer:', 'English intro');
var jaIntro = /\n      intro: '全体図はあなたの[^\n]*\n      footer:/;
once(jaIntro, (html.match(jaIntro) || [''])[0].replace(/      footer:$/,
  "      next_demo: 'BGP の経路がなぜ選ばれるか: <a href=\"index-bgp-lp.html\">Best-Path Decision のデモ</a>。',\n      footer:"),
  'Japanese intro');

// 2) inject the replay driver right before </body>. It runs synchronously at parse
//    time (after the loader kicks off async dep-loading), seeds window.LIVE_STATES
//    with frame A so the first render is real, then advances frames on a timer using
//    applyState() on the currently-open node (identical mechanism to the live poll).
//    The bar logic itself (autoplay, prev/next, keys, frame dots) lives in replay-bar.js.
var driver = shell.CSS + shell.bar(FRAMES.length)
+ '<script>(function(){'
+ 'var FRAMES=' + JSON.stringify(FRAMES) + ';'
+ 'var LABELS=' + JSON.stringify(LABELS) + ';'
+ 'window.xrayReplayBar.mount({frames:FRAMES,labels:LABELS,dwell:2600,focus:"r1",'
+ 'cta:' + JSON.stringify(CTA) + '});'
+ '})();<\/script>';

driver += shell.MOBILE;
html = html.replace('</body>', driver + '\n</body>');

fs.writeFileSync(dir + '/index.html', html);
var leftover = (html.match(/\{\{/g) || []).length;
console.log('index.html written: ' + html.length + ' bytes, frames=' + FRAMES.length
  + ', topo nodes=' + (JSON.parse(topo).nodes||[]).length + ', leftover {{=' + leftover);
