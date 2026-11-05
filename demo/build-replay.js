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
var dir = __dirname;
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
html = html.split('{{ .Name }}').join(NAME);
html = html.split('{{ .Data }}').join(topo);

// 2) inject the replay driver right before </body>. It runs synchronously at parse
//    time (after the loader kicks off async dep-loading), seeds window.LIVE_STATES
//    with frame A so the first render is real, then advances frames on a timer using
//    applyState() on the currently-open node (identical mechanism to the live poll).
//    The bar logic itself (autoplay, prev/next, keys, frame dots) lives in replay-bar.js.
var driver =
'<style>'
+ '#replaybar{position:fixed;left:0;right:0;top:0;z-index:9999;background:#10202c;border-bottom:1px solid #26c6da;'
+ 'color:#cfe8ee;font:13px -apple-system,Segoe UI,Roboto,sans-serif;padding:7px 12px;display:flex;align-items:center;gap:12px}'
+ '#replaybar .tag{background:#26c6da;color:#06222a;font-weight:700;border-radius:4px;padding:2px 8px;font-size:11px}'
+ '#replaybar .st{font-weight:700;color:#4dd0e1}#replaybar .src{color:#78909c;margin-left:auto;font-size:11px}'
+ '#replaybar button{background:#16202b;color:#cfe8ee;border:1px solid #2b3a44;border-radius:4px;padding:3px 10px;cursor:pointer}'
+ '#replaybar .ctl,#replaybar .dots{display:inline-flex;gap:4px;white-space:nowrap}'
+ '#replaybar .dots button{display:inline-block;width:12px;height:12px;padding:0;border:2px solid #10202c;border-radius:50%;background:#2b3a44;vertical-align:middle}'
+ '#replaybar .dots button.on{background:#26c6da}'
+ '#replaybar button:focus-visible,#rb-cta:focus-visible{outline:2px solid #4dd0e1;outline-offset:2px}'
+ '#rb-cta{background:#26c6da;color:#06222a;font-weight:700;border-radius:4px;padding:3px 10px;text-decoration:none;white-space:nowrap}#rb-cta[hidden]{display:none}'
+ '.wrap{padding-top:46px}'
+ '/* nx_mobile_replaybar */@media (max-width:600px){#replaybar{position:static;flex-wrap:wrap;gap:6px 10px;margin:0 0 12px;border:1px solid #26c6da;border-radius:6px}#replaybar .src{margin-left:0;flex-basis:100%}.wrap{padding-top:16px}}'
+ '</style>'
+ '<div id="replaybar"><span class="tag">▶ RECORDED REPLAY</span>'
+ '<span>frame <b id="rb-i">1</b>/' + FRAMES.length + ':</span> <span class="st" id="rb-st">…</span>'
+ '<span class="dots" id="rb-dots"></span>'
+ '<span class="ctl"><button type="button" id="rb-prev" aria-label="previous frame" title="previous frame (←)">◀</button>'
+ '<button type="button" id="rb-toggle" aria-pressed="false" title="pause / play (Space)">pause</button>'
+ '<button type="button" id="rb-next" aria-label="next frame" title="next frame (→)">▶</button></span>'
+ '<span class="src">real frames captured from a live FRR / containerlab lab · no backend</span></div>'
+ '<script src="replay-bar.js"><\/script>'
+ '<script>(function(){'
+ 'var FRAMES=' + JSON.stringify(FRAMES) + ';'
+ 'var LABELS=' + JSON.stringify(LABELS) + ';'
+ 'window.xrayReplayBar.mount({frames:FRAMES,labels:LABELS,dwell:2600,focus:"r1",'
+ 'cta:' + JSON.stringify(CTA) + '});'
+ '})();<\/script>';

driver += '<script>/* nx_mobile_replaybar: phone width = the RECORDED REPLAY bar sits just above the topology (not fixed over it) */(function(){var mq=window.matchMedia&&window.matchMedia("(max-width:600px)"),b=document.getElementById("replaybar"),home=null;if(!mq||!b)return;function f(){var t=document.querySelector(".wrap .topology")||document.querySelector(".topology");if(!t)return;if(mq.matches){if(!home)home={p:b.parentNode,n:b.nextSibling};if(b.nextSibling!==t)t.parentNode.insertBefore(b,t);}else if(home&&(b.parentNode!==home.p||b.nextSibling!==home.n)){try{home.p.insertBefore(b,home.n);}catch(e){home.p.appendChild(b);}}}f();if(mq.addEventListener)mq.addEventListener("change",f);else if(mq.addListener)mq.addListener(f);})();</script>';   /* nx_mobile_replaybar */
html = html.replace('</body>', driver + '\n</body>');

fs.writeFileSync(dir + '/index.html', html);
var leftover = (html.match(/\{\{/g) || []).length;
console.log('index.html written: ' + html.length + ' bytes, frames=' + FRAMES.length
  + ', topo nodes=' + (JSON.parse(topo).nodes||[]).length + ', leftover {{=' + leftover);
