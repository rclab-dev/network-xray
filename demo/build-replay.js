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
var driver =
'<style>'
+ '#replaybar{position:fixed;left:0;right:0;top:0;z-index:9999;background:#10202c;border-bottom:1px solid #26c6da;'
+ 'color:#cfe8ee;font:13px -apple-system,Segoe UI,Roboto,sans-serif;padding:7px 12px;display:flex;align-items:center;gap:12px}'
+ '#replaybar .tag{background:#26c6da;color:#06222a;font-weight:700;border-radius:4px;padding:2px 8px;font-size:11px}'
+ '#replaybar .st{font-weight:700;color:#4dd0e1}#replaybar .src{color:#78909c;margin-left:auto;font-size:11px}'
+ '#replaybar button{background:#16202b;color:#cfe8ee;border:1px solid #2b3a44;border-radius:4px;padding:3px 10px;cursor:pointer}'
+ '#replaybar .dots i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2b3a44;margin:0 2px}'
+ '#replaybar .dots i.on{background:#26c6da}'
+ '.wrap{padding-top:46px}'
+ '</style>'
+ '<div id="replaybar"><span class="tag">▶ RECORDED REPLAY</span>'
+ '<span>frame <b id="rb-i">1</b>/' + FRAMES.length + ':</span> <span class="st" id="rb-st">…</span>'
+ '<span class="dots" id="rb-dots"></span>'
+ '<button id="rb-toggle">pause</button>'
+ '<span class="src">real frames captured from a live FRR / containerlab lab · no backend</span></div>'
+ '<script>(function(){'
+ 'var FRAMES=' + JSON.stringify(FRAMES) + ';'
+ 'var LABELS=' + JSON.stringify(LABELS) + ';'
+ 'var STEP=2600,i=0,paused=false,timer=null;'
+ 'window.LIVE_STATES=FRAMES[0];'
+ 'var dots=document.getElementById("rb-dots");for(var d=0;d<FRAMES.length;d++)dots.appendChild(document.createElement("i"));'
+ 'function paint(){document.getElementById("rb-i").textContent=(i+1);document.getElementById("rb-st").textContent=LABELS[i];'
+ 'var ii=dots.querySelectorAll("i");for(var k=0;k<ii.length;k++)ii[k].className=(k===i?"on":"");}'
+ 'function apply(){window.LIVE_STATES=FRAMES[i];var n=window.__xrayCurNode,st=n&&FRAMES[i]&&FRAMES[i][n];'
+ 'if(st&&window.xrayCore&&typeof window.xrayCore.applyState==="function"){try{window.xrayCore.applyState(st);}'
+ 'catch(e){if(window.__xrayShowNode)window.__xrayShowNode(n);}}else if(n&&window.__xrayShowNode){window.__xrayShowNode(n);}paint();}'
+ 'var FOCUS="r1";'
+ 'var wait=setInterval(function(){if(window.xrayCore&&typeof window.xrayCore.applyState==="function"&&window.__xrayCurNode){clearInterval(wait);if(window.__xrayShowNode&&FRAMES[0]&&FRAMES[0][FOCUS]){window.__xrayShowNode(FOCUS);}start();}},150);'
+ 'function start(){paint();timer=setInterval(function(){if(paused)return;i=(i+1)%FRAMES.length;apply();},STEP);}'
+ 'document.getElementById("rb-toggle").onclick=function(){paused=!paused;this.textContent=paused?"play":"pause";};'
+ '})();<\/script>';

html = html.replace('</body>', driver + '\n</body>');

fs.writeFileSync(dir + '/index.html', html);
var leftover = (html.match(/\{\{/g) || []).length;
console.log('index.html written: ' + html.length + ' bytes, frames=' + FRAMES.length
  + ', topo nodes=' + (JSON.parse(topo).nodes||[]).length + ', leftover {{=' + leftover);
