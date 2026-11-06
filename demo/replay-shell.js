/* replay-shell.js — the RECORDED REPLAY bar markup shared by the replay page builders
 * (build-replay.js, build-replay-bgp.js): its styles, the bar itself, and the phone-width
 * script that moves the bar above the topology. The bar's behaviour lives in replay-bar.js.
 */
var CSS =
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
+ '</style>';

function bar(n) {
  return '<div id="replaybar"><span class="tag">▶ RECORDED REPLAY</span>'
  + '<span>frame <b id="rb-i">1</b>/' + n + ':</span> <span class="st" id="rb-st">…</span>'
  + '<span class="dots" id="rb-dots"></span>'
  + '<span class="ctl"><button type="button" id="rb-prev" aria-label="previous frame" title="previous frame (←)">◀</button>'
  + '<button type="button" id="rb-toggle" aria-pressed="false" title="pause / play (Space)">pause</button>'
  + '<button type="button" id="rb-next" aria-label="next frame" title="next frame (→)">▶</button></span>'
  + '<span class="src">real frames captured from a live FRR / containerlab lab · no backend</span></div>'
  + '<script src="replay-bar.js"><\/script>';
}

var MOBILE = '<script>/* nx_mobile_replaybar: phone width = the RECORDED REPLAY bar sits just above the topology (not fixed over it) */(function(){var mq=window.matchMedia&&window.matchMedia("(max-width:600px)"),b=document.getElementById("replaybar"),home=null;if(!mq||!b)return;function f(){var t=document.querySelector(".wrap .topology")||document.querySelector(".topology");if(!t)return;if(mq.matches){if(!home)home={p:b.parentNode,n:b.nextSibling};if(b.nextSibling!==t)t.parentNode.insertBefore(b,t);}else if(home&&(b.parentNode!==home.p||b.nextSibling!==home.n)){try{home.p.insertBefore(b,home.n);}catch(e){home.p.appendChild(b);}}}f();if(mq.addEventListener)mq.addEventListener("change",f);else if(mq.addListener)mq.addListener(f);})();</script>';   /* nx_mobile_replaybar */

// fill the Go-template placeholders of a page template ({{ .Name }}, {{ .Data }})
function fill(html, name, data) {
  return html.split('{{ .Name }}').join(name).split('{{ .Data }}').join(data);
}

module.exports = { CSS: CSS, bar: bar, MOBILE: MOBILE, fill: fill };
