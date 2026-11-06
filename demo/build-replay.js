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
  'r1 recovering — OSPF re-forming (2-Way/DROther)',
  'converged — back to Full'
];

// 1) fill the Go-template placeholders with the real captured topology + name
html = shell.fill(html, NAME, topo);

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
