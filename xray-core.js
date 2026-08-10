window.xrayApplyTheme = function(labMode) {
  var themes = {
    troubleshoot: {
      accent: "#0f0",
      border: "#27ae60",
      bg: "#1a1a1a",
      headerBg: "#2a2a2a",
      btn: "#3498db",
      btnHover: "#2980b9",
      target: "#e74c3c",
      topoBg: "#2a2a2a",
      topoBoxBg: "#1a1a1a",
      topoBoxBorder: "#444",
      topoIfaceBg: "#0a0a0a",
      topoIfaceColor: "#aaa",
      topoIp: "#0f0",
      topoLinkLine: "linear-gradient(90deg,#444,#666,#444)",
      captBg: "#2a2a2a",
      captHeaderBg: "#333",
      captBorder: "#444",
      explBg: "#1a2a1a"
    },
    capture: {
      accent: "#4dd0e1",
      border: "#26c6da",
      bg: "#0f1318",
      headerBg: "#1c2736",
      btn: "#00acc1",
      btnHover: "#00838f",
      target: "#e74c3c",
      topoBg: "#1e2a38",
      topoBoxBg: "#141b24",
      topoBoxBorder: "#455a64",
      topoIfaceBg: "#0f1318",
      topoIfaceColor: "#b0bec5",
      topoIp: "#80deea",
      topoLinkLine: "linear-gradient(90deg,#37474f,#607d8b,#37474f)",
      captBg: "#1a2530",
      captHeaderBg: "#253545",
      captBorder: "#37474f",
      explBg: "#172230"
    },
    destroy: {
      accent: "#e74c3c",
      border: "#e74c3c",
      bg: "#1a1a1a",
      headerBg: "#333",
      btn: "#e74c3c",
      btnHover: "#c0392b",
      target: "#e74c3c",
      topoBg: "#2a2a2a",
      topoBoxBg: "#1a1a1a",
      topoBoxBorder: "#444",
      topoIfaceBg: "#0a0a0a",
      topoIfaceColor: "#aaa",
      topoIp: "#0f0",
      topoLinkLine: "linear-gradient(90deg,#444,#666,#444)",
      captBg: "#2a2a2a",
      captHeaderBg: "#333",
      captBorder: "#444",
      explBg: "#2a1a1a"
    }
  };
  var t = themes[labMode] || themes.capture;
  var r = document.documentElement.style;
  r.setProperty("--rc-accent", t.accent);
  r.setProperty("--rc-border", t.border);
  r.setProperty("--rc-bg", t.bg);
  r.setProperty("--rc-header-bg", t.headerBg);
  r.setProperty("--rc-btn", t.btn);
  r.setProperty("--rc-btn-hover", t.btnHover);
  r.setProperty("--rc-target", t.target);
  r.setProperty("--rc-topo-bg", t.topoBg);
  r.setProperty("--rc-topo-box-bg", t.topoBoxBg);
  r.setProperty("--rc-topo-box-border", t.topoBoxBorder);
  r.setProperty("--rc-topo-iface-bg", t.topoIfaceBg);
  r.setProperty("--rc-topo-iface-color", t.topoIfaceColor);
  r.setProperty("--rc-topo-ip", t.topoIp);
  r.setProperty("--rc-topo-link-line", t.topoLinkLine);
  r.setProperty("--rc-capt-bg", t.captBg);
  r.setProperty("--rc-capt-header-bg", t.captHeaderBg);
  r.setProperty("--rc-capt-border", t.captBorder);
  r.setProperty("--rc-expl-bg", t.explBg);
  document.documentElement.setAttribute("data-mode", labMode);
};

(function() {
  if (document.getElementById("xray-core-css")) return;
  var s = document.createElement("style");
  s.id = "xray-core-css";
  s.textContent = [ ".is-xray-deep:not(.xray-state-ready) .de-beam," + ".is-xray-deep:not(.xray-state-ready) .de-energy," + ".is-xray-deep:not(.xray-state-ready) .de-label," + ".is-xray-deep:not(.xray-state-ready) .de-tunnel," + ".is-xray-deep:not(.xray-state-ready) .de-hello-orb," + ".is-xray-deep:not(.xray-state-ready) .de-ping-orb," + ".is-xray-deep:not(.xray-state-ready) .de-packet," + ".is-xray-deep:not(.xray-state-ready) .de-panel{visibility:hidden!important}", ".is-xray-deep.xray-switching .de-beam," + ".is-xray-deep.xray-switching .de-energy," + ".is-xray-deep.xray-switching .de-label," + ".is-xray-deep.xray-switching .de-tunnel," + ".is-xray-deep.xray-switching .de-hello-orb," + ".is-xray-deep.xray-switching .de-ping-orb," + ".is-xray-deep.xray-switching .de-packet," + ".is-xray-deep.xray-switching .de-panel{visibility:hidden!important}", '.xray-deep-engine::before{content:"✖";position:absolute;left:1.7%;top:50%;transform:translate(-50%,-50%);width:28px;height:28px;background:rgba(220,40,40,0.85);border:2px solid #ef5350;border-radius:50%;color:#fff;font-size:14px;line-height:28px;text-align:center;z-index:10;box-shadow:0 0 12px rgba(239,83,80,0.7),0 0 30px rgba(239,83,80,0.3);opacity:0;transition:opacity 0.3s;pointer-events:none}', ".is-input-down.is-xray-deep .de-if-marker.left,.is-output-down.is-xray-deep .de-if-marker.right{z-index:11}", '.is-input-down.is-xray-deep .de-if-marker.left::after,.is-output-down.is-xray-deep .de-if-marker.right::after{content:"✖";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;background:rgba(220,40,40,0.85);border:2px solid #ef5350;border-radius:50%;color:#fff;font-size:14px;line-height:24px;text-align:center;box-shadow:0 0 12px rgba(239,83,80,0.7),0 0 30px rgba(239,83,80,0.3);pointer-events:none;z-index:11}', ".is-input-down .de-beam.in{background:repeating-linear-gradient(90deg,rgba(255,60,60,0.5) 0,rgba(255,60,60,0.5) 8px,transparent 8px,transparent 16px)!important;box-shadow:none!important}", ".is-input-down .de-label.in{color:#ef5350!important;text-shadow:0 0 6px rgba(239,83,80,0.5)!important}", ".is-input-down .de-energy.el{background:radial-gradient(circle,rgba(255,80,60,0.6) 0%,rgba(255,60,60,0.2) 40%,transparent 70%)!important;box-shadow:0 0 10px rgba(255,60,60,0.3)!important;animation:none!important}", ".is-input-down.is-xray-deep .de-packet,.is-input-down.is-xray-deep .de-packet.p2{animation:none!important;opacity:0!important}", '.xray-deep-engine::after{content:"✖";position:absolute;right:1.7%;top:50%;transform:translate(50%,-50%);width:28px;height:28px;background:rgba(220,40,40,0.85);border:2px solid #ef5350;border-radius:50%;color:#fff;font-size:14px;line-height:28px;text-align:center;z-index:10;box-shadow:0 0 12px rgba(239,83,80,0.7),0 0 30px rgba(239,83,80,0.3);opacity:0;transition:opacity 0.3s;pointer-events:none}', ".is-output-down.is-xray-deep .xray-deep-engine::after{opacity:0}", ".is-output-down.is-xray-deep .de-beam.out{background:repeating-linear-gradient(90deg,rgba(255,60,60,0.5) 0,rgba(255,60,60,0.5) 8px,transparent 8px,transparent 16px)!important;box-shadow:none!important}", ".is-output-down.is-xray-deep .de-energy.er{background:radial-gradient(circle,rgba(255,80,60,0.6) 0%,rgba(255,60,60,0.2) 40%,transparent 70%);box-shadow:0 0 10px rgba(255,60,60,0.3);animation:none}", ".is-output-down.is-xray-deep .de-label.out{color:#ef5350;text-shadow:0 0 6px rgba(239,83,80,0.5)}", ".is-cleared .de-beam.out{background:var(--xto-link,#00e5ff);box-shadow:0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.7),0 0 50px rgba(var(--xto-link-rgb,0,229,255),0.3)}", ".is-cleared .de-energy.er{background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5),0 0 60px rgba(var(--xto-link-rgb,0,229,255),0.25);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".is-cleared .de-label.out{color:rgba(var(--xto-link-rgb,0,229,255),0.95);text-shadow:0 0 10px rgba(var(--xto-link-rgb,0,229,255),0.6)}", ".de-packet{position:absolute;top:50%;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 10px 4px rgba(255,255,255,0.7),0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.8);transform:translateY(-50%);z-index:6;opacity:0;display:none}", ".xray-state-ready .de-packet{display:block}", ":not(.ping-ok).is-xray-deep.ping-through .de-packet{animation:xrayDeepPacketStop 2s ease-in-out infinite}", ":not(.ping-ok).is-xray-deep.ping-through .de-packet.p2{animation-delay:1s}", ":not(.ping-ok).is-xray-deep.ping-from-r1 .de-packet{display:none}", ".is-xray-deep.ping-from-r1 .de-beam.in{display:none!important}", ".is-xray-deep.ping-from-r1 .de-energy.el{display:none!important}", ".is-xray-deep.ping-from-r1 .de-label.in{display:none!important}", ":not(.ping-ok).is-xray-deep.ping-cylinder-to-left .de-packet{display:none}", ".is-xray-deep.ping-cylinder-to-left .de-beam.out,.is-xray-deep.ping-cylinder-to-left .de-if-marker.right{display:none!important}", ".is-xray-deep.ping-cylinder-to-left .de-energy.er{display:none!important}", ".is-xray-deep.ping-cylinder-to-left .de-label.out{display:none!important}", ".xray-advertiser-view .de-beam.out,.xray-advertiser-view .de-tunnel:not(.left-side),.xray-advertiser-view .de-energy.er,.xray-advertiser-view .de-label.out,.xray-advertiser-view #de-ping-req,.xray-advertiser-view .de-ping-orb.reply,.xray-advertiser-view .de-if-marker.right{display:none!important}", ".xray-advertiser-view .de-packet,.xray-advertiser-view .de-packet.p2{display:none!important}", ".is-xray-deep.ping-from-r1 .de-beam.in,.is-xray-deep:not(.ping-through):not(.ping-from-r1):not(.ping-cylinder-to-left) .de-beam.in,.is-xray-deep.ping-from-r1 .de-if-marker.left,.is-xray-deep:not(.ping-through):not(.ping-from-r1):not(.ping-cylinder-to-left) .de-if-marker.left{display:none}", ".is-xray-deep.ping-from-r1 .de-energy.el,.is-xray-deep:not(.ping-through):not(.ping-from-r1):not(.ping-cylinder-to-left) .de-energy.el{display:none}", ".is-xray-deep.ping-from-r1 .de-label.in,.is-xray-deep:not(.ping-through):not(.ping-from-r1):not(.ping-cylinder-to-left) .de-label.in{display:none}", "[data-topo-triangle].is-xray-deep .de-beam.in,[data-topo-triangle].is-xray-deep .de-if-marker.left{display:block!important}", "[data-topo-triangle].is-xray-deep .de-energy.el{display:block!important}", "[data-topo-triangle].is-xray-deep .de-label.in{display:block!important}", "[data-topo-triangle].is-xray-deep .de-hello-orb.out{display:none!important}", "[data-topo-triangle].is-xray-deep .de-hello-orb.in{display:none!important}", ".is-single-link-edge.is-xray-deep .de-beam.in,.is-single-link-edge.is-xray-deep .de-if-marker.left,.is-single-link-edge.is-xray-deep .de-hello-orb.in,.is-single-link-edge.is-xray-deep .de-tunnel.left-side,.is-single-link-edge.is-xray-deep .de-side-left,.is-single-link-edge.is-xray-deep .de-label.in{display:none!important}", "[data-topo-triangle].is-xray-deep.hello-out .de-hello-orb.left-out{display:block!important}", "[data-topo-triangle].is-xray-deep.hello-in .de-hello-orb.left-in{display:block!important}", "@keyframes xrayDeepPacketStop{0%{left:3%;opacity:0;transform:translateY(-50%) scale(0.4)}10%{opacity:1;transform:translateY(-50%) scale(1)}40%{left:calc(50% - 60px);transform:translateY(-50%) scale(1.3)}55%{left:calc(50% - 60px);opacity:0.5;transform:translateY(-50%) scale(0.7)}80%{left:calc(50% - 60px);opacity:0}100%{left:calc(50% - 60px);opacity:0}}", ".ping-ok.is-xray-deep .de-packet{animation:xrayDeepPacket 2.8s ease-in-out infinite}", ".ping-ok.is-xray-deep .de-packet.p2{animation-delay:1.4s}", "@keyframes xrayDeepPacket{0%{left:3%;opacity:0;transform:translateY(-50%) scale(0.4)}8%{opacity:1;transform:translateY(-50%) scale(1)}42%{left:47%;transform:translateY(-50%) scale(1.5)}58%{left:53%;transform:translateY(-50%) scale(1.5)}92%{opacity:1;transform:translateY(-50%) scale(1)}100%{left:97%;opacity:0;transform:translateY(-50%) scale(0.4)}}", "@keyframes xrayEnergyPulse{0%{transform:translate(-50%,-50%) scale(0.7);opacity:0.6}100%{transform:translate(-50%,-50%) scale(1.3);opacity:1}}", ".de-ping-orb{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(var(--xto-link-rgb,0,229,255),0.8));box-shadow:0 0 12px rgba(var(--xto-link-rgb,0,229,255),0.7);transform:translateY(-50%);z-index:8;opacity:0;display:none}", ".ping-ok.is-xray-deep .de-ping-orb{display:block}", ".ping-ok.is-xray-deep .de-packet{display:none}", ".ping-ok.is-xray-deep .de-packet.p2{display:none}", ":not(.ping-ok).is-xray-deep .de-ping-orb{display:none!important}", ".xray-target-bypassed.is-xray-deep .de-ping-orb{display:none!important;animation:none!important}", ".xray-target-bypassed.is-xray-deep .de-packet{display:none!important;animation:none!important}", ".xray-target-bypassed.is-xray-deep .de-packet.p2{display:none!important;animation:none!important}", ".xray-target-bypassed:not(.xray-input-session-up).is-xray-deep .de-tunnel.left-side{height:0!important;opacity:0!important}", ".ping-ok.is-xray-deep.ping-from-r1 .de-ping-orb{animation:dePingR1Req 4s ease-in-out infinite}", ".ping-ok.is-xray-deep.ping-from-r1 .de-ping-orb.reply{animation:dePingR1Rep 4s ease-in-out infinite;animation-delay:2s}", "@keyframes dePingR1Req{0%{left:calc(50% + 10px);opacity:0}6%{opacity:1}40%{left:calc(100% - 14px);opacity:0.8}44%{left:calc(100% - 14px);opacity:0}100%{opacity:0}}", "@keyframes dePingR1Rep{0%{left:calc(100% - 14px);opacity:0}6%{opacity:1}40%{left:calc(50% + 10px);opacity:0.8}44%{left:calc(50% + 10px);opacity:0}100%{opacity:0}}", ".ping-ok.is-xray-deep.ping-through .de-ping-orb{animation:dePingThruReq 4s ease-in-out infinite}", ".ping-ok.is-xray-deep.ping-through .de-ping-orb.reply{animation:dePingThruRep 4s ease-in-out infinite;animation-delay:2s}", "@keyframes dePingThruReq{0%{left:3%;opacity:0}4%{opacity:1}20%{left:calc(50% - 10px);opacity:1;transform:translateY(-50%) scale(1.3)}25%{left:calc(50% + 10px);transform:translateY(-50%) scale(1.3)}45%{left:calc(100% - 14px);opacity:0.8}48%{left:calc(100% - 14px);opacity:0}100%{opacity:0}}", "@keyframes dePingThruRep{0%{left:calc(100% - 14px);opacity:0}4%{opacity:1}20%{left:calc(50% + 10px);opacity:1;transform:translateY(-50%) scale(1.3)}25%{left:calc(50% - 10px);transform:translateY(-50%) scale(1.3)}45%{left:3%;opacity:0.8}48%{left:3%;opacity:0}100%{opacity:0}}", ".de-hello-orb{position:absolute;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(var(--xto-idle-rgb,255,140,0),0.9));box-shadow:0 0 10px rgba(var(--xto-idle-rgb,255,140,0),0.7);z-index:7;opacity:0;display:none}", ".de-hello-orb.out{top:calc(50% + 10px)}", ".de-hello-orb.in{top:calc(50% - 18px)}", ".is-xray-deep.hello-out .de-hello-orb.out{display:block;animation:deHelloOut 10s ease-in-out infinite}", ".is-xray-deep.hello-in .de-hello-orb.in{display:block;animation:deHelloIn 10s ease-in-out 5s infinite}", "@keyframes deHelloOut{0%{left:calc(50% + 10px);opacity:0}2%{opacity:1}15%{left:calc(100% - 12px);opacity:0.8}18%{left:calc(100% - 12px);opacity:0}100%{opacity:0}}", "@keyframes deHelloIn{0%{left:calc(100% - 12px);opacity:0}2%{opacity:1}15%{left:calc(50% + 10px);opacity:0.8}18%{left:calc(50% + 10px);opacity:0}100%{opacity:0}}", ".de-hello-orb.left-out{top:calc(50% + 10px)}", ".de-hello-orb.left-in{top:calc(50% - 18px)}", ".is-xray-deep.hello-left-out .de-hello-orb.left-out{display:block;animation:deHelloLeftOut 10s ease-in-out infinite}", ".is-xray-deep.hello-left-in .de-hello-orb.left-in{display:block;animation:deHelloLeftIn 10s ease-in-out 5s infinite}", "@keyframes deHelloLeftOut{0%{left:calc(50% - 10px);opacity:0}2%{opacity:1}15%{left:12px;opacity:0.8}18%{left:12px;opacity:0}100%{opacity:0}}", "@keyframes deHelloLeftIn{0%{left:12px;opacity:0}2%{opacity:1}15%{left:calc(50% - 10px);opacity:0.8}18%{left:calc(50% - 10px);opacity:0}100%{opacity:0}}", ".is-input-down .de-hello-orb.left-out{display:none!important}", ".is-input-down .de-hello-orb.left-in{display:none!important}", '.de-panel{position:absolute;z-index:8;background:rgba(0,8,16,0.92);border:1px solid rgba(var(--xto-link-rgb,0,229,255),0.4);border-radius:5px;padding:12px 14px;font-family:"Courier New",monospace;font-size:11px;line-height:1.8;color:rgba(var(--xto-link-rgb,0,229,255),0.95);box-shadow:0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.1);backdrop-filter:blur(8px);min-width:220px;max-width:280px;opacity:0;transition:opacity 0.5s ease 0.3s}', ".xray-deep-engine .de-panel{top:30px;right:calc(50% + 100px);left:auto}", ".is-xray-deep .de-panel{opacity:1}", ".dd-engine .de-panel{top:30px;right:calc(50% + 100px);left:auto;opacity:1}", ".xray-deep-engine .de-bgp-panel,.dd-engine .de-bgp-panel{top:30px;bottom:auto;left:calc(50% + 100px);right:auto;min-width:280px;max-width:560px;max-height:360px;overflow-y:auto;overflow-x:auto}", "body.trace-active .xray-deep-engine .de-bgp-panel,body.trace-active .xray-deep-engine .de-bgp-decision-panel{max-width:calc(50% - 120px)}", "body.trace-active .de-bgp-panel{min-width:0}", "body.trace-active .de-bgp-panel .de-bgp-table{font-size:calc(10px * var(--de-bgp-fs,1))}", "body.trace-active .de-bgp-panel .de-bgp-table th{padding:2px 6px 3px 0;font-size:calc(9px * var(--de-bgp-fs,1));letter-spacing:0}", "body.trace-active .de-bgp-panel .de-bgp-table td{padding:2px 6px 2px 0}", ".de-bgp-panel .de-title{color:#bb86fc;text-shadow:0 0 8px rgba(187,134,252,0.55)}", ".de-bgp-panel .de-title,.de-bgp-decision-panel .de-title{font-size:calc(12px * var(--de-bgp-fs,1))}", ".de-bgp-panel .de-bgp-table{width:100%;border-collapse:collapse;font-size:calc(12px * var(--de-bgp-fs,1));margin-top:4px}", ".de-bgp-panel .de-bgp-table th{color:#bb86fc;text-align:left;font-weight:700;padding:2px 11px 4px 0;border-bottom:1px solid rgba(187,134,252,0.3);font-size:calc(11px * var(--de-bgp-fs,1));letter-spacing:0.3px}", ".de-bgp-fs-ctl{float:right;display:inline-flex;gap:3px;margin-left:8px}", ".de-bgp-fs-ctl button{background:rgba(187,134,252,0.12);border:1px solid rgba(187,134,252,0.4);color:#bb86fc;font-size:11px;line-height:1.1;padding:1px 6px;border-radius:4px;cursor:pointer;pointer-events:auto!important}", ".de-bgp-fs-ctl button:hover{background:rgba(187,134,252,0.28)}", ".de-bgp-panel .de-bgp-table td{color:rgba(var(--xto-link-rgb,0,229,255),0.9);padding:2px 11px 2px 0;white-space:nowrap}", ".de-bgp-panel .bgp-st{color:var(--xto-ospf,#39ff14);font-weight:700}", ".de-bgp-panel .de-bgp-table tr.bgp-best td{color:#aef5b0;background:rgba(var(--xto-ospf-rgb,57,255,20),0.10)}", ".de-bgp-panel .de-bgp-table tr.bgp-best .bgp-st{color:var(--xto-ospf,#39ff14);text-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.6)}", ".de-bgp-panel .de-bgp-table td.bgp-decider{background:rgba(255,193,7,0.22);color:#ffd54f;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,193,7,0.55)}", ".de-bgp-panel .de-bgp-table .bgp-default{color:rgba(var(--xto-link-rgb,0,229,255),0.45);font-style:italic}", ".de-bgp-panel .de-bgp-table td.bgp-decider .bgp-default{color:#ffd54f;font-style:normal}", ".xray-deep-engine .de-bgp-decision-panel,.dd-engine .de-bgp-decision-panel{top:auto;bottom:64px;left:calc(50% + 100px);right:auto;min-width:280px;max-width:560px;z-index:40}", ".xray-deep-engine.xray-unified-mode .de-bgp-decision-panel{top:calc(50% + 64px);bottom:auto;max-height:calc(50% - 84px);overflow-y:auto}", ".de-bgp-decision-panel .de-title{color:#ffd54f;text-shadow:0 0 8px rgba(255,193,7,0.5)}", ".de-bgp-decision-panel .bgp-reason{margin-top:6px;font-size:calc(12px * var(--de-bgp-fs,1));color:#66bb6a;line-height:1.5}", ".de-bgp-decision-panel .bgp-reason b{color:#ffd54f}", ".de-bgp-decision-panel .bgp-reason.bgp-reason-note{color:#7facc9}", ".de-bgp-decision-panel .bgp-chain{margin-top:3px;font-size:calc(10px * var(--de-bgp-fs,1));color:var(--xto-static,#888);line-height:1.6;letter-spacing:0.2px}", ".de-bgp-decision-panel .bgp-chain .bgp-step-tie{color:#6b7b8c}", ".de-bgp-decision-panel .bgp-chain .bgp-step-win{color:#ffd54f;font-weight:700}", ".de-bgp-decision-panel .bgp-chain .bgp-step-amb{color:#e0a060;font-weight:700}", ".de-bgp-decision-panel .bgp-legend{margin-top:5px;font-size:calc(10px * var(--de-bgp-fs,1));color:#999;letter-spacing:0.3px}", ".de-bgp-decision-panel .bgp-crit-btn{color:#ffd54f;cursor:pointer;border-bottom:1.5px dashed #ffd54f;padding:0 1px;font-weight:800;pointer-events:auto}", '.de-bgp-decision-panel .bgp-crit-btn::after{content:" \\25BE";font-size:0.85em}', ".de-bgp-decision-panel .bgp-crit-btn:hover,.de-bgp-decision-panel .bgp-crit-btn:focus-visible{background:rgba(255,213,79,0.16);border-radius:4px;outline:none}", ".de-bgp-bracket-pop{position:relative;z-index:2;margin-top:8px;background:#0c1a28;border:1px solid rgba(255,213,79,0.55);border-radius:8px;padding:8px 10px;display:none;box-shadow:0 8px 24px -10px rgba(0,0,0,0.8)}", ".de-bgp-bracket-pop.open{display:block}", ".de-bgp-bracket-pop .bp-h{display:flex;align-items:center;font-size:calc(11px * var(--de-bgp-fs,1));font-weight:700;color:#ffd54f;margin-bottom:6px}", ".de-bgp-bracket-pop .bp-x{margin-left:auto;cursor:pointer;color:#8fb0c8;border:none;background:transparent;font-size:13px;line-height:1;padding:0 2px;pointer-events:auto!important}", ".de-bgp-bracket-pop .bp-x:hover{color:#ff4d4d}", ".de-bgp-bracket-pop .bp-row{display:flex;justify-content:space-between;gap:14px;font-size:calc(11px * var(--de-bgp-fs,1));padding:2px 2px;font-variant-numeric:tabular-nums}", ".de-bgp-bracket-pop .bp-row .k{color:#8fb0c8}", ".de-bgp-bracket-pop .bp-row.tie .v{color:#6b7b8c}", ".de-bgp-bracket-pop .bp-row.win{background:rgba(57,255,20,0.08);border-radius:4px}", ".de-bgp-bracket-pop .bp-row.win .v b{color:#00e5ff}", ".de-bgp-bracket-pop .bp-more{display:block;margin-top:8px;padding-top:7px;border-top:1px dashed rgba(255,213,79,0.25);font-size:calc(11px * var(--de-bgp-fs,1));color:#00e5ff;text-decoration:none;font-weight:700;pointer-events:auto!important}", ".de-bgp-bracket-pop .bp-more:hover{text-decoration:underline}", ".de-panel .de-title{color:var(--xto-link,#00e5ff);font-weight:700;font-size:12px;margin-bottom:6px;letter-spacing:1px;text-shadow:0 0 8px rgba(var(--xto-link-rgb,0,229,255),0.6)}", ".de-panel .de-hl{color:var(--xto-ospf,#39ff14);font-weight:700}", ".de-panel .de-dim{color:rgba(var(--xto-link-rgb,0,229,255),0.35);font-size:10px}", ".de-panel .de-err{color:#ff4444;font-weight:700}", ".de-panel .de-warn{color:var(--xto-idle,#ff8c00);font-weight:700}", ".de-tunnel{position:absolute;top:50%;left:calc(50% + 60px);right:0;height:0;transform:translateY(-50%);z-index:1;pointer-events:none;overflow:hidden;opacity:0;transition:all 0.8s cubic-bezier(0.23,1,0.32,1)}", ".is-xray-deep.xray-state-full .de-tunnel:not(.left-side){height:36px;opacity:1}", ".is-xray-deep.xray-state-full.ping-through .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-bgp-established .de-tunnel:not(.left-side){height:36px;opacity:1}", ".is-xray-deep.xray-bgp-established.ping-cylinder-to-left .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-bgp-established.ping-through .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-bgp-established .de-tunnel-wall{background:var(--xto-bgp,#a855f7);box-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.5),0 0 14px rgba(var(--xto-bgp-rgb,168,85,247),0.2)}", ".is-xray-deep.xray-bgp-established .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 30%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 70%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)}", ".is-xray-deep.xray-bgp-established .de-tunnel-label{opacity:1;color:var(--xto-bgp,#a855f7);text-shadow:0 0 8px rgba(var(--xto-bgp-rgb,168,85,247),0.5);animation:xBgpTunnelPulse 2s ease-in-out infinite alternate}", "@keyframes xBgpTunnelPulse{0%{text-shadow:0 0 8px rgba(var(--xto-bgp-rgb,168,85,247),0.5)}100%{text-shadow:0 0 18px rgba(var(--xto-bgp-rgb,168,85,247),0.8)}}", ".is-xray-deep.xray-bgp-idle .de-tunnel:not(.left-side){height:36px;opacity:1}", ".is-xray-deep.xray-bgp-idle.ping-cylinder-to-left .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-bgp-idle.ping-through .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-bgp-idle .de-tunnel > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-bgp,#a855f7) 0 6px,transparent 6px 11px);opacity:0.42;box-shadow:none}", ".is-xray-deep.xray-bgp-idle .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.05) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.02) 30%,rgba(var(--xto-bgp-rgb,168,85,247),0.02) 70%,rgba(var(--xto-bgp-rgb,168,85,247),0.05) 100%)}", ".is-xray-deep.xray-bgp-idle .de-tunnel-label{opacity:0.55;color:var(--xto-bgp,#a855f7);text-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.3)}", ".de-tunnel-wall{position:absolute;left:0;right:0;height:1.5px;background:var(--xto-idle,#ff8c00);box-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.5),0 0 14px rgba(var(--xto-idle-rgb,255,140,0),0.2)}", ".de-tunnel-wall.top{top:0}", ".de-tunnel-wall.bot{bottom:0}", ".de-tunnel-fill{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(180deg,rgba(var(--xto-idle-rgb,255,140,0),0.08) 0%,rgba(var(--xto-idle-rgb,255,140,0),0.03) 30%,rgba(var(--xto-idle-rgb,255,140,0),0.03) 70%,rgba(var(--xto-idle-rgb,255,140,0),0.08) 100%);opacity:0;transition:opacity 0.6s ease 0.3s}", ".is-xray-deep.xray-state-full .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 30%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 70%,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 100%)}", ".is-xray-deep.xray-state-full .de-tunnel-wall{background:var(--xto-ospf,#39ff14);box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)}", '.de-tunnel-label{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-family:"Courier New",monospace;font-size:9px;font-weight:700;color:var(--xto-idle,#ff8c00);text-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.5);letter-spacing:1px;opacity:0;white-space:nowrap;transition:opacity 0.6s ease 0.8s}', ".is-xray-deep.xray-state-full .de-tunnel-label{opacity:1;color:var(--xto-ospf,#39ff14);text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5);animation:xtunnelLabelPulse 2s ease-in-out infinite alternate}", ".is-xray-deep.xray-ospftun-init .de-tunnel:not(.left-side),.is-xray-deep.xray-ospftun-2way .de-tunnel:not(.left-side),.is-xray-deep.xray-ospftun-exchange .de-tunnel:not(.left-side){height:36px;opacity:1}", ".is-xray-deep.xray-ospftun-init.ping-through .de-tunnel.left-side,.is-xray-deep.xray-ospftun-2way.ping-through .de-tunnel.left-side,.is-xray-deep.xray-ospftun-exchange.ping-through .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-ospftun-init .de-tunnel > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-idle,#ff8c00) 0 6px,transparent 6px 11px);box-shadow:0 0 5px rgba(var(--xto-idle-rgb,255,140,0),0.35)}", ".is-xray-deep.xray-ospftun-2way .de-tunnel > .de-tunnel-wall{background:var(--xto-idle,#ff8c00);box-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.5),0 0 14px rgba(var(--xto-idle-rgb,255,140,0),0.2)}", ".is-xray-deep.xray-ospftun-exchange .de-tunnel > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-ospf,#39ff14) 0 6px,transparent 6px 11px);box-shadow:0 0 5px rgba(var(--xto-ospf-rgb,57,255,20),0.35)}", ".is-xray-deep.xray-ospftun-init .de-tunnel-fill,.is-xray-deep.xray-ospftun-2way .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-idle-rgb,255,140,0),0.06) 0%,rgba(var(--xto-idle-rgb,255,140,0),0.03) 50%,rgba(var(--xto-idle-rgb,255,140,0),0.06) 100%)}", ".is-xray-deep.xray-ospftun-exchange .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.06) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 50%,rgba(var(--xto-ospf-rgb,57,255,20),0.06) 100%)}", ".is-xray-deep.xray-ospftun-init .de-tunnel-label,.is-xray-deep.xray-ospftun-2way .de-tunnel-label{opacity:0.85;color:var(--xto-idle,#ff8c00);text-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.4)}", ".is-xray-deep.xray-ospftun-exchange .de-tunnel-label{opacity:0.85;color:var(--xto-ospf,#39ff14);text-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.4)}", ".is-xray-deep:not(.de-angle-active).xray-ospftun-init .de-tunnel-fill,.is-xray-deep:not(.de-angle-active).xray-ospftun-2way .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-idle-rgb,255,140,0),0.42) 0%,rgba(var(--xto-idle-rgb,255,140,0),0.28) 50%,rgba(var(--xto-idle-rgb,255,140,0),0.42) 100%)}", ".is-xray-deep:not(.de-angle-active).xray-ospftun-exchange .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.28) 50%,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 100%)}", ".is-xray-deep:not(.de-angle-active).xray-state-full .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.28) 50%,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 100%)}", ".de-tunnel-inner{position:absolute;top:3px;bottom:3px;left:0;right:0;display:none;pointer-events:none}", ".de-tunnel.de-coexist .de-tunnel-inner{display:block}", ".de-tunnel.de-coexist-init .de-tunnel-inner .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-idle,#ff8c00) 0 6px,transparent 6px 11px)!important;box-shadow:0 0 5px rgba(var(--xto-idle-rgb,255,140,0),0.35)!important}", ".de-tunnel.de-coexist-2way .de-tunnel-inner .de-tunnel-wall{background:var(--xto-idle,#ff8c00)!important;box-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.5)!important}", ".de-tunnel.de-coexist-exchange .de-tunnel-inner .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-ospf,#39ff14) 0 6px,transparent 6px 11px)!important;box-shadow:0 0 5px rgba(var(--xto-ospf-rgb,57,255,20),0.35)!important}", ".de-tunnel.de-coexist-full .de-tunnel-inner .de-tunnel-wall{background:var(--xto-ospf,#39ff14)!important;box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)!important}", ".is-xray-deep .de-tunnel.de-coexist .de-tunnel-inner{display:none!important}", ".is-xray-deep .de-tunnel.de-coexist.de-side-bgp > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 50%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)!important}", ".is-xray-deep .de-tunnel.de-coexist > .de-tunnel-fill{position:relative}", '.is-xray-deep .de-tunnel.de-coexist > .de-tunnel-fill::after{content:"";position:absolute;left:0;right:0;top:calc(50% + 2px);height:10px;transform:translateY(-50%);pointer-events:none;z-index:1}', ".is-xray-deep .de-tunnel.de-coexist-full > .de-tunnel-fill::after{background:rgba(var(--xto-ospf-rgb,57,255,20),0.9);box-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5)}", ".is-xray-deep .de-tunnel.de-coexist-exchange > .de-tunnel-fill::after{background:repeating-linear-gradient(90deg,rgba(var(--xto-ospf-rgb,57,255,20),0.9) 0 6px,transparent 6px 11px)}", ".is-xray-deep .de-tunnel.de-coexist-2way > .de-tunnel-fill::after{background:rgba(var(--xto-idle-rgb,255,140,0),0.9);box-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", ".is-xray-deep .de-tunnel.de-coexist-init > .de-tunnel-fill::after{background:repeating-linear-gradient(90deg,rgba(var(--xto-idle-rgb,255,140,0),0.9) 0 6px,transparent 6px 11px)}", ".is-xray-deep .de-tunnel.de-side-show{height:36px!important;opacity:1!important}", ".is-xray-deep .de-tunnel.de-side-show > .de-tunnel-fill{opacity:0!important}", ".is-xray-deep .de-tunnel.de-side-bgp > .de-tunnel-wall{background:var(--xto-bgp,#a855f7)!important;box-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.5),0 0 14px rgba(var(--xto-bgp-rgb,168,85,247),0.2)!important}", ".is-xray-deep .de-tunnel.de-side-bgp > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 50%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)!important}", ".is-xray-deep .de-tunnel.de-side-bgp-idle > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-bgp,#a855f7) 0 6px,transparent 6px 11px)!important;opacity:0.42!important;box-shadow:none!important}", ".is-xray-deep .de-tunnel.de-side-ospf-full > .de-tunnel-wall{background:var(--xto-ospf,#39ff14)!important;box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)!important}", ".is-xray-deep .de-tunnel.de-side-ospf-full > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.28) 50%,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 100%)!important}", ".is-xray-deep .de-tunnel.de-side-ospf-exchange > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-ospf,#39ff14) 0 6px,transparent 6px 11px)!important;box-shadow:0 0 5px rgba(var(--xto-ospf-rgb,57,255,20),0.35)!important}", ".is-xray-deep .de-tunnel.de-side-ospf-2way > .de-tunnel-wall{background:var(--xto-idle,#ff8c00)!important;box-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.5)!important}", ".is-xray-deep .de-tunnel.de-side-ospf-init > .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-idle,#ff8c00) 0 6px,transparent 6px 11px)!important;box-shadow:0 0 5px rgba(var(--xto-idle-rgb,255,140,0),0.35)!important}", ".is-xray-deep .xray-deep-engine .de-tunnel.left-side.de-side-show{height:36px!important;opacity:1!important}", ".is-xray-deep .xray-deep-engine .de-tunnel:not(.left-side).de-side-show{height:36px!important;opacity:1!important}", "@keyframes xtunnelLabelPulse{0%{text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5)}100%{text-shadow:0 0 18px rgba(var(--xto-ospf-rgb,57,255,20),0.8)}}", ".de-panel-initial{display:block}", ".de-panel-cleared{display:none}", ".is-cleared .de-panel-initial{display:none}", ".is-cleared .de-panel-cleared{display:block}", ".is-xray-deep.xray-state-inactive .xray-deep-engine .de-energy.er{animation:none}", ".is-xray-deep.xray-bgp-idle .xray-deep-engine .de-beam.out{background:var(--xto-link,#00e5ff);box-shadow:0 0 10px rgba(var(--xto-link-rgb,0,229,255),0.5)}", ".is-xray-deep.xray-bgp-idle .xray-deep-engine .de-energy.er{background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".is-xray-deep.xray-bgp-idle .xray-deep-engine .de-label.out{color:var(--xto-idle,#ff8c00)}", ".is-xray-deep.xray-bgp-established .xray-deep-engine .de-beam.out{background:var(--xto-link,#00e5ff);box-shadow:0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.7),0 0 50px rgba(var(--xto-link-rgb,0,229,255),0.3)}", ".is-xray-deep.xray-bgp-established .xray-deep-engine .de-energy.er{background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".is-xray-deep.xray-bgp-established .xray-deep-engine .de-label.out{color:rgba(var(--xto-link-rgb,0,229,255),0.95);text-shadow:0 0 10px rgba(var(--xto-link-rgb,0,229,255),0.6)}", ".xray-deep-engine{position:relative;width:100%;height:0;overflow:hidden;opacity:0;transition:opacity 0.4s,height 0.4s;border-radius:6px;margin-top:10px;display:none}", ".xray-deep-engine::before,.xray-deep-engine::after{display:none!important}", ".is-xray-deep .xray-deep-engine{display:block}", ".is-xray-deep .xray-deep-engine::before,.is-xray-deep .xray-deep-engine::after{display:block!important}", ".is-xray-deep .xray-deep-engine{opacity:1;height:400px}", ".is-xray-deep .topo-diagram{display:none!important}", ".is-xray-deep .topo-header{display:none!important}", ".is-xray-deep .topology{background:transparent!important;padding:0!important;border-radius:0!important}", ".is-xray-deep .btn-xray{display:none!important}", ".is-xray-deep .neighbor-panel,.is-xray-deep .link-status,.is-xray-deep .topo-tri-arrows,.is-replaying .neighbor-panel,.is-replaying .link-status,.is-replaying .topo-tri-arrows,.is-replaying .panels-row{display:none!important}", ".de-box-svg{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}", ".de-cyl-svg{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:160px;height:320px;z-index:3}", ".de-beam{position:absolute;top:50%;height:4px;z-index:2;box-shadow:0 0 12px rgba(var(--xto-link-rgb,0,229,255),0.6),0 0 30px rgba(var(--xto-link-rgb,0,229,255),0.2)}", ".de-beam.out{left:calc(50% + 60px);right:0;background:var(--xto-link,#00e5ff)}", ".de-energy{position:absolute;top:50%;width:20px;height:20px;border-radius:50%;transform:translate(-50%,-50%);z-index:4;background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 15px 6px rgba(var(--xto-link-rgb,0,229,255),0.5),0 0 40px rgba(var(--xto-link-rgb,0,229,255),0.2);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".de-energy.er{left:calc(50% + 60px)}", '.de-label{position:absolute;top:50%;z-index:5;font-family:"Courier New",monospace;font-size:12px;font-weight:700;color:rgba(var(--xto-link-rgb,0,229,255),0.95);text-shadow:0 0 8px rgba(var(--xto-link-rgb,0,229,255),0.5);white-space:nowrap}', ".de-label.out{right:10px;transform:translateY(14px)}", ".de-r1-label{position:absolute;top:24px;left:60px;z-index:7;text-align:left;opacity:0;transition:opacity 0.4s ease 0.2s}", ".is-xray-deep .de-r1-label{opacity:1}", ".de-r1-name{font-size:22px;font-weight:700;color:var(--xto-ospf,#39ff14);text-shadow:0 0 12px rgba(var(--xto-ospf-rgb,57,255,20),0.5);letter-spacing:3px}", ".de-r1-sub{font-size:10px;color:rgba(var(--xto-ospf-rgb,57,255,20),0.4);margin-top:2px}", ".is-xray-deep.xray-state-init .de-beam.out,.is-xray-deep.xray-state-exchange .de-beam.out{background:var(--xto-link,#00e5ff)!important;box-shadow:0 0 10px rgba(var(--xto-link-rgb,0,229,255),0.5)!important}", ".is-xray-deep.xray-state-init .de-energy.er,.is-xray-deep.xray-state-exchange .de-energy.er{background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".is-xray-deep.xray-state-init .de-label.out,.is-xray-deep.xray-state-exchange .de-label.out{color:var(--xto-idle,#ff8c00)!important;text-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.4)!important}", ".is-xray-deep.xray-state-full .de-beam.out{background:var(--xto-link,#00e5ff);box-shadow:0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.7),0 0 50px rgba(var(--xto-link-rgb,0,229,255),0.3)}", ".is-xray-deep.xray-state-full .de-energy.er{background:radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%);box-shadow:0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5);animation:xrayEnergyPulse 1.5s ease-in-out infinite alternate}", ".is-xray-deep.xray-state-full .de-label.out{color:rgba(var(--xto-link-rgb,0,229,255),0.95);text-shadow:0 0 10px rgba(var(--xto-link-rgb,0,229,255),0.6)}", ".de-ospf{position:absolute;top:16%;left:50%;transform:translateX(-50%);z-index:5;text-align:center}", ".de-ospf-core{width:50px;height:50px;border-radius:50%;border:2px solid var(--xto-down,#555);background:rgba(40,40,40,0.4);margin:0 auto;transition:all 0.6s;position:relative}", ".de-ospf-core .inner{width:16px;height:16px;border-radius:50%;background:#333;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:all 0.6s}", ".is-xray-deep.xray-state-init .de-ospf-core,.is-xray-deep.xray-state-exchange .de-ospf-core,.is-xray-deep.xray-state-full .de-ospf-core{border-color:var(--xto-idle,#ff8c00);box-shadow:0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", '.de-ospf-label{font-family:"Courier New",monospace;font-size:8px;color:#666;margin-top:4px;transition:color 0.5s}', ".is-xray-deep.xray-state-init .de-ospf-label,.is-xray-deep.xray-state-exchange .de-ospf-label{color:var(--xto-idle,#ff8c00)}", ".is-xray-deep.xray-state-full .de-ospf-label{color:var(--xto-ospf,#39ff14)}", ".de-ospf-coexist{display:none;top:auto;bottom:18%}", "body.de-coexist-glyph .de-ospf-coexist{display:flex;flex-direction:column-reverse;align-items:center}", ".de-ospf-coexist .de-ospf-label{margin-top:0;margin-bottom:3px}", ".de-bgp-proc{position:absolute;top:16%;left:50%;transform:translateX(-50%);z-index:5;text-align:center}", ".de-bgp-proc-core{width:50px;height:50px;border-radius:50%;border:2px solid var(--xto-down,#555);background:rgba(40,40,40,0.4);margin:0 auto;transition:all 0.6s;position:relative}", ".de-bgp-proc-core .inner{width:16px;height:16px;border-radius:50%;background:#333;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:all 0.6s}", ".is-xray-deep.xray-bgpproc-up .de-bgp-proc-core{border-color:var(--xto-idle,#ff8c00);box-shadow:0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", ".is-xray-deep.xray-bgpproc-up .de-bgp-proc-core .inner{background:var(--xto-idle,#ff8c00)}", ".is-xray-deep.xray-bgpproc-est .de-bgp-proc-core{border-color:var(--xto-bgp,#a855f7);box-shadow:0 0 20px rgba(var(--xto-bgp-rgb,168,85,247),0.6)}", ".is-xray-deep.xray-bgpproc-est .de-bgp-proc-core .inner{background:var(--xto-bgp,#a855f7)}", '.de-bgp-proc-label{font-family:"Courier New",monospace;font-size:8px;color:#666;margin-top:4px;transition:color 0.5s}', ".is-xray-deep.xray-bgpproc-up .de-bgp-proc-label{color:var(--xto-idle,#ff8c00)}", ".is-xray-deep.xray-bgpproc-est .de-bgp-proc-label{color:var(--xto-bgp,#a855f7)}", '.de-lsdb{position:absolute;bottom:14%;left:50%;transform:translateX(-50%);z-index:5;width:180px;background:rgba(0,8,16,0.9);border:1px solid rgba(var(--xto-idle-rgb,255,140,0),0.3);border-radius:5px;padding:10px 12px;font-family:"Courier New",monospace;font-size:9px;color:rgba(var(--xto-idle-rgb,255,140,0),0.7);backdrop-filter:blur(4px);transition:all 0.5s}', ".de-lsdb .lsdb-hd{font-weight:700;font-size:10px;color:var(--xto-idle,#ff8c00);margin-bottom:4px;letter-spacing:1px;text-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.4)}", ".de-lsdb .lsdb-bar{height:4px;background:#1a1a1a;border-radius:3px;overflow:hidden;margin-bottom:6px}", ".de-lsdb .lsdb-bar-fill{height:100%;width:0;background:linear-gradient(90deg,var(--xto-idle,#ff8c00),#ffb347);border-radius:3px;transition:width 0.4s}", ".de-lsdb .lsdb-row{padding:2px 0;border-bottom:1px solid rgba(var(--xto-idle-rgb,255,140,0),0.1)}", ".de-lsdb .lsdb-row .type{color:var(--xto-idle,#ff8c00);font-weight:700}", '.de-loading-ind{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;display:none;align-items:center;gap:8px;font-family:"Courier New",monospace;font-size:12px;color:var(--xto-idle,#ff8c00);letter-spacing:1px;text-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.5)}', ".is-xray-deep.de-loading .de-loading-ind{display:flex}", ".de-loading-ind .de-load-spin{width:14px;height:14px;border:2px solid rgba(var(--xto-idle-rgb,255,140,0),0.25);border-top-color:var(--xto-idle,#ff8c00);border-radius:50%;animation:deLoadSpin 0.8s linear infinite}", "@keyframes deLoadSpin{to{transform:rotate(360deg)}}", ".is-xray-deep.de-loading .xray-deep-engine .de-cyl-svg,.is-xray-deep.de-loading .xray-deep-engine .de-ospf,.is-xray-deep.de-loading .xray-deep-engine .de-bgp-proc,.is-xray-deep.de-loading .xray-deep-engine .de-lsdb,.is-xray-deep.de-loading .xray-deep-engine .de-panel,.is-xray-deep.de-loading .xray-deep-engine .de-bgp-panel,.is-xray-deep.de-loading .xray-deep-engine .de-bgp-decision-panel,.is-xray-deep.de-loading .xray-deep-engine .de-tunnel,.is-xray-deep.de-loading .xray-deep-engine .de-beam,.is-xray-deep.de-loading .xray-deep-engine .de-energy,.is-xray-deep.de-loading .xray-deep-engine .de-label,.is-xray-deep.de-loading .xray-deep-engine .de-if-marker,.is-xray-deep.de-loading .xray-deep-engine .de-ping-orb,.is-xray-deep.de-loading .xray-deep-engine .de-hello-orb,.is-xray-deep.de-loading .xray-deep-engine .de-packet,.is-xray-deep.de-loading .xray-deep-engine .de-lsa-container,.is-xray-deep.de-loading .xray-deep-engine #xray-deep-unified{visibility:hidden!important}", ".de-beam.in{left:0;right:calc(50% + 60px);background:var(--xto-link,#00e5ff);box-shadow:0 0 12px rgba(var(--xto-link-rgb,0,229,255),0.6),0 0 30px rgba(var(--xto-link-rgb,0,229,255),0.2)}", ".de-if-marker{position:absolute;top:calc(50% + 2px);width:8px;height:8px;background:var(--xto-bg,#0d1620);border:1.5px solid var(--xto-link,#00e5ff);box-sizing:border-box;z-index:4;pointer-events:none}", ".de-if-marker.left{left:1.67%;transform:translate(-50%,-50%)}", ".de-if-marker.right{right:1.67%;transform:translate(50%,-50%)}", ".is-input-down .de-if-marker.left,.is-output-down .de-if-marker.right{border-color:var(--xto-linkDown,#ff4d4d)}", ".de-energy.el{left:calc(50% - 60px);right:auto}", ".de-label.in{left:1.7%;transform:translateY(20px);text-align:left}", ".de-tunnel.left-side{position:absolute;top:50%;left:0;right:calc(50% + 60px);height:0;transform:translateY(-50%);z-index:1;pointer-events:none;overflow:hidden;opacity:0;transition:all 0.8s cubic-bezier(0.23,1,0.32,1)}", ".de-tunnel.left-side.tunnel-active{height:36px;opacity:1}", "#de-tunnel-left:not(.tunnel-active):not(.tunnel-2way),#de-tunnel-right:not(.tunnel-active):not(.tunnel-2way){height:0!important;opacity:0!important}", "#de-tunnel-left.tunnel-active,#de-tunnel-right.tunnel-active{height:36px!important;opacity:1!important}", "#de-tunnel-left.tunnel-active .de-tunnel-fill,#de-tunnel-right.tunnel-active .de-tunnel-fill{opacity:1}", "#de-tunnel-left.tunnel-active .de-tunnel-wall,#de-tunnel-right.tunnel-active .de-tunnel-wall{background:var(--xto-ospf,#39ff14);box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)}", "#de-tunnel-left.tunnel-active .de-tunnel-label,#de-tunnel-right.tunnel-active .de-tunnel-label{opacity:1;color:var(--xto-ospf,#39ff14);text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5);animation:xtunnelLabelPulse 2s ease-in-out infinite alternate}", "#de-tunnel-left.tunnel-2way,#de-tunnel-right.tunnel-2way{height:36px!important;opacity:1!important}", "#de-tunnel-left.tunnel-2way .de-tunnel-fill,#de-tunnel-right.tunnel-2way .de-tunnel-fill{opacity:1}", "#de-tunnel-left.tunnel-2way .de-tunnel-wall,#de-tunnel-right.tunnel-2way .de-tunnel-wall{background:#ffcc80;box-shadow:0 0 6px rgba(255,204,128,0.5),0 0 14px rgba(255,204,128,0.2)}", "#de-tunnel-left.tunnel-2way .de-tunnel-label,#de-tunnel-right.tunnel-2way .de-tunnel-label{opacity:1;color:#ffcc80;text-shadow:0 0 8px rgba(255,204,128,0.5);animation:xtunnelLabelPulse 2s ease-in-out infinite alternate}", ".is-xray-deep.xray-bgp-established #de-tunnel-left.tunnel-active .de-tunnel-wall,.is-xray-deep.xray-bgp-established #de-tunnel-right.tunnel-active .de-tunnel-wall{background:var(--xto-bgp,#a855f7);box-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.5),0 0 14px rgba(var(--xto-bgp-rgb,168,85,247),0.2)}", ".is-xray-deep.xray-bgp-established #de-tunnel-left.tunnel-active .de-tunnel-fill,.is-xray-deep.xray-bgp-established #de-tunnel-right.tunnel-active .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 30%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 70%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)}", ".is-xray-deep.xray-bgp-established #de-tunnel-left.tunnel-active .de-tunnel-label,.is-xray-deep.xray-bgp-established #de-tunnel-right.tunnel-active .de-tunnel-label{opacity:1;color:var(--xto-bgp,#a855f7);text-shadow:0 0 8px rgba(var(--xto-bgp-rgb,168,85,247),0.5);animation:xBgpTunnelPulse 2s ease-in-out infinite alternate}", ".is-xray-deep.xray-bgp-idle #de-tunnel-left.tunnel-active .de-tunnel-wall,.is-xray-deep.xray-bgp-idle #de-tunnel-right.tunnel-active .de-tunnel-wall{background:repeating-linear-gradient(90deg,var(--xto-bgp,#a855f7) 0 6px,transparent 6px 11px);opacity:0.42;box-shadow:none}", ".is-xray-deep.xray-bgp-idle #de-tunnel-left.tunnel-active .de-tunnel-fill,.is-xray-deep.xray-bgp-idle #de-tunnel-right.tunnel-active .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.05) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.02) 30%,rgba(var(--xto-bgp-rgb,168,85,247),0.02) 70%,rgba(var(--xto-bgp-rgb,168,85,247),0.05) 100%)}", ".is-xray-deep.xray-bgp-idle #de-tunnel-left.tunnel-active .de-tunnel-label,.is-xray-deep.xray-bgp-idle #de-tunnel-right.tunnel-active .de-tunnel-label{opacity:0.55;color:var(--xto-bgp,#a855f7);text-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.3)}", ".de-tunnel.left-side .de-tunnel-fill{opacity:1}", ".de-tunnel.left-side .de-tunnel-label{opacity:1;animation:xtunnelLabelPulse 2s ease-in-out infinite alternate}", ".de-ping-orb.left-req{animation:none;display:none}", ".de-ping-orb.left-rep{animation:none;display:none}", ".ping-left.ping-ok.is-xray-deep .de-ping-orb.left-req{display:block;animation:dePingLeftReq 4s ease-in-out infinite}", ".ping-left.ping-ok.is-xray-deep .de-ping-orb.left-rep{display:block;animation:dePingLeftRep 4s ease-in-out 2s infinite}", ".ping-left.ping-ok.is-xray-deep .de-ping-orb:not(.left-req):not(.left-rep){display:none}", "@keyframes dePingLeftReq{0%{left:calc(50% - 10px);opacity:0}6%{opacity:1}40%{left:14px;opacity:0.8}44%{left:14px;opacity:0}100%{opacity:0}}", "@keyframes dePingLeftRep{0%{left:14px;opacity:0}6%{opacity:1}40%{left:calc(50% - 10px);opacity:0.8}44%{left:calc(50% - 10px);opacity:0}100%{opacity:0}}", ".xray-ospf-unit{position:absolute;bottom:-6px;right:-6px;width:28px;height:28px;border-radius:50%;border:2px solid var(--xto-down,#555);background:rgba(var(--xto-down-rgb,85,85,85),0.3);transition:all 0.6s;z-index:2;display:none}", ".is-xray-mode .xray-ospf-unit{display:none!important}", ".is-xray-mode .xray-ospf-unit{display:none!important}", ".xray-ospf-unit .xray-ospf-dot{width:10px;height:10px;border-radius:50%;background:var(--xto-down,#555);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:all 0.6s}", ".xray-ospf-unit.ospf-active{border-color:var(--xto-idle,#ff8c00);box-shadow:0 0 12px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", ".xray-ospf-unit.ospf-active .xray-ospf-dot{background:var(--xto-idle,#ff8c00);box-shadow:0 0 8px var(--xto-idle,#ff8c00)}", ".is-xray-deep.xray-state-inactive .xray-deep-engine .de-packet{top:calc(50% - 18px)}", ".is-output-down .de-hello-orb.out{display:none!important}", ".is-output-down .de-hello-orb.in{display:none!important}", ".is-output-down:not(.ping-ok) .de-ping-orb{display:none!important}", ".is-output-down:not([data-topo-triangle]) .de-tunnel{opacity:0!important;height:0!important}", ".is-input-down .de-hello-orb.in{display:none!important}", ".is-input-down .de-hello-orb.out{display:none!important}", ".is-input-down:not(.ping-ok) .de-ping-orb{display:none!important}", ".is-input-down .de-packet{display:none!important}", ".is-input-down .de-packet.p2{display:none!important}", ".is-input-down.is-output-down .de-hello-orb{display:none!important}", ".is-input-down.is-output-down .de-packet{display:none!important}", ".btn-xray{position:absolute;top:16px;right:16px;z-index:12;background:rgba(var(--xto-ospf-rgb,57,255,20),0.12);color:var(--xto-ospf,#39ff14);border:1px solid rgba(var(--xto-ospf-rgb,57,255,20),0.3);font-size:11px;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;transition:all 0.3s;animation:xrayBtnBlink 1.5s ease-in-out infinite alternate}", ".btn-xray:hover{background:rgba(var(--xto-ospf-rgb,57,255,20),0.22)}", ".btn-xray.active{background:rgba(var(--xto-ospf-rgb,57,255,20),0.35);border-color:var(--xto-ospf,#39ff14);box-shadow:0 0 12px rgba(var(--xto-ospf-rgb,57,255,20),0.4);animation:xrayBtnActive 0.8s ease-in-out infinite alternate}", "@keyframes xrayBtnBlink{0%{box-shadow:0 0 4px rgba(var(--xto-ospf-rgb,57,255,20),0.2)}100%{box-shadow:0 0 16px rgba(var(--xto-ospf-rgb,57,255,20),0.6),0 0 30px rgba(var(--xto-ospf-rgb,57,255,20),0.2)}}", "@keyframes xrayBtnActive{0%{box-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.4);transform:scale(1)}100%{box-shadow:0 0 24px rgba(var(--xto-ospf-rgb,57,255,20),0.8),0 0 50px rgba(var(--xto-ospf-rgb,57,255,20),0.3);transform:scale(1.08)}}", ".xray-packet-orb{position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px rgba(255,255,255,0.7),0 0 30px rgba(var(--xto-link-rgb,0,229,255),0.8);top:50%;transform:translateY(-50%);opacity:0;pointer-events:none;z-index:5}", ".is-xray-mode:not(.ping-through):not(.ping-from-r1):not(.ping-cylinder-to-left) .xray-packet-orb{animation:none!important;opacity:0!important}", ".is-xray-mode.ping-through .xray-packet-orb{animation:xrayPktDyn 2.4s ease-in-out infinite;animation-delay:2s}", ".is-xray-mode .xray-packet-orb.orb2{animation-delay:3.2s;width:7px;height:7px;box-shadow:0 0 8px 3px rgba(255,255,255,0.5),0 0 20px rgba(var(--xto-ospf-rgb,57,255,20),0.6)}", ":not(.is-cleared).is-xray-mode.ping-through .xray-packet-orb{animation:none!important;opacity:0!important}", ":not(.is-cleared).is-xray-mode.ping-from-r1 .xray-packet-orb{animation:none!important;opacity:0!important}", ":not(.is-cleared).is-xray-mode.ping-cylinder-to-left .xray-packet-orb{animation:none!important;opacity:0!important}", ".is-xray-deep.ping-cylinder-to-left .de-tunnel:not(.left-side){display:none!important}", ".is-xray-deep.xray-state-full.ping-cylinder-to-left .de-tunnel.left-side{height:36px;opacity:1}", ".is-xray-deep.xray-state-full.ping-cylinder-to-left .de-tunnel.left-side .de-tunnel-fill{opacity:1;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 30%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 70%,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 100%)}", ".is-xray-deep.xray-state-full.ping-cylinder-to-left .de-tunnel.left-side .de-tunnel-wall{background:var(--xto-ospf,#39ff14);box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)}", ".is-xray-deep.xray-state-full.ping-cylinder-to-left .de-tunnel.left-side .de-tunnel-label{opacity:1;color:var(--xto-ospf,#39ff14);text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5);animation:xtunnelLabelPulse 2s ease-in-out infinite alternate}", ".is-xray-deep.ping-cylinder-to-left .de-hello-orb.out{display:none!important}", ".is-xray-deep.ping-cylinder-to-left .de-hello-orb.in{display:none!important}", ".is-xray-deep.ping-cylinder-to-left.hello-out .de-hello-orb.left-out{display:block!important;animation:deHelloLeftOut 10s ease-in-out infinite}", ".is-xray-deep.ping-cylinder-to-left.hello-in .de-hello-orb.left-in{display:block!important;animation:deHelloLeftIn 10s ease-in-out 5s infinite}", ".is-input-down.is-xray-mode .xray-packet-orb{animation:none!important;opacity:0!important}", ".ping-ok.is-xray-mode:not(.is-xray-deep) .xray-packet-orb{animation:xrayOvPingReq 4s ease-in-out infinite!important;animation-delay:0s!important}", ".ping-ok.is-xray-mode:not(.is-xray-deep) .xray-packet-orb.orb2{animation:xrayOvPingRep 4s ease-in-out infinite!important;animation-delay:2s!important}", ".is-xray-mode .topology{background:rgba(5,15,25,0.4)!important;border:1px solid rgba(var(--xto-link-rgb,0,229,255),0.2)!important;overflow:hidden}", ".is-xray-mode .topo-box{background:rgba(0,15,30,0.95)!important;border-color:var(--xto-link,#00e5ff)!important;box-shadow:0 0 15px rgba(var(--xto-link-rgb,0,229,255),0.3),inset 0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.08)!important;position:relative;z-index:1}", ".is-xray-mode .topo-box:not(.target) h4{color:var(--xto-link,#00e5ff)!important;text-shadow:0 0 8px rgba(var(--xto-link-rgb,0,229,255),0.5)}", ".is-xray-mode .topo-box:not(.target) .role{color:rgba(var(--xto-link-rgb,0,229,255),0.6)!important}", ".is-xray-mode .topo-box:not(.target) .terminal-hint{visibility:hidden}", ".is-xray-mode .topo-iface .ip,.is-xray-mode .topo-link-subnet{pointer-events:auto!important;cursor:pointer!important}", ".is-xray-mode a.topo-box-link{pointer-events:none!important;cursor:default!important}", ".is-xray-mode .topo-box.target .role,.is-xray-mode .topo-box.target .topo-iface,.is-xray-mode .topo-box.target .terminal-hint{visibility:hidden}", ".is-xray-mode .xray-logic .label{color:#78909c!important}", ".is-xray-mode .xray-logic .ip{color:var(--rc-topo-ip)!important;cursor:pointer;border-radius:2px;padding:0 2px;pointer-events:auto;position:relative;z-index:6}", ".is-xray-mode .xray-logic .ip.copied{background:#27ae60!important;color:#fff!important}", ".is-xray-mode .topo-box.target{border-color:var(--xto-ospf,#39ff14)!important;border-width:2px!important;box-shadow:none!important;outline:none;animation:xrayR1Blink 1.5s ease-in-out infinite alternate}", ".is-xray-mode .topo-box.target h4{visibility:visible!important;color:var(--xto-ospf,#39ff14)!important;text-shadow:0 0 10px rgba(var(--xto-ospf-rgb,57,255,20),0.6);position:relative;z-index:8}", ".is-xray-mode .topo-box.deepdive-target:not(.target){border-color:var(--xto-ospf,#39ff14)!important;border-width:2px!important;box-shadow:0 0 12px rgba(var(--xto-ospf-rgb,57,255,20),0.35)!important;cursor:pointer}", ".is-xray-mode .topo-box.deepdive-target:not(.target) h4{color:var(--xto-ospf,#39ff14)!important;text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5)}", ".is-xray-mode a.topo-box-link:has(> .topo-box.deepdive-target){cursor:pointer;pointer-events:auto!important}", ".is-xray-mode .topo-link-line{background:#607d8b!important;box-shadow:none!important;height:4px!important;position:relative;z-index:1}", ".is-xray-mode .topo-link-label{color:rgba(var(--xto-link-rgb,0,229,255),0.8)!important;text-shadow:0 0 6px rgba(var(--xto-link-rgb,0,229,255),0.4)}", ".is-xray-mode .topo-link-subnet{color:rgba(var(--xto-link-rgb,0,229,255),0.6)!important}", "@keyframes xrayR1Blink{from{outline:2px solid transparent;outline-offset:2px;filter:drop-shadow(0 0 4px rgba(var(--xto-ospf-rgb,57,255,20),0.2))}to{outline:3px solid var(--xto-ospf,#39ff14);outline-offset:4px;filter:drop-shadow(0 0 20px rgba(var(--xto-ospf-rgb,57,255,20),0.8)) drop-shadow(0 0 40px rgba(var(--xto-ospf-rgb,57,255,20),0.4))}}", ".is-xray-mode .topo-link-line{transition:stroke 0.5s,stroke-width 0.3s,filter 0.5s}", ".is-xray-mode .topo-link-line{align-self:stretch!important;width:auto!important;margin-left:-5px!important;margin-right:-5px!important}", ".is-xray-mode{background:#03030a!important;color:#b0d4e8!important}", ".is-xray-mode .header{background:rgba(3,5,12,0.98)!important;border-bottom-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important}", ".is-xray-mode .header h1,.is-xray-mode .header h1 a{color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .scenario-title{color:rgba(var(--xto-link-rgb,0,229,255),0.7)!important}", ".is-xray-mode .difficulty{background:rgba(var(--xto-link-rgb,0,229,255),0.15)!important;color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .lab-timer{background:rgba(0,15,30,0.8)!important;color:var(--xto-link,#00e5ff)!important;border-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important}", ".is-xray-mode .lab-plan{color:rgba(var(--xto-link-rgb,0,229,255),0.4)!important}", ".is-xray-mode .user-info{border-left-color:rgba(var(--xto-link-rgb,0,229,255),0.2)!important}", ".is-xray-mode .user-name{color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .user-rank-ja,.is-xray-mode .user-rank-en{color:rgba(var(--xto-link-rgb,0,229,255),0.5)!important}", ".is-xray-mode .question-map{background:rgba(3,5,12,0.95)!important;border-bottom-color:rgba(var(--xto-link-rgb,0,229,255),0.15)!important}", ".is-xray-mode .qmap-sep{color:rgba(var(--xto-link-rgb,0,229,255),0.2)!important}", ".is-xray-mode .topo-target-label{color:var(--xto-ospf,#39ff14)!important;text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5)}", ".rcl-refonly-badge{position:absolute;top:3px;right:3px;background:rgba(255,183,77,0.18);color:#ffb74d;border:1px solid rgba(255,183,77,0.5);border-radius:3px;font-size:9px;font-weight:bold;padding:1px 5px;z-index:9;pointer-events:none;line-height:1.3}", ".is-xray-mode .xray-grid-overlay{opacity:1}", ".is-xray-mode .xray-logic{opacity:1;transition:none}", ".is-cleared .xray-initial{display:none}", ".is-cleared .xray-cleared{display:flex}", ".xray-focus-close{position:absolute;top:8px;right:8px;z-index:20;background:rgba(255,100,60,0.15);color:#f96;border:1px solid rgba(255,100,60,0.4);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 0.3s}", ".is-xray-deep .xray-holo-panel{display:none!important}", ".is-xray-deep .xray-focus-close{opacity:1;pointer-events:auto}", ".trace-active .xray-focus-close{opacity:0!important;pointer-events:none!important}", ".is-xray-mode .topo-diagram{position:relative;overflow:visible!important}", ".is-xray-mode .xray-flash-scene{display:block}", ".is-cleared .xray-trace{display:none}", ".is-xray-mode .topo-box.target{cursor:pointer}", ".is-xray-mode a.topo-box-link:has(> .topo-box.target){cursor:pointer}", ".is-xray-mode .capture-panel,.is-xray-mode .hint,.is-xray-mode .problem,.is-xray-mode .explanation,.is-xray-mode .info,.is-xray-mode .result-panel,.is-xray-mode .link-status,.is-xray-mode .neighbor-panel{background:rgba(3,8,16,0.9)!important;border-color:rgba(var(--xto-link-rgb,0,229,255),0.2)!important;color:#b0d4e8!important}", ".is-xray-mode .capture-header{background:rgba(0,15,30,0.7)!important}", ".is-xray-mode .capture-header h3{color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .capture-body{background:rgba(3,8,16,0.6)!important}", ".is-xray-mode .tab-btn{background:rgba(0,15,30,0.6)!important;color:rgba(var(--xto-link-rgb,0,229,255),0.5)!important}", ".is-xray-mode .tab-btn.active{background:rgba(var(--xto-link-rgb,0,229,255),0.12)!important;color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .tab-content{background:rgba(3,8,16,0.8)!important}", ".is-xray-mode .hint h3{color:rgba(var(--xto-link-rgb,0,229,255),0.7)!important}", ".is-xray-mode .problem h3{color:rgba(var(--xto-link-rgb,0,229,255),0.7)!important}", ".is-xray-mode .hint code,.is-xray-mode .problem code{background:rgba(var(--xto-link-rgb,0,229,255),0.08)!important;color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .hint-level{background:rgba(0,15,30,0.5)!important;border-left-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important;color:#b0d4e8!important}", ".is-xray-mode .hint-level.standard-tier{background:rgba(123,44,191,0.1)!important;border-left-color:rgba(167,139,250,0.5)!important}", ".is-xray-mode .hint-level.standard-tier strong{color:#a78bfa!important}", ".is-xray-mode .hint-btn{background:rgba(var(--xto-link-rgb,0,229,255),0.1)!important;border-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important;color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .topo-flow-node{background:rgba(0,15,30,0.6)!important;border-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important;color:var(--xto-link,#00e5ff)!important}", ".is-xray-mode .seg-label,.is-xray-mode .seg-arrow,.is-xray-mode .arrow-line{color:rgba(var(--xto-link-rgb,0,229,255),0.5)!important}", ".is-xray-mode .ttyd-card{background:rgba(3,8,16,0.9)!important;border:1px solid rgba(var(--xto-link-rgb,0,229,255),0.2)!important}", ".is-xray-mode .ttyd-card-header{background:rgba(0,15,30,0.7)!important}", ".is-xray-mode .ttyd-card-header h3{color:#0f0!important}", ".is-xray-mode .ttyd-toggle{color:#0f0!important}", ".is-xray-mode .ttyd-radios label{color:rgba(0,255,0,0.7)!important}", '.is-xray-mode .ttyd-radios input[type="radio"]{accent-color:var(--xto-link,#00e5ff)!important}', ".is-xray-mode .ttyd-card,.is-xray-mode .ttyd-card *{pointer-events:auto!important;cursor:auto!important}", ".is-xray-mode .ttyd-card a,.is-xray-mode .ttyd-card button{pointer-events:auto!important;cursor:pointer!important;opacity:1!important}", ".is-xray-mode .floating-action button{background:rgba(var(--xto-link-rgb,0,229,255),0.15)!important;color:var(--xto-link,#00e5ff)!important;box-shadow:0 0 15px rgba(var(--xto-link-rgb,0,229,255),0.2)!important}", ".is-xray-mode .scroll-top button{background:rgba(0,15,30,0.8)!important;color:var(--xto-link,#00e5ff)!important;border-color:rgba(var(--xto-link-rgb,0,229,255),0.3)!important}", ".is-xray-mode a:not(.critical-tl-btn):not(.unlock-btn):not(.logo-link):not(.bp-more),.is-xray-mode button:not(.btn-xray):not(.xray-focus-close):not(.xray-deep-mode-toggle):not(.xray-trace-btn):not(.topo-zoom button):not(.trace-close):not(.trace-back):not(.trace-next):not(.critical-btn):not(.end-mode):not(.replay-skip):not(.shutdown-btn):not(#font-size-btn):not(.bp-x){pointer-events:none!important;cursor:default!important}", ".is-xray-mode .controls .btn,.is-xray-mode .floating-action .check-float,.is-xray-mode .floating-action .reset-mode,.is-xray-mode .floating-action .fb-float-btn{opacity:0.3!important}", ".is-xray-mode .capture-btn,.is-xray-mode .hint-btn,.is-xray-mode .check-btn,.is-xray-mode .reset-btn{opacity:0.3!important}", ".is-xray-mode .header h1 a,.is-xray-mode .logo-link{pointer-events:auto!important;cursor:pointer!important}", ".is-xray-mode .qmap-item,.is-xray-mode .qmap-nav{pointer-events:none!important;cursor:default!important;opacity:0.4!important}", ".is-xray-mode .capture-header{pointer-events:none!important}", ".is-xray-mode .tab-btn{pointer-events:none!important;opacity:0.4!important}", ".is-xray-mode .scroll-top button{pointer-events:none!important;opacity:0.3!important}", ".is-xray-mode .help-guide-btn{pointer-events:none!important;opacity:0.3!important}", ".xray-flash{position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9999;opacity:0}", ".xray-flash.active{animation:xrayFlashBang 0.8s ease-out}", "@keyframes xrayFlashBang{0%{opacity:0.9;background:radial-gradient(circle,rgba(255,200,100,0.95),rgba(var(--xto-idle-rgb,255,140,0),0.7) 40%,transparent 70%)}30%{opacity:0.6;background:linear-gradient(90deg,transparent 15%,rgba(var(--xto-idle-rgb,255,140,0),0.6) 35%,rgba(255,200,100,0.9) 50%,rgba(var(--xto-idle-rgb,255,140,0),0.6) 65%,transparent 85%)}100%{opacity:0}}", ".is-xray-deep .capture-panel,.is-xray-deep .hint,.is-xray-deep .hint-level,.is-xray-deep .problem,.is-xray-deep .explanation,.is-xray-deep .result-panel,.is-xray-deep .next-question,.is-xray-deep .question-map,.is-xray-deep .floating-action,.is-xray-deep .scroll-top{display:none!important}", ".is-xray-deep .mode-title{display:none!important}", ".is-xray-deep .xray-spark-container{display:none!important}", ".is-xray-deep .xray-hello-container{display:none!important}", ".is-xray-deep .xray-packet-orb{display:none!important}", ".is-xray-deep .xray-ping-orb{display:none!important}", ".is-xray-deep .xray-fib-entry{display:none!important}", "body.trace-active .main{margin-left:370px;transition:margin-left 0.3s}", "body.trace-active .header{margin-left:370px;transition:margin-left 0.3s}", "@media (max-width:800px){body.trace-active .main,body.trace-active .header{margin-left:0}}", ".is-xray-deep .xray-ospf-tunnel{display:none!important}", '.xray-logic{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:center;padding:8px 10px;font-family:"Courier New",monospace;font-size:11px;line-height:1.7;color:rgba(var(--xto-link-rgb,0,229,255),0.85);text-align:left;opacity:0;pointer-events:none;z-index:5;overflow:hidden}', ".xray-logic .hl{color:var(--xto-ospf,#39ff14);font-weight:700}", ".xray-logic .warn{color:#ff6b35}", ".xray-logic .dim{color:rgba(var(--xto-link-rgb,0,229,255),0.4);font-size:11px}", ".xray-logic .off{color:#78909c;font-weight:700}", ".is-xray-mode .xray-logic{background:rgba(0,15,30,0.95)!important;border-radius:6px!important}", ".is-xray-mode .xray-ospf-unit{z-index:8!important}", ".is-xray-mode .xray-spark{background:var(--xto-idle,#ff8c00)!important;box-shadow:0 0 6px var(--xto-idle,#ff8c00)!important}", ".is-xray-mode .xray-spark-container{opacity:0!important}", ".is-xray-mode .route-arrow{display:none!important}", ".is-xray-mode .topo-link-subnet{display:none!important}", ".is-xray-mode .topo-tri-label{color:rgba(100,100,100,0.5)!important}", ".is-xray-mode .anim-status{display:none!important}", '.xray-holo-panel{position:absolute;top:50px;left:16px;z-index:10;background:rgba(0,8,16,0.92);border:1px solid rgba(var(--xto-idle-rgb,255,140,0),0.35);border-radius:6px;padding:14px 18px;font-family:"Courier New",monospace;font-size:11px;line-height:1.9;color:rgba(var(--xto-idle-rgb,255,140,0),0.9);box-shadow:0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.08);backdrop-filter:blur(8px);min-width:240px;max-width:280px;transition:all 0.5s;display:none}', ".is-xray-mode .xray-holo-panel{display:block}", ".xray-holo-panel .title{font-weight:700;font-size:12px;letter-spacing:1px;margin-bottom:6px;color:var(--xto-idle,#ff8c00);text-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", ".xray-holo-panel .ok{color:var(--xto-ospf,#39ff14);font-weight:700}", ".xray-holo-panel .err{color:#ff4444;font-weight:700}", ".xray-holo-panel .dim{color:rgba(var(--xto-idle-rgb,255,140,0),0.35);font-size:10px}", ".xray-holo-panel .warn{color:var(--xto-idle,#ff8c00);font-weight:700}", ".topo-diagram:has(.topo-triangle) .xray-holo-panel{left:10px;top:10px}", ".topo-diagram:has(.topo-multi-node) ~ .xray-holo-panel{top:auto!important;bottom:16px!important;right:auto!important;left:16px!important}", ".xray-deep-engine{transition:none!important}", ":not(.ping-ok) .xray-ping-orb{display:none!important}", ".xray-flash-scene{position:absolute;top:0;left:0;width:100%;height:100%;z-index:50;pointer-events:none;opacity:0;display:none}", ".is-xray-mode .xray-flash-scene{display:block}", ".xray-flash-scene.fire{animation:xflashFire 0.8s ease-out forwards}", ".xray-flash-scene.full{animation:xflashFull 1.2s ease-out forwards}", "@keyframes xflashFull{0%{opacity:0.8;background:linear-gradient(90deg,transparent 20%,rgba(var(--xto-idle-rgb,255,140,0),0.6) 35%,rgba(255,200,100,0.9) 50%,rgba(var(--xto-idle-rgb,255,140,0),0.6) 65%,transparent 80%)}40%{opacity:0.4}100%{opacity:0}}", ".xray-hello-container{position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;display:none}", ".xray-hello-pkt{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--xto-idle,#ff8c00);box-shadow:0 0 10px 3px rgba(var(--xto-idle-rgb,255,140,0),0.7),0 0 25px rgba(var(--xto-idle-rgb,255,140,0),0.3);top:50%;transform:translateY(-50%);opacity:0;z-index:4}", ".xray-spark-container{position:absolute;top:calc(50% - 10px);transform:translate(50%,-50%);z-index:5;pointer-events:none;opacity:0;display:none}", ".xray-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#ff4444;box-shadow:0 0 6px #ff4444}", ".xray-spark:nth-child(1){top:-8px;left:0;animation:xsparkFly1 0.4s ease-out infinite}", ".xray-spark:nth-child(2){top:0;left:8px;animation:xsparkFly2 0.4s ease-out infinite}", ".xray-spark:nth-child(3){top:8px;left:2px;animation:xsparkFly3 0.4s ease-out infinite}", ".xray-spark:nth-child(4){top:-4px;left:-6px;animation:xsparkFly4 0.4s ease-out infinite}", ".xray-ospf-tunnel{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden;display:none}", ".xray-bgp-established .xray-ospf-tunnel{display:block!important}", ".xray-bgp-established .xray-tunnel-wall{background:var(--xto-bgp,#a855f7);box-shadow:0 0 6px rgba(var(--xto-bgp-rgb,168,85,247),0.5),0 0 14px rgba(var(--xto-bgp-rgb,168,85,247),0.2)}", ".xray-bgp-established .xray-tunnel-fill{background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 30%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 70%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)}", ".xray-bgp-established .xray-tunnel-portal{background:linear-gradient(180deg,transparent,rgba(var(--xto-bgp-rgb,168,85,247),0.7),transparent)!important;box-shadow:0 0 12px rgba(var(--xto-bgp-rgb,168,85,247),0.4)!important}", ".xray-bgp-established .xray-tunnel-ring{background:rgba(var(--xto-bgp-rgb,168,85,247),0.12);box-shadow:0 0 3px rgba(var(--xto-bgp-rgb,168,85,247),0.08)}", ".xray-bgp-established .xray-tunnel-label{color:var(--xto-bgp,#a855f7);text-shadow:0 0 8px rgba(var(--xto-bgp-rgb,168,85,247),0.5)}", "#topo-diagram:not(.xray-overview-ready) .xray-tunnel-body,#topo-diagram:not(.xray-overview-ready) .xray-tunnel-portal,#topo-diagram:not(.xray-overview-ready) .xray-tunnel-label,#topo-diagram:not(.xray-overview-ready) .xray-ospf-tunnel{opacity:0!important;visibility:hidden!important;transition:none!important}", ".xray-tunnel-body{position:absolute;top:50%;left:var(--xr1,38%);right:var(--xr2r,30%);height:0;transform:translateY(-50%);border-radius:3px;overflow:hidden;opacity:0;transition:all 0.8s cubic-bezier(0.23,1,0.32,1)}", ".xray-tunnel-wall{position:absolute;left:0;right:0;height:1.5px;background:var(--xto-idle,#ff8c00);box-shadow:0 0 6px rgba(var(--xto-idle-rgb,255,140,0),0.5),0 0 14px rgba(var(--xto-idle-rgb,255,140,0),0.2)}", ".xray-tunnel-wall.top{top:0}", ".xray-tunnel-wall.bot{bottom:0}", ".xray-tunnel-fill{position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(180deg,rgba(var(--xto-idle-rgb,255,140,0),0.08) 0%,rgba(var(--xto-idle-rgb,255,140,0),0.03) 30%,rgba(var(--xto-idle-rgb,255,140,0),0.03) 70%,rgba(var(--xto-idle-rgb,255,140,0),0.08) 100%);opacity:0;transition:opacity 0.6s ease 0.3s}", ".xray-tunnel-ring{position:absolute;top:50%;height:100%;width:1px;background:rgba(var(--xto-idle-rgb,255,140,0),0.12);transform:translateY(-50%);box-shadow:0 0 3px rgba(var(--xto-idle-rgb,255,140,0),0.08);opacity:0;transition:opacity 0.4s}", ".xray-tunnel-portal{position:absolute;top:50%;width:4px;height:36px;transform:translateY(-50%);border-radius:2px;opacity:0;transition:all 0.6s ease 0.2s;z-index:3}", ".xray-tunnel-portal.entry{left:var(--xr1,38%);background:linear-gradient(180deg,transparent,rgba(var(--xto-idle-rgb,255,140,0),0.7),transparent);box-shadow:0 0 12px rgba(var(--xto-idle-rgb,255,140,0),0.4)}", ".xray-tunnel-portal.exit{right:var(--xr2r,30%);background:linear-gradient(180deg,transparent,rgba(var(--xto-idle-rgb,255,140,0),0.7),transparent);box-shadow:0 0 12px rgba(var(--xto-idle-rgb,255,140,0),0.4)}", '.xray-tunnel-label{position:absolute;top:calc(50% + 28px);left:50%;transform:translateX(-50%);font-family:"Courier New",monospace;font-size:11px;font-weight:700;color:var(--xto-idle,#ff8c00);text-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.5);letter-spacing:2px;opacity:0;z-index:4;transition:opacity 0.6s ease 0.8s;white-space:nowrap}', ".xray-state-full .xray-tunnel-wall{background:var(--xto-ospf,#39ff14)!important;box-shadow:0 0 6px rgba(var(--xto-ospf-rgb,57,255,20),0.5),0 0 14px rgba(var(--xto-ospf-rgb,57,255,20),0.2)!important}", ".xray-state-full .xray-tunnel-fill{background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 30%,rgba(var(--xto-ospf-rgb,57,255,20),0.03) 70%,rgba(var(--xto-ospf-rgb,57,255,20),0.08) 100%)!important}", ".xray-state-full .xray-tunnel-portal{background:linear-gradient(180deg,transparent,rgba(var(--xto-ospf-rgb,57,255,20),0.7),transparent)!important;box-shadow:0 0 12px rgba(var(--xto-ospf-rgb,57,255,20),0.4)!important}", ".xray-state-full .xray-tunnel-ring{background:rgba(var(--xto-ospf-rgb,57,255,20),0.12)!important;box-shadow:0 0 3px rgba(var(--xto-ospf-rgb,57,255,20),0.08)!important}", ".xray-state-full .xray-tunnel-label{color:var(--xto-ospf,#39ff14)!important;text-shadow:0 0 8px rgba(var(--xto-ospf-rgb,57,255,20),0.5)!important}", ".xray-ping-orb{position:absolute;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle,#fff 30%,rgba(255,255,255,0.6) 60%,transparent 100%);box-shadow:0 0 10px 3px rgba(255,255,255,0.6),0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.4);top:50%;transform:translateY(-50%);z-index:8;opacity:0;pointer-events:none;display:none}", '.xray-fib-entry{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:10;font-family:"Courier New",monospace;font-size:14px;font-weight:700;color:var(--xto-link,#00e5ff);text-shadow:0 0 12px rgba(var(--xto-link-rgb,0,229,255),0.6);opacity:0;pointer-events:none;white-space:nowrap;transition:opacity 0.3s;display:none}', ".is-xray-mode .topo-triangle .topo-box{background:rgba(0,15,30,0.95)!important}", ".is-xray-mode .topo-triangle .topo-box.target{background:rgba(0,20,10,0.95)!important}", ".topo-triangle svg line{transition:stroke 0.5s,stroke-width 0.3s,filter 0.5s}", ".topo-link{position:relative}", ".topo-link-pipe{position:absolute;top:0;left:0;right:0;height:4px;display:none;pointer-events:none;z-index:0}", ".topo-link-pipe.pipe-full,.topo-link-pipe.pipe-2way,.topo-link-pipe.pipe-exchange,.topo-link-pipe.pipe-init,.topo-link-pipe.pipe-bgp,.topo-link-pipe.pipe-bgp-idle{display:block}", ".topo-link-pipe.pipe-full,.topo-link-pipe.pipe-exchange{--pipe-col:var(--xto-ospf,#39ff14);--pipe-glow:rgba(var(--xto-ospf-rgb,57,255,20),0.6)}", ".topo-link-pipe.pipe-2way,.topo-link-pipe.pipe-init{--pipe-col:var(--xto-idle,#ff8c00);--pipe-glow:rgba(var(--xto-idle-rgb,255,140,0),0.6)}", ".topo-link-pipe.pipe-bgp,.topo-link-pipe.pipe-bgp-idle{--pipe-col:var(--xto-bgp,#a855f7);--pipe-glow:rgba(var(--xto-bgp-rgb,168,85,247),0.6)}", '.topo-link-pipe::before,.topo-link-pipe::after{content:"";position:absolute;left:0;right:0;height:2.5px;background:repeating-linear-gradient(90deg,var(--pipe-col) 0 10px,transparent 10px 16px);background-size:16px 100%;filter:drop-shadow(0 0 6px var(--pipe-glow))}', ".topo-link-pipe.pipe-full::before,.topo-link-pipe.pipe-full::after,.topo-link-pipe.pipe-2way::before,.topo-link-pipe.pipe-2way::after,.topo-link-pipe.pipe-bgp::before,.topo-link-pipe.pipe-bgp::after{animation:pipeFlow 1.2s linear infinite}", ".topo-link-pipe.pipe-bgp-idle::before,.topo-link-pipe.pipe-bgp-idle::after{opacity:0.42}", ".topo-link-pipe::before{top:-4px}", ".topo-link-pipe::after{bottom:-4px}", ".topo-link-pipe.pipe-inner{z-index:2}", ".topo-link-pipe.pipe-inner::before,.topo-link-pipe.pipe-inner::after{height:2px}", ".topo-link-pipe.pipe-inner::before{top:-3px}", ".topo-link-pipe.pipe-inner::after{bottom:-3px}", ".topo-link-pipe.pipe-coexist::before{top:-7px}", ".topo-link-pipe.pipe-coexist::after{bottom:-7px}", "@keyframes pipeFlow{to{background-position:16px 0}}", ".topo-diagram:has(.topo-link-pipe) .xray-ping-orb,.topo-diagram:has(.topo-link-pipe) .xray-packet-orb,.topo-diagram:has(.topo-link-pipe) .xray-hello-pkt{top:calc(50% - 9px)}", ".is-xray-mode .topo-diagram:has(.topo-link-pipe) .xray-ospf-tunnel{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-ospf-tunnel,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-ospf-tunnel,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-ospf-tunnel{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-packet-orb,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-packet-orb,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-packet-orb{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-hello-container,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-hello-container,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-hello-container{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-ping-orb,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-ping-orb,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-ping-orb{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-spark-container,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-spark-container,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-spark-container{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-lsa-container,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-lsa-container,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-lsa-container{display:none!important}", ".is-xray-mode .topo-diagram:has(.topo-triangle) .xray-fib-entry,.is-xray-mode .topo-diagram:has(.topo-multi-node) .xray-fib-entry,.is-xray-mode .topo-diagram:has(.topo-inverted-v) .xray-fib-entry{display:none!important}", "@keyframes triRouteDash{to{stroke-dashoffset:-28}}", ".de-lsa-container{position:absolute;top:0;left:0;width:100%;height:100%;z-index:6;pointer-events:none}", ".de-lsa{position:absolute;width:8px;height:4px;border-radius:2px;background:var(--xto-idle,#ff8c00);box-shadow:0 0 8px rgba(var(--xto-idle-rgb,255,140,0),0.7);opacity:0}", ".is-xray-deep.xray-state-exchange .de-lsa{animation:deLsaGather var(--dur) ease-in var(--delay) infinite}", "@keyframes deLsaGather{0%{opacity:0;transform:scale(0.4)}8%{opacity:1;transform:scale(1)}60%{opacity:1;transform:scale(1)}80%{left:calc(50% + 10px);top:70%;opacity:0.8;transform:scale(0.5)}100%{left:50%;top:76%;opacity:0;transform:scale(0.2)}}", "@keyframes deLsaGatherLeft{0%{opacity:0;transform:scale(0.4)}8%{opacity:1;transform:scale(1)}60%{opacity:1;transform:scale(1)}80%{left:calc(50% - 10px);top:70%;opacity:0.8;transform:scale(0.5)}100%{left:50%;top:76%;opacity:0;transform:scale(0.2)}}", "@keyframes deLsaGatherRight{0%{opacity:0;transform:scale(0.4)}8%{opacity:1;transform:scale(1)}60%{opacity:1;transform:scale(1)}80%{left:calc(82% - 10px);top:70%;opacity:0.8;transform:scale(0.5)}100%{left:82%;top:76%;opacity:0;transform:scale(0.2)}}", ".is-xray-deep.xray-state-inactive .de-packet{background:var(--xto-idle,#ff8c00);box-shadow:0 0 10px 4px rgba(var(--xto-idle-rgb,255,140,0),0.7),0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.3);animation:deHelloReject 3s ease-in-out infinite!important;opacity:0}", ".is-xray-deep:not(.xray-state-init):not(.xray-state-exchange):not(.xray-state-full) .de-packet.p2{animation-delay:1.5s!important}", "@keyframes deHelloReject{0%{left:96%;opacity:0;transform:translateY(-50%) scale(0.4)}8%{opacity:1;transform:translateY(-50%) scale(1)}40%{left:calc(50% + 70px);opacity:1;transform:translateY(-50%) scale(1)}50%{left:calc(50% + 65px);opacity:1;transform:translateY(-50%) scale(1.5)}55%{left:calc(50% + 70px);opacity:0.5;transform:translateY(-50%) scale(0.5)}65%{left:calc(50% + 80px);opacity:0}100%{left:calc(50% + 80px);opacity:0}}", ".is-xray-deep.xray-state-init .de-packet,.is-xray-deep.xray-state-exchange .de-packet{animation:none!important;opacity:0!important}", "@keyframes ospfCorePulse{0%{transform:translate(-50%,-50%) scale(0.8);box-shadow:0 0 6px var(--xto-idle,#ff8c00)}100%{transform:translate(-50%,-50%) scale(1.3);box-shadow:0 0 16px var(--xto-idle,#ff8c00)}}", ".is-xray-mode.xray-state-init .topo-box.target .xray-ospf-unit,.is-xray-mode.xray-state-exchange .topo-box.target .xray-ospf-unit,.is-xray-mode.xray-state-full .topo-box.target .xray-ospf-unit{border-color:var(--xto-idle,#ff8c00);box-shadow:0 0 12px rgba(var(--xto-idle-rgb,255,140,0),0.5)}", ".is-xray-mode.xray-state-init .topo-box.target .xray-ospf-unit .xray-ospf-dot,.is-xray-mode.xray-state-exchange .topo-box.target .xray-ospf-unit .xray-ospf-dot{background:var(--xto-idle,#ff8c00);box-shadow:0 0 8px var(--xto-idle,#ff8c00);animation:ospfCorePulse 0.8s ease-in-out infinite alternate}", ".is-xray-mode.xray-state-full .topo-box.target .xray-ospf-unit .xray-ospf-dot{background:var(--xto-idle,#ff8c00);box-shadow:0 0 10px var(--xto-idle,#ff8c00)}", ".xray-fib-entry{display:none!important}", "@keyframes xlinkPulse{0%{box-shadow:0 0 10px rgba(var(--xto-idle-rgb,255,140,0),0.4)}100%{box-shadow:0 0 20px rgba(var(--xto-idle-rgb,255,140,0),0.8)}}", "@keyframes xlineBlink{0%{opacity:1}100%{opacity:0.35}}", ".xray-hello-container{position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;display:none}", ".is-xray-mode.hello-out .xray-hello-container,.is-xray-mode.hello-in .xray-hello-container{display:block}", ".xray-hello-pkt{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--xto-idle,#ff8c00);box-shadow:0 0 10px 3px rgba(var(--xto-idle-rgb,255,140,0),0.7),0 0 25px rgba(var(--xto-idle-rgb,255,140,0),0.3);top:50%;transform:translateY(-50%);opacity:0;z-index:4}", ".xray-iface-dot,.xray-if-dot{display:none}", ".is-xray-mode .xray-iface-dot,.is-xray-mode .xray-if-dot{display:inline-block}", ".is-xray-mode .topo-box:not(.target) .xray-logic{display:none!important}", ".is-replaying .btn-xray{display:none!important}", ".is-replaying .xray-focus-close{opacity:0!important;pointer-events:none!important}", ".is-replaying .xray-holo-panel{display:none!important}", ".replay-skip{position:fixed;bottom:24px;right:24px;z-index:9999;background:rgba(255,255,255,0.12);color:#ccc;border:1px solid rgba(255,255,255,0.3);padding:10px 22px;border-radius:24px;font-size:13px;font-weight:bold;cursor:pointer;pointer-events:auto;transition:all 0.3s;backdrop-filter:blur(6px);display:none}", ".replay-skip:hover{background:rgba(255,255,255,0.25);color:#fff;transform:translateY(-2px)}", ".is-replaying .replay-skip{display:block}", '[data-mode="troubleshoot"] .xray-trace-btn{color:#ccc;background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.25);box-shadow:none}', '[data-mode="troubleshoot"] .xray-trace-btn:hover{background:rgba(255,255,255,0.2);color:#fff}', '[data-mode="destroy"] .xray-trace-btn{color:#fff;background:#e74c3c!important;border-color:#c0392b;box-shadow:0 0 25px rgba(231,76,60,0.6);z-index:8200!important;opacity:1!important;pointer-events:auto!important}', '[data-mode="destroy"] .xray-trace-btn:hover{background:rgba(231,76,60,0.2);color:#ff6b6b;box-shadow:0 0 30px rgba(231,76,60,0.3)}', ".capture-toggle{order:-1!important}", "#next-question-content a{color:var(--rc-accent,#4dd0e1);text-decoration:underline;font-weight:600}", "#next-question-content a:hover{color:#fff}" ].join("\n");
  var target = document.head || document.documentElement || document.body;
  if (target) {
    target.appendChild(s);
  } else {
    document.addEventListener("DOMContentLoaded", function() {
      document.head.appendChild(s);
    });
  }
})();

window._xrayActiveSkin = null;

window._XRAY_SKIN_DEFAULT_COLORS = {
  ospf: {
    hex: "#39ff14",
    rgb: "57,255,20"
  },
  bgp: {
    hex: "#a855f7",
    rgb: "168,85,247"
  },
  link: {
    hex: "#00e5ff",
    rgb: "0,229,255"
  },
  idle: {
    hex: "#ff8c00",
    rgb: "255,140,0"
  },
  down: {
    hex: "#555555",
    rgb: "85,85,85"
  },
  static: {
    hex: "#888888",
    rgb: "136,136,136"
  }
};

function _xrayHexToRgb(hex) {
  var m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(String(hex || "").trim());
  if (!m) return null;
  return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
}

function _xrayApplySkinColors(skin) {
  var colors = skin && skin.colors || {};
  var defs = window._XRAY_SKIN_DEFAULT_COLORS;
  var css = ":root{";
  for (var key in defs) {
    if (!defs.hasOwnProperty(key)) continue;
    var hex = colors[key] || defs[key].hex;
    var rgb = _xrayHexToRgb(hex) || defs[key].rgb;
    css += "--xto-" + key + ":" + hex + ";--xto-" + key + "-rgb:" + rgb + ";";
  }
  css += "}";
  var el = document.getElementById("xray-skin-vars");
  if (!el) {
    el = document.createElement("style");
    el.id = "xray-skin-vars";
    var tgt = document.head || document.documentElement || document.body;
    if (tgt) {
      tgt.appendChild(el);
    } else {
      el = null;
    }
  }
  if (el) el.textContent = css;
}

function xraySetSkin(skin) {
  window._xrayActiveSkin = skin || null;
  _xrayApplySkinColors(window._xrayActiveSkin);
  return window._xrayActiveSkin;
}

function _escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (typeof window._getIface !== "function") {
  window._getIface = function() {
    return "...";
  };
}

if (typeof window._xrayEnsureTopology !== "function") {
  window._xrayEnsureTopology = function() {};
}

function xrayEvaluateState(s) {
  var protocol = window._xrayProtocol || "static";
  var ifaces = s.interfaces || {};
  var ifKeys = Object.keys(ifaces);
  var rr = s.route_resolution || {};
  var wanIf = s.wan_iface || rr.out_iface || ifKeys[0] || "";
  var lanIf = s.lan_iface || ifKeys[ifKeys.length - 1] || wanIf;
  var _nonLoCount = ifKeys.filter(function(k) {
    return k !== "lo";
  }).length;
  var state = {
    ifUp: false,
    inputIfUp: false,
    singleIf: lanIf === wanIf,
    singleLinkEdge: lanIf === wanIf && _nonLoCount <= 1,
    wanIf: wanIf,
    lanIf: lanIf,
    helloIn: false,
    helloOut: false,
    ospfFull: false,
    ospfPhase: "inactive",
    bgpEstablished: false,
    routeInstalled: false,
    pingOk: false,
    canForward: false,
    cleared: false,
    protocol: protocol
  };
  state.ifUp = !!(ifaces[wanIf] && ifaces[wanIf].up);
  state.inputIfUp = state.singleIf ? true : !!(ifaces[lanIf] && ifaces[lanIf].up);
  if (s.sv_link_up === false) {
    state.inputIfUp = false;
  }
  if (!state.ifUp && rr.out_iface && ifaces[rr.out_iface] && ifaces[rr.out_iface].up) {
    state.ifUp = true;
  }
  if (!state.ifUp) return state;
  if (protocol === "ospf") {
    var ns = s.neighbor_state || "None";
    state.helloIn = !!s.peer_sending_hello;
    state.helloOut = !!s.ospf_active_on_interface;
    var nsLower = ns.toLowerCase();
    if (!state.helloOut) {
      state.ospfPhase = "inactive";
    } else if (ns === "Full" || s.has_full) {
      state.ospfPhase = "full";
    } else if (nsLower === "exstart" || nsLower === "exchange" || nsLower === "loading") {
      state.ospfPhase = "exchange";
    } else {
      state.ospfPhase = "init";
    }
    var _otb = _xrayOspfBucket(ns);
    if (_otb === "none" && s.has_full) _otb = "full";
    state.ospfTunBucket = state.helloOut ? _otb : "none";
    state.lsdbSyncing = nsLower === "exchange" || nsLower === "loading";
    state.ospfFull = state.helloIn && state.helloOut && (ns === "Full" || !!s.has_full);
    state._r1Hello = s.r1_hello || 10;
    state._r2Hello = s.r2_hello || 10;
    state._r1Area = s.r1_area || "";
    state._r2Area = s.r2_area || "";
  } else if (protocol === "bgp") {
    state.bgpEstablished = !!s.is_established;
    state.bgpPhase = state.bgpEstablished ? "established" : "idle";
    state.bgpStatus = state.bgpEstablished ? "ESTABLISHED" : s.bgp_state ? s.bgp_state : "NOT CONFIGURED";
    state.bgpConfigured = s.bgp_configured !== false;
  }
  state.routeInstalled = !!rr.resolved;
  state.pingOk = state.routeInstalled && s.ping_ok === true;
  if (protocol === "static" && typeof s.nh_reachable === "boolean") {
    state.canForward = state.routeInstalled && s.nh_reachable;
  } else if (protocol === "static" && s.r1_ping_ok !== undefined) {
    state.canForward = state.routeInstalled && !!s.r1_ping_ok;
  } else {
    state.canForward = state.routeInstalled;
  }
  state.cleared = state.pingOk;
  window._lastXrayHierarchy = state;
  if (protocol === "ospf") {
    state.ospfStatus = state.helloOut ? "ACTIVE" : s.ospf_configured ? "CONFIGURED" : "NOT RUNNING";
  }
  if (protocol === "bgp" && (s.ospf_active_on_interface || s.neighbor_state && s.neighbor_state !== "None")) {
    state.helloIn = !!s.peer_sending_hello;
    state.helloOut = !!s.ospf_active_on_interface;
    var _oif = s.iface_hellos && Object.keys(s.iface_hellos).filter(function(k) {
      return k !== "lo";
    })[0] || s.lan_iface;
    state.helloSide = _oif && _oif === s.lan_iface && s.lan_iface !== s.wan_iface ? "left" : "right";
  }
  return state;
}

function _xrayApplyPingModeClasses(bcl, mode) {
  var KNOWN_PING_MODES = [ "cylinder-to-right", "cylinder-to-left", "through-right", "through-left", "from-r1", "through" ];
  if (KNOWN_PING_MODES.indexOf(mode) === -1) {
    console.warn("[xray] unknown ping_mode:", mode, "→ falling back to default (layout will break). meta.json で既存値 grep 推奨");
  }
  if (mode === "from-r1") mode = "cylinder-to-right"; else if (mode === "through") mode = "through-right";
  bcl.remove("ping-from-r1", "ping-through", "ping-left", "ping-cylinder-to-left");
  if (mode === "cylinder-to-right") {
    bcl.add("ping-from-r1");
  } else if (mode === "cylinder-to-left") {
    bcl.add("ping-cylinder-to-left");
    bcl.add("ping-left");
  } else if (mode === "through-right") {
    bcl.add("ping-through");
  } else {
    bcl.add("ping-" + mode);
  }
}

function xrayCurrentPingMode() {
  if (document.body.classList.contains("trace-active")) {
    var cfg = window._scenarioConfig || {};
    var declared = cfg.xray && cfg.xray.ping_mode;
    if (declared) return declared;
  }
  return window._xrayPingMode || "from-r1";
}

function xrayApplyHierarchy(state) {
  var b = document.body.classList;
  b.add("xray-state-ready");
  var _adv = b.contains("xray-advertiser-view");
  var _cylLeft = typeof xrayCurrentPingMode === "function" && xrayCurrentPingMode() === "cylinder-to-left";
  if (_adv) {
    state.ifUp ? b.remove("is-input-down") : b.add("is-input-down");
    b.remove("is-output-down");
  } else if (_cylLeft) {
    !state.ifUp && state.wanIf ? b.add("is-input-down") : b.remove("is-input-down");
    b.remove("is-output-down");
  } else {
    state.ifUp ? b.remove("is-output-down") : b.add("is-output-down");
    state.inputIfUp ? b.remove("is-input-down") : b.add("is-input-down");
  }
  b.remove("xray-state-inactive", "xray-state-init", "xray-state-exchange", "xray-state-full", "xray-bgp-idle", "xray-bgp-established", "xray-ospftun-none", "xray-ospftun-init", "xray-ospftun-2way", "xray-ospftun-exchange", "xray-ospftun-full");
  if (state.protocol === "ospf") {
    b.add("xray-state-" + state.ospfPhase);
    b.add("xray-ospftun-" + (state.ospfTunBucket || "none"));
  } else if (state.protocol === "bgp") {
    b.add("xray-bgp-" + state.bgpPhase);
  }
  b.remove("xray-bgpproc-down", "xray-bgpproc-up", "xray-bgpproc-est");
  if (state.protocol === "bgp") {
    var _bgpProc = state.bgpEstablished ? "est" : state.bgpConfigured ? "up" : "down";
    b.add("xray-bgpproc-" + _bgpProc);
  }
  var _useLeft = state.helloSide ? state.helloSide === "left" : _adv;
  var _hi = _useLeft ? "hello-left-in" : "hello-in";
  var _ho = _useLeft ? "hello-left-out" : "hello-out";
  state.helloIn ? b.add(_hi) : b.remove(_hi);
  state.helloOut ? b.add(_ho) : b.remove(_ho);
  b.remove(_useLeft ? "hello-in" : "hello-left-in");
  b.remove(_useLeft ? "hello-out" : "hello-left-out");
  state.cleared ? b.add("is-cleared") : b.remove("is-cleared");
  state.pingOk ? b.add("ping-ok") : b.remove("ping-ok");
  if (state.protocol === "ospf") {
    var _lsaC = document.getElementById("de-lsa-container");
    if (_lsaC) {
      var _lsaG = window._xrayLsaGather;
      var _lsaActive = _lsaG ? _lsaG.left || _lsaG.right : !!state.lsdbSyncing;
      if (_lsaActive && !window._deepLsaInterval) {
        _lsaC.innerHTML = "";
        var _spawnLsa = function() {
          var g = window._xrayLsaGather;
          var sides;
          if (g) {
            sides = [];
            if (g.left) sides.push("left");
            if (g.right) sides.push("right");
          } else {
            if (!document.body.classList.contains("xray-state-exchange")) return;
            sides = [ "right" ];
          }
          if (!sides.length) return;
          sides.forEach(function(side) {
            var el = document.createElement("div");
            el.className = "de-lsa";
            var dur = 1.5 + Math.random();
            if (side === "left") {
              el.style.left = 5 + Math.random() * 25 + "%";
              el.style.animation = "deLsaGatherLeft " + dur + "s ease-in 0s infinite";
            } else {
              el.style.left = 70 + Math.random() * 25 + "%";
              var _rkf = ((window._scenarioConfig || {}).xray || {}).trace_pattern === "dual_static_rid" ? "deLsaGatherRight" : "deLsaGather";
              if (g) el.style.animation = _rkf + " " + dur + "s ease-in 0s infinite";
            }
            el.style.top = 30 + Math.random() * 30 + "%";
            el.style.setProperty("--dur", dur + "s");
            el.style.setProperty("--delay", "0s");
            _lsaC.appendChild(el);
            if (_lsaC.children.length > 15) _lsaC.removeChild(_lsaC.firstChild);
          });
        };
        for (var _li = 0; _li < 6; _li++) setTimeout(_spawnLsa, _li * 200);
        window._deepLsaInterval = setInterval(_spawnLsa, 400);
      } else if (!_lsaActive && window._deepLsaInterval) {
        clearInterval(window._deepLsaInterval);
        window._deepLsaInterval = null;
        _lsaC.innerHTML = "";
      }
    }
  }
  var isDestroy = !!window._xrayDestroyMode;
  isDestroy ? b.add("is-destroy-mode") : b.remove("is-destroy-mode");
  document.body.classList.toggle("is-single-link-edge", !!state.singleLinkEdge);
  var inLabel = document.querySelector(".de-label.in");
  if (inLabel) {
    if (state.singleLinkEdge) {
      inLabel.textContent = "";
    } else {
      inLabel.textContent = "Input: " + state.lanIf;
      inLabel.style.display = "";
    }
  }
  var outLabel = document.querySelector(".de-label.out");
  if (outLabel) outLabel.textContent = "Output: " + state.wanIf;
  var fwd = document.getElementById("de-cyl-fwd-arrow");
  if (fwd) {
    var rr = window._lastXrayState && window._lastXrayState.route_resolution || {};
    var fwdText = fwd.querySelector("text");
    if (fwdText && rr.matched_prefix) {
      fwdText.textContent = rr.matched_prefix;
    }
    var _selR = window._xraySelectedRoute;
    var _selIf = _selR && _selR.out_ifaces && _selR.out_ifaces[0];
    var _dirForSelIface = function(ifn) {
      if (!ifn || ifn === "lo") return null;
      if (xrayCurrentPingMode() === "cylinder-to-left") return "left";
      if (state.singleIf) return "right";
      var _g = window._xrayDirDbg || {};
      if (ifn === _g.lIf) return "left";
      if (ifn === _g.rIf) return "right";
      if (ifn === (_g.lan || state.lanIf)) return "left";
      return "right";
    };
    var dir = _selIf ? _dirForSelIface(_selIf) : window._xrayFwdDirection;
    var dirKnown = true;
    if (!dir) {
      if (xrayCurrentPingMode() === "cylinder-to-left") {
        dir = "left";
      } else if (state.singleIf) {
        dir = "right";
      } else if (rr.out_iface) {
        dir = rr.out_iface === state.lanIf ? "left" : "right";
      } else {
        dirKnown = false;
      }
    }
    if (dirKnown) {
      fwd.setAttribute("transform", dir === "left" ? "translate(200, 0) scale(-1, 1)" : "");
      if (fwdText) {
        fwdText.setAttribute("transform", dir === "left" ? "translate(200, 0) scale(-1, 1)" : "");
      }
    }
    fwd.style.display = state.canForward && dirKnown ? "inline" : "none";
  }
  var tunnelLabel = document.querySelector(".de-tunnel-label");
  if (tunnelLabel) {
    tunnelLabel.textContent = state.protocol === "bgp" ? "BGP SESSION" : "OSPF ADJACENCY";
  }
  var fibEl = document.getElementById("xray-fib-entry");
  if (fibEl) {
    var _fibRr = window._lastXrayState && window._lastXrayState.route_resolution || {};
    if (_fibRr.resolved && _fibRr.matched_prefix) {
      var protoMap = {
        ospf: "O",
        static: "S",
        bgp: "B",
        connected: "C"
      };
      var protoChar = protoMap[_fibRr.protocol] || _fibRr.protocol || "?";
      var fibText = "FIB: " + protoChar + " " + _fibRr.matched_prefix;
      if (_fibRr.next_hop) fibText += " via " + _fibRr.next_hop;
      fibEl.textContent = fibText;
    }
  }
  var pingMode = xrayCurrentPingMode();
  _xrayApplyPingModeClasses(b, pingMode);
  var _rr = window._lastXrayState && window._lastXrayState.route_resolution || {};
  if (!window._xrayIsTransit && _rr.out_iface && _rr.out_iface === state.lanIf && !state.singleIf) {
    b.add("ping-left");
  }
  _xrayApplyHelloTiming(state);
  var protoCore = document.querySelector(".de-ospf:not(.de-ospf-coexist) .de-ospf-core");
  var protoInner = protoCore ? protoCore.querySelector(".inner") : null;
  var protoLbl = document.querySelector(".de-ospf:not(.de-ospf-coexist) .de-ospf-label");
  if (protoCore && protoInner && protoLbl) {
    protoLbl.textContent = state.protocol === "bgp" ? "BGP" : "OSPF";
    if (state.protocol === "bgp") {
      if (state.bgpEstablished) {
        protoCore.style.borderColor = "var(--xto-bgp,#a855f7)";
        protoCore.style.boxShadow = "0 0 20px rgba(var(--xto-bgp-rgb,168,85,247),0.5)";
        protoInner.style.background = "var(--xto-bgp,#a855f7)";
        protoInner.style.boxShadow = "0 0 10px var(--xto-bgp,#a855f7)";
        protoInner.style.animation = "";
        protoLbl.style.color = "var(--xto-bgp,#a855f7)";
      } else if (state.bgpPhase === "idle") {
        protoCore.style.borderColor = "var(--xto-idle,#ff8c00)";
        protoCore.style.boxShadow = "0 0 15px rgba(var(--xto-idle-rgb,255,140,0),0.4)";
        protoInner.style.background = "var(--xto-idle,#ff8c00)";
        protoInner.style.boxShadow = "0 0 8px var(--xto-idle,#ff8c00)";
        protoInner.style.animation = "xrayEnergyPulse 1s ease-in-out infinite alternate";
        protoLbl.style.color = "var(--xto-idle,#ff8c00)";
      } else {
        protoCore.style.borderColor = "var(--xto-down,#555)";
        protoCore.style.boxShadow = "none";
        protoInner.style.background = "#333";
        protoInner.style.boxShadow = "none";
        protoInner.style.animation = "";
        protoLbl.style.color = "var(--xto-down,#555)";
      }
    } else {
      if (state.ospfFull) {
        protoCore.style.borderColor = "var(--xto-ospf,#39ff14)";
        protoCore.style.boxShadow = "0 0 20px rgba(var(--xto-ospf-rgb,57,255,20),0.5)";
        protoInner.style.background = "var(--xto-ospf,#39ff14)";
        protoInner.style.boxShadow = "0 0 10px var(--xto-ospf,#39ff14)";
        protoInner.style.animation = "";
        protoLbl.style.color = "var(--xto-ospf,#39ff14)";
      } else if (state.helloOut) {
        protoCore.style.borderColor = "var(--xto-idle,#ff8c00)";
        protoCore.style.boxShadow = "0 0 15px rgba(var(--xto-idle-rgb,255,140,0),0.4)";
        protoInner.style.background = "var(--xto-idle,#ff8c00)";
        protoInner.style.boxShadow = "0 0 8px var(--xto-idle,#ff8c00)";
        protoInner.style.animation = "xrayEnergyPulse 1s ease-in-out infinite alternate";
        protoLbl.style.color = "var(--xto-idle,#ff8c00)";
      } else {
        protoCore.style.borderColor = "var(--xto-down,#555)";
        protoCore.style.boxShadow = "none";
        protoInner.style.background = "#333";
        protoInner.style.boxShadow = "none";
        protoInner.style.animation = "";
        protoLbl.style.color = "var(--xto-down,#555)";
      }
    }
  }
  (function() {
    var _cxCfg = window._scenarioConfig || {}, _cxSt = window._lastXrayState || {};
    var _isCoex = !!(_cxCfg.xray && _cxCfg.xray.deep_coexist_ospf) && !!(_cxSt.lan_iface && _cxSt.wan_iface && _cxSt.lan_iface !== _cxSt.wan_iface);
    document.body.classList.toggle("de-coexist-glyph", _isCoex);
    var _cxCore = document.querySelector(".de-ospf-coexist .de-ospf-core");
    var _cxInner = _cxCore ? _cxCore.querySelector(".inner") : null;
    var _cxLbl = document.querySelector(".de-ospf-coexist .de-ospf-label");
    if (_isCoex && _cxCore && _cxInner && _cxLbl) {
      _cxLbl.textContent = "OSPF";
      var _cxFull = !!(state.ospfFull || _cxSt.has_full || _cxSt.neighbor_state === "Full");
      var _cxUp = _cxFull || !!(_cxSt.ospf_active_on_interface || _cxSt.ospf_configured || state.helloOut);
      if (_cxFull) {
        _cxCore.style.borderColor = "var(--xto-ospf,#39ff14)";
        _cxCore.style.boxShadow = "0 0 20px rgba(var(--xto-ospf-rgb,57,255,20),0.5)";
        _cxInner.style.background = "var(--xto-ospf,#39ff14)";
        _cxInner.style.boxShadow = "0 0 10px var(--xto-ospf,#39ff14)";
        _cxInner.style.animation = "";
        _cxLbl.style.color = "var(--xto-ospf,#39ff14)";
      } else if (_cxUp) {
        _cxCore.style.borderColor = "var(--xto-idle,#ff8c00)";
        _cxCore.style.boxShadow = "0 0 15px rgba(var(--xto-idle-rgb,255,140,0),0.4)";
        _cxInner.style.background = "var(--xto-idle,#ff8c00)";
        _cxInner.style.boxShadow = "0 0 8px var(--xto-idle,#ff8c00)";
        _cxInner.style.animation = "xrayEnergyPulse 1s ease-in-out infinite alternate";
        _cxLbl.style.color = "var(--xto-idle,#ff8c00)";
      } else {
        _cxCore.style.borderColor = "var(--xto-down,#555)";
        _cxCore.style.boxShadow = "none";
        _cxInner.style.background = "#333";
        _cxInner.style.boxShadow = "none";
        _cxInner.style.animation = "";
        _cxLbl.style.color = "var(--xto-down,#555)";
      }
    }
  })();
  var _ps = window._lastXrayState || {};
  var _targetNodeId = window._xrayTargetNode || "topo-node-r1";
  document.querySelectorAll(".xray-ospf-unit").forEach(function(unit) {
    var node = unit.closest('.topo-node, .topo-multi-node, [id^="topo-node-"]');
    var nodeId = node ? node.id : "";
    var isTarget = nodeId === _targetNodeId;
    var dot = unit.querySelector(".xray-ospf-dot");
    if (!dot) return;
    if (state.protocol === "static") {
      unit.style.display = "none";
    } else if (state.protocol === "bgp") {
      unit.style.display = "";
      var bgpEst = false;
      if (isTarget) {
        bgpEst = !!_ps.is_established;
      } else {
        var nodeName = nodeId.replace("topo-node-", "");
        var estField = nodeName + "_established";
        bgpEst = _ps[estField] !== undefined ? !!_ps[estField] : !!_ps.is_established;
      }
      unit.classList.toggle("ospf-active", bgpEst);
      if (bgpEst) {
        dot.style.setProperty("background", "#a855f7", "important");
        dot.style.setProperty("box-shadow", "0 0 8px #a855f7", "important");
        unit.style.setProperty("border-color", "#a855f7", "important");
        unit.style.setProperty("box-shadow", "0 0 8px rgba(168,85,247,0.5)", "important");
      } else {
        dot.style.setProperty("background", "#ff8c00", "important");
        dot.style.setProperty("box-shadow", "0 0 6px #ff8c00", "important");
        unit.style.setProperty("border-color", "#ff8c00", "important");
        unit.style.setProperty("box-shadow", "0 0 8px rgba(255,140,0,0.3)", "important");
      }
    } else {
      unit.style.display = "";
      var ospfActive = isTarget ? !!_ps.ospf_active_on_interface : !!_ps.peer_sending_hello;
      unit.classList.toggle("ospf-active", ospfActive);
      dot.style.removeProperty("background");
      dot.style.removeProperty("box-shadow");
      unit.style.removeProperty("border-color");
      unit.style.removeProperty("box-shadow");
    }
  });
  var _s = window._lastXrayState || {};
  var _ifaces = _s.interfaces || {};
  var _ifKeys = Object.keys(_ifaces);
  if (_ifKeys.length > 0) {
    var targetId = window._xrayTargetNode || "topo-node-r1";
    var targetNode = document.getElementById(targetId);
    if (targetNode) {
      var ifaceEls = targetNode.querySelectorAll(".topo-iface");
      _ifKeys.forEach(function(ifName, idx) {
        var info = _ifaces[ifName];
        var el = ifaceEls[idx];
        if (el) {
          var labelEl = el.querySelector(".label");
          var ipEl = el.querySelector(".ip");
          if (labelEl) labelEl.textContent = ifName + ":";
          if (ipEl) ipEl.textContent = info.ip || "";
        }
      });
      if (!window._xrayUserToggled) {
        ifaceEls.forEach(function(el) {
          if (el) el.querySelectorAll(".xray-if-dot").forEach(function(d) {
            d.remove();
          });
        });
      } else {
        _ifKeys.forEach(function(ifName, idx) {
          var info = _ifaces[ifName];
          var el = ifaceEls[idx];
          if (!el) return;
          el.querySelectorAll(".xray-if-dot").forEach(function(d) {
            d.remove();
          });
          var dot = document.createElement("span");
          dot.className = "xray-if-dot";
          dot.style.cssText = "display:inline-block;width:6px;height:6px;border-radius:50%;margin-left:4px;vertical-align:middle;position:relative;z-index:10;" + "background:" + (info.up ? "#39ff14" : "#ff4444") + ";" + "box-shadow:0 0 4px " + (info.up ? "rgba(57,255,20,0.6)" : "rgba(255,68,68,0.6)");
          el.appendChild(dot);
        });
      }
    }
    var allLinks = document.querySelectorAll(".topo-link");
    allLinks.forEach(function(linkEl) {
      var subnetEl = linkEl.querySelector(".topo-link-subnet");
      var lineEl = linkEl.querySelector(".topo-link-line");
      var prev = linkEl.previousElementSibling;
      var next = linkEl.nextElementSibling;
      if (!prev || !next) return;
      var hasTarget = function(el) {
        return el.id === targetId || !!(el.querySelector && el.querySelector("#" + targetId));
      };
      var isTargetPrev = hasTarget(prev);
      var isTargetNext = hasTarget(next);
      if (!isTargetPrev && !isTargetNext) return;
      var linkIdx = Array.from(allLinks).indexOf(linkEl);
      var ifName;
      if (isTargetNext) {
        ifName = _s.lan_iface || _ifKeys[0] || "";
      } else {
        ifName = _s.wan_iface || _ifKeys[_ifKeys.length - 1] || "";
      }
      if (subnetEl) {
        var netName = linkEl.getAttribute("data-net");
        var topoSubnets = window._xrayTopologyData && window._xrayTopologyData.subnets || null;
        if (netName && topoSubnets && topoSubnets[netName]) {
          subnetEl.textContent = topoSubnets[netName];
        } else if (netName && !topoSubnets) {
          window._xrayEnsureTopology();
        } else if (ifName && _ifaces[ifName] && _ifaces[ifName].ip) {
          var ip = _ifaces[ifName].ip;
          subnetEl.textContent = ip.replace(/\.\d+\//, ".0/");
        }
      }
      var xMark = linkEl.querySelector(".xray-link-x");
      if (xMark) xMark.remove();
      var _isXray = document.body.classList.contains("is-xray-mode");
      var _linkUp = null;
      if (_isXray && lineEl) {
        var _linkNetName = linkEl.getAttribute("data-net");
        var _topoData = window._xrayTopologyData;
        if (_linkNetName && _topoData && _topoData.subnets && _topoData.nodes) {
          var _linkSubnet = _topoData.subnets[_linkNetName];
          if (_linkSubnet) {
            var _linkPrefix = _linkSubnet.replace(/\/\d+$/, "").split(".").slice(0, 3).join(".");
            var _foundAny = false, _allLinkUp = true;
            for (var _nodeName in _topoData.nodes) {
              var _nodeIfs = _topoData.nodes[_nodeName] || [];
              for (var _ifi = 0; _ifi < _nodeIfs.length; _ifi++) {
                if (_nodeIfs[_ifi].name === "lo") continue;
                var _ifIp = _nodeIfs[_ifi].ip || "";
                if (_ifIp.indexOf(_linkPrefix + ".") === 0) {
                  _foundAny = true;
                  var _effState = _xrayEffectiveIfaceState(_nodeName, _nodeIfs[_ifi].name, _nodeIfs[_ifi].state);
                  if (_effState !== "UP") _allLinkUp = false;
                }
              }
            }
            if (_foundAny) _linkUp = _allLinkUp;
          }
        }
        if (_linkUp === null && ifName && _ifaces[ifName]) {
          _linkUp = !!_ifaces[ifName].up;
        }
      }
      if (_isXray && lineEl && _linkUp !== null) {
        if (!_linkUp) {
          lineEl.style.setProperty("background", "repeating-linear-gradient(90deg,rgba(255,60,60,0.5) 0,rgba(255,60,60,0.5) 8px,transparent 8px,transparent 16px)", "important");
          lineEl.style.setProperty("box-shadow", "none", "important");
          lineEl.style.setProperty("height", "3px", "important");
          xMark = document.createElement("div");
          xMark.className = "xray-link-x";
          xMark.textContent = "✖";
          xMark.style.cssText = "position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:22px;height:22px;background:rgba(220,40,40,0.85);border:2px solid #ef5350;border-radius:50%;color:#fff;font-size:11px;line-height:22px;text-align:center;z-index:10;box-shadow:0 0 12px rgba(239,83,80,0.7),0 0 30px rgba(239,83,80,0.3);pointer-events:none";
          linkEl.style.position = "relative";
          linkEl.appendChild(xMark);
        } else {
          lineEl.style.removeProperty("background");
          lineEl.style.removeProperty("box-shadow");
          lineEl.style.removeProperty("height");
        }
      }
    });
  }
  var ovTunnel = document.querySelector(".xray-ospf-tunnel");
  if (ovTunnel) {
    var isXrayMode = document.body.classList.contains("is-xray-mode");
    var showTunnel = isXrayMode && (state.ospfFull || state.bgpEstablished);
    var tBody = ovTunnel.querySelector(".xray-tunnel-body");
    var tPortals = ovTunnel.querySelectorAll(".xray-tunnel-portal");
    var tRings = ovTunnel.querySelectorAll(".xray-tunnel-ring");
    var tFill = ovTunnel.querySelector(".xray-tunnel-fill");
    var tLabel = ovTunnel.querySelector(".xray-tunnel-label");
    if (showTunnel) {
      ovTunnel.style.display = "block";
      var _diag = document.querySelector(".topo-diagram");
      var _tNodes = _diag ? _diag.querySelectorAll(".topo-node") : [];
      if (_diag && _tNodes.length >= 2) {
        var _dRect = _diag.getBoundingClientRect();
        var _dW = _dRect.width;
        if (_dW > 0) {
          var _first = _tNodes[0].getBoundingClientRect();
          var _last = _tNodes[_tNodes.length - 1].getBoundingClientRect();
          var _l = Math.min(_first.left, _last.left) - _dRect.left;
          var _r = Math.max(_first.right, _last.right) - _dRect.left;
          ovTunnel.style.left = _l / _dW * 100 + "%";
          ovTunnel.style.width = (_r - _l) / _dW * 100 + "%";
        }
      }
      if (tBody) {
        tBody.style.height = "36px";
        tBody.style.opacity = "1";
      }
      tPortals.forEach(function(p) {
        p.style.opacity = "1";
      });
      tRings.forEach(function(r) {
        r.style.opacity = "1";
      });
      if (tFill) tFill.style.opacity = "1";
      if (tLabel) {
        tLabel.style.opacity = "1";
        tLabel.textContent = state.protocol === "bgp" ? "Established" : "Full";
      }
    } else {
      if (tBody) {
        tBody.style.height = "0";
        tBody.style.opacity = "0";
      }
      tPortals.forEach(function(p) {
        p.style.opacity = "0";
      });
      tRings.forEach(function(r) {
        r.style.opacity = "0";
      });
      if (tFill) tFill.style.opacity = "0";
      if (tLabel) tLabel.style.opacity = "0";
    }
  }
  var _phase = state.protocol === "bgp" ? state.bgpPhase || "idle" : state.protocol === "ospf" ? state.ospfPhase || "inactive" : "";
  var _prevPhase = window._xrayCurrentPhase || "";
  window._xrayCurrentPhase = _phase;
  var holoContent = window._xrayHoloContent;
  if (holoContent && _phase) {
    var hBody = document.getElementById("xray-holo-body");
    if (hBody) hBody.innerHTML = holoContent[_phase] || "";
  }
  if (_phase && _phase !== _prevPhase && _prevPhase !== "__activating__") {
    var flash = document.getElementById("xray-flash-scene");
    if (flash) {
      if (_phase === "init" && _prevPhase === "inactive") {
        flash.className = "xray-flash-scene fire";
        setTimeout(function() {
          flash.className = "xray-flash-scene";
        }, 900);
      }
    }
    if (typeof window._xrayOnPhaseChange === "function") {
      window._xrayOnPhaseChange(_phase, _prevPhase);
    }
  }
  var s = window._lastXrayState;
  if (s && !window._xrayCustomDeep && document.body.classList.contains("is-xray-deep")) {
    var rr = s.route_resolution || {};
    var opts = {
      target: rr.target || "2.2.2.2"
    };
    var lines;
    if (state.protocol === "ospf") {
      lines = xrayOspfDeepLines(s, opts);
    } else if (state.protocol === "static") {
      lines = xrayStaticDeepLines(s, opts);
    } else if (state.protocol === "bgp") {
      lines = xrayBgpDeepLines(s, opts);
    }
    if (lines) {
      var rePanel = document.getElementById("de-re-panel");
      if (rePanel) {
        xraySetDeepDive("#de-re-panel", lines);
      }
      var oldInit = document.querySelector(".de-panel-initial");
      if (oldInit) oldInit.style.display = "none";
      var oldClr = document.querySelector(".de-panel-cleared");
      if (oldClr) oldClr.style.display = "none";
    }
  }
  if (document.body.classList.contains("is-xray-mode")) {
    xrayUpdateNonTargetLogic();
    if (!_ovPingKfValid) _xrayComputeOvPingKf();
  }
}

var _xrayTopoFetching = false;

function _xrayEffectiveIfaceState(nodeName, ifaceName, fallback) {
  var live = window._xrayLiveIfaceStates;
  if (live && live[nodeName] && live[nodeName][ifaceName]) {
    return live[nodeName][ifaceName];
  }
  return fallback || "UP";
}

function xrayUpdateNonTargetLogic() {
  var topo = window._xrayTopologyData;
  if (!topo) {
    window._xrayEnsureTopology();
    return;
  }
  var targetId = window._xrayTargetNode || "topo-node-r1";
  var s = window._lastXrayState || {};
  var rr = s.route_resolution || {};
  var pingTarget = rr.target || "";
  document.querySelectorAll('[id^="topo-node-"]').forEach(function(node) {
    if (node.id === targetId) return;
    var nodeId = node.id.replace("topo-node-", "");
    var box = node.querySelector(".topo-box");
    if (!box) return;
    var logic = box.querySelector(".xray-logic:not(.xray-initial):not(.xray-cleared)");
    if (!logic) {
      if (box.classList.contains("target") && box.dataset.secIfaceBuilt !== "1") {
        var _tgtIfs = topo.nodes && topo.nodes[nodeId] || [];
        if (_tgtIfs.length) {
          var _rows = [];
          _tgtIfs.forEach(function(_if) {
            if (_if.name === "lo") return;
            _rows.push({
              lbl: _if.name,
              ip: _if.ip
            });
          });
          var _tlo = _tgtIfs.find(function(i) {
            return i.name === "lo";
          });
          if (_tlo) _rows.push({
            lbl: "Lo",
            ip: _tlo.ip
          });
          var _ipH = _rows.map(function(r) {
            var _ipShow = (r.ip || "...").replace(/\/\d+$/, "");
            return '<div class="xr-if-row"><span class="label">' + r.lbl + ':</span> <span class="ip">' + _ipShow + "</span></div>";
          }).join("");
          box.querySelectorAll(".xray-logic.xray-initial, .xray-logic.xray-cleared").forEach(function(sl) {
            sl.innerHTML = _ipH;
          });
          box.dataset.secIfaceBuilt = "1";
        }
      }
      return;
    }
    var isServer = box.classList.contains("server");
    var isIsp = box.classList.contains("isp");
    var nodeIfaces = topo.nodes && topo.nodes[nodeId] || [];
    var lines;
    if (isServer) {
      lines = _xrayServerLines(nodeId, nodeIfaces, topo, s, pingTarget);
    } else if (isIsp) {
      lines = _xrayIspLines(nodeId, nodeIfaces, pingTarget);
    } else {
      lines = _xrayPeerRouterLines(nodeId, nodeIfaces, s);
    }
    if (lines && lines.length > 0) {
      logic.innerHTML = lines.map(function(l) {
        return "<span" + (l.cls ? ' class="' + l.cls + '"' : "") + ">" + l.text + "</span>";
      }).join("");
    }
  });
}

function _xrayServerLines(nodeId, nodeIfaces, topo, s, pingTarget) {
  var svIface = nodeIfaces.find(function(i) {
    return i.name !== "lo";
  });
  var svIp = svIface ? svIface.ip : "...";
  var gwIp = "...";
  var targetNodeId = (window._xrayTargetNode || "topo-node-r1").replace("topo-node-", "");
  var targetIfaces = topo.nodes && topo.nodes[targetNodeId] || [];
  if (svIface && targetIfaces.length > 0) {
    var svPrefix = svIface.ip.split(".").slice(0, 3).join(".");
    var gwIface = targetIfaces.find(function(i) {
      return i.name !== "lo" && i.ip && i.ip.split(".").slice(0, 3).join(".") === svPrefix;
    });
    if (gwIface) gwIp = gwIface.ip;
  }
  return [ {
    text: "$ ping " + (pingTarget || "..."),
    cls: "dim"
  }, {
    text: "SRC: " + svIp
  }, {
    text: "DST: " + (pingTarget || "...")
  }, {
    text: "&rarr; GW " + gwIp,
    cls: "hl"
  } ];
}

function _xrayIspLines(nodeId, nodeIfaces, pingTarget) {
  var inIface = nodeIfaces.find(function(i) {
    return i.name !== "lo";
  });
  var inName = inIface ? inIface.name : "...";
  return [ {
    text: "IN: " + inName
  }, {
    text: "DST: " + (pingTarget || "...")
  }, {
    text: '&nbsp; (<span class="hl">LOCAL</span>)'
  }, {
    text: "&rarr; ICMP Reply",
    cls: "hl"
  }, {
    text: "TTL=64, seq=1",
    cls: "dim"
  } ];
}

function _xrayPeerRouterLines(nodeId, nodeIfaces, s) {
  var protocol = window._xrayProtocol || s.protocol || "ospf";
  var lines = [];
  if (protocol === "ospf") {
    var nodeHello = s[nodeId + "_hello"];
    var nodeHasFull = s[nodeId + "_has_full"];
    var nodeNeighborState = s[nodeId + "_neighbor_state"];
    var peerHello = nodeHello !== undefined ? nodeHello > 0 : !!s.peer_sending_hello;
    var hasFull = nodeHasFull !== undefined ? !!nodeHasFull : !!s.has_full;
    var neighborState = nodeNeighborState || s.neighbor_state || "";
    if (hasFull || neighborState === "Full") {
      lines.push({
        text: 'OSPF: <span class="hl">FULL</span>'
      });
    } else if (peerHello) {
      lines.push({
        text: 'OSPF: <span class="hl">ACTIVE</span>'
      });
    } else {
      lines.push({
        text: 'OSPF: <span class="warn">&mdash;</span>'
      });
    }
    if (peerHello) {
      lines.push({
        text: "Hello: sending",
        cls: "hl"
      });
    }
    var lo = nodeIfaces.find(function(i) {
      return i.name === "lo";
    });
    if (lo) lines.push({
      text: "Lo: " + lo.ip
    });
    var area = s[nodeId + "_area"] || s.r2_area;
    if (area !== undefined && area !== null) {
      lines.push({
        text: "area " + area,
        cls: "dim"
      });
    }
  } else if (protocol === "bgp") {
    var estField = nodeId + "_established";
    var est = s[estField] !== undefined ? !!s[estField] : !!s.is_established;
    lines.push({
      text: "BGP: " + (est ? '<span class="hl">Established</span>' : '<span class="warn">' + (s.bgp_state || "Idle") + "</span>")
    });
    var lo = nodeIfaces.find(function(i) {
      return i.name === "lo";
    });
    if (lo) lines.push({
      text: "Lo: " + lo.ip
    });
  } else {
    nodeIfaces.forEach(function(iface) {
      if (iface.name === "lo") return;
      var st = _xrayEffectiveIfaceState(nodeId, iface.name, iface.state);
      lines.push({
        text: iface.name + ": " + st,
        cls: st === "UP" ? "hl" : "warn"
      });
    });
    var lo = nodeIfaces.find(function(i) {
      return i.name === "lo";
    });
    if (lo) lines.push({
      text: "Lo: " + lo.ip,
      cls: "dim"
    });
  }
  return lines;
}

var _ovPingKfValid = false;

function _xrayComputeOvPingKf() {
  var diag = document.querySelector(".topo-diagram");
  if (!diag) return;
  if (diag.querySelector(".topo-triangle") || diag.querySelector(".topo-multi-node") || diag.querySelector(".topo-inverted-v")) return;
  var nodes = Array.from(diag.querySelectorAll(".topo-node"));
  if (nodes.length < 2) return;
  var dRect = diag.getBoundingClientRect();
  var dW = dRect.width;
  if (dW < 1) return;
  function pct(el) {
    var r = el.getBoundingClientRect();
    return (r.left + r.width / 2 - dRect.left) / dW * 100;
  }
  var targetId = window._xrayTargetNode || "topo-node-r1";
  var pingMode = window._xrayPingMode || "from-r1";
  var positions = nodes.map(function(n) {
    return {
      id: n.id,
      p: pct(n)
    };
  });
  var srcP, dstP, midP;
  if (pingMode === "through" && positions.length >= 3) {
    srcP = positions[0].p;
    dstP = positions[positions.length - 1].p;
    var tgt = positions.find(function(p) {
      return p.id === targetId;
    });
    midP = tgt ? tgt.p : positions[Math.floor(positions.length / 2)].p;
  } else {
    var tgt = positions.find(function(p) {
      return p.id === targetId;
    });
    if (tgt) {
      srcP = tgt.p;
      dstP = positions[0].p;
      positions.forEach(function(p) {
        if (Math.abs(p.p - srcP) > Math.abs(dstP - srcP)) dstP = p.p;
      });
    } else {
      srcP = positions[0].p;
      dstP = positions[positions.length - 1].p;
    }
  }
  var old = document.getElementById("xray-ov-ping-kf");
  if (old) old.remove();
  var style = document.createElement("style");
  style.id = "xray-ov-ping-kf";
  if (midP !== undefined) {
    style.textContent = "@keyframes xrayPktDyn{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "8%{opacity:1;transform:translateY(-50%) scale(1)}" + "45%{left:" + midP + "%;transform:translateY(-50%) scale(1.3)}" + "55%{left:" + (midP + 2) + "%;transform:translateY(-50%) scale(1.2)}" + "92%{opacity:1;transform:translateY(-50%) scale(1)}" + "100%{left:" + dstP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "}" + "@keyframes xrayPktStop{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "8%{opacity:1;transform:translateY(-50%) scale(1)}" + "40%{left:" + (midP - 1) + "%;transform:translateY(-50%) scale(1.3)}" + "50%{left:" + midP + "%;opacity:1;transform:translateY(-50%) scale(1.1)}" + "70%{left:" + midP + "%;opacity:0.3;transform:translateY(-50%) scale(0.8)}" + "100%{left:" + midP + "%;opacity:0;transform:translateY(-50%) scale(0.5)}" + "}";
  } else {
    style.textContent = "@keyframes xrayPktDyn{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "8%{opacity:1;transform:translateY(-50%) scale(1)}" + "85%{left:" + dstP + "%;opacity:1;transform:translateY(-50%) scale(1)}" + "100%{left:" + dstP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "}" + "@keyframes xrayPktStop{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "8%{opacity:1;transform:translateY(-50%) scale(1)}" + "40%{left:" + (srcP + dstP) / 2 + "%;transform:translateY(-50%) scale(1.3)}" + "50%{left:" + (srcP + dstP) / 2 + "%;opacity:1;transform:translateY(-50%) scale(1.1)}" + "70%{left:" + (srcP + dstP) / 2 + "%;opacity:0.3;transform:translateY(-50%) scale(0.8)}" + "100%{left:" + (srcP + dstP) / 2 + "%;opacity:0;transform:translateY(-50%) scale(0.5)}" + "}";
  }
  if (midP !== undefined) {
    style.textContent += "@keyframes xrayOvPingReq{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "4%{opacity:1;transform:translateY(-50%) scale(1)}" + "20%{left:" + midP + "%;transform:translateY(-50%) scale(1.3)}" + "25%{left:" + (midP + 1) + "%;transform:translateY(-50%) scale(1.2)}" + "45%{left:" + dstP + "%;opacity:0.8;transform:translateY(-50%) scale(1)}" + "50%{left:" + dstP + "%;opacity:0}" + "100%{opacity:0}" + "}" + "@keyframes xrayOvPingRep{" + "0%{left:" + dstP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "4%{opacity:1;transform:translateY(-50%) scale(1)}" + "20%{left:" + midP + "%;transform:translateY(-50%) scale(1.3)}" + "25%{left:" + (midP - 1) + "%;transform:translateY(-50%) scale(1.2)}" + "45%{left:" + srcP + "%;opacity:0.8;transform:translateY(-50%) scale(1)}" + "50%{left:" + srcP + "%;opacity:0}" + "100%{opacity:0}" + "}";
  } else {
    style.textContent += "@keyframes xrayOvPingReq{" + "0%{left:" + srcP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "6%{opacity:1;transform:translateY(-50%) scale(1)}" + "40%{left:" + dstP + "%;opacity:0.8;transform:translateY(-50%) scale(1)}" + "44%{left:" + dstP + "%;opacity:0}" + "100%{opacity:0}" + "}" + "@keyframes xrayOvPingRep{" + "0%{left:" + dstP + "%;opacity:0;transform:translateY(-50%) scale(0.6)}" + "6%{opacity:1;transform:translateY(-50%) scale(1)}" + "40%{left:" + srcP + "%;opacity:0.8;transform:translateY(-50%) scale(1)}" + "44%{left:" + srcP + "%;opacity:0}" + "100%{opacity:0}" + "}";
  }
  document.head.appendChild(style);
  if (document.body.classList.contains("ping-ok")) {
    diag.querySelectorAll(".xray-packet-orb").forEach(function(orb) {
      orb.style.animation = "none";
      void orb.offsetHeight;
      orb.style.animation = "";
    });
  }
  _ovPingKfValid = true;
}

document.addEventListener("DOMContentLoaded", function() {
  setTimeout(function() {
    _xrayComputeOvPingKf();
  }, 200);
});

window.addEventListener("resize", function() {
  _ovPingKfValid = false;
});

var _ovHelloPosValid = false;

function _xrayEnsureOvHelloElements() {
  var diag = document.querySelector(".topo-diagram");
  if (!diag) return;
  diag.style.position = "relative";
  if (diag.querySelector(".xray-hello-container")) return;
  var c = document.createElement("div");
  c.className = "xray-hello-container";
  c.innerHTML = '<div class="xray-hello-pkt"></div><div class="xray-hello-pkt"></div>';
  diag.appendChild(c);
}

function _xrayComputeOvHelloPos() {
  var diag = document.querySelector(".topo-diagram");
  if (!diag) return;
  var r1 = document.getElementById("topo-node-r1");
  var r2 = document.getElementById("topo-node-r2");
  if (!r1 || !r2) return;
  var dRect = diag.getBoundingClientRect();
  var dW = dRect.width, dH = dRect.height;
  if (dW < 1) return;
  function rightPct(el) {
    var r = el.getBoundingClientRect();
    return 100 - (r.left + r.width / 2 - dRect.left) / dW * 100;
  }
  function topPct(el) {
    var r = el.getBoundingClientRect();
    if (dH < 1) return 50;
    return (r.top + r.height / 2 - dRect.top) / dH * 100;
  }
  window._xrayHelloPos = {
    r1R: rightPct(r1),
    r2R: rightPct(r2),
    r1Y: topPct(r1),
    r2Y: topPct(r2)
  };
  _ovHelloPosValid = true;
}

window.addEventListener("resize", function() {
  _ovHelloPosValid = false;
});

var _HELLO_TRAVEL_TIME = 1.5;

var _helloKfCache = {};

function _xrayBuildHelloKf(name, interval, direction) {
  var key = name + "_" + interval;
  if (_helloKfCache[key]) return _helloKfCache[key];
  var tPct = _HELLO_TRAVEL_TIME / interval * 100;
  var fadeIn = Math.min(tPct * .13, 3);
  var fadeOut = Math.min(tPct + tPct * .2, 99);
  var positions = {
    out: {
      start: "calc(50% + 10px)",
      end: "calc(100% - 12px)"
    },
    in: {
      start: "calc(100% - 12px)",
      end: "calc(50% + 10px)"
    },
    "left-out": {
      start: "calc(50% - 10px)",
      end: "12px"
    },
    "left-in": {
      start: "12px",
      end: "calc(50% - 10px)"
    }
  };
  var pos = positions[direction] || positions["out"];
  var startPos = pos.start;
  var endPos = pos.end;
  var kfName = name + "_" + interval;
  var rule = "@keyframes " + kfName + "{" + "0%{left:" + startPos + ";opacity:0}" + fadeIn.toFixed(1) + "%{opacity:1}" + tPct.toFixed(1) + "%{left:" + endPos + ";opacity:0.8}" + fadeOut.toFixed(1) + "%{left:" + endPos + ";opacity:0}" + "100%{opacity:0}}";
  var el = document.getElementById("xray-hello-kf") || function() {
    var s = document.createElement("style");
    s.id = "xray-hello-kf";
    (document.head || document.documentElement).appendChild(s);
    return s;
  }();
  el.textContent += rule + "\n";
  _helloKfCache[key] = kfName;
  return kfName;
}

function _xrayBuildOvHelloKf(name, interval, startR, endR, yOff) {
  var key = name + "_" + interval;
  if (_helloKfCache[key]) return _helloKfCache[key];
  var movePct = _HELLO_TRAVEL_TIME / interval * 100;
  var p1 = Math.min(movePct * .2, 5);
  var p2 = Math.min(movePct, 40);
  var p3 = Math.min(p2 + movePct * .3, 50);
  var ty = "translateY(calc(-50% " + yOff + "))";
  var rule = "@keyframes " + key + "{" + "0%{right:" + startR + "%;opacity:0;transform:" + ty + " scale(0.8)}" + p1.toFixed(1) + "%{opacity:1;transform:" + ty + " scale(1)}" + p2.toFixed(1) + "%{right:" + endR + "%;opacity:1;transform:" + ty + " scale(1)}" + p3.toFixed(1) + "%{right:" + endR + "%;opacity:0;transform:" + ty + " scale(1)}" + "100%{right:" + endR + "%;opacity:0}}";
  var el = document.getElementById("xray-hello-kf") || function() {
    var s = document.createElement("style");
    s.id = "xray-hello-kf";
    (document.head || document.documentElement).appendChild(s);
    return s;
  }();
  el.textContent += rule + "\n";
  _helloKfCache[key] = key;
  return key;
}

function _xrayBuildOvBounceDead(name, interval, startR, endR, yOff) {
  var key = name + "_" + interval;
  if (_helloKfCache[key]) return _helloKfCache[key];
  var movePct = _HELLO_TRAVEL_TIME / interval * 100;
  var p1 = Math.min(movePct * .2, 5);
  var p2 = Math.min(movePct, 40);
  var pBounce = Math.min(p2 + 3, 45);
  var pRecoil = Math.min(pBounce + 3, 50);
  var pFade = Math.min(pRecoil + 5, 60);
  var ty = "translateY(calc(-50% " + yOff + "))";
  var recoilR = endR + 2;
  var rule = "@keyframes " + key + "{" + "0%{right:" + startR + "%;opacity:0;transform:" + ty + " scale(0.5)}" + p1.toFixed(1) + "%{opacity:1;transform:" + ty + " scale(1)}" + p2.toFixed(1) + "%{right:" + endR + "%;opacity:1;transform:" + ty + " scale(1)}" + pBounce.toFixed(1) + "%{right:" + endR + "%;opacity:1;transform:" + ty + " scale(1.4)}" + pRecoil.toFixed(1) + "%{right:" + recoilR + "%;opacity:0.6;transform:" + ty + " scale(0.6)}" + pFade.toFixed(1) + "%{right:" + endR + "%;opacity:0}" + "100%{opacity:0}}";
  var sparkKey = "_spark_" + interval;
  if (!_helloKfCache[sparkKey]) {
    var sp1 = Math.max(p2 - 1, 0);
    var sp2 = p2;
    var sp3 = Math.min(p2 + 4, pFade);
    rule += "\n@keyframes xsparkSync_" + interval + "{" + "0%," + sp1.toFixed(1) + "%{opacity:0}" + sp2.toFixed(1) + "%{opacity:1}" + sp3.toFixed(1) + "%{opacity:0}" + "100%{opacity:0}}";
    _helloKfCache[sparkKey] = "xsparkSync_" + interval;
  }
  var el = document.getElementById("xray-hello-kf") || function() {
    var s = document.createElement("style");
    s.id = "xray-hello-kf";
    (document.head || document.documentElement).appendChild(s);
    return s;
  }();
  el.textContent += rule + "\n";
  _helloKfCache[key] = key;
  return key;
}

function _xrayBuildOvReach(name, interval, startR, endR, yOff) {
  var key = name + "_" + interval;
  if (_helloKfCache[key]) return _helloKfCache[key];
  var movePct = _HELLO_TRAVEL_TIME / interval * 100;
  var p1 = Math.min(movePct * .2, 5);
  var p2 = Math.min(movePct, 40);
  var p3 = Math.min(p2 + movePct * .3, 50);
  var ty = "translateY(calc(-50% " + yOff + "))";
  var rule = "@keyframes " + key + "{" + "0%{right:" + startR + "%;opacity:0;transform:" + ty + " scale(0.5)}" + p1.toFixed(1) + "%{opacity:1;transform:" + ty + " scale(1)}" + p2.toFixed(1) + "%{right:" + endR + "%;opacity:1;transform:" + ty + " scale(1)}" + p3.toFixed(1) + "%{right:" + endR + "%;opacity:0.4;transform:" + ty + " scale(0.3)}" + "100%{right:" + endR + "%;opacity:0}}";
  var el = document.getElementById("xray-hello-kf") || function() {
    var s = document.createElement("style");
    s.id = "xray-hello-kf";
    (document.head || document.documentElement).appendChild(s);
    return s;
  }();
  el.textContent += rule + "\n";
  _helloKfCache[key] = key;
  return key;
}

function _xrayApplyHelloTiming(state) {
  if (typeof _xrayUnifiedActive === "function" && _xrayUnifiedActive(window._scenarioConfig || {})) {
    var _uh = document.querySelectorAll(".xray-hello-pkt, .de-hello-orb, .xray-hello-container");
    for (var _u = 0; _u < _uh.length; _u++) {
      if (_uh[_u].style && _uh[_u].style.setProperty) {
        _uh[_u].style.setProperty("animation", "none", "important");
        _uh[_u].style.setProperty("display", "none", "important");
      }
    }
    return;
  }
  var r1Hello = state._r1Hello || 10;
  var r2Hello = state._r2Hello || 10;
  var _triDeepH = !!window._triNodes || ((window._scenarioConfig || {}).xray || {}).pattern === "ospf_triangle" || !!document.querySelector("[data-topo-triangle]");
  var outOrb = document.querySelector(".de-hello-orb.out");
  var inOrb = document.querySelector(".de-hello-orb.in");
  if (!_triDeepH && outOrb && state.helloOut) {
    var kf = _xrayBuildHelloKf("deHOut", r1Hello, "out");
    outOrb.style.animation = kf + " " + r1Hello + "s ease-in-out infinite";
  }
  if (!_triDeepH && inOrb && state.helloIn) {
    var kf = _xrayBuildHelloKf("deHIn", r2Hello, "in");
    inOrb.style.animation = kf + " " + r2Hello + "s ease-in-out " + Math.floor(r2Hello / 2) + "s infinite";
  }
  _xrayEnsureOvHelloElements();
  if (!_ovHelloPosValid) _xrayComputeOvHelloPos();
  var pos = window._xrayHelloPos;
  var helloPkts = document.querySelectorAll(".xray-hello-pkt");
  if (helloPkts.length >= 2 && pos) {
    if (Math.abs((pos.r1Y || 50) - (pos.r2Y || 50)) > 10) {} else if (state.protocol === "ospf") {
      var yUp = "- 10px", yDown = "+ 10px";
      if (state.helloOut) {
        var kf0 = _xrayBuildOvReach("ovR1R2", r1Hello, pos.r1R, pos.r2R, yDown);
        helloPkts[0].style.animation = kf0 + " " + r1Hello + "s ease-in-out infinite";
      } else {
        helloPkts[0].style.animation = "none";
      }
      if (state.helloIn) {
        var kf1 = _xrayBuildOvReach("ovR2R1", r2Hello, pos.r2R, pos.r1R, yUp);
        helloPkts[1].style.animation = kf1 + " " + r2Hello + "s ease-in-out " + (r2Hello / 2).toFixed(1) + "s infinite";
      } else {
        helloPkts[1].style.animation = "none";
      }
    } else {
      helloPkts[0].style.animation = "none";
      helloPkts[1].style.animation = "none";
    }
  }
  var leftOut = document.querySelector(".de-hello-orb.left-out");
  var leftIn = document.querySelector(".de-hello-orb.left-in");
  if (!_triDeepH && leftOut) {
    var kfLO = _xrayBuildHelloKf("deHLO", r1Hello, "left-out");
    leftOut.style.animation = kfLO + " " + r1Hello + "s ease-in-out infinite";
  }
  if (!_triDeepH && leftIn) {
    var kfLI = _xrayBuildHelloKf("deHLI", r2Hello, "left-in");
    leftIn.style.animation = kfLI + " " + r2Hello + "s ease-in-out " + Math.floor(r2Hello / 2) + "s infinite";
  }
}

function xrayIsCleared(s) {
  if (s.route_resolution && s.route_resolution.resolved !== undefined) {
    return s.route_resolution.resolved && s.ping_ok !== false;
  }
  return !!s.cleared;
}

function xrayCanForward(s) {
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var outIf = rr.out_iface || s.wan_iface || "";
  var routeAndIfUp = !!(rr.resolved && ifaces[outIf] && ifaces[outIf].up);
  if (typeof s.nh_reachable === "boolean") {
    return routeAndIfUp && s.nh_reachable;
  }
  var _staticBest = rr.protocol === "static" || !!(s.has_static && s.static_is_best);
  if (_staticBest && s.static_nh_valid === false) {
    return false;
  }
  if (s.r1_ping_ok !== undefined) {
    return routeAndIfUp && s.r1_ping_ok;
  }
  if (_staticBest && s.ping_ok !== undefined) {
    return routeAndIfUp && !!s.ping_ok;
  }
  return routeAndIfUp;
}

function xrayUpdateCleared(s) {
  var resolved = xrayIsCleared(s);
  if (resolved) {
    document.body.classList.add("is-cleared");
  } else {
    document.body.classList.remove("is-cleared");
  }
  return resolved;
}

function xrayActivateFlash() {
  if (window._xrayTraceClosing) return;
  var fullFlash = document.getElementById("xray-flash");
  if (fullFlash) {
    fullFlash.classList.add("active");
    setTimeout(function() {
      fullFlash.classList.remove("active");
    }, 600);
  }
  var flash = document.getElementById("xray-flash-scene");
  if (flash) {
    flash.style.cssText = "";
    flash.className = "xray-flash-scene";
    flash.style.opacity = "0.9";
    flash.style.background = "radial-gradient(circle at 50% 50%, rgba(255,200,100,0.95), rgba(255,140,0,0.7) 40%, transparent 70%)";
    flash.style.transition = "none";
    setTimeout(function() {
      flash.style.transition = "all 0.3s";
      flash.style.background = "linear-gradient(90deg, transparent 15%, rgba(255,140,0,0.6) 35%, rgba(255,200,100,0.9) 50%, rgba(255,140,0,0.6) 65%, transparent 85%)";
      flash.style.opacity = "0.6";
    }, 200);
    setTimeout(function() {
      flash.style.transition = "all 0.4s";
      flash.style.background = "linear-gradient(90deg, transparent 20%, rgba(255,140,0,0.4) 35%, rgba(255,200,100,0.6) 50%, rgba(255,140,0,0.4) 65%, transparent 80%)";
      flash.style.opacity = "0.3";
    }, 500);
    setTimeout(function() {
      flash.style.transition = "opacity 0.6s";
      flash.style.opacity = "0";
    }, 800);
    setTimeout(function() {
      flash.style.cssText = "";
      flash.className = "xray-flash-scene";
    }, 1500);
  }
  window._xrayCurrentPhase = "__activating__";
}

if (typeof stopDeepLsa !== "function") {
  window.stopDeepLsa = function() {};
}

function xrayDeactivateFlash() {
  var flash = document.getElementById("xray-flash-scene");
  if (!flash) return;
  flash.style.cssText = "";
  flash.className = "xray-flash-scene";
  flash.style.display = "block";
  flash.style.background = "#000";
  flash.style.opacity = "0.7";
  flash.style.transition = "none";
  setTimeout(function() {
    flash.style.transition = "background 1s ease";
    flash.style.background = "rgba(255,200,50,0.6)";
  }, 50);
  setTimeout(function() {
    flash.style.transition = "none";
    flash.style.opacity = "0.9";
    flash.style.background = "rgba(255,215,0,0.8)";
    setTimeout(function() {
      flash.style.transition = "opacity 0.5s ease-out";
      flash.style.opacity = "0";
    }, 50);
  }, 1100);
  setTimeout(function() {
    flash.style.cssText = "";
    flash.className = "xray-flash-scene";
  }, 1800);
}

function xrayDeepDiveReset() {
  document.body.classList.remove("is-xray-deep");
  var diagram = document.querySelector(".topo-diagram");
  if (diagram) {
    diagram.style.display = "";
    diagram.style.transform = "";
    diagram.style.opacity = "";
    diagram.style.transition = "";
    diagram.style.transformOrigin = "";
  }
}

function xrayDeepDiveClose() {
  if (typeof xrayStopBgpTablePoll === "function") xrayStopBgpTablePoll();
  var diagram = document.querySelector(".topo-diagram");
  var engine = document.querySelector(".xray-deep-engine");
  if (engine) {
    engine.style.transition = "opacity 0.3s ease";
    engine.style.opacity = "0";
  }
  setTimeout(function() {
    document.body.classList.remove("is-xray-deep");
    document.body.classList.remove("de-loading", "de-applied");
    if (window._xrayDeRevealTimer) {
      clearTimeout(window._xrayDeRevealTimer);
      window._xrayDeRevealTimer = null;
    }
    var _defIds = typeof _xrayGetTargetIds === "function" ? _xrayGetTargetIds() : [];
    if (_defIds.length && window._xrayTargetNode !== "topo-node-" + _defIds[0]) {
      window._xrayTargetNode = "topo-node-" + _defIds[0];
      if (typeof xrayFetchState === "function") xrayFetchState();
    }
    if (diagram) {
      var nodeId = window._xrayTargetNode || "topo-node-r1";
      diagram.style.display = "";
      diagram.style.opacity = "0";
      diagram.style.transform = "scale(3)";
      diagram.style.transition = "none";
      var node = document.getElementById(nodeId);
      if (node) {
        var dRect = diagram.getBoundingClientRect();
        var rect = node.getBoundingClientRect();
        if (dRect.width > 0) {
          var cx = (rect.left + rect.width / 2 - dRect.left) / dRect.width * 100;
          var cy = (rect.top + rect.height / 2 - dRect.top) / dRect.height * 100;
          diagram.style.transformOrigin = cx + "% " + cy + "%";
        }
      }
      requestAnimationFrame(function() {
        diagram.style.transition = "transform 0.6s cubic-bezier(0.23,1,0.32,1), opacity 0.4s ease";
        diagram.style.transform = "scale(1)";
        diagram.style.opacity = "1";
      });
      setTimeout(function() {
        diagram.style.transform = "";
        diagram.style.opacity = "";
        diagram.style.transition = "";
        diagram.style.transformOrigin = "";
        if (typeof window._triRedrawSVG === "function") window._triRedrawSVG();
      }, 700);
    }
    if (engine) {
      engine.style.transition = "";
      engine.style.opacity = "";
    }
    var topo = document.querySelector(".topology");
    if (topo) {
      topo.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, 300);
}

function _xrayArmDeepLoading() {
  document.body.classList.add("de-loading");
  document.body.classList.remove("de-applied");
  try {
    var _deArm = document.getElementById("xray-deep-engine");
    if (_deArm && typeof _XRAY_DE !== "undefined" && _XRAY_DE.deEngineH) _deArm.style.minHeight = _XRAY_DE.deEngineH;
  } catch (e) {}
  if (window._xrayDeRevealTimer) clearTimeout(window._xrayDeRevealTimer);
  window._xrayDeRevealTimer = setTimeout(function() {
    document.body.classList.remove("de-loading");
    document.body.classList.add("de-applied");
  }, 12e3);
}

function _xrayReangleAfterDeepOpen() {
  try {
    if (window._lastXrayState && typeof window.applyXrayState === "function" && !document.body.classList.contains("trace-active")) {
      window.applyXrayState(window._lastXrayState);
    }
  } catch (_e) {}
}

function xrayDeepDiveZoomIn() {
  var nodeId = window._xrayTargetNode || "topo-node-r1";
  var node = document.getElementById(nodeId);
  var diagram = document.querySelector(".topo-diagram");
  if (node && diagram) {
    var rect = node.getBoundingClientRect();
    var dRect = diagram.getBoundingClientRect();
    var cx = (rect.left + rect.width / 2 - dRect.left) / dRect.width * 100;
    var cy = (rect.top + rect.height / 2 - dRect.top) / dRect.height * 100;
    diagram.style.transformOrigin = cx + "% " + cy + "%";
    diagram.style.transition = "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease";
    diagram.style.transform = "scale(3)";
    diagram.style.opacity = "0";
    setTimeout(function() {
      diagram.style.display = "none";
      diagram.style.transform = "";
      diagram.style.opacity = "";
      diagram.style.transition = "";
      diagram.style.transformOrigin = "";
      document.body.classList.add("is-xray-deep");
      _xrayReangleAfterDeepOpen();
    }, 500);
  } else {
    document.body.classList.add("is-xray-deep");
    _xrayReangleAfterDeepOpen();
  }
  if (typeof xrayStartBgpTablePoll === "function") xrayStartBgpTablePoll(window._scenarioConfig || {});
  var _liveDeep = document.body.classList.contains("is-xray-mode") && !window._replayLock && !document.body.classList.contains("trace-active") && !document.body.classList.contains("is-replaying");
  if (_liveDeep) {
    _xrayArmDeepLoading();
    window._xrayActive = true;
    window._xrayDeepReady = false;
    if (window._xrayDeepReadyTimer) clearTimeout(window._xrayDeepReadyTimer);
    window._xrayDeepReadyTimer = setTimeout(function() {
      window._xrayDeepReady = true;
    }, 12e3);
    if (typeof xrayFetchState === "function") xrayFetchState();
    if (typeof xrayStartPoll === "function") xrayStartPoll();
  }
}

function xrayUpdateIfaceIndicators(interfaces) {}

var _svgLineColors = {
  up: {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "none"
  },
  "if-down": {
    stroke: "#ff3c3c",
    width: "3",
    filter: "drop-shadow(0 0 6px rgba(255,60,60,0.6))",
    dasharray: "6,4"
  },
  "ospf-full": {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "6,4"
  },
  active: {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "6,4"
  },
  connected: {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "6,4"
  },
  muted: {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "none"
  },
  inactive: {
    stroke: "#607d8b",
    width: "2",
    filter: "none",
    dasharray: "none"
  }
};

window.xrayGetTargetRouterId = function() {
  var cfg = window._scenarioConfig;
  if (cfg && cfg.nodes) {
    for (var i = 0; i < cfg.nodes.length; i++) {
      if (cfg.nodes[i].target) return cfg.nodes[i].id;
    }
  }
  return "r1";
};

function xraySetSvgLine(id, state) {
  var el = document.getElementById(id);
  if (!el) return;
  var c = _svgLineColors[state] || _svgLineColors.inactive;
  el.setAttribute("stroke", c.stroke);
  el.setAttribute("stroke-width", c.width);
  el.style.filter = c.filter;
  if (c.dasharray === "none") {
    el.removeAttribute("stroke-dasharray");
  } else if (c.dasharray) {
    el.setAttribute("stroke-dasharray", c.dasharray);
  }
  el.style.animation = "";
}

function _xrayDrawTunnelPipe(svg, a, b, id) {
  if (!svg) return;
  var dx = b.x - a.x, dy = b.y - a.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / len, ny = dx / len;
  var off = 3;
  [ 1, -1 ].forEach(function(sgn, i) {
    var t = document.createElementNS("http://www.w3.org/2000/svg", "line");
    t.setAttribute("x1", a.x + nx * off * sgn);
    t.setAttribute("y1", a.y + ny * off * sgn);
    t.setAttribute("x2", b.x + nx * off * sgn);
    t.setAttribute("y2", b.y + ny * off * sgn);
    t.setAttribute("stroke-linecap", "round");
    t.setAttribute("stroke-width", "2.5");
    t.setAttribute("stroke-dasharray", "10,6");
    t.setAttribute("class", "tri-tunnel");
    t.id = id + (i === 0 ? "-a" : "-b");
    t.style.display = "none";
    svg.appendChild(t);
  });
}

function xraySetSvgTunnel(id, nbrState, kind) {
  var els = [ document.getElementById(id + "-a"), document.getElementById(id + "-b") ];
  var col = null, animated = false, pale = false;
  if (kind === "bgp") {
    col = "var(--xto-bgp,#a855f7)";
    animated = true;
  } else if (kind === "bgp-idle") {
    col = "var(--xto-bgp,#a855f7)";
    pale = true;
  } else {
    var b = _xrayOspfBucket(nbrState);
    if (b === "full") {
      col = "var(--xto-ospf,#39ff14)";
      animated = true;
    } else if (b === "exchange") {
      col = "var(--xto-ospf,#39ff14)";
    } else if (b === "2way") {
      col = "var(--xto-idle,#ff8c00)";
      animated = true;
    } else if (b === "init") {
      col = "var(--xto-idle,#ff8c00)";
    }
  }
  els.forEach(function(el) {
    if (!el) return;
    if (!col) {
      el.style.display = "none";
      el.style.animation = "";
      el.style.opacity = "";
      return;
    }
    var _wasHidden = el.style.display === "none";
    el.style.display = "";
    el.setAttribute("stroke", col);
    el.setAttribute("stroke-dasharray", "10,6");
    el.style.opacity = pale ? "0.42" : "";
    el.style.filter = "drop-shadow(0 0 6px " + col + ")";
    if (animated) {
      if (_wasHidden || !el.style.animation) el.style.animation = "triRouteDash 1.2s linear infinite";
    } else {
      el.style.animation = "";
    }
  });
}

function _xraySetCssPipe(el, nbrState, kind) {
  if (!el) return;
  el.classList.remove("pipe-full", "pipe-2way", "pipe-exchange", "pipe-init", "pipe-bgp", "pipe-bgp-idle");
  if (kind === "bgp") {
    el.classList.add("pipe-bgp");
    return;
  }
  if (kind === "bgp-idle") {
    el.classList.add("pipe-bgp-idle");
    return;
  }
  var b = _xrayOspfBucket(nbrState);
  if (b !== "none") el.classList.add("pipe-" + b);
}

function xrayLinkState(hasFull, nbrState, helloActive, ifDown) {
  if (ifDown) return "if-down";
  var ns = (nbrState || "None").toLowerCase();
  if (hasFull || ns === "full" || ns === "dr" || ns === "bdr") return "ospf-full";
  if (ns === "init" || ns === "2-way" || ns === "2way" || ns === "exstart" || ns === "exchange" || ns === "loading" || ns === "attempt") return "active";
  if (helloActive && (ns === "none" || ns === "")) return "active";
  return "connected";
}

function xrayUpdateLinkLines(interfaces, linkIfaceMap) {
  if (!interfaces || !linkIfaceMap) return;
  Object.keys(linkIfaceMap).forEach(function(linkId) {
    var el = document.getElementById(linkId);
    if (!el) return;
    var ifaces = linkIfaceMap[linkId];
    var allUp = ifaces.every(function(name) {
      var info = interfaces[name];
      return info && info.up;
    });
    var line = el.querySelector(".topo-link-line");
    if (!line) return;
    if (allUp) {
      line.style.background = "";
      line.style.boxShadow = "";
      line.style.height = "";
    } else {
      line.style.background = "repeating-linear-gradient(90deg,rgba(255,60,60,0.5) 0,rgba(255,60,60,0.5) 8px,transparent 8px,transparent 16px)";
      line.style.boxShadow = "none";
      line.style.height = "3px";
    }
  });
}

function xrayUpdateLsdb(s, opts) {
  var lsdbEl = document.getElementById("de-lsdb");
  if (!lsdbEl) return;
  opts = opts || {};
  if (!s.ospf_active_on_interface && !(s.has_full || s.neighbor_state && s.neighbor_state !== "None")) {
    lsdbEl.style.display = "none";
    return;
  }
  lsdbEl.style.display = "";
  var ifaces = s.interfaces || {};
  var rr = s.route_resolution || {};
  var fullCount = s.full_count !== undefined ? s.full_count : s.has_full ? 1 : 0;
  var synced = fullCount > 0;
  var ns = (s.neighbor_state || "").toLowerCase();
  var isExchange = ns === "exchange" || ns === "loading";
  var isNeighborInit = ns === "init" || ns === "2-way" || ns === "twoway";
  var progress = synced ? 100 : isExchange ? 40 : s.ospf_active_on_interface ? 20 : 0;
  var hd = lsdbEl.querySelector(".lsdb-hd");
  if (hd) {
    hd.style.color = synced ? "#39ff14" : "#ff8c00";
    hd.style.textShadow = synced ? "0 0 8px rgba(57,255,20,0.4)" : "0 0 6px rgba(255,140,0,0.4)";
  }
  lsdbEl.style.borderColor = synced ? "rgba(57,255,20,0.4)" : "rgba(255,140,0,0.3)";
  var fill = document.getElementById("de-lsdb-fill");
  if (fill) {
    fill.style.width = progress + "%";
    fill.style.background = synced ? "linear-gradient(90deg,#39ff14,#80ff80)" : "linear-gradient(90deg,#ff8c00,#ffb347)";
  }
  lsdbEl.querySelectorAll(".lsdb-row").forEach(function(r) {
    r.remove();
  });
  var rows = [];
  if (Array.isArray(s.lsdb_prefixes) && s.lsdb_prefixes.length) {
    s.lsdb_prefixes.forEach(function(p) {
      if (p && p.text) rows.push({
        text: p.text,
        own: !!p.own
      });
    });
  } else {
    var wanIf = s.wan_iface || "";
    if (s.ospf_active_on_interface && wanIf && ifaces[wanIf] && ifaces[wanIf].ip) {
      var wanInfo = ifaces[wanIf];
      if (wanInfo.up) {
        var subnet = wanInfo.ip.indexOf("/") >= 0 ? wanInfo.ip.replace(/\.\d+\//, ".0/") : wanInfo.ip.replace(/\.\d+$/, ".0/24");
        rows.push({
          text: subnet,
          own: true
        });
      }
    }
    if (synced && (rr.resolved || s.lsa_in_db) && rr.matched_prefix) {
      var alreadyHas = rows.some(function(r) {
        return r.text === rr.matched_prefix;
      });
      if (!alreadyHas) {
        rows.push({
          text: rr.matched_prefix,
          own: false
        });
      }
    }
  }
  if (opts.extraRows) {
    opts.extraRows.forEach(function(r) {
      rows.push({
        text: r.text || r,
        own: false
      });
    });
  }
  rows.forEach(function(row) {
    var div = document.createElement("div");
    var visible = row.own || synced;
    div.className = visible ? "lsdb-row show" : "lsdb-row";
    div.textContent = row.text;
    if (visible) div.style.color = "#39ff14";
    lsdbEl.appendChild(div);
  });
}

function xraySetLogicBlock(elementId, lines) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = lines.map(function(l) {
    return "<span" + (l.cls ? ' class="' + l.cls + '"' : "") + ">" + l.text + "</span>";
  }).join("");
}

function xraySetDeepDive(selector, lines) {
  var el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = lines.map(function(l) {
    var tag = "<div";
    if (l.style) tag += ' style="' + l.style + '"';
    if (l.cls) tag += ' class="' + l.cls + '"';
    tag += ">" + l.text + "</div>";
    return tag;
  }).join("");
}

function _xrayApplyDualLinkApexTrace(s) {
  var config = window._scenarioConfig || {};
  var xr = config.xray || {};
  var pattern = xr.pattern || "";
  if (pattern !== "ospf_triangle") return false;
  var pairs = xr.ospf_pairs || [];
  if (!pairs.length) {
    if (xr.trace_pattern === "dual_static_rid") {
      var _leftLk = {
        up: !!s.has_full,
        nbrState: s.neighbor_state || "",
        fallback: false,
        ifName: ""
      };
      if (typeof _xrayApplyDualLinkTunnels === "function") {
        _xrayApplyDualLinkTunnels(_leftLk, {
          up: false,
          nbrState: ""
        });
      }
      if (typeof _xrayApplyDualLinkBeam === "function") {
        _xrayApplyDualLinkBeam(document.querySelector(".de-beam.in"), _leftLk, s.interfaces || {});
      }
    }
    return false;
  }
  var nodes = config.nodes || [];
  var targetN = nodes.find(function(n) {
    return n.target;
  }) || nodes[0];
  if (!targetN) return false;
  var others = nodes.filter(function(n) {
    return n !== targetN;
  });
  if (others.length < 2) return false;
  var triNodes = {
    target: targetN.id,
    left: others[0].id,
    right: others[1].id
  };
  document.body.setAttribute("data-topo-triangle", "");
  var isOspfPeer = function(id) {
    return pairs.indexOf([ targetN.id, id ].sort().join("_")) >= 0;
  };
  var full = !!s.has_full;
  var hasStatic = !!(s.has_static || s.has_floating_static);
  var _nonLo = Object.keys(s.interfaces || {}).filter(function(k) {
    return k && k.indexOf("lo") !== 0;
  });
  var _rr = s.route_resolution || {};
  var _ospfId = isOspfPeer(triNodes.right) ? triNodes.right : triNodes.left;
  var _staticId = _ospfId === triNodes.right ? triNodes.left : triNodes.right;
  if (!s[_ospfId + "_iface"]) {
    s[_ospfId + "_iface"] = Object.keys(s.iface_hellos || {})[0] || (_rr.protocol === "ospf" && _rr.out_iface || "") || _nonLo.filter(function(k) {
      return k !== s[_staticId + "_iface"];
    })[0] || _nonLo[0] || "";
  }
  if (!s[_staticId + "_iface"]) {
    s[_staticId + "_iface"] = _nonLo.filter(function(k) {
      return k !== s[_ospfId + "_iface"];
    })[0] || "";
  }
  var _ospfIf = s[_ospfId + "_iface"];
  if (s.ospf_active_on_interface && _ospfIf) {
    if (!s.iface_hellos) s.iface_hellos = {};
    if (!s.iface_hellos[_ospfIf]) s.iface_hellos[_ospfIf] = s.r1_hello || 10;
    if (!s.interfaces) s.interfaces = {};
    if (!s.interfaces[_ospfIf]) s.interfaces[_ospfIf] = {
      up: true
    };
  }
  var _q9Dual = xr.trace_pattern === "dual_static_rid";
  var _staticIf = s[_staticId + "_iface"];
  if (_q9Dual && s._failover && _staticIf) {
    if (!s.interfaces) s.interfaces = {};
    if (!s.interfaces[_staticIf]) s.interfaces[_staticIf] = {};
    s.interfaces[_staticIf].up = false;
  }
  if (_q9Dual && _rr && _rr.resolved) {
    var _mainUp = _staticIf && !(s.interfaces && s.interfaces[_staticIf] && s.interfaces[_staticIf].up === false);
    _rr.out_iface = _mainUp ? _staticIf : full ? _ospfIf : _staticIf;
    s.route_resolution = _rr;
  }
  var mk = function(id) {
    var ospf = isOspfPeer(id);
    return {
      up: ospf && full,
      fallback: !ospf && hasStatic,
      ifName: s[id + "_iface"] || ""
    };
  };
  var leftLink = mk(triNodes.left);
  var rightLink = mk(triNodes.right);
  if (_q9Dual && s._failover) {
    rightLink.up = false;
    rightLink.fallback = false;
  }
  _xrayApplyDualLinkLabels(s, triNodes);
  _xrayApplyDualLinkBeams(s, leftLink, rightLink);
  _xrayApplyDualLinkEnergies(s, leftLink, rightLink);
  _xrayApplyDualLinkTunnels(leftLink, rightLink);
  _xrayApplyDualLinkDirection(s, triNodes);
  _xrayApplyDualLinkHello(s, leftLink.ifName, rightLink.ifName, triNodes.left, triNodes.right);
  var _if = s.interfaces || {};
  document.body.classList.toggle("is-input-down", !!(leftLink.ifName && _if[leftLink.ifName] && !_if[leftLink.ifName].up));
  document.body.classList.toggle("is-output-down", !!(rightLink.ifName && _if[rightLink.ifName] && !_if[rightLink.ifName].up));
  return true;
}

function xrayUpdateDeepDiveIO(s) {
  var _dualApex = _xrayApplyDualLinkApexTrace(s);
  if (!_dualApex) {
    var ifaces = s.interfaces || {};
    var ifKeys = Object.keys(ifaces);
    var rr = s.route_resolution || {};
    var lanIf = s.lan_iface || ifKeys[ifKeys.length - 1] || "?";
    var wanIf = s.wan_iface || rr.out_iface || ifKeys[0] || "?";
    var inLabel = document.querySelector(".de-label.in");
    if (inLabel) inLabel.textContent = "Input: " + lanIf;
    var outLabel = document.querySelector(".de-label.out");
    if (outLabel) outLabel.textContent = "Output: " + wanIf;
    var singleIf = lanIf === wanIf;
    if (typeof xrayCurrentPingMode === "function" && xrayCurrentPingMode() === "cylinder-to-left") {
      var leftIf = ifaces[lanIf];
      if (leftIf && !leftIf.up) {
        document.body.classList.add("is-input-down");
      } else {
        document.body.classList.remove("is-input-down");
      }
      document.body.classList.remove("is-output-down");
    } else {
      var outputUp = ifaces[wanIf] && ifaces[wanIf].up;
      if (outputUp) {
        document.body.classList.remove("is-output-down");
      } else {
        document.body.classList.add("is-output-down");
      }
      var inputUp = singleIf || ifaces[lanIf] && ifaces[lanIf].up;
      if (inputUp) {
        document.body.classList.remove("is-input-down");
      } else {
        document.body.classList.add("is-input-down");
      }
    }
  }
  var pingMode = xrayCurrentPingMode();
  _xrayApplyPingModeClasses(document.body.classList, pingMode);
  if (_dualApex && window._xrayFwdDirection === "left") {
    document.body.classList.add("ping-left");
  }
  if (document.body.classList.contains("trace-active") && (window._scenarioConfig && window._scenarioConfig.xray || {}).protocol === "bgp") {
    var _xrCfg = window._scenarioConfig || {};
    var _hasFix = Array.isArray((_xrCfg.xray || {}).bgp_routes) && _xrCfg.xray.bgp_routes.length > 0;
    var _hasPerStep = Array.isArray(window.TRACE_STEPS) && window.TRACE_STEPS.some(function(st) {
      return st && st.bgpRoutes !== undefined;
    });
    if ((_hasFix || _hasPerStep) && typeof xrayEnsureBgpTableBox === "function") xrayEnsureBgpTableBox(_xrCfg);
    window._lastXrayState = s;
    if (typeof xrayRenderBgpTableReplay === "function") xrayRenderBgpTableReplay();
  }
  try {
    if (typeof _xrayDeAngleView === "function") _xrayDeAngleView(s);
  } catch (_e) {}
}

function xrayStaticLogicLines(s, opts) {
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var target = rr.target || opts && opts.target || "8.8.8.8";
  var lines = [];
  Object.keys(ifaces).forEach(function(name) {
    var info = ifaces[name];
    lines.push({
      text: name + ": " + (info.up ? "UP" : "DOWN") + (info.ip ? " (" + info.ip.split("/")[0] + ")" : ""),
      cls: info.up ? "hl" : "warn"
    });
  });
  if (s.dr_rid || s.bdr_rid) {
    lines.push({
      text: "───────────",
      cls: "dim"
    });
    if (s.dr_rid) lines.push({
      text: '> DR: <span class="de-hl">' + s.dr_rid + "</span>"
    });
    if (s.bdr_rid) lines.push({
      text: '> BDR: <span class="de-hl">' + s.bdr_rid + "</span>"
    });
    if (s.full_count !== undefined) lines.push({
      text: '> Full neighbors: <span class="de-hl">' + s.full_count + "</span>"
    });
  }
  return lines;
}

function xrayOspfLogicLines(s) {
  var lines = [];
  var h = window._lastXrayHierarchy || xrayEvaluateState(s);
  lines.push({
    text: "OSPF: " + (h.ospfStatus || "NOT RUNNING"),
    cls: h.ospfFull ? "hl" : h.ospfStatus === "NOT RUNNING" ? "off" : "warn"
  });
  lines.push({
    text: "Ping: " + (s.ping_ok ? "OK" : "FAIL"),
    cls: s.ping_ok ? "hl" : "warn"
  });
  return lines;
}

function xrayBgpLogicLines(s) {
  var lines = [];
  var h = window._lastXrayHierarchy || xrayEvaluateState(s);
  lines.push({
    text: "BGP: " + (h.bgpStatus || s.bgp_state || "Idle"),
    cls: h.bgpEstablished ? "hl" : "warn"
  });
  lines.push({
    text: "Ping: " + (s.ping_ok ? "OK" : "FAIL"),
    cls: s.ping_ok ? "hl" : "warn"
  });
  return lines;
}

function xrayStaticDeepLines(s, opts) {
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var target = rr.target || opts && opts.target || "8.8.8.8";
  var lines = [];
  lines.push({
    text: "[Routing Engine]",
    cls: "de-title"
  });
  lines.push({
    text: "> Lookup: " + target
  });
  Object.keys(ifaces).forEach(function(name) {
    var info = ifaces[name];
    var color = info.up ? "#39ff14" : "#ff4444";
    lines.push({
      text: "> " + name + ': <span style="color:' + color + '">' + (info.up ? "UP" : "DOWN") + "</span>" + (info.ip ? ' <span class="de-dim">' + info.ip + "</span>" : ""),
      style: info.up ? "" : "color:#ff6b35;font-weight:700"
    });
  });
  if (rr.resolved) {
    lines.push({
      text: '> Route: <span class="de-hl">' + (rr.protocol || "static") + " " + (rr.matched_prefix || rr.target || target) + "</span>"
    });
    var nhReachable = typeof s.nh_reachable === "boolean" ? s.nh_reachable : s.r1_ping_ok !== false;
    if (nhReachable) {
      lines.push({
        text: '> Next-Hop: <span class="de-hl">' + (rr.next_hop || "direct") + "</span>"
      });
    } else {
      lines.push({
        text: '> Next-Hop: <span style="color:#ff4444">' + (rr.next_hop || "?") + '</span> <span style="color:#ff6b35">(ARP FAILED)</span>',
        style: "color:#ff6b35;font-weight:700"
      });
    }
    lines.push({
      text: '> Out: <span class="de-hl">' + (rr.out_iface || "?") + "</span>"
    });
  } else {
    var cfgNh = s.config_next_hop || "";
    if (cfgNh) {
      lines.push({
        text: '> Config: <span class="de-dim">S 0.0.0.0/0 via ' + cfgNh + "</span>"
      });
      lines.push({
        text: '> RIB: <span style="color:#ff4444">NOT INSTALLED</span> <span class="de-dim">(nexthop unreachable)</span>',
        style: "color:#ff6b35;font-weight:700"
      });
    } else {
      lines.push({
        text: "> Route to " + target + ': <span style="color:#ff4444">NONE</span>',
        style: "color:#ff6b35"
      });
    }
  }
  var canFwd = xrayCanForward(s);
  var actionColor = canFwd ? "#39ff14" : "#ff4444";
  lines.push({
    text: '> Action: <span style="color:' + actionColor + ';font-weight:700">' + (canFwd ? "FORWARD" : "DROP") + "</span>"
  });
  return lines;
}

function xrayOspfDeepLines(s, opts) {
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var target = rr.target || opts && opts.target || "2.2.2.2";
  var lines = [];
  var h = xrayEvaluateState(s);
  lines.push({
    text: "[Routing Engine]",
    cls: "de-title"
  });
  var ospfLabel = h.ospfStatus || "NOT RUNNING";
  if (h.ospfFull) {
    lines.push({
      text: '> OSPF: <span class="de-hl">' + ospfLabel + "</span>"
    });
  } else if (h.helloOut) {
    lines.push({
      text: '> OSPF: <span style="color:#ff8c00">' + ospfLabel + "</span>"
    });
  } else {
    lines.push({
      text: '> OSPF: <span style="color:#ff4444">' + ospfLabel + "</span>",
      style: "color:#ff6b35;font-weight:700"
    });
  }
  var ospfRunning = h.helloOut || h.ospfFull;
  if (ospfRunning) {
    var ns = s.neighbor_state || "None";
    if (ns === "Full" || s.has_full) {
      lines.push({
        text: '> Neighbor: <span class="de-hl">Full</span>'
      });
    } else if (ns !== "None" && h.helloOut) {
      lines.push({
        text: '> Neighbor: <span style="color:#ff8c00">' + ns + "</span>"
      });
    } else {
      lines.push({
        text: '> Neighbor: <span style="color:#ff4444">' + ns + "</span>"
      });
    }
  }
  if (ospfRunning) {
    var ns = s.neighbor_state || "None";
    if (s.neighbor_state === "Full" || s.has_full) {
      lines.push({
        text: '> LSDB: <span class="de-hl">SYNCHRONIZED</span>'
      });
    } else {
      var nsLow = (ns || "").toLowerCase();
      var isExch = nsLow === "exchange" || nsLow === "loading";
      lines.push({
        text: '> LSDB: <span style="color:#ff8c00">' + (isExch ? "収集中" : "自装置のみ") + "</span>"
      });
    }
  }
  var showAll = !!(opts && opts.showAll);
  var init = showAll ? s : window._xrayInitialState || s;
  var currTimerOk = s.r1_hello === s.r2_hello;
  if (ospfRunning && (showAll || !(init.r1_hello === init.r2_hello) || currTimerOk !== (init.r1_hello === init.r2_hello))) {
    var timerColor = currTimerOk ? "#39ff14" : "#ff4444";
    lines.push({
      text: "> Hello: r1=" + (s.r1_hello || "?") + "s r2=" + (s.r2_hello || "?") + 's <span style="color:' + timerColor + '">' + (currTimerOk ? "MATCH" : "MISMATCH") + "</span>"
    });
  }
  var currAreaOk = !!s.area_match;
  if (ospfRunning && (showAll || !init.area_match || currAreaOk !== !!init.area_match)) {
    var areaColor = currAreaOk ? "#39ff14" : "#ff4444";
    lines.push({
      text: "> Area: r1=" + (s.r1_area || "?") + " r2=" + (s.r2_area || "?") + ' <span style="color:' + areaColor + '">' + (currAreaOk ? "MATCH" : "MISMATCH") + "</span>"
    });
  }
  var currPassiveOk = !s.is_passive;
  if (ospfRunning && (showAll || !!init.is_passive || currPassiveOk !== !init.is_passive)) {
    var passiveColor = currPassiveOk ? "#39ff14" : "#ff4444";
    lines.push({
      text: '> passive-interface: <span style="color:' + passiveColor + '">' + (s.is_passive ? "YES (Hello停止)" : "NO") + "</span>"
    });
  }
  if (ospfRunning && s.has_redistribute !== undefined) {
    var currRedistOk = !!s.has_redistribute;
    if (showAll || !init.has_redistribute || currRedistOk !== !!init.has_redistribute) {
      if (s.has_redistribute) {
        var rmColor = s.route_map_status === "permit" ? "#39ff14" : "#ff4444";
        lines.push({
          text: '> redistribute: <span style="color:' + rmColor + '">' + (s.route_map_status || "?") + "</span>"
        });
      } else {
        lines.push({
          text: '> redistribute: <span style="color:#ff4444">未設定</span>'
        });
      }
    }
  }
  if (s.is_advertiser) {
    var _lb = s.loopback || target;
    var _advArea = s.target_area || s.r2_area || "0";
    if (ospfRunning && s.advertises_loopback) {
      lines.push({
        text: '> Advertising <span class="de-hl">' + _lb + "/32</span> (area " + _advArea + ")"
      });
    } else {
      lines.push({
        text: "> Advertising " + _lb + '/32: <span style="color:#ff4444">NO</span> (OSPF area0 に未広報)',
        style: "color:#ff6b35;font-weight:700"
      });
    }
    return lines;
  }
  if (s.dr_rid || s.bdr_rid) {
    lines.push({
      text: "───────────",
      cls: "dim"
    });
    if (s.dr_rid) lines.push({
      text: '> DR: <span class="de-hl">' + s.dr_rid + "</span>"
    });
    if (s.bdr_rid) lines.push({
      text: '> BDR: <span class="de-hl">' + s.bdr_rid + "</span>"
    });
    if (s.full_count !== undefined) lines.push({
      text: '> Full neighbors: <span class="de-hl">' + s.full_count + "</span>"
    });
  }
  if (s.has_static && s.static_is_best) {
    lines.push({
      text: "───────────",
      cls: "dim"
    });
    lines.push({
      text: '> Route: <span style="color:#ff4444">STATIC ' + (rr.matched_prefix || target) + "</span> (AD=1, best)",
      style: "color:#ff6b35;font-weight:700"
    });
    if (rr.next_hop) {
      var nhOk = s.ping_ok;
      var nhColor = nhOk ? "#39ff14" : "#ff4444";
      lines.push({
        text: '> Next-Hop: <span style="color:' + nhColor + '">' + rr.next_hop + (nhOk ? "" : " (UNREACHABLE)") + "</span>"
      });
    }
    if (s.ospf_route_available) {
      lines.push({
        text: '> OSPF route: <span style="color:#78909c">存在するが AD=110 で不採用</span>',
        cls: "dim"
      });
    }
  } else if (rr.resolved) {
    lines.push({
      text: '> Route: <span class="de-hl">' + (rr.protocol || "ospf").toUpperCase() + " " + (rr.matched_prefix || rr.target || target) + "</span>"
    });
    if (rr.next_hop) lines.push({
      text: '> Next-Hop: <span class="de-hl">' + rr.next_hop + "</span>"
    });
  } else {
    lines.push({
      text: "> Route to " + target + ': <span style="color:#ff4444">NONE</span>',
      style: "color:#ff6b35"
    });
  }
  var canFwd = s.has_static && s.static_is_best ? s.ping_ok : xrayCanForward(s);
  var actionColor = canFwd ? "#39ff14" : "#ff4444";
  lines.push({
    text: '> Action: <span style="color:' + actionColor + ';font-weight:700">' + (canFwd ? "FORWARD" : "DROP") + "</span>"
  });
  return lines;
}

function xrayTriangleOverlay(directFull, pingOk, faultActive, helloActive, faultHello) {
  if (faultActive === undefined) faultActive = !directFull;
  var tri = document.querySelector(".topo-triangle");
  if (!tri) return;
  var svg = tri.querySelector("svg");
  if (!svg) return;
  var cfg = window._xrayTriConfig;
  if (!cfg) return;
  var old = svg.querySelector("#tri-particles");
  if (old) old.parentNode.removeChild(old);
  if (!svg.querySelector("#tri-p-direct")) {
    var ns = "http://www.w3.org/2000/svg";
    var defs = svg.querySelector("defs") || document.createElementNS(ns, "defs");
    if (!defs.parentNode) svg.insertBefore(defs, svg.firstChild);
    var defsTmp = document.createElementNS(ns, "svg");
    defsTmp.innerHTML = '<filter id="tri-glow-o" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>' + '<filter id="tri-glow-c" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>' + '<path id="tri-p-direct" d="' + cfg.direct + '"/>' + '<path id="tri-p-direct-rev" d="' + cfg.directRev + '"/>' + '<path id="tri-p-detour" d="' + cfg.detour + '"/>' + '<path id="tri-p-detour-rev" d="' + cfg.detourRev + '"/>' + '<path id="tri-p-fault" d="' + (cfg.fault || cfg.direct) + '"/>' + '<path id="tri-p-fault-rev" d="' + (cfg.faultRev || cfg.directRev) + '"/>' + (cfg.hello ? '<path id="tri-p-hello" d="' + cfg.hello + '"/><path id="tri-p-hello-rev" d="' + cfg.helloRev + '"/>' : "");
    while (defsTmp.firstChild) defs.appendChild(defsTmp.firstChild);
  }
  function orb(r, fill, filter, dur, begin, pathId, kp, kt, oVals, oTms) {
    var s = '<circle r="' + r + '" fill="' + fill + '" opacity="0"' + (filter ? ' filter="url(#' + filter + ')"' : "") + ">";
    s += '<animateMotion dur="' + dur + 's" repeatCount="indefinite"' + (begin ? ' begin="' + begin + 's"' : "") + (kp ? ' keyPoints="' + kp + '" keyTimes="' + kt + '" calcMode="linear" fill="freeze"' : "") + '><mpath href="#' + pathId + '"/></animateMotion>';
    s += '<animate attributeName="opacity" values="' + oVals + '" keyTimes="' + oTms + '" dur="' + dur + 's" repeatCount="indefinite"' + (begin ? ' begin="' + begin + 's"' : "") + "/>";
    s += "</circle>";
    return s;
  }
  var p = '<g id="tri-particles">';
  if (faultActive) {
    p += "<g>";
    p += orb(4, "#ff8c00", null, 2.2, 0, "tri-p-fault", "0;1", "0;0.7", "0;0.9;0.9;0;0", "0;0.06;0.7;0.85;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 2.2, 0, "tri-p-fault", "0;1", "0;0.7", "0;0.4;0.4;0;0", "0;0.06;0.7;0.85;1");
    p += orb(4, "#ff8c00", null, 2.2, 1.1, "tri-p-fault-rev", "0;1", "0;0.7", "0;0.9;0.9;0;0", "0;0.06;0.7;0.85;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 2.2, 1.1, "tri-p-fault-rev", "0;1", "0;0.7", "0;0.4;0.4;0;0", "0;0.06;0.7;0.85;1");
    p += "</g>";
  }
  if (faultHello && !faultActive) {
    p += "<g>";
    p += orb(4, "#ff8c00", null, 3, 0, "tri-p-fault", "0;1", "0;0.6", "0;0.9;0.9;0.3;0", "0;0.06;0.55;0.7;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 3, 0, "tri-p-fault", "0;1", "0;0.6", "0;0.4;0.4;0;0", "0;0.06;0.55;0.7;1");
    p += orb(4, "#ff8c00", null, 3, 1.5, "tri-p-fault-rev", "0;1", "0;0.6", "0;0.9;0.9;0.3;0", "0;0.06;0.55;0.7;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 3, 1.5, "tri-p-fault-rev", "0;1", "0;0.6", "0;0.4;0.4;0;0", "0;0.06;0.55;0.7;1");
    p += "</g>";
  }
  if (helloActive && cfg.hello) {
    p += "<g>";
    p += orb(4, "#ff8c00", null, 3, 0, "tri-p-hello", "0;1", "0;0.6", "0;0.9;0.9;0.3;0", "0;0.06;0.55;0.7;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 3, 0, "tri-p-hello", "0;1", "0;0.6", "0;0.4;0.4;0;0", "0;0.06;0.55;0.7;1");
    p += orb(4, "#ff8c00", null, 3, 1.5, "tri-p-hello-rev", "0;1", "0;0.6", "0;0.9;0.9;0.3;0", "0;0.06;0.55;0.7;1");
    p += orb(5, "#ff8c00", "tri-glow-o", 3, 1.5, "tri-p-hello-rev", "0;1", "0;0.6", "0;0.4;0.4;0;0", "0;0.06;0.55;0.7;1");
    p += "</g>";
  }
  if (!directFull && pingOk) {
    p += '<path d="' + cfg.detour + '" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="8,6" style="animation:triRouteDash 1.5s linear infinite"/>';
    p += "<g>";
    p += orb(5, "#fff", null, 3.5, 0, "tri-p-detour", null, null, "0;1;1;1;0", "0;0.04;0.45;0.92;1");
    p += orb(7, "#fff", "tri-glow-c", 3.5, 0, "tri-p-detour", null, null, "0;0.5;0.5;0.5;0", "0;0.04;0.45;0.92;1");
    p += orb(4, "#b0bec5", null, 3.5, 1.7, "tri-p-detour-rev", null, null, "0;0.7;0.7;0.7;0", "0;0.04;0.45;0.92;1");
    p += "</g>";
  }
  if (directFull && pingOk) {
    p += '<path d="' + cfg.direct + '" fill="none" stroke="rgba(0,229,255,0.25)" stroke-width="2" stroke-dasharray="8,6" style="animation:triRouteDash 1.2s linear infinite"/>';
    p += "<g>";
    p += orb(5, "#00e5ff", null, 2, 0, "tri-p-direct", null, null, "0;1;1;0", "0;0.08;0.85;1");
    p += orb(7, "#00e5ff", "tri-glow-c", 2, 0, "tri-p-direct", null, null, "0;0.4;0.4;0", "0;0.08;0.85;1");
    p += orb(4, "#80deea", null, 2, 1, "tri-p-direct-rev", null, null, "0;0.8;0.8;0", "0;0.08;0.85;1");
    p += "</g>";
  }
  p += "</g>";
  var ns2 = "http://www.w3.org/2000/svg";
  var tmp = document.createElementNS(ns2, "svg");
  tmp.innerHTML = p;
  while (tmp.firstChild) {
    svg.appendChild(tmp.firstChild);
  }
}

function xrayTriangleOverlayReset() {
  var tri = document.querySelector(".topo-triangle");
  if (!tri) return;
  var g = tri.querySelector("#tri-particles");
  if (g) g.parentNode.removeChild(g);
}

function xrayTriDeepLines(s, opts) {
  var lines = [];
  lines.push({
    text: "[Routing Engine]",
    cls: "de-title"
  });
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var target = opts && opts.target || "3.3.3.3";
  var tName = opts.targetName || "r1";
  var pName = opts.primaryName || "r2";
  var sName = opts.secondaryName || "r3";
  var pFull = opts.primaryFull !== undefined ? !!opts.primaryFull : !!s.has_full;
  var pState = s[pName + "_neighbor_state"] || "None";
  var sFull = !!opts.secondaryFull;
  var sState = opts.secondaryState || "None";
  function _linkLine(linkName, nodeId, hasFull, nbrState, isStatic) {
    var ifName = s[nodeId + "_iface"] || "";
    var ifInfo = ifName ? ifaces[ifName] : null;
    var ifDown = ifInfo && !ifInfo.up;
    if (isStatic) {
      if (ifDown) {
        return {
          text: "> " + linkName + ' STATIC: <span style="color:#ff4444">link DOWN</span>'
        };
      }
      var nhOk = s.static_nh_valid !== undefined ? !!s.static_nh_valid : true;
      var nhColor = nhOk ? "#39ff14" : "#ff4444";
      return {
        text: "> " + linkName + ' STATIC: <span style="color:' + nhColor + '">' + (nhOk ? "NH Valid" : "NH UNREACHABLE") + "</span>"
      };
    }
    var color = hasFull ? "#39ff14" : nbrState !== "None" ? "#ff8c00" : "#ff4444";
    var label = hasFull ? "Full" : nbrState;
    return {
      text: "> " + linkName + ' OSPF: <span style="color:' + color + '">' + label + "</span>"
    };
  }
  lines.push(_linkLine(tName + "-" + pName, pName, pFull, pState, !!opts.primaryStatic));
  lines.push(_linkLine(tName + "-" + sName, sName, sFull, sState, !!opts.secondaryStatic));
  var _ospfRunning = !!s.ospf_active_on_interface;
  if (_ospfRunning) {
    var _peerLbl = s.peer_id || "peer";
    if (s.rid_duplicate !== undefined) {
      var ridColor = s.rid_duplicate ? "#ff4444" : "#39ff14";
      var _tgtRid = s.target_rid || s.r1_rid || "?";
      var _peerRid = s.peer_rid || s.r2_rid || "?";
      var ridLabel = s.rid_duplicate ? "DUPLICATE (" + _tgtRid + "=" + _peerRid + ")" : "Unique";
      lines.push({
        text: '> Router-ID: <span style="color:' + ridColor + '">' + ridLabel + "</span>"
      });
    }
    if (s.timer_match !== undefined) {
      var tmColor = s.timer_match ? "#39ff14" : "#ff4444";
      var _tgtHello = s.target_hello || s.r1_hello || "?";
      var _peerHello = s.peer_hello || s.r2_hello || "?";
      lines.push({
        text: "> Hello: " + tName + "=" + _tgtHello + "s " + _peerLbl + "=" + _peerHello + 's <span style="color:' + tmColor + '">' + (s.timer_match ? "MATCH" : "MISMATCH") + "</span>"
      });
    }
    if (s.area_match !== undefined) {
      var aColor = s.area_match ? "#39ff14" : "#ff4444";
      var _tgtArea = s.target_area || s.r1_area || "?";
      var _peerArea = s.peer_area || s.r2_area || "?";
      lines.push({
        text: "> Area: " + tName + "=" + _tgtArea + " " + _peerLbl + "=" + _peerArea + ' <span style="color:' + aColor + '">' + (s.area_match ? "MATCH" : "MISMATCH") + "</span>"
      });
    }
    if (s.is_passive !== undefined && s.is_passive) {
      lines.push({
        text: '> passive-interface: <span style="color:#ff4444">YES (Hello停止)</span>'
      });
    }
  }
  lines.push({
    text: "───────────",
    cls: "dim"
  });
  Object.keys(ifaces).forEach(function(ifn) {
    var info = ifaces[ifn];
    lines.push({
      text: "> " + ifn + ': <span style="color:' + (info.up ? "#39ff14" : "#ff4444") + '">' + (info.up ? "UP" : "DOWN") + '</span> <span class="de-dim">' + (info.ip || "") + "</span>"
    });
  });
  if (rr.resolved) {
    lines.push({
      text: '> Route: <span class="de-hl">' + (rr.protocol || "ospf").toUpperCase() + " " + (rr.matched_prefix || target) + "</span>"
    });
    if (rr.next_hop) {
      var _nhIfUp = !rr.out_iface || ifaces[rr.out_iface] && ifaces[rr.out_iface].up;
      var _nhUnreach = !!_nhIfUp && !xrayCanForward(s);
      lines.push({
        text: "> Next-Hop: <span " + (_nhUnreach ? 'style="color:#ff4444"' : 'class="de-hl"') + ">" + rr.next_hop + (_nhUnreach ? " (UNREACHABLE)" : "") + "</span>"
      });
    }
  } else {
    lines.push({
      text: "> Route to " + target + ': <span style="color:#ff4444">NONE</span>',
      style: "color:#ff6b35"
    });
  }
  var canFwd = xrayCanForward(s);
  var actionColor = canFwd ? "#39ff14" : "#ff4444";
  lines.push({
    text: '> Action: <span style="color:' + actionColor + ';font-weight:700">' + (canFwd ? "FORWARD" : "DROP") + "</span>"
  });
  return lines;
}

function xrayBgpDeepLines(s, opts) {
  var rr = s.route_resolution || {};
  var ifaces = s.interfaces || {};
  var target = rr.target || opts && opts.target || "8.8.8.8";
  var lines = [];
  var h = window._lastXrayHierarchy || xrayEvaluateState(s);
  lines.push({
    text: "[Routing Engine]",
    cls: "de-title"
  });
  if (s.r2_established !== undefined || s.r3_established !== undefined) {
    if (s.r2_established !== undefined) {
      var r2Color = s.r2_established ? "#a855f7" : "#ff4444";
      lines.push({
        text: '> r2 BGP: <span style="color:' + r2Color + '">' + (s.r2_established ? "Established" : "Down") + "</span>"
      });
    }
    if (s.r3_established !== undefined) {
      var r3Color = s.r3_established ? "#a855f7" : "#ff4444";
      lines.push({
        text: '> r3 BGP: <span style="color:' + r3Color + '">' + (s.r3_established ? "Established" : "Down") + "</span>"
      });
    }
  } else if (h.bgpEstablished) {
    lines.push({
      text: '> BGP: <span class="de-hl">' + (h.bgpStatus || "ESTABLISHED") + "</span>"
    });
  } else {
    lines.push({
      text: '> BGP: <span style="color:#ff4444">' + (h.bgpStatus || s.bgp_state || "Idle") + "</span>",
      style: "color:#ff6b35;font-weight:700"
    });
  }
  if (s.pfx_rcvd !== undefined) {
    lines.push({
      text: '> Prefixes received: <span class="de-hl">' + s.pfx_rcvd + "</span>"
    });
  }
  Object.keys(ifaces).forEach(function(name) {
    var info = ifaces[name];
    if (!info.up && !info.ip) return;
    lines.push({
      text: "> " + name + ': <span style="color:' + (info.up ? "#39ff14" : "#ff4444") + '">' + (info.up ? "UP" : "DOWN") + '</span> <span class="de-dim">' + (info.ip || "") + "</span>"
    });
  });
  var init = window._xrayInitialState || s;
  if (s.neighbor_ip !== undefined) {
    var initNbOk = !!init.neighbor_correct;
    var currNbOk = !!s.neighbor_correct;
    if (!initNbOk || currNbOk !== initNbOk) {
      var nbColor = currNbOk ? "#39ff14" : "#ff4444";
      lines.push({
        text: '> Neighbor: <span style="color:' + nbColor + '">' + (s.neighbor_ip || "?") + "</span>" + (s.r2_actual_ip && !currNbOk ? ' <span class="de-dim">(actual: ' + s.r2_actual_ip + ")</span>" : "")
      });
    }
  }
  if (s.has_update_source !== undefined) {
    var initUsOk = !!init.has_update_source;
    var currUsOk = !!s.has_update_source;
    if (!initUsOk || currUsOk !== initUsOk) {
      var usColor = currUsOk ? "#39ff14" : "#ff4444";
      lines.push({
        text: '> update-source: <span style="color:' + usColor + '">' + (s.has_update_source ? "設定済み" : "未設定") + "</span>"
      });
    }
  }
  if (s.has_next_hop_self !== undefined) {
    var initNhsOk = !!init.has_next_hop_self;
    var currNhsOk = !!s.has_next_hop_self;
    if (!initNhsOk || currNhsOk !== initNhsOk) {
      var nhsColor = currNhsOk ? "#39ff14" : "#ff4444";
      lines.push({
        text: '> next-hop-self: <span style="color:' + nhsColor + '">' + (s.has_next_hop_self ? "設定済み" : "未設定") + "</span>"
      });
      if (s.bgp_next_hop) lines.push({
        text: '> BGP NH: <span class="de-dim">' + s.bgp_next_hop + "</span>"
      });
    }
  }
  if (s.prefix_list_deny !== undefined) {
    var initPlOk = !init.prefix_list_deny;
    var currPlOk = !s.prefix_list_deny;
    if (!initPlOk || currPlOk !== initPlOk) {
      var plColor = currPlOk ? "#39ff14" : "#ff4444";
      lines.push({
        text: '> prefix-list: <span style="color:' + plColor + '">' + (s.prefix_list_deny ? "DENY (ブロック中)" : "permit") + "</span>"
      });
    }
  }
  if (s.max_prefix_limit !== undefined) {
    var initMpOk = (init.pfx_rcvd || 0) <= (init.max_prefix_limit || 999);
    var currMpOk = (s.pfx_rcvd || 0) <= (s.max_prefix_limit || 999);
    if (!initMpOk || currMpOk !== initMpOk) {
      lines.push({
        text: '> max-prefix: <span class="de-dim">' + s.max_prefix_limit + "</span>"
      });
    }
  }
  if (s.r2_lp !== undefined || s.r3_lp !== undefined) {
    var initBestPath = init.best_path_via || "";
    var currBestPath = s.best_path_via || "";
    if (initBestPath !== currBestPath || !initBestPath) {
      lines.push({
        text: "> LP: r2=" + (s.r2_lp || "?") + " r3=" + (s.r3_lp || "?") + (s.best_path_via ? ' <span class="de-hl">best via ' + s.best_path_via + "</span>" : "")
      });
    }
  }
  if (rr.resolved) {
    lines.push({
      text: '> Route: <span class="de-hl">' + (rr.protocol || "bgp").toUpperCase() + " " + (rr.matched_prefix || rr.target || target) + "</span>"
    });
    if (rr.next_hop) lines.push({
      text: '> Next-Hop: <span class="de-hl">' + rr.next_hop + "</span>"
    });
  } else {
    lines.push({
      text: "> Route to " + target + ': <span style="color:#ff4444">NONE</span>',
      style: "color:#ff6b35"
    });
  }
  var canFwd = xrayCanForward(s);
  var actionColor = canFwd ? "#39ff14" : "#ff4444";
  lines.push({
    text: '> Action: <span style="color:' + actionColor + ';font-weight:700">' + (canFwd ? "FORWARD" : "DROP") + "</span>"
  });
  return lines;
}

var _xrayFetching = false;

function _xrayGetTargetIds() {
  var cfg = window._scenarioConfig || {};
  var xrayDt = cfg.xray && cfg.xray.deep_targets || null;
  if (Array.isArray(xrayDt) && xrayDt.length > 0) return xrayDt.slice();
  var ids = (cfg.nodes || []).filter(function(n) {
    return n.target;
  }).map(function(n) {
    return n.id;
  });
  if (ids.length > 0) return ids;
  var fb = (window._xrayTargetNode || "topo-node-r1").replace("topo-node-", "");
  return [ fb ];
}

function xrayRenderTopology(config) {
  var nodes = config.nodes || [];
  var type = config.topology_type || "linear_2node";
  var xray = config.xray || {};
  if (config.skin) {
    xraySetSkin(config.skin);
  } else if (!document.getElementById("xray-skin-vars")) {
    _xrayApplySkinColors(window._xrayActiveSkin);
  }
  if (type === "triangle") {
    return _xrayRenderTriangleTopology(config);
  }
  if (config.layout === "inverted_v" && nodes.length >= 3) {
    return _xrayRenderInvertedVTopology(config);
  }
  var html = "";
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var cls = n.type === "server" ? "server" : n.type === "isp" ? "isp" : "router";
    if (n.target) cls += " target";
    var nodeId = n.id;
    html += '<div class="topo-node" id="topo-node-' + nodeId + '">';
    var _dotHtml = !n.target ? ' <span class="xray-link-dot" data-node="' + nodeId + '" style="width:8px;height:8px;border-radius:50%;margin-left:6px;vertical-align:middle;background:#39ff14;box-shadow:0 0 4px rgba(57,255,20,0.6)"></span>' : "";
    if (n.readonly) {
      html += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      html += "<h4>" + nodeId + "</h4>";
      html += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) {
        html += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span>" + _dotHtml + "</div>";
      }
      html += '<div class="topo-iface"><span class="label">...</span>' + _dotHtml + "</div>";
      html += '<div class="terminal-hint" style="color:#e74c3c">🔒 アクセス不可</div>';
    } else {
      var ttydPath = n.ttyd_path || nodeId;
      html += '<a href="ttyd/' + ttydPath + '/" target="_blank" class="topo-box-link" id="' + nodeId + '-box-link">';
      html += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      html += "<h4>" + nodeId + "</h4>";
      html += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) {
        html += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span>" + _dotHtml + "</div>";
      }
      html += '<div class="topo-iface"><span class="label">...</span>' + _dotHtml + "</div>";
      html += '<div class="terminal-hint">Click to open terminal</div>';
    }
    html += '<div class="xray-ospf-unit"><div class="xray-ospf-dot"></div></div>';
    if (n.target) {
      html += '<div class="xray-logic xray-initial" id="xray-' + nodeId + '-initial"></div>';
      html += '<div class="xray-logic xray-cleared" id="xray-' + nodeId + '-cleared"></div>';
    } else {
      html += '<div class="xray-logic"></div>';
    }
    if (n.readonly) {
      html += "</div>";
    } else {
      html += "</div></a>";
    }
    if (n.target) html += '<div class="topo-target-label">★ 調査対象</div>';
    html += "</div>";
    if (i < nodes.length - 1) {
      var _nets = config.networks || config.topology && config.topology.networks || [];
      var linkName = "net-link";
      var _n1 = nodeId, _n2 = nodes[i + 1].id;
      for (var _li = 0; _li < _nets.length; _li++) {
        var _members = (_nets[_li].members || []).map(function(m) {
          return m.node || m;
        });
        if (_members.indexOf(_n1) !== -1 && _members.indexOf(_n2) !== -1) {
          linkName = _nets[_li].name;
          break;
        }
      }
      if (linkName === "net-link" && nodes.length > 2) linkName = "net-" + nodeId + nodes[i + 1].id;
      html += '<div class="topo-link" data-net="' + linkName + '">';
      html += '<div class="topo-link-line"></div>';
      html += '<div class="topo-link-pipe" data-net="' + linkName + '"></div>';
      html += '<div class="topo-link-pipe pipe-inner" data-net="' + linkName + '"></div>';
      html += '<div class="topo-link-label">' + linkName + "</div>";
      html += '<div class="topo-link-subnet" id="topo-subnet-' + linkName.replace("net-", "") + '">...</div>';
      html += "</div>";
    }
  }
  html += '<div class="xray-packet-orb" id="xray-orb1"></div>';
  html += '<div class="xray-packet-orb orb2" id="xray-orb2"></div>';
  html += '<div class="xray-hello-container">';
  html += '<div class="xray-hello-pkt"></div><div class="xray-hello-pkt"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container" style="animation-delay:1.25s">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-lsa-container" id="xray-lsa-container"></div>';
  html += '<div class="xray-ospf-tunnel">';
  html += '<div class="xray-tunnel-portal entry"></div><div class="xray-tunnel-portal exit"></div>';
  html += '<div class="xray-tunnel-body">';
  html += '<div class="xray-tunnel-wall top"></div><div class="xray-tunnel-wall bot"></div>';
  html += '<div class="xray-tunnel-fill"></div>';
  for (var r = 10; r <= 90; r += 10) html += '<div class="xray-tunnel-ring" style="left:' + r + '%"></div>';
  html += "</div>";
  html += '<div class="xray-tunnel-label">&#9670; FULL &#8212; OSPF ADJACENCY &#9670;</div>';
  html += "</div>";
  html += '<div class="xray-ping-orb"></div><div class="xray-ping-orb p2"></div>';
  var targetNode = nodes.find(function(n) {
    return n.target;
  }) || nodes[0];
  var _holoProto = xray.protocol === "static" ? "Routing Engine" : xray.protocol === "bgp" ? "BGP Process" : "OSPF Process";
  html += '<div class="xray-holo-panel" id="xray-holo-panel">';
  html += '<div class="title">[' + _holoProto + " &#8212; " + targetNode.id + "]</div>";
  html += '<div id="xray-holo-body"></div>';
  html += "</div>";
  html += '<div class="xray-fib-entry" id="xray-fib-entry"></div>';
  html += '<div class="xray-flash-scene" id="xray-flash-scene"></div>';
  return html;
}

function _xrayRenderTriangleTopology(config) {
  var nodes = config.nodes || [];
  var nets = config.networks || [];
  if (nodes.length < 3) return '<div style="color:#78909c;text-align:center;padding:40px">Triangle topology requires 3 nodes</div>';
  function nodeHtml(n) {
    var cls = "router";
    if (n.target) cls += " target";
    var nodeId = n.id;
    var h = '<div class="topo-node" id="topo-node-' + nodeId + '">';
    if (n.readonly) {
      h += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      h += "<h4>" + nodeId + "</h4>";
      h += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) h += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span></div>";
      h += '<div class="topo-iface"><span class="label">...</span></div>';
      h += '<div class="terminal-hint" style="color:#e74c3c">🔒 参照専用</div>';
      h += '<div class="xray-ospf-unit"><div class="xray-ospf-dot"></div></div>';
      h += '<div class="xray-logic"></div>';
      h += "</div>";
    } else {
      var ttydPath = n.ttyd_path || nodeId;
      h += '<a href="ttyd/' + ttydPath + '/" target="_blank" class="topo-box-link" id="' + nodeId + '-box-link">';
      h += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      h += "<h4>" + nodeId + "</h4>";
      h += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) h += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span></div>";
      h += '<div class="topo-iface"><span class="label">...</span></div>';
      h += '<div class="terminal-hint">Click to open terminal</div>';
      h += '<div class="xray-ospf-unit"><div class="xray-ospf-dot"></div></div>';
      if (n.target) {
        h += '<div class="xray-logic xray-initial" id="xray-' + nodeId + '-initial"></div>';
        h += '<div class="xray-logic xray-cleared" id="xray-' + nodeId + '-cleared"></div>';
      } else {
        h += '<div class="xray-logic"></div>';
      }
      h += "</div></a>";
    }
    if (n.target) h += '<div class="topo-target-label">★ 調査対象</div>';
    h += "</div>";
    return h;
  }
  function findNet(a, b) {
    for (var i = 0; i < nets.length; i++) {
      var ms = (nets[i].members || []).map(function(m) {
        return m.node || m;
      });
      if (ms.indexOf(a) !== -1 && ms.indexOf(b) !== -1) return nets[i].name;
    }
    return "net-" + a + b;
  }
  var apex = nodes.find(function(n) {
    return n.target;
  }) || nodes[1];
  var bottom = nodes.filter(function(n) {
    return n !== apex;
  });
  var bLeft = bottom[0], bRight = bottom[1];
  var netTopLeft = findNet(apex.id, bLeft.id);
  var netTopRight = findNet(apex.id, bRight.id);
  var netBottom = findNet(bLeft.id, bRight.id);
  function _triLinkKey(a, b) {
    return [ a, b ].sort().join("_");
  }
  window._xrayTriLinkMap = {};
  window._xrayTriLinkMap[_triLinkKey(apex.id, bLeft.id)] = "tri-line-tl";
  window._xrayTriLinkMap[_triLinkKey(apex.id, bRight.id)] = "tri-line-tr";
  window._xrayTriLinkMap[_triLinkKey(bLeft.id, bRight.id)] = "tri-line-bt";
  var html = '<div class="topo-triangle">';
  html += "<style>";
  html += ".topo-triangle{position:relative;display:flex;flex-direction:column;align-items:center;gap:0;min-height:320px}";
  html += ".topo-tri-top{display:flex;justify-content:center;position:relative;z-index:2}";
  html += ".topo-tri-bottom{display:flex;justify-content:center;gap:120px;margin-top:40px;position:relative;z-index:2}";
  html += ".topo-tri-svg{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none}";
  html += ".topo-tri-arrows{z-index:3}";
  html += ".topo-tri-link-label{position:absolute;font-size:11px;color:#90a4ae;text-align:center;z-index:3;pointer-events:none}";
  html += ".topo-tri-subnet{font-size:10px;color:#607d8b;display:block}";
  html += "</style>";
  html += '<div class="topo-tri-top">';
  html += nodeHtml(apex);
  html += "</div>";
  html += '<div class="topo-tri-bottom">';
  html += nodeHtml(bLeft);
  html += nodeHtml(bRight);
  html += "</div>";
  html += '<svg class="topo-tri-svg" id="topo-tri-svg"></svg>';
  html += '<svg class="topo-tri-svg topo-tri-arrows" id="topo-tri-arrows"></svg>';
  html += '<div class="topo-tri-link-label" id="tri-label-tl">' + netTopLeft + '<span class="topo-tri-subnet" id="topo-subnet-' + netTopLeft.replace("net-", "") + '">...</span></div>';
  html += '<div class="topo-tri-link-label" id="tri-label-tr">' + netTopRight + '<span class="topo-tri-subnet" id="topo-subnet-' + netTopRight.replace("net-", "") + '">...</span></div>';
  html += '<div class="topo-tri-link-label" id="tri-label-bt">' + netBottom + '<span class="topo-tri-subnet" id="topo-subnet-' + netBottom.replace("net-", "") + '">...</span></div>';
  html += "</div>";
  var _triApex = apex.id, _triBL = bLeft.id, _triBR = bRight.id;
  var _triQid = config.id || "q6";
  var _triCapture = config.capture || {};
  var _triPingSrc = _triCapture.ping_src || (nodes.find(function(n) {
    return !n.target && !n.loopback;
  }) || {}).id || nodes[0].id;
  var _triPingDstIp = _triCapture.ping_dst || "";
  var _triPingDstNode = nodes.find(function(n) {
    return n.loopback && n.loopback.split("/")[0] === _triPingDstIp.split("/")[0];
  }) || nodes.find(function(n) {
    return n.loopback && n.id !== _triPingSrc;
  }) || nodes.find(function(n) {
    return n.id !== _triPingSrc && !n.target;
  }) || nodes[nodes.length - 1];
  function _triDrawSVG() {
    var svg = document.getElementById("topo-tri-svg");
    if (!svg) return;
    svg.innerHTML = "";
    var arrowSvgPre = document.getElementById("topo-tri-arrows");
    if (arrowSvgPre) arrowSvgPre.innerHTML = "";
    var container = svg.parentElement;
    if (!container) return;
    var rect = container.getBoundingClientRect();
    function center(id) {
      var el = document.getElementById("topo-node-" + id);
      if (!el) return {
        x: 0,
        y: 0
      };
      var r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - rect.left,
        y: r.top + r.height / 2 - rect.top
      };
    }
    var pA = center(_triApex), pBL = center(_triBL), pBR = center(_triBR);
    var _btMidY = (pBL.y + pBR.y) / 2;
    pBL.y = _btMidY;
    pBR.y = _btMidY;
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    svg.style.width = rect.width + "px";
    svg.style.height = rect.height + "px";
    function drawLine(a, b, id) {
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke", "#607d8b");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-dasharray", "6,4");
      if (id) line.id = id;
      svg.appendChild(line);
    }
    drawLine(pA, pBL, "tri-line-tl");
    drawLine(pA, pBR, "tri-line-tr");
    drawLine(pBL, pBR, "tri-line-bt");
    function drawTunnel(a, b, id) {
      _xrayDrawTunnelPipe(svg, a, b, id);
    }
    drawTunnel(pA, pBL, "tri-tunnel-tl");
    drawTunnel(pA, pBR, "tri-tunnel-tr");
    drawTunnel(pBL, pBR, "tri-tunnel-bt");
    var arrowSvg = document.getElementById("topo-tri-arrows");
    if (!arrowSvg) return;
    arrowSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    arrowSvg.style.width = rect.width + "px";
    arrowSvg.style.height = rect.height + "px";
    var ns = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(ns, "defs");
    defs.innerHTML = '<marker id="ah-green" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0,6 2.5,0 5" fill="#66bb6a"/></marker>' + '<marker id="ah-cyan" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0,6 2.5,0 5" fill="#4dd0e1"/></marker>';
    arrowSvg.appendChild(defs);
    function boxEdge(nodeId, toward) {
      var el = document.getElementById("topo-node-" + nodeId);
      if (!el) return toward;
      var box = el.querySelector(".topo-box");
      if (!box) return toward;
      var br = box.getBoundingClientRect();
      var cx = br.left + br.width / 2 - rect.left;
      var cy = br.top + br.height / 2 - rect.top;
      if (nodeId === _triBL || nodeId === _triBR) cy = _btMidY;
      var hw = br.width / 2 + 12, hh = br.height / 2 + 16;
      var dx = toward.x - cx, dy = toward.y - cy;
      if (dx === 0 && dy === 0) return {
        x: cx,
        y: cy
      };
      var sx = dx !== 0 ? hw / Math.abs(dx) : 9999;
      var sy = dy !== 0 ? hh / Math.abs(dy) : 9999;
      var s = Math.min(sx, sy);
      return {
        x: cx + dx * s,
        y: cy + dy * s
      };
    }
    var _idToPos = {};
    _idToPos[_triApex] = pA;
    _idToPos[_triBL] = pBL;
    _idToPos[_triBR] = pBR;
    var srcId = _triPingSrc, srcP = _idToPos[srcId] || pBL;
    var dstId = _triPingDstNode.id, dstP = _idToPos[dstId] || pBR;
    var _remain = [ _triApex, _triBL, _triBR ].filter(function(id) {
      return id !== srcId && id !== dstId;
    });
    var relayId = _remain[0], relayP = _idToPos[relayId] || pA;
    function offsetLine(p1, p2, dist) {
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len * dist, ny = dx / len * dist;
      return {
        s: {
          x: p1.x + nx,
          y: p1.y + ny
        },
        e: {
          x: p2.x + nx,
          y: p2.y + ny
        }
      };
    }
    var dStart = boxEdge(srcId, dstP);
    var dEnd = boxEdge(dstId, srcP);
    var dOff = offsetLine(dStart, dEnd, 10);
    var arDirect = document.createElementNS(ns, "line");
    arDirect.id = "route-arrow-direct";
    arDirect.setAttribute("x1", dOff.s.x);
    arDirect.setAttribute("y1", dOff.s.y);
    arDirect.setAttribute("x2", dOff.e.x);
    arDirect.setAttribute("y2", dOff.e.y);
    arDirect.setAttribute("stroke", "#66bb6a");
    arDirect.setAttribute("stroke-width", "3");
    arDirect.setAttribute("marker-end", "url(#ah-green)");
    arDirect.setAttribute("opacity", "0");
    arDirect.style.transition = "opacity 0.5s";
    arrowSvg.appendChild(arDirect);
    var lblDirect = document.createElementNS(ns, "text");
    lblDirect.id = "route-label-direct";
    var lblDX = (dStart.x + dEnd.x) / 2, lblDY = (dStart.y + dEnd.y) / 2;
    var lblDOffY = relayP.y < lblDY ? 20 : -12;
    lblDirect.setAttribute("x", lblDX);
    lblDirect.setAttribute("y", lblDY + lblDOffY);
    lblDirect.setAttribute("text-anchor", "middle");
    lblDirect.setAttribute("fill", "#66bb6a");
    lblDirect.setAttribute("font-size", "11");
    lblDirect.setAttribute("font-family", "monospace");
    lblDirect.setAttribute("opacity", "0");
    lblDirect.textContent = srcId + " → " + dstId + " (直通)";
    arrowSvg.appendChild(lblDirect);
    var d1S = boxEdge(srcId, relayP), d1E = boxEdge(relayId, srcP);
    var d1Off = offsetLine(d1S, d1E, 10);
    var arR1R2 = document.createElementNS(ns, "line");
    arR1R2.id = "route-arrow-r1r2";
    arR1R2.setAttribute("x1", d1Off.s.x);
    arR1R2.setAttribute("y1", d1Off.s.y);
    arR1R2.setAttribute("x2", d1Off.e.x);
    arR1R2.setAttribute("y2", d1Off.e.y);
    arR1R2.setAttribute("stroke", "#4dd0e1");
    arR1R2.setAttribute("stroke-width", "3");
    arR1R2.setAttribute("marker-end", "url(#ah-cyan)");
    arR1R2.setAttribute("opacity", "0");
    arR1R2.style.transition = "opacity 0.5s";
    arrowSvg.appendChild(arR1R2);
    var d2S = boxEdge(relayId, dstP), d2E = boxEdge(dstId, relayP);
    var d2Off = offsetLine(d2S, d2E, 10);
    var arR2R3 = document.createElementNS(ns, "line");
    arR2R3.id = "route-arrow-r2r3";
    arR2R3.setAttribute("x1", d2Off.s.x);
    arR2R3.setAttribute("y1", d2Off.s.y);
    arR2R3.setAttribute("x2", d2Off.e.x);
    arR2R3.setAttribute("y2", d2Off.e.y);
    arR2R3.setAttribute("stroke", "#4dd0e1");
    arR2R3.setAttribute("stroke-width", "3");
    arR2R3.setAttribute("marker-end", "url(#ah-cyan)");
    arR2R3.setAttribute("opacity", "0");
    arR2R3.style.transition = "opacity 0.5s";
    arrowSvg.appendChild(arR2R3);
    var relayBox = document.getElementById("topo-node-" + relayId);
    var relayLblY = relayBox ? relayBox.querySelector(".topo-box").getBoundingClientRect().top - rect.top - 18 : relayP.y - 60;
    var lblOspf = document.createElementNS(ns, "text");
    lblOspf.id = "route-label-ospf";
    lblOspf.setAttribute("x", relayP.x);
    lblOspf.setAttribute("y", relayLblY);
    lblOspf.setAttribute("text-anchor", "middle");
    lblOspf.setAttribute("fill", "#4dd0e1");
    lblOspf.setAttribute("font-size", "11");
    lblOspf.setAttribute("font-family", "monospace");
    lblOspf.setAttribute("opacity", "0");
    lblOspf.textContent = "OSPF (迂回)";
    arrowSvg.appendChild(lblOspf);
    window._triArrowsVisible = true;
    function _applyTraceArrows(d) {
      if (!d || !d.success) return;
      var ad = document.getElementById("route-arrow-direct");
      var ld = document.getElementById("route-label-direct");
      var a12 = document.getElementById("route-arrow-r1r2");
      var a23 = document.getElementById("route-arrow-r2r3");
      var lo = document.getElementById("route-label-ospf");
      if (!d.reached) {
        if (ad) ad.setAttribute("opacity", "0");
        if (ld) ld.setAttribute("opacity", "0");
        if (a12) a12.setAttribute("opacity", "0");
        if (a23) a23.setAttribute("opacity", "0");
        if (lo) lo.setAttribute("opacity", "0");
      } else if (d.hops.length <= 1) {
        if (ad) ad.setAttribute("opacity", "1");
        if (ld) ld.setAttribute("opacity", "1");
        if (a12) a12.setAttribute("opacity", "0");
        if (a23) a23.setAttribute("opacity", "0");
        if (lo) lo.setAttribute("opacity", "0");
      } else {
        if (ad) ad.setAttribute("opacity", "0.15");
        if (ld) ld.setAttribute("opacity", "0.15");
        if (a12) a12.setAttribute("opacity", "1");
        if (a23) a23.setAttribute("opacity", "1");
        if (lo) lo.setAttribute("opacity", "1");
      }
    }
    function _pollTraceroute() {
      var _tf = window._xrayTraceFetcher;
      if (typeof _tf !== "function") return;
      window._tracePolling = true;
      _tf(_triQid).then(_applyTraceArrows).catch(function() {}).then(function() {
        window._tracePolling = false;
      });
    }
    if (!window._tracePollTimer) {
      window._tracePollTimer = setInterval(function() {
        if (_xrayDeepDeconflict()) return;
        if (!window._tracePolling) _pollTraceroute();
      }, 3e3);
      _pollTraceroute();
    }
    var maxY = Math.max(dStart.y, dEnd.y, d1S.y, d2E.y) + 30;
    if (maxY > rect.height) {
      svg.setAttribute("viewBox", "0 0 " + rect.width + " " + maxY);
      svg.style.height = maxY + "px";
      arrowSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + maxY);
      arrowSvg.style.height = maxY + "px";
      container.style.minHeight = maxY + "px";
    }
    function posLabel(labelId, a, b, offsetX, offsetY) {
      var el = document.getElementById(labelId);
      if (!el) return;
      el.style.left = (a.x + b.x) / 2 + (offsetX || 0) - 30 + "px";
      el.style.top = (a.y + b.y) / 2 + (offsetY || 0) - 10 + "px";
    }
    posLabel("tri-label-tl", pA, pBL, -40, 0);
    posLabel("tri-label-tr", pA, pBR, 40, 0);
    posLabel("tri-label-bt", pBL, pBR, 0, -20);
  }
  window._triRedrawSVG = _triDrawSVG;
  setTimeout(_triDrawSVG, 100);
  html += '<div class="xray-packet-orb" id="xray-orb1"></div>';
  html += '<div class="xray-packet-orb orb2" id="xray-orb2"></div>';
  html += '<div class="xray-hello-container">';
  html += '<div class="xray-hello-pkt"></div><div class="xray-hello-pkt"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container" style="animation-delay:1.25s">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-lsa-container" id="xray-lsa-container"></div>';
  html += '<div class="xray-ospf-tunnel">';
  html += '<div class="xray-tunnel-portal entry"></div><div class="xray-tunnel-portal exit"></div>';
  html += '<div class="xray-tunnel-body">';
  html += '<div class="xray-tunnel-wall top"></div><div class="xray-tunnel-wall bot"></div>';
  html += '<div class="xray-tunnel-fill"></div>';
  for (var _r = 10; _r <= 90; _r += 10) html += '<div class="xray-tunnel-ring" style="left:' + _r + '%"></div>';
  html += "</div>";
  html += '<div class="xray-tunnel-label">&#9670; FULL &#8212; OSPF ADJACENCY &#9670;</div>';
  html += "</div>";
  html += '<div class="xray-ping-orb"></div><div class="xray-ping-orb p2"></div>';
  var _xray = config.xray || {};
  var _holoProto = _xray.protocol === "static" ? "Routing Engine" : _xray.protocol === "bgp" ? "BGP Process" : "OSPF Process";
  html += '<div class="xray-holo-panel" id="xray-holo-panel">';
  html += '<div class="title">[' + _holoProto + " &#8212; " + apex.id + "]</div>";
  html += '<div id="xray-holo-body"></div>';
  html += "</div>";
  html += '<div class="xray-fib-entry" id="xray-fib-entry"></div>';
  html += '<div class="xray-flash-scene" id="xray-flash-scene"></div>';
  return html;
}

function _xrayRenderInvertedVTopology(config) {
  var nodes = config.nodes || [];
  var nets = config.networks || [];
  function nodeHtml(n) {
    var cls = "router";
    if (n.target) cls += " target";
    var nodeId = n.id;
    var h = '<div class="topo-node" id="topo-node-' + nodeId + '">';
    if (n.readonly) {
      h += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      h += "<h4>" + nodeId + "</h4>";
      h += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) h += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span></div>";
      h += '<div class="topo-iface"><span class="label">...</span></div>';
      h += '<div class="terminal-hint" style="color:#e74c3c">🔒 参照専用</div>';
      h += '<div class="xray-ospf-unit"><div class="xray-ospf-dot"></div></div>';
      h += '<div class="xray-logic"></div>';
      h += "</div>";
    } else {
      var ttydPath = n.ttyd_path || nodeId;
      h += '<a href="ttyd/' + ttydPath + '/" target="_blank" class="topo-box-link" id="' + nodeId + '-box-link">';
      h += '<div class="topo-box ' + cls + '" style="position:relative" data-name="' + nodeId + '">';
      h += "<h4>" + nodeId + "</h4>";
      h += '<div class="role">' + (n.role || "") + "</div>";
      if (n.loopback) h += '<div class="topo-iface"><span class="label">Lo:</span> <span class="ip">' + n.loopback + "</span></div>";
      h += '<div class="topo-iface"><span class="label">...</span></div>';
      h += '<div class="terminal-hint">Click to open terminal</div>';
      h += '<div class="xray-ospf-unit"><div class="xray-ospf-dot"></div></div>';
      if (n.target) {
        h += '<div class="xray-logic xray-initial" id="xray-' + nodeId + '-initial"></div>';
        h += '<div class="xray-logic xray-cleared" id="xray-' + nodeId + '-cleared"></div>';
      } else {
        h += '<div class="xray-logic"></div>';
      }
      h += "</div></a>";
    }
    if (n.target) h += '<div class="topo-target-label">★ 調査対象</div>';
    h += "</div>";
    return h;
  }
  function findNet(a, b) {
    for (var i = 0; i < nets.length; i++) {
      var ms = (nets[i].members || []).map(function(m) {
        return m.node || m;
      });
      if (ms.indexOf(a) !== -1 && ms.indexOf(b) !== -1) return nets[i].name;
    }
    return null;
  }
  var apex = nodes.find(function(n) {
    return n.target;
  }) || nodes[0];
  var bottom = nodes.filter(function(n) {
    return n.id !== apex.id;
  });
  var ivLinks = [];
  for (var i = 0; i < bottom.length; i++) {
    var netName = findNet(apex.id, bottom[i].id);
    if (netName) {
      ivLinks.push({
        bottomId: bottom[i].id,
        idx: i,
        netName: netName
      });
    }
  }
  function _ivLinkKey(a, b) {
    return [ a, b ].sort().join("_");
  }
  window._xrayTriLinkMap = {};
  if (ivLinks[0]) window._xrayTriLinkMap[_ivLinkKey(apex.id, ivLinks[0].bottomId)] = "tri-line-tl";
  if (ivLinks[1]) window._xrayTriLinkMap[_ivLinkKey(apex.id, ivLinks[1].bottomId)] = "tri-line-tr";
  var html = '<div class="topo-inverted-v">';
  html += "<style>";
  html += ".topo-inverted-v{position:relative;display:flex;flex-direction:column;align-items:center;gap:0;min-height:320px}";
  html += ".topo-iv-top{display:flex;justify-content:center;width:100%;position:relative;z-index:2}";
  html += ".topo-iv-bottom{display:flex;justify-content:center;width:100%;gap:120px;margin-top:40px;position:relative;z-index:2}";
  html += ".topo-iv-svg{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none}";
  html += ".topo-iv-link-label{position:absolute;font-size:11px;color:#90a4ae;text-align:center;z-index:3;pointer-events:none}";
  html += ".topo-iv-subnet{font-size:10px;color:#607d8b;display:block}";
  html += "</style>";
  html += '<div class="topo-iv-top">';
  html += nodeHtml(apex);
  html += "</div>";
  html += '<div class="topo-iv-bottom">';
  for (var bi = 0; bi < bottom.length; bi++) {
    html += nodeHtml(bottom[bi]);
  }
  html += "</div>";
  html += '<svg class="topo-iv-svg" id="topo-iv-svg"></svg>';
  for (var li = 0; li < ivLinks.length; li++) {
    var lk = ivLinks[li];
    var lblPosCls = li === 0 ? "tl" : li === 1 ? "tr" : "n" + li;
    html += '<div class="topo-iv-link-label" id="iv-label-' + lblPosCls + '">' + lk.netName + '<span class="topo-iv-subnet" id="topo-subnet-' + lk.netName.replace("net-", "") + '">...</span></div>';
  }
  html += "</div>";
  var _ivApex = apex.id;
  var _ivLinkData = ivLinks.map(function(lk, i) {
    return {
      bottomId: lk.bottomId,
      lineId: i === 0 ? "tri-line-tl" : i === 1 ? "tri-line-tr" : "iv-line-" + i,
      labelPos: i === 0 ? "tl" : i === 1 ? "tr" : "n" + i
    };
  });
  function _ivDrawSVG() {
    var svg = document.getElementById("topo-iv-svg");
    if (!svg) return;
    svg.innerHTML = "";
    var container = svg.parentElement;
    if (!container) return;
    var rect = container.getBoundingClientRect();
    function center(id) {
      var el = document.getElementById("topo-node-" + id);
      if (!el) return {
        x: 0,
        y: 0
      };
      var r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - rect.left,
        y: r.top + r.height / 2 - rect.top
      };
    }
    var pA = center(_ivApex);
    var bottomPs = _ivLinkData.map(function(d) {
      return center(d.bottomId);
    });
    if (bottomPs.length > 1) {
      var avgY = bottomPs.reduce(function(s, p) {
        return s + p.y;
      }, 0) / bottomPs.length;
      bottomPs.forEach(function(p) {
        p.y = avgY;
      });
    }
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    svg.style.width = rect.width + "px";
    svg.style.height = rect.height + "px";
    _ivLinkData.forEach(function(d, i) {
      var pB = bottomPs[i];
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pA.x);
      line.setAttribute("y1", pA.y);
      line.setAttribute("x2", pB.x);
      line.setAttribute("y2", pB.y);
      line.setAttribute("stroke", "#607d8b");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-dasharray", "6,4");
      line.id = d.lineId;
      svg.appendChild(line);
      var _ivTunId = d.lineId.replace("tri-line-", "tri-tunnel-").replace("iv-line-", "iv-tunnel-");
      _xrayDrawTunnelPipe(svg, pA, pB, _ivTunId);
      var lbl = document.getElementById("iv-label-" + d.labelPos);
      if (lbl) {
        var midX = (pA.x + pB.x) / 2;
        var midY = (pA.y + pB.y) / 2;
        var offX = d.labelPos === "tl" ? -40 : d.labelPos === "tr" ? 40 : 0;
        lbl.style.left = midX + offX - 30 + "px";
        lbl.style.top = midY - 10 + "px";
      }
    });
  }
  window._triRedrawSVG = _ivDrawSVG;
  setTimeout(_ivDrawSVG, 100);
  html += '<div class="xray-packet-orb" id="xray-orb1"></div>';
  html += '<div class="xray-packet-orb orb2" id="xray-orb2"></div>';
  html += '<div class="xray-hello-container">';
  html += '<div class="xray-hello-pkt"></div><div class="xray-hello-pkt"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-spark-container" style="animation-delay:1.25s">';
  html += '<div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div><div class="xray-spark"></div>';
  html += "</div>";
  html += '<div class="xray-lsa-container" id="xray-lsa-container"></div>';
  html += '<div class="xray-ospf-tunnel">';
  html += '<div class="xray-tunnel-portal entry"></div><div class="xray-tunnel-portal exit"></div>';
  html += '<div class="xray-tunnel-body">';
  html += '<div class="xray-tunnel-wall top"></div><div class="xray-tunnel-wall bot"></div>';
  html += '<div class="xray-tunnel-fill"></div>';
  for (var _r = 10; _r <= 90; _r += 10) html += '<div class="xray-tunnel-ring" style="left:' + _r + '%"></div>';
  html += "</div>";
  html += '<div class="xray-tunnel-label">&#9670; FULL &#8212; OSPF ADJACENCY &#9670;</div>';
  html += "</div>";
  html += '<div class="xray-ping-orb"></div><div class="xray-ping-orb p2"></div>';
  var _xrayCfg = config.xray || {};
  var _holoProto = _xrayCfg.protocol === "static" ? "Routing Engine" : _xrayCfg.protocol === "bgp" ? "BGP Process" : "OSPF Process";
  html += '<div class="xray-holo-panel" id="xray-holo-panel">';
  html += '<div class="title">[' + _holoProto + " &#8212; " + apex.id + "]</div>";
  html += '<div id="xray-holo-body"></div>';
  html += "</div>";
  html += '<div class="xray-fib-entry" id="xray-fib-entry"></div>';
  html += '<div class="xray-flash-scene" id="xray-flash-scene"></div>';
  return html;
}

var _XRAY_DE = {
  cylHeightFrac: 1,
  cylFillRGBA: "rgba(6,20,34,0.72)",
  zMode: "split",
  connBallR: 6.5,
  connBallCol: "#00e5ff",
  fwdArrowCol: "#39ff14",
  rePanelLeft: 90,
  rePanelTop: 58,
  lsdbRight: "8%",
  rePanelMinH: "300px",
  beamReachMxFrac: .49,
  beamReachMyFrac: .49,
  labelBelowOffsetPx: 16,
  deEngineH: "460px",
  helloZipFrac: .85,
  helloTravelSec: 2,
  helloSendRecvPhaseFrac: .35,
  helloTravelPct: .6,
  helloEndScreenMarginPx: 22,
  helloReachEndFrac: 1.3,
  helloSendEndInsetPx: 6,
  deCardPadBottomPx: 44,
  deCardPadTopPx: 32,
  deLabelChipBg: "rgba(6,16,26,0.85)",
  helloLeftPhaseFrac: .4
};

function _xrayDeCylSvg(frac, fwdDir) {
  var topY = 40, bodyLen = Math.round(420 * frac), botY = topY + bodyLen, cx = 100, rx = 80, ry = 22;
  var col = "#00e5ff", st = 'style="stroke:var(--xto-link,' + col + ')"';
  var vbH = topY + bodyLen + 40, cssH = Math.round(160 / 200 * vbH), midY = Math.round((topY + botY) / 2);
  var FILL = _XRAY_DE.cylFillRGBA;
  var s = '<svg class="de-cyl-svg" style="width:160px;height:' + cssH + 'px" viewBox="0 0 200 ' + vbH + '" fill="none">';
  s += '<rect x="' + (cx - rx) + '" y="' + topY + '" width="' + rx * 2 + '" height="' + bodyLen + '" fill="' + FILL + '"/>';
  s += '<ellipse cx="' + cx + '" cy="' + botY + '" rx="' + rx + '" ry="' + ry + '" fill="' + FILL + '" stroke="none"/>';
  s += '<ellipse cx="' + cx + '" cy="' + topY + '" rx="' + rx + '" ry="' + ry + '" fill="' + FILL + '" stroke="none"/>';
  [ [ 20, .8, 1.5, 0 ], [ 180, .8, 1.5, 0 ], [ 31, .3, 1, 10 ], [ 169, .3, 1, 10 ], [ 47, .4, 1, 17 ], [ 153, .4, 1, 17 ], [ 65, .35, 1, 20 ], [ 135, .35, 1, 20 ], [ 86, .5, 1, 22 ], [ 114, .5, 1, 22 ], [ 100, .2, .5, 22 ] ].forEach(function(l) {
    s += '<line x1="' + l[0] + '" y1="' + (topY - l[3]) + '" x2="' + l[0] + '" y2="' + (botY + l[3]) + '" stroke="' + col + '" ' + st + ' stroke-width="' + l[2] + '" opacity="' + l[1] + '"/>';
  });
  s += '<ellipse cx="' + cx + '" cy="' + topY + '" rx="' + rx + '" ry="' + ry + '" stroke="' + col + '" ' + st + ' stroke-width="1.5" fill="none" opacity="0.9"/>';
  var n = Math.max(0, Math.round(bodyLen / 60) - 1);
  for (var i = 1; i <= n; i++) {
    var cy = Math.round(topY + bodyLen * i / (n + 1));
    s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" stroke="' + col + '" ' + st + ' stroke-width="1" fill="none" opacity="0.25"/>';
  }
  s += '<ellipse cx="' + cx + '" cy="' + botY + '" rx="' + rx + '" ry="' + ry + '" stroke="' + col + '" ' + st + ' stroke-width="1.5" fill="none" opacity="0.9"/>';
  var tf = fwdDir === "left" ? ' transform="translate(200, 0) scale(-1, 1)"' : "";
  s += '<g id="de-cyl-fwd-arrow" style="display:none"' + tf + ">";
  s += '<line x1="35" y1="' + midY + '" x2="155" y2="' + midY + '" stroke="' + _XRAY_DE.fwdArrowCol + '" stroke-width="3.5" stroke-linecap="round"/>';
  s += '<polygon points="160,' + (midY - 10) + " 180," + midY + " 160," + (midY + 10) + '" fill="' + _XRAY_DE.fwdArrowCol + '"/>';
  s += '<text x="100" y="' + (midY - 15) + '" text-anchor="middle" font-family="Courier New" font-size="13" font-weight="bold" fill="' + _XRAY_DE.fwdArrowCol + '" opacity="0.8"' + tf + ">FORWARD</text>";
  s += "</g></svg>";
  return s;
}

function _xrayDeAngleInjectCss() {
  if (document.getElementById("xray-de-angle-style")) return;
  var st = document.createElement("style");
  st.id = "xray-de-angle-style";
  st.textContent = ".de-side-wrap{position:absolute;inset:0;transform-origin:50% 50%;pointer-events:none}" + "body.de-angle-active .xray-deep-engine{overflow:visible}" + "body.de-angle-active .topology{overflow:hidden!important}" + "body.de-angle-active #de-tunnel-left,body.de-angle-active #de-tunnel-right{transition:opacity 0.8s cubic-bezier(0.23,1,0.32,1),height 0.8s cubic-bezier(0.23,1,0.32,1)!important}" + "body.de-angle-active .de-tunnel.de-side-ospf-full > .de-tunnel-fill,body.de-angle-active .de-tunnel.de-side-ospf-exchange > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 0%,rgba(var(--xto-ospf-rgb,57,255,20),0.28) 50%,rgba(var(--xto-ospf-rgb,57,255,20),0.42) 100%)!important}" + "body.de-angle-active .de-tunnel.de-side-ospf-2way > .de-tunnel-fill,body.de-angle-active .de-tunnel.de-side-ospf-init > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-idle-rgb,255,140,0),0.42) 0%,rgba(var(--xto-idle-rgb,255,140,0),0.28) 50%,rgba(var(--xto-idle-rgb,255,140,0),0.42) 100%)!important}" + "body.de-angle-active .de-tunnel.de-side-bgp > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 50%,rgba(var(--xto-bgp-rgb,168,85,247),0.34) 100%)!important}" + "body.de-angle-active .de-tunnel.de-side-bgp-idle > .de-tunnel-fill{opacity:1!important;background:linear-gradient(180deg,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 0%,rgba(var(--xto-bgp-rgb,168,85,247),0.12) 50%,rgba(var(--xto-bgp-rgb,168,85,247),0.20) 100%)!important}" + ".de-angle-on #de-cyl-fwd-arrow,.de-angle-on .de-ping-orb,.de-angle-on .de-packet{display:none!important}" + ".de-angle-on .de-r1-name{display:inline-block;vertical-align:baseline;margin-right:12px}" + ".de-angle-on .de-r1-sub{display:inline-block;vertical-align:baseline}" + "[data-topo-triangle].is-xray-deep.hello-out .de-angle-on .de-hello-orb.out{display:block!important}" + "[data-topo-triangle].is-xray-deep.hello-in .de-angle-on .de-hello-orb.in{display:block!important}" + ".de-ping-ball{position:absolute;left:0;top:0;width:13px;height:13px;border-radius:50%;" + "background:radial-gradient(circle,#fff,rgba(0,229,255,0.95));box-shadow:0 0 14px rgba(0,229,255,0.9);" + "z-index:9;pointer-events:none;offset-anchor:center;offset-rotate:0deg;" + "animation:demove 1.8s ease-in-out infinite alternate;display:none}" + "@keyframes demove{from{offset-distance:0%}to{offset-distance:100%}}";
  (document.head || document.body).appendChild(st);
}

function _xrayDeSideAngles(cfg) {
  var dual = cfg && (cfg.topology_type === "triangle" || typeof _xrayIsDualLinkApexLayout === "function" && _xrayIsDualLinkApexLayout(cfg));
  return dual ? {
    l: -45,
    r: 45,
    dual: true
  } : {
    l: 0,
    r: 0,
    dual: false
  };
}

function _xrayDeAngleTeardown(de) {
  if (!de || !de.classList.contains("de-angle-on")) return;
  de.classList.remove("de-angle-on");
  document.body.classList.remove("de-angle-active");
  var _topoT = de.closest(".topology");
  if (_topoT && !(typeof _xrayUnifiedActive === "function" && _xrayUnifiedActive(window._scenarioConfig || {}))) {
    _topoT.style.removeProperty("padding-bottom");
    _topoT.style.removeProperty("padding-top");
  }
  if (typeof _xrayUnifiedActive === "function" && _xrayUnifiedActive(window._scenarioConfig || {}) && typeof _XRAY_DE !== "undefined" && _XRAY_DE.deEngineH) de.style.minHeight = _XRAY_DE.deEngineH; else de.style.removeProperty("min-height");
  [ ".de-side-left", ".de-side-right", ".de-side-left-hi", ".de-side-right-hi" ].forEach(function(sel) {
    var w = de.querySelector(sel);
    if (w) {
      while (w.firstChild) {
        var c = w.firstChild;
        if (c.style) {
          c.style.removeProperty("display");
          c.style.removeProperty("left");
          c.style.removeProperty("right");
          c.style.removeProperty("offset-path");
        }
        if (c.classList) c.classList.remove("de-hp");
        de.appendChild(c);
      }
      w.remove();
    }
  });
  [ ".de-conn-ball", ".de-flow", ".de-ping-ball", ".de-occ", ".de-hello-probe" ].forEach(function(sel) {
    de.querySelectorAll(sel).forEach(function(e) {
      e.remove();
    });
  });
  de._deCbL = de._deCbR = de._deFlow = de._dePing = de._deOcc = de._probeR = de._probeL = de._probeR2 = de._probeL2 = null;
  de._helloFarR = de._helloFarL = de._helloGeomKey = null;
}

function _xrayDeAngleView(s) {
  try {
    var de = document.querySelector(".xray-deep-engine");
    if (!de) return;
    var cfg = window._scenarioConfig || {};
    var off = typeof _xrayUnifiedActive === "function" && _xrayUnifiedActive(cfg) || !document.body.classList.contains("is-xray-deep");
    if (off) {
      _xrayDeAngleTeardown(de);
      return;
    }
    var cyl = de.querySelector(".de-cyl-svg");
    if (!cyl) return;
    de.style.minHeight = _XRAY_DE.deEngineH;
    var SVGNS = "http://www.w3.org/2000/svg";
    var wL = de.querySelector(".de-side-left"), wR = de.querySelector(".de-side-right");
    if (!wL || !wR) {
      _xrayDeAngleInjectCss();
      de.classList.add("de-angle-on");
      wL = document.createElement("div");
      wL.className = "de-side-wrap de-side-left";
      wL.style.zIndex = "1";
      wR = document.createElement("div");
      wR.className = "de-side-wrap de-side-right";
      wR.style.zIndex = "1";
      de.appendChild(wL);
      de.appendChild(wR);
      var mv = function(sels, w) {
        sels.forEach(function(sel) {
          de.querySelectorAll(sel).forEach(function(el) {
            if (el && !el.closest(".de-side-wrap")) w.appendChild(el);
          });
        });
      };
      mv([ ".de-beam.in", ".de-energy.el", "#de-tunnel-left", ".de-hello-orb.left-out", ".de-hello-orb.left-in" ], wL);
      mv([ ".de-beam.out", ".de-energy.er", "#de-tunnel-right", ".de-hello-orb.out", ".de-hello-orb.in" ], wR);
      var _mkProbe = function(w, sign, px) {
        var p = document.createElement("div");
        p.className = "de-hello-probe";
        p.style.cssText = "position:absolute;top:50%;left:calc(50% " + (sign > 0 ? "+" : "-") + " " + px + "px);width:1px;height:1px;opacity:0;pointer-events:none";
        w.appendChild(p);
        return p;
      };
      de._probeR = _mkProbe(wR, 1, 200);
      de._probeR2 = _mkProbe(wR, 1, 600);
      de._probeL = _mkProbe(wL, -1, 200);
      de._probeL2 = _mkProbe(wL, -1, 600);
      de.querySelectorAll(".de-ping-orb, .de-packet").forEach(function(el) {
        el.style.display = "none";
      });
      var mkBall = function() {
        var d = document.createElement("div");
        d.className = "de-conn-ball";
        d.style.cssText = "position:absolute;width:" + _XRAY_DE.connBallR * 2 + "px;height:" + _XRAY_DE.connBallR * 2 + "px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(0,229,255,0.95));box-shadow:0 0 12px rgba(0,229,255,0.9);transform:translate(-50%,-50%);z-index:9;pointer-events:none";
        de.appendChild(d);
        return d;
      };
      de._deCbL = mkBall();
      de._deCbR = mkBall();
      var flow = document.createElementNS(SVGNS, "svg");
      flow.setAttribute("class", "de-flow");
      flow.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none;overflow:visible";
      flow.innerHTML = '<defs><marker id="de-fwd-head" markerWidth="7" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0,7 3,0 6" fill="' + _XRAY_DE.fwdArrowCol + '"/></marker></defs>' + '<path class="de-fwd-a" fill="none" stroke="' + _XRAY_DE.fwdArrowCol + '" stroke-width="3" stroke-linecap="round" opacity="0.85"/>' + '<path class="de-fwd-b" fill="none" stroke="' + _XRAY_DE.fwdArrowCol + '" stroke-width="3" stroke-linecap="round" opacity="0.9" marker-end="url(#de-fwd-head)"/>';
      de.appendChild(flow);
      de._deFlow = flow;
      var pb = document.createElement("div");
      pb.className = "de-ping-ball";
      de.appendChild(pb);
      de._dePing = pb;
      var occ = document.createElementNS(SVGNS, "svg");
      occ.setAttribute("class", "de-occ");
      occ.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;display:none;overflow:visible";
      de.appendChild(occ);
      de._deOcc = occ;
    }
    var ang = _xrayDeSideAngles(cfg);
    document.body.classList.toggle("de-angle-active", !!ang.dual);
    var _topo = de.closest(".topology");
    if (_topo) {
      if (ang.dual) {
        _topo.style.setProperty("padding-bottom", (_XRAY_DE.deCardPadBottomPx || 32) + "px", "important");
        _topo.style.setProperty("padding-top", (_XRAY_DE.deCardPadTopPx || 32) + "px", "important");
      } else {
        _topo.style.removeProperty("padding-bottom");
        _topo.style.removeProperty("padding-top");
      }
    }
    wL.style.transform = "rotate(" + ang.l + "deg)";
    wR.style.transform = "rotate(" + ang.r + "deg)";
    var zMode = _XRAY_DE.zMode;
    cyl.style.zIndex = zMode === "behind" ? 5 : 0;
    de.appendChild(cyl);
    var occ = de._deOcc;
    if (zMode === "split" || zMode === "split2") {
      occ.innerHTML = cyl.innerHTML;
      occ.setAttribute("viewBox", cyl.getAttribute("viewBox"));
      occ.setAttribute("preserveAspectRatio", "xMidYMid meet");
      occ.style.width = cyl.style.width;
      occ.style.height = cyl.style.height;
      occ.style.clipPath = zMode === "split" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)";
      occ.style.display = "block";
      de.appendChild(occ);
    } else {
      occ.style.display = "none";
    }
    try {
      var _cr = cyl.getBoundingClientRect(), _dr0 = de.getBoundingClientRect();
      var _cTop = _cr.top - _dr0.top, _cH = _cr.height;
      de.querySelectorAll(".de-ospf, .de-bgp-proc").forEach(function(el) {
        el.style.top = Math.round(_cTop + _cH * .16) + "px";
        el.style.zIndex = "7";
      });
    } catch (_e2) {}
    var der = de.getBoundingClientRect(), W = der.width, Hh = der.height, C = [ W / 2, Hh / 2 ];
    if (!W || !Hh) return;
    var connPt = function(deg, side) {
      var t = deg * Math.PI / 180, R = 62;
      return [ W / 2 + side * R * Math.cos(t), Hh / 2 + side * R * Math.sin(t) ];
    };
    var reachPt = function(deg, side) {
      var t = deg * Math.PI / 180, dx = side * Math.cos(t), dy = side * Math.sin(t);
      var mx = W * _XRAY_DE.beamReachMxFrac, my = Hh * _XRAY_DE.beamReachMyFrac, reach = Math.min(dx ? mx / Math.abs(dx) : 1e9, dy ? my / Math.abs(dy) : 1e9);
      return [ W / 2 + dx * reach, Hh / 2 + dy * reach ];
    };
    var _topoR = de.closest(".topology") ? de.closest(".topology").getBoundingClientRect() : null;
    var _visBottomLocal = _topoR ? Math.max(Hh, _topoR.bottom - der.top) : Hh;
    var visFar = function(deg, side) {
      var t = deg * Math.PI / 180, dx = side * Math.cos(t), dy = side * Math.sin(t);
      var reach = dy ? (_visBottomLocal - Hh / 2) / Math.abs(dy) : W * _XRAY_DE.beamReachMxFrac / (Math.abs(dx) || 1);
      return [ W / 2 + dx * reach, Hh / 2 + dy * reach ];
    };
    var _visEndDist = Math.round(Math.hypot(visFar(ang.r, 1)[0] - C[0], visFar(ang.r, 1)[1] - C[1]));
    var L = connPt(ang.l, -1), R = connPt(ang.r, 1);
    de._deCbL.style.left = L[0] + "px";
    de._deCbL.style.top = L[1] + "px";
    de._deCbR.style.left = R[0] + "px";
    de._deCbR.style.top = R[1] + "px";
    var outIsLeft = window._xrayFwdDirection === "left";
    var outDeg = outIsLeft ? ang.l : ang.r, outConn = outIsLeft ? L : R, outSide = outIsLeft ? -1 : 1, outFar = visFar(outDeg, outSide);
    var inDeg = outIsLeft ? ang.r : ang.l, inConn = outIsLeft ? R : L, inSide = outIsLeft ? 1 : -1, inFar = visFar(inDeg, inSide);
    var _nLink = s && s.interfaces ? Object.keys(s.interfaces).filter(function(k) {
      return k !== "lo";
    }).length : 0;
    var isTransit = !!window._xrayIsTransit && (ang.dual || _nLink >= 2);
    (outIsLeft ? de._deCbL : de._deCbR).style.display = "block";
    (outIsLeft ? de._deCbR : de._deCbL).style.display = ang.dual || isTransit ? "block" : "none";
    var reachR = Math.round(Math.hypot(reachPt(ang.r, 1)[0] - C[0], reachPt(ang.r, 1)[1] - C[1]));
    var reachL = Math.round(Math.hypot(reachPt(ang.l, -1)[0] - C[0], reachPt(ang.l, -1)[1] - C[1]));
    if (ang.dual) {
      var _bo = wR.querySelector(".de-beam.out"), _to = wR.querySelector("#de-tunnel-right");
      var _bi = wL.querySelector(".de-beam.in"), _ti = wL.querySelector("#de-tunnel-left");
      [ _bo, _bi ].forEach(function(e) {
        if (e) {
          e.style.removeProperty("left");
          e.style.removeProperty("right");
        }
      });
      [ _to, _ti ].forEach(function(e) {
        if (e) {
          e.style.removeProperty("left");
          e.style.removeProperty("right");
          e.style.transform = "translateY(-50%)";
        }
      });
    }
    var q = function(a, b, c) {
      return "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) + " Q" + b[0].toFixed(1) + " " + b[1].toFixed(1) + " " + c[0].toFixed(1) + " " + c[1].toFixed(1);
    };
    var mIn = [ (inConn[0] + C[0]) / 2, (inConn[1] + C[1]) / 2 ];
    var bx = C[0] + (outConn[0] - C[0]) * .82, by = C[1] + (outConn[1] - C[1]) * .82, B = [ bx, by ], mOut = [ (C[0] + bx) / 2, (C[1] + by) / 2 ];
    var _rr = s && s.route_resolution;
    var arrowOn = document.body.classList.contains("ping-ok") || !!(_rr && (_rr.out_iface || _rr.resolved));
    var pingReaches = document.body.classList.contains("ping-ok") || xrayIsCleared(s);
    var fa = de._deFlow.querySelector(".de-fwd-a"), fb = de._deFlow.querySelector(".de-fwd-b");
    fa.setAttribute("d", q(inConn, mIn, C));
    fa.style.display = arrowOn && isTransit ? "" : "none";
    fb.setAttribute("d", q(C, mOut, B));
    fb.style.display = arrowOn ? "" : "none";
    var g = de.querySelector("#de-cyl-fwd-arrow");
    if (g) g.style.display = "none";
    var pb = de._dePing;
    if (!pingReaches) {
      pb.style.display = "none";
    } else {
      pb.style.display = "block";
      var pts = isTransit ? [ inFar, inConn, C, outConn, outFar ] : [ C, outConn, outFar ];
      pb.style.offsetPath = "path('M" + pts.map(function(p) {
        return p[0].toFixed(1) + " " + p[1].toFixed(1);
      }).join(" L") + "')";
    }
    (function() {
      var _okf = document.getElementById("xray-de-hello-kf");
      if (!ang.dual) {
        if (_okf) _okf.remove();
        de._helloFarR = de._helloFarL = de._helloGeomKey = null;
        return;
      }
      var _gk = Math.round(W) + "x" + Math.round(Hh) + "x" + Math.round(_visEndDist);
      if (de._helloGeomKey !== _gk || !(de._helloFarR > 0) || !(de._helloFarL > 0)) {
        var _pScreen = function(pr) {
          if (!pr) return null;
          var r = pr.getBoundingClientRect();
          return Math.hypot(r.left + r.width / 2 - (der.left + C[0]), r.top + r.height / 2 - (der.top + C[1]));
        };
        var _margin = _XRAY_DE.helloEndScreenMarginPx != null ? _XRAY_DE.helloEndScreenMarginPx : 12;
        var _endScreen = Math.max(60, _visEndDist - _margin);
        var _local4screen = function(p1, p2, S) {
          var s1 = _pScreen(p1), s2 = _pScreen(p2);
          if (s1 == null || s2 == null || Math.abs(s2 - s1) < 1) return null;
          var a = (s2 - s1) / 400, b = s1 - a * 200;
          return a ? (S - b) / a : null;
        };
        var farRpx = _local4screen(de._probeR, de._probeR2, _endScreen);
        var farLpx = _local4screen(de._probeL, de._probeL2, _endScreen);
        if (!(farRpx > 0)) farRpx = reachR * 1.3;
        if (!(farLpx > 0)) farLpx = reachL * 1.3;
        de._helloFarR = Math.round(farRpx);
        de._helloFarL = Math.round(farLpx);
        de._helloGeomKey = _gk;
      }
    })();
    var rep = de.querySelector("#de-re-panel");
    if (rep) {
      rep.style.left = _XRAY_DE.rePanelLeft + "px";
      rep.style.right = "auto";
      rep.style.top = _XRAY_DE.rePanelTop + "px";
      rep.style.minHeight = _XRAY_DE.rePanelMinH;
    }
    var lsdb = de.querySelector("#de-lsdb");
    if (lsdb) {
      var _lg = window._xrayLsaGather;
      if (_lg && _lg.left && !_lg.right) {
        lsdb.style.right = "auto";
        lsdb.style.left = _XRAY_DE.lsdbRight;
        lsdb.style.transform = "none";
      } else {
        lsdb.style.left = "auto";
        lsdb.style.right = _XRAY_DE.lsdbRight;
        lsdb.style.transform = "none";
      }
    }
    if (ang.dual) {
      var tn = window._triNodes || {};
      var lId = tn.left || "", rId = tn.right || "";
      var lIf = s && s[lId + "_iface"] || "eth0", rIf = s && s[rId + "_iface"] || "eth1";
      var linkCol = "var(--xto-link,#00e5ff)", downCol = "#ef5350";
      var _ifUp = function(ifName) {
        return !(s && s.interfaces && s.interfaces[ifName] && s.interfaces[ifName].up === false);
      };
      var lCol = _ifUp(lIf) ? linkCol : downCol, rCol = _ifUp(rIf) ? linkCol : downCol;
      var placeMarker = function(selM, pt, col) {
        var m = de.querySelector(selM);
        if (m) {
          if (m.parentElement !== de) de.appendChild(m);
          m.style.left = pt[0].toFixed(1) + "px";
          m.style.right = "auto";
          m.style.top = pt[1].toFixed(1) + "px";
          m.style.transform = "translate(-50%,-50%)";
          m.style.borderColor = col;
        }
      };
      var placeLabel = function(selL, pt, txt, col) {
        var l = de.querySelector(selL);
        if (l) {
          if (l.parentElement !== de) de.appendChild(l);
          l.textContent = txt;
          l.style.display = "block";
          l.style.left = pt[0].toFixed(1) + "px";
          l.style.right = "auto";
          l.style.top = (pt[1] + _XRAY_DE.labelBelowOffsetPx).toFixed(1) + "px";
          l.style.transform = "translate(-50%,0)";
          l.style.textAlign = "center";
          l.style.whiteSpace = "nowrap";
          l.style.setProperty("color", col, "important");
          l.style.setProperty("text-shadow", "0 0 6px rgba(" + (col === downCol ? "239,83,80" : "0,229,255") + ",0.55)", "important");
          l.style.background = _XRAY_DE.deLabelChipBg || "rgba(6,16,26,0.85)";
          l.style.padding = "1px 7px";
          l.style.borderRadius = "4px";
          l.style.zIndex = "12";
        }
      };
      var Lp = reachPt(ang.l, -1), Rp = reachPt(ang.r, 1);
      placeMarker(".de-if-marker.left", Lp, lCol);
      placeMarker(".de-if-marker.right", Rp, rCol);
      placeLabel(".de-label.in", Lp, lIf + " - " + lId, lCol);
      placeLabel(".de-label.out", Rp, rIf + " - " + rId, rCol);
      var _rgb = function(col) {
        return col === downCol ? "239,83,80" : "0,229,255";
      };
      var ballBg = function(col) {
        return "radial-gradient(circle,#fff,rgba(" + _rgb(col) + ",0.95))";
      };
      if (de._deCbL) {
        de._deCbL.style.background = ballBg(lCol);
        de._deCbL.style.boxShadow = "0 0 12px rgba(" + _rgb(lCol) + ",0.9)";
      }
      if (de._deCbR) {
        de._deCbR.style.background = ballBg(rCol);
        de._deCbR.style.boxShadow = "0 0 12px rgba(" + _rgb(rCol) + ",0.9)";
      }
    }
  } catch (_e) {}
}

function xrayRenderDeepEngine(config, activeTargetId) {
  var nodes = config.nodes || [];
  var targetNode;
  if (activeTargetId) {
    targetNode = nodes.find(function(n) {
      return n.id === activeTargetId;
    });
  }
  if (!targetNode && !activeTargetId && window._xrayTargetNode) {
    var _sotId = String(window._xrayTargetNode).replace("topo-node-", "");
    targetNode = nodes.find(function(n) {
      return n.id === _sotId;
    });
  }
  if (!targetNode) {
    var xrayDt = config.xray && config.xray.deep_targets || null;
    if (Array.isArray(xrayDt) && xrayDt.length > 0) {
      var _defId = xrayDt[0];
      targetNode = nodes.find(function(n) {
        return n.id === _defId;
      });
    }
  }
  if (!targetNode) {
    targetNode = nodes.find(function(n) {
      return n.target;
    }) || nodes[0] || {
      id: "r1"
    };
  }
  var nodeId = targetNode.id;
  var xray = config.xray || {};
  var protocol = xray.protocol || "static";
  var isOspf = protocol === "ospf";
  var isBgp = protocol === "bgp";
  var otherNodes = nodes.filter(function(n) {
    return n.id !== nodeId;
  });
  var otherLabel = otherNodes.length > 0 ? otherNodes[0].id : "?";
  var isTriangle = (config.topology_type === "triangle" || _xrayIsDualLinkApexLayout(config)) && otherNodes.length >= 2;
  var leftNode = isTriangle ? otherNodes[0] : null;
  var rightNode = isTriangle ? otherNodes[1] : null;
  var html = '<button class="xray-focus-close" onclick="closeXrayDeep()">&#10005; Close</button>';
  html += '<svg class="de-box-svg" viewBox="0 0 1200 700" preserveAspectRatio="none">';
  html += '<rect x="200" y="140" width="800" height="420" stroke="rgba(57,255,20,0.2)" stroke-width="1.5" fill="none"/>';
  html += '<line x1="20" y1="10" x2="200" y2="140" stroke="rgba(57,255,20,0.22)" stroke-width="1"/>';
  html += '<line x1="1180" y1="10" x2="1000" y2="140" stroke="rgba(57,255,20,0.22)" stroke-width="1"/>';
  html += '<line x1="20" y1="690" x2="200" y2="560" stroke="rgba(57,255,20,0.22)" stroke-width="1"/>';
  html += '<line x1="1180" y1="690" x2="1000" y2="560" stroke="rgba(57,255,20,0.22)" stroke-width="1"/>';
  html += '<rect x="20" y="10" width="1160" height="680" stroke="rgba(57,255,20,0.5)" stroke-width="2" fill="none"/>';
  html += "</svg>";
  html += '<div class="de-if-marker left"></div><div class="de-if-marker right"></div>';
  html += '<div class="de-r1-label"><div class="de-r1-name">' + nodeId + "</div>";
  html += '<div class="de-r1-sub">Gateway Router &#8212; Internal View</div></div>';
  html += '<div class="de-loading-ind"><span class="de-load-spin"></span><span class="de-load-txt">解析中&#8230;</span></div>';
  if (isTriangle) {
    html += '<div class="de-beam in"></div>';
    html += '<div class="de-beam out"></div>';
  } else {
    html += '<div class="de-beam in"></div>';
    html += '<div class="de-beam out"></div>';
  }
  if (isOspf || isBgp) {
    if (isTriangle) {
      var _protoLabel = isBgp ? "BGP" : "OSPF";
      html += '<div class="de-tunnel left-side" id="de-tunnel-left"><div class="de-tunnel-wall top"></div><div class="de-tunnel-wall bot"></div>';
      html += '<div class="de-tunnel-fill"></div><div class="de-tunnel-label">' + _protoLabel + " &#8212; " + leftNode.id + "</div></div>";
      html += '<div class="de-tunnel" id="de-tunnel-right"><div class="de-tunnel-wall top"></div><div class="de-tunnel-wall bot"></div>';
      html += '<div class="de-tunnel-fill"></div><div class="de-tunnel-label">' + _protoLabel + " &#8212; " + rightNode.id + "</div></div>";
    } else {
      var _linearLabel = isBgp ? "BGP SESSION" : "OSPF ADJACENCY";
      var _deInner = '<div class="de-tunnel-inner"><div class="de-tunnel-wall top"></div><div class="de-tunnel-wall bot"></div></div>';
      html += '<div class="de-tunnel left-side"><div class="de-tunnel-wall top"></div><div class="de-tunnel-wall bot"></div>';
      html += '<div class="de-tunnel-fill"></div>' + _deInner + '<div class="de-tunnel-label">' + _linearLabel + "</div></div>";
      html += '<div class="de-tunnel"><div class="de-tunnel-wall top"></div><div class="de-tunnel-wall bot"></div>';
      html += '<div class="de-tunnel-fill"></div>' + _deInner + '<div class="de-tunnel-label">' + _linearLabel + "</div></div>";
    }
  }
  if (isTriangle) {
    html += '<div class="de-energy el"></div>';
    html += '<div class="de-energy er"></div>';
    html += '<div class="de-label in">' + leftNode.id + ": ...</div>";
    html += '<div class="de-label out">' + rightNode.id + ": ...</div>";
  } else {
    html += '<div class="de-energy el"></div>';
    html += '<div class="de-energy er"></div>';
    html += '<div class="de-label in">Input: ...</div>';
    html += '<div class="de-label out">Output: ...</div>';
  }
  html += '<div class="de-packet"></div><div class="de-packet p2"></div>';
  html += '<div class="de-ping-orb" id="de-ping-req"></div><div class="de-ping-orb reply" id="de-ping-rep"></div>';
  html += '<div class="de-ping-orb left-req"></div><div class="de-ping-orb left-rep"></div>';
  if (isOspf || isBgp) {
    html += '<div class="de-hello-orb out"></div><div class="de-hello-orb in"></div>';
    html += '<div class="de-hello-orb left-out"></div><div class="de-hello-orb left-in"></div>';
  }
  var _fwdDir0 = window._xrayFwdDirection;
  if (!_fwdDir0) {
    var _rr0 = window._lastXrayState && window._lastXrayState.route_resolution || {};
    if (window._xrayPingMode === "cylinder-to-left") {
      _fwdDir0 = "left";
    } else if (isTriangle && leftNode && window._lastXrayState && _rr0.out_iface) {
      var _lanIf0 = window._lastXrayState[leftNode.id + "_iface"];
      if (_lanIf0) _fwdDir0 = _rr0.out_iface === _lanIf0 ? "left" : "right";
    }
  }
  html += _xrayDeCylSvg(_XRAY_DE.cylHeightFrac, _fwdDir0);
  if (isOspf) {
    html += '<div class="de-ospf"><div class="de-ospf-core"><div class="inner"></div></div><div class="de-ospf-label">OSPF</div></div>';
    html += '<div class="de-lsdb" id="de-lsdb"><div class="lsdb-hd">LSDB</div><div class="lsdb-bar"><div class="lsdb-bar-fill" id="de-lsdb-fill"></div></div></div>';
    html += '<div class="de-lsa-container" id="de-lsa-container"></div>';
  } else if (isBgp) {
    html += '<div class="de-bgp-proc"><div class="de-bgp-proc-core"><div class="inner"></div></div><div class="de-bgp-proc-label">BGP</div></div>';
  }
  if (xray.deep_coexist_ospf) {
    html += '<div class="de-ospf de-ospf-coexist"><div class="de-ospf-core"><div class="inner"></div></div><div class="de-ospf-label">OSPF</div></div>';
  }
  html += '<div class="de-panel" id="de-re-panel"></div>';
  return html;
}

function xrayRenderExplanation(explanation) {
  if (!explanation) return "";
  var html = '<h3>&#x1F4D6; 解説</h3><div class="explanation-content">';
  if (explanation.cause) {
    html += "<h4>原因</h4><p>" + explanation.cause + "</p>";
  }
  if (explanation.concept_title && explanation.concept) {
    html += "<h4>" + explanation.concept_title + "</h4><p>" + explanation.concept + "</p>";
  }
  if (explanation.fix_commands) {
    html += "<h4>解決方法</h4>";
    if (explanation.fix_note) html += "<p>" + explanation.fix_note + "</p>";
    html += '<div class="cmd-group">';
    html += '<div class="cmd-tabs">';
    html += '<button class="cmd-tab active" data-platform="frr" onclick="switchCmd(this)">FRR</button>';
    html += '<button class="cmd-tab" data-platform="cisco" onclick="switchCmd(this)">Cisco IOS</button>';
    html += "</div>";
    html += '<pre class="code-block cmd-code frr">' + _escapeHtml(explanation.fix_commands) + "</pre>";
    if (explanation.cisco_fix_commands) {
      html += '<pre class="code-block cmd-code cisco" style="display:none">' + _escapeHtml(explanation.cisco_fix_commands) + "</pre>";
    }
    html += "</div>";
  }
  if (explanation.fix_alt) {
    html += '<p style="margin-top:8px;font-size:13px;color:#aaa;line-height:1.8">' + explanation.fix_alt + "</p>";
  }
  if (explanation.verify_commands) {
    html += "<h4>確認コマンド</h4>";
    html += '<div class="cmd-group">';
    html += '<div class="cmd-tabs">';
    html += '<button class="cmd-tab active" data-platform="frr" onclick="switchCmd(this)">FRR</button>';
    html += '<button class="cmd-tab" data-platform="cisco" onclick="switchCmd(this)">Cisco IOS</button>';
    html += "</div>";
    html += '<pre class="code-block cmd-code frr">' + _escapeHtml(explanation.verify_commands) + "</pre>";
    if (explanation.cisco_verify_commands) {
      html += '<pre class="code-block cmd-code cisco" style="display:none">' + _escapeHtml(explanation.cisco_verify_commands) + "</pre>";
    }
    html += "</div>";
  }
  if (explanation.learnings && explanation.learnings.length > 0) {
    html += "<h4>学んだこと</h4><ul>";
    for (var i = 0; i < explanation.learnings.length; i++) {
      html += "<li>" + explanation.learnings[i] + "</li>";
    }
    html += "</ul>";
  }
  html += "</div>";
  return html;
}

function xrayRenderRoutingTable(config) {
  var nets = (config.capture || {}).nets || [ "net-link" ];
  var html = '<div class="capture-header" onclick="toggleCapture()">';
  html += '<h3 style="cursor:pointer">Routing Table</h3>';
  html += '<button class="btn capture-btn" id="ping-capture-btn" onclick="event.stopPropagation();fetchRoutingTable()" style="padding:6px 14px;font-size:13px">Refresh</button>';
  html += '<span class="capture-status" id="capture-status" style="font-size:11px;color:#888"></span>';
  html += '<div class="capture-header-spacer"></div>';
  html += '<div class="capture-zoom"><button onclick="event.stopPropagation();captureZoom(-1)" title="縮小">−</button><span id="capture-zoom-level">100%</span><button onclick="event.stopPropagation();captureZoom(1)" title="拡大">+</button></div>';
  html += '<span class="capture-toggle" id="capture-toggle" style="cursor:pointer">▼</span>';
  html += "</div>";
  html += '<div class="capture-body" id="capture-body">';
  html += '<div class="capture-tabs">';
  html += '<button class="tab-btn active" id="tab-btn-flow" onclick="switchTab(\'visual\')">ルート可視化</button>';
  html += '<button class="tab-btn" id="tab-btn-raw" onclick="switchTab(\'raw\')">show ip route</button>';
  html += '<button class="tab-btn" onclick="switchTab(\'nexthop\')">Next-hop 検証</button>';
  html += '<button class="tab-btn" id="compare-tab-btn" onclick="switchTab(\'compare\')">復旧差分レポート</button>';
  html += '<button class="tab-btn" id="realtime-tab-btn" onclick="switchTab(\'realtime\')">リアルタイムキャプチャ</button>';
  html += "</div>";
  html += '<div class="tab-content active" id="tab-visual">';
  html += '<div id="route-visual-content" style="padding:10px"><div style="text-align:center;color:#666;padding:20px">[Refresh] を押してルーティングテーブルを取得してください</div></div>';
  html += "</div>";
  html += '<div class="tab-content" id="tab-raw">';
  html += '<div id="route-raw-content" style="font-family:monospace;font-size:12px;white-space:pre-wrap;color:#b0bec5;padding:10px;background:var(--rc-topo-iface-bg);border-radius:4px;max-height:400px;overflow-y:auto">[Refresh] を押すと show ip route の出力が表示されます</div>';
  html += "</div>";
  html += '<div class="tab-content" id="tab-nexthop">';
  html += '<div id="nexthop-content" style="padding:10px"><div style="text-align:center;color:#666;padding:20px">[Refresh] を押して Next-hop の到達性を確認してください</div></div>';
  html += "</div>";
  html += '<div class="tab-content" id="tab-compare">';
  html += '<div class="state-compare-container" id="compare-container" style="padding:10px"><div style="text-align:center;color:#666;padding:20px">まず [Refresh] でルーティングテーブルを取得し、修復後にもう一度 [Refresh] を実行すると差分が表示されます。</div></div>';
  html += "</div>";
  html += '<div class="tab-content" id="tab-realtime">';
  html += '<div class="rt-capture-container">';
  for (var ni = 0; ni < nets.length; ni++) {
    var net = nets[ni];
    html += '<div class="rt-capture-panel"><div class="rt-capture-header">';
    html += '<span class="rt-net-label">' + net + "</span>";
    html += '<input class="rt-filter-input" id="rt-filter-' + net + '" type="text" placeholder="filter" maxlength="80">';
    html += '<button class="rt-capture-btn start" id="rt-btn-' + net + '" onclick="startRealtimeCapture(\'' + net + "')\">Capture Start</button>";
    html += '<span class="rt-status-msg" id="rt-status-' + net + '"></span>';
    html += '</div><div class="rt-packets" id="rt-packets-' + net + '"><div class="rt-empty">Capture Start を押すとパケットがリアルタイム表示されます</div></div></div>';
  }
  html += "</div>";
  html += '<div class="rt-files-section"><h4>Capture Files</h4><div id="rt-file-list"><div class="rt-no-files">キャプチャファイルはまだありません</div></div></div>';
  html += "</div>";
  html += "</div>";
  return html;
}

function xrayRenderCapture(config) {
  var _isOspfProto = config.xray && config.xray.protocol === "ospf" || config.capture && config.capture.capture_ospf;
  var toolType = config.tool_type || (_isOspfProto ? "ospf-capture" : "ping-capture");
  if (toolType === "routing-table") return xrayRenderRoutingTable(config);
  var capture = config.capture || {};
  var nodes = config.nodes || [];
  var nets = capture.nets || [ "net-link" ];
  var lanes = capture.lanes || {};
  var _captNet = (config.networks || []).find(function(net) {
    return nets.indexOf(net.name) !== -1;
  });
  var _captMembers = _captNet ? _captNet.members.map(function(m) {
    return m.node;
  }) : [];
  var targetNode, otherNodes;
  if (_captMembers.length >= 2) {
    var _captRouter = (capture.capture_routers || {})[nets[0]];
    targetNode = nodes.find(function(n) {
      return n.id === _captRouter;
    }) || nodes.find(function(n) {
      return n.target;
    }) || nodes[0] || {
      id: "r1"
    };
    otherNodes = _captMembers.filter(function(id) {
      return id !== targetNode.id;
    }).map(function(id) {
      return nodes.find(function(n) {
        return n.id === id;
      }) || {
        id: id
      };
    });
  } else {
    targetNode = nodes.find(function(n) {
      return n.target;
    }) || nodes[0] || {
      id: "r1"
    };
    otherNodes = nodes.filter(function(n) {
      return !n.target;
    });
  }
  var html = '<div class="capture-header">';
  var _capTitle = _isOspfProto ? "OSPF Capture" : "Ping &amp; Capture";
  html += '<h3 onclick="toggleCapture()" style="cursor:pointer">' + _capTitle + "</h3>";
  var _btnLabel = _isOspfProto ? "Capture Go!" : "Ping Go!";
  html += '<button class="btn capture-btn" id="ping-capture-btn" onclick="captureGo()" style="padding:6px 14px;font-size:13px">' + _btnLabel + "</button>";
  html += '<span class="capture-status" id="capture-status" style="font-size:11px;color:#888"></span>';
  html += '<div class="capture-header-spacer"></div>';
  html += '<div class="capture-zoom"><button onclick="captureZoom(-1)" title="縮小">−</button>';
  html += '<span id="capture-zoom-level">100%</span>';
  html += '<button onclick="captureZoom(1)" title="拡大">+</button></div>';
  html += '<span class="capture-toggle" id="capture-toggle" onclick="toggleCapture()" style="cursor:pointer">▼</span>';
  html += "</div>";
  var isOspf = config.xray && config.xray.protocol === "ospf" || config.capture && config.capture.capture_ospf;
  html += '<div class="capture-body" id="capture-body">';
  html += '<div class="capture-tabs">';
  if (isOspf) {
    html += '<button class="tab-btn active" id="tab-btn-flow" onclick="switchTab(\'hello\')">Hello 観測</button>';
    html += '<button class="tab-btn" id="tab-btn-raw" onclick="switchTab(\'raw\')">パケット（詳細）</button>';
  } else {
    html += '<button class="tab-btn active" id="tab-btn-flow" onclick="switchTab(\'flow\')">通信フロー</button>';
    html += '<button class="tab-btn" id="tab-btn-raw" onclick="switchTab(\'raw\')">パケット（詳細）</button>';
  }
  html += '<button class="tab-btn" id="compare-tab-btn" onclick="switchTab(\'compare\')">復旧差分レポート</button>';
  html += '<button class="tab-btn" id="realtime-tab-btn" onclick="switchTab(\'realtime\')">リアルタイムキャプチャ</button>';
  html += "</div>";
  if (isOspf) {
    html += '<div class="tab-content active" id="tab-hello">';
    html += '<div class="ospf-topo"><div class="ospf-topo-nodes" id="ospf-topo-nodes" style="position:relative">';
    html += '<div class="ospf-topo-node"><div class="ospf-node-box' + (targetNode.target ? " target" : "") + '">' + targetNode.id + "</div>";
    html += '<div class="ospf-node-status"><div class="ospf-status-item"><span class="status-label">Hello送信</span> <span class="status-icon" id="' + targetNode.id + '-hello-icon"></span></div></div></div>';
    html += '<div class="ospf-topo-arrow" id="ospf-arrow" style="visibility:hidden">';
    html += '<div class="arrow-shaft"></div><div class="arrow-dst">224.0.0.5</div><div class="arrow-label">OSPF Hello</div></div>';
    if (otherNodes.length > 0) {
      html += '<div class="ospf-topo-node"><div class="ospf-node-box">' + otherNodes[0].id + "</div></div>";
    }
    html += '<div class="measuring-overlay" id="measuring-overlay" style="display:none">';
    html += '<div class="measuring-text">計測中</div><div class="measuring-dots"><span>.</span><span>.</span><span>.</span></div></div>';
    html += "</div></div>";
    html += '<div class="ospf-card" id="ospf-card"><div class="ospf-card-body">';
    html += '<div class="ospf-metric" id="ospf-hello-metric"><div class="value" id="ospf-hello-count">-</div>';
    html += '<div class="label">' + targetNode.id + " の Hello パケット送信数</div></div>";
    html += '<div class="ospf-message" id="ospf-message">Capture Go! を押してキャプチャを開始してください</div>';
    html += '</div><div class="ospf-extra" id="ospf-extra" style="display:none"></div></div>';
    html += "</div>";
    html += '<div class="tab-content" id="tab-raw">';
    html += '<div class="raw-container" style="position:relative">';
    html += '<div class="raw-col"><div class="raw-col-header" style="color:#26c6da">OSPF パケット (' + nets[0] + ")</div>";
    html += '<div class="raw-col-body" id="raw-col-ospf"><div class="raw-empty">キャプチャ実行後にパケットが表示されます</div></div></div>';
    html += '<div class="measuring-overlay" id="measuring-overlay-raw" style="display:none">';
    html += '<div class="measuring-text">計測中</div><div class="measuring-dots"><span>.</span><span>.</span><span>.</span></div></div>';
    html += "</div></div>";
  } else {
    html += '<div class="tab-content active" id="tab-flow">';
    html += '<div class="topo-flow" id="topo-flow"><div class="topo-flow-nodes" id="current-flow">';
    var flowNodes = nodes.filter(function(n) {
      return !n.readonly;
    });
    var allNetworks = config.networks || [];
    for (var fi = 0; fi < flowNodes.length; fi++) {
      var fn = flowNodes[fi];
      var fcls = fn.type === "server" ? "server" : fn.type === "isp" ? "isp" : "router";
      html += '<div class="topo-flow-node ' + fcls + '">' + fn.id.toUpperCase() + "</div>";
      if (fi < flowNodes.length - 1) {
        if (fi < nets.length) {
          var segNet = nets[fi];
          var segId = segNet.replace("net-", "");
          html += '<div class="topo-flow-segment" id="seg-' + segId + '">';
          html += '<div class="seg-label">' + segNet + "</div>";
          html += '<div class="seg-arrow req"><span class="arrow-line">---&gt;</span> <span class="seg-count" id="' + segId + '-req">-</span></div>';
          html += '<div class="seg-arrow rep"><span class="arrow-line">&lt;---</span> <span class="seg-count" id="' + segId + '-rep">-</span></div>';
          html += "</div>";
        } else {
          var fromId = flowNodes[fi].id;
          var toId = flowNodes[fi + 1].id;
          var foundNet = null;
          for (var ni = 0; ni < allNetworks.length; ni++) {
            var anet = allNetworks[ni];
            if (!anet.members || anet.members.length !== 2) continue;
            var hasFrom = anet.members.some(function(m) {
              return m.node === fromId;
            });
            var hasTo = anet.members.some(function(m) {
              return m.node === toId;
            });
            if (hasFrom && hasTo) {
              foundNet = anet.name;
              break;
            }
          }
          var placeholderNet = foundNet || "net-" + fromId + toId;
          html += '<div class="topo-flow-segment not-captured" style="opacity:0.55">';
          html += '<div class="seg-label">' + placeholderNet + "</div>";
          html += '<div class="seg-arrow req"><span class="arrow-line">---&gt;</span> <span class="seg-count pending" style="color:#78909c">未観測</span></div>';
          html += '<div class="seg-arrow rep"><span class="arrow-line">&lt;---</span> <span class="seg-count pending" style="color:#78909c">未観測</span></div>';
          html += "</div>";
        }
      }
    }
    var roNodes = nodes.filter(function(n) {
      return n.readonly;
    });
    if (roNodes.length > 0 && nets.length > flowNodes.length - 1) {
      var lastNet = nets[nets.length - 1] || "net-wan";
      var lastId = lastNet.replace("net-", "");
      html += '<div class="topo-flow-segment" id="seg-' + lastId + '">';
      html += '<div class="seg-label">' + lastNet + "</div>";
      html += '<div class="seg-arrow req"><span class="arrow-line">---&gt;</span> <span class="seg-count" id="' + lastId + '-req">-</span></div>';
      html += '<div class="seg-arrow rep"><span class="arrow-line">&lt;---</span> <span class="seg-count" id="' + lastId + '-rep">-</span></div>';
      html += "</div>";
      html += '<div class="topo-flow-node isp">' + roNodes[0].id.toUpperCase() + "</div>";
    }
    html += "</div></div>";
    html += '<div id="before-after-flow" class="before-after-split" style="display:none"></div>';
    html += "</div>";
    html += '<div class="tab-content" id="tab-raw">';
    html += '<div id="packet-summary" style="display:none"></div>';
    html += '<div class="raw-container" id="current-raw"><div class="raw-2col">';
    for (var ri = 0; ri < nets.length; ri++) {
      var rNet = nets[ri];
      var rLabel = lanes[rNet] || rNet;
      html += '<div class="raw-col"><div class="raw-col-header">' + rNet + "</div>";
      html += '<div class="raw-col-body" id="raw-col-' + rNet.replace("net-", "") + '"><div class="raw-empty">-</div></div></div>';
    }
    html += "</div></div>";
    html += '<div id="before-after-raw" class="before-after-split" style="display:none"></div>';
    html += "</div>";
  }
  html += '<div class="tab-content" id="tab-compare">';
  html += '<div class="state-compare-container" id="compare-container">';
  html += '<div style="padding:20px;text-align:center;color:#666;line-height:1.8">まず [Capture Go!] でキャプチャを取得し、修復後にもう一度 [Capture Go!] を実行すると差分が表示されます。</div>';
  html += "</div></div>";
  html += '<div class="tab-content" id="tab-realtime">';
  html += '<div class="rt-capture-container">';
  for (var ni = 0; ni < nets.length; ni++) {
    var net = nets[ni];
    var lane = lanes[net] || net.replace("net-", "").toUpperCase();
    html += '<div class="rt-capture-panel"><div class="rt-capture-header">';
    html += '<span class="rt-net-label">' + lane + "</span>";
    html += '<input class="rt-filter-input" id="rt-filter-' + net + '" type="text" placeholder="filter (e.g. icmp, port 80)" maxlength="80">';
    html += '<button class="rt-capture-btn start" id="rt-btn-' + net + '" onclick="startRealtimeCapture(\'' + net + "')\">Capture Start</button>";
    html += '<span class="rt-status-msg" id="rt-status-' + net + '"></span></div>';
    html += '<div class="rt-packets" id="rt-packets-' + net + '"><div class="rt-empty">Capture Start を押すとパケットがリアルタイム表示されます</div></div></div>';
  }
  html += "</div>";
  html += '<div class="rt-files-section"><h4>Capture Files</h4><div id="rt-file-list"><div class="rt-no-files">キャプチャファイルはまだありません</div></div></div>';
  html += "</div>";
  html += "</div>";
  return html;
}

function _xrayCaptureCfg() {
  var cfg = window._scenarioConfig || {};
  var cap = cfg.capture || {};
  return {
    nets: cap.nets || [ "net-lan", "net-wan" ],
    lanes: cap.lanes || {
      "net-lan": "LAN",
      "net-wan": "WAN"
    },
    nodes: cfg.nodes || []
  };
}

window.xraySetSegCount = function(id, count, total) {
  var el = document.getElementById(id);
  if (!el) return;
  var ok = count > 0;
  var d = Math.min(count, total);
  el.textContent = d + "/" + total + (ok ? " ✔" : " ✖");
  el.className = "seg-count " + (ok ? "ok" : "fail");
  var arrow = el.closest && el.closest(".seg-arrow");
  if (arrow) {
    var line = arrow.querySelector(".arrow-line");
    if (line) {
      if (ok) line.classList.add("active"); else line.classList.remove("active");
    }
  }
};

window.xrayUpdateFlowCounts = function(events, status) {
  if (!events) return;
  var c = _xrayCaptureCfg();
  var total = status && status.ping_total || 10;
  var counts = {};
  c.nets.forEach(function(n) {
    counts[n] = {
      req: 0,
      rep: 0
    };
  });
  events.forEach(function(e) {
    if (e.ok === false) return;
    var net = c.nets.find(function(n) {
      return c.lanes[n] === e.lane;
    });
    if (net && (e.direction === "req" || e.direction === "rep")) {
      counts[net][e.direction]++;
    }
  });
  c.nets.forEach(function(n) {
    var id = n.replace("net-", "");
    window.xraySetSegCount(id + "-req", counts[n].req, total);
    window.xraySetSegCount(id + "-rep", counts[n].rep, total);
  });
};

window.xrayResetFlowCounts = function() {
  var c = _xrayCaptureCfg();
  c.nets.forEach(function(n) {
    var id = n.replace("net-", "");
    [ "req", "rep" ].forEach(function(d) {
      var el = document.getElementById(id + "-" + d);
      if (el) {
        el.textContent = "-";
        el.className = "seg-count pending";
      }
    });
  });
};

window.xrayResetArrowColors = function() {
  document.querySelectorAll(".arrow-line").forEach(function(el) {
    el.classList.remove("active");
  });
};

window.xrayBuildRawSummary = function(packets) {
  var c = _xrayCaptureCfg();
  var focusNet = c.nets[c.nets.length - 1];
  var focusLane = c.lanes[focusNet] || focusNet;
  var routerLabel = "r1 (" + focusLane + ")";
  if (!packets || packets.length === 0) {
    return "📡 " + routerLabel + " でパケットは観測されませんでした";
  }
  var focusPkts = packets.filter(function(p) {
    return p.net === focusNet;
  });
  if (focusPkts.length === 0) {
    return "📡 " + routerLabel + " でパケットは観測されませんでした";
  }
  var bgpPkts = focusPkts.filter(function(p) {
    return p.proto === "BGP" || p.proto === "TCP";
  });
  var ospfPkts = focusPkts.filter(function(p) {
    return p.proto === "OSPF";
  });
  var arpPkts = focusPkts.filter(function(p) {
    return p.proto === "ARP";
  });
  var extra = "";
  if (bgpPkts.length) {
    var hasSyn = bgpPkts.some(function(p) {
      return p.raw_line && p.raw_line.indexOf("[S]") !== -1;
    });
    extra += " ／ 🔗 BGP(TCP179) " + bgpPkts.length + " 件" + (hasSyn ? "（SYN 観測）" : "");
  }
  if (ospfPkts.length) extra += " ／ 🌐 OSPF " + ospfPkts.length + " 件";
  if (arpPkts.length) {
    var arpHasReply = arpPkts.some(function(p) {
      return (p.icmp_type || "").indexOf("reply") !== -1;
    });
    extra += " ／ 📨 ARP " + arpPkts.length + " 件" + (arpHasReply ? "" : "（応答なし）");
  }
  var icmpPkts = focusPkts.filter(function(p) {
    return p.proto === "ICMP";
  });
  var hasReq = icmpPkts.some(function(p) {
    return p.raw_line && (p.raw_line.indexOf("request") !== -1 || p.raw_line.indexOf("echo request") !== -1);
  });
  var hasRep = icmpPkts.some(function(p) {
    return p.raw_line && (p.raw_line.indexOf("reply") !== -1 || p.raw_line.indexOf("echo reply") !== -1);
  });
  var base;
  if (!icmpPkts.length) base = "📡 " + routerLabel + " で ICMP は観測されませんでした"; else if (hasReq && hasRep) base = "📡 " + routerLabel + " で ICMP Echo Request/Reply が観測されました"; else if (hasReq) base = "📡 " + routerLabel + " で ICMP Echo Request のみ観測（Reply なし）"; else base = "📡 " + routerLabel + " で ICMP パケットが " + icmpPkts.length + " 件観測されました";
  return base + extra;
};

function _xrayRenderPacketsToCol(pkts) {
  if (!pkts || pkts.length === 0) return '<div class="raw-empty">-</div>';
  return pkts.map(function(p) {
    var ts = new Date(p.ts * 1e3).toLocaleTimeString("ja-JP", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 1
    });
    var proto = p.proto || "ICMP";
    if (proto === "OSPF" || proto === "BGP" || proto === "TCP") {
      var cls = proto === "OSPF" ? "ospf" : "bgp";
      var body = (p.raw_line || "").replace(/^\S+\s+IP\s+/, "");
      body = body.replace(/Flags\s+\[S\]/g, '<span style="color:#e74c3c;font-weight:bold">Flags [S]</span>');
      return '<div class="raw-line ' + cls + '"><span class="raw-ts">' + ts + "</span>" + '<span class="raw-dir" style="font-weight:bold;min-width:3.2em">' + proto + "</span>" + body + "</div>";
    }
    if (proto === "ARP") {
      var arpBody = (p.raw_line || "").replace(/^\S+\s+/, "").replace(/Ethernet \(len \d+\), IPv4 \(len \d+\), /, "");
      return '<div class="raw-line arp"><span class="raw-ts">' + ts + "</span>" + '<span class="raw-dir" style="font-weight:bold;min-width:3.2em">ARP</span>' + arpBody + "</div>";
    }
    var isReq = p.raw_line && (p.raw_line.indexOf("request") !== -1 || p.raw_line.indexOf("echo request") !== -1);
    var dir = isReq ? "req" : "rep";
    var dirLabel = isReq ? "→" : "←";
    var body = (p.raw_line || "").replace(/.*ICMP\s*/, "");
    return '<div class="raw-line ' + dir + '"><span class="raw-ts">' + ts + '</span><span class="raw-dir ' + dir + '">' + dirLabel + "</span>" + body + "</div>";
  }).join("");
}

window.xrayRenderRawPackets = function(packets) {
  var c = _xrayCaptureCfg();
  var summaryEl = document.getElementById("packet-summary");
  document.querySelectorAll("#tab-raw .raw-col-body").forEach(function(el) {
    el.innerHTML = '<div class="raw-empty">-</div>';
  });
  if (!packets || packets.length === 0) {
    if (summaryEl) summaryEl.style.display = "none";
    return;
  }
  var viewPkts = packets.slice();
  if (summaryEl) {
    summaryEl.innerHTML = window.xrayBuildRawSummary(packets);
    summaryEl.style.display = "block";
  }
  c.nets.forEach(function(n) {
    var id = n.replace("net-", "");
    var col = document.getElementById("raw-col-" + id);
    if (!col) return;
    var pkts = viewPkts.filter(function(p) {
      return p.net === n;
    });
    col.innerHTML = _xrayRenderPacketsToCol(pkts);
    col.scrollTop = col.scrollHeight;
  });
};

window.xrayBuildRawHTML = function(packets) {
  var c = _xrayCaptureCfg();
  var result = {};
  c.nets.forEach(function(n) {
    var id = n.replace("net-", "");
    if (!packets || packets.length === 0) {
      result[id] = '<div class="raw-empty">-</div>';
      return;
    }
    var pkts = packets.filter(function(p) {
      return p.net === n;
    });
    result[id] = _xrayRenderPacketsToCol(pkts);
  });
  return result;
};

window.xrayBuildFlowHTML = function(flowData) {
  if (!flowData || !flowData.events) return '<div style="color:#555;padding:10px">データなし</div>';
  var c = _xrayCaptureCfg();
  var total = flowData.status && flowData.status.ping_total || 10;
  var counts = {};
  c.nets.forEach(function(n) {
    counts[n] = {
      req: 0,
      rep: 0
    };
  });
  flowData.events.forEach(function(e) {
    if (e.ok === false) return;
    var net = c.nets.find(function(n) {
      return c.lanes[n] === e.lane;
    });
    if (net && (e.direction === "req" || e.direction === "rep")) {
      counts[net][e.direction]++;
    }
  });
  function fmtCount(cnt, t) {
    var ok = cnt > 0;
    var d = Math.min(cnt, t);
    return '<span class="seg-count ' + (ok ? "ok" : "fail") + '">' + d + "/" + t + (ok ? " ✔" : " ✖") + "</span>";
  }
  function arrowCls(cnt) {
    return cnt > 0 ? "arrow-line active" : "arrow-line";
  }
  function segHTML(segNet) {
    var cnt = counts[segNet] || {
      req: 0,
      rep: 0
    };
    return '<div class="topo-flow-segment"><div class="seg-label">' + segNet + "</div>" + '<div class="seg-arrow req"><span class="' + arrowCls(cnt.req) + '">---&gt;</span> ' + fmtCount(cnt.req, total) + "</div>" + '<div class="seg-arrow rep"><span class="' + arrowCls(cnt.rep) + '">&lt;---</span> ' + fmtCount(cnt.rep, total) + "</div>" + "</div>";
  }
  function placeholderSegHTML(netName) {
    return '<div class="topo-flow-segment not-captured" style="opacity:0.55">' + '<div class="seg-label">' + netName + "</div>" + '<div class="seg-arrow req"><span class="arrow-line">---&gt;</span> <span class="seg-count pending" style="color:#78909c">未観測</span></div>' + '<div class="seg-arrow rep"><span class="arrow-line">&lt;---</span> <span class="seg-count pending" style="color:#78909c">未観測</span></div>' + "</div>";
  }
  var flowNodes = c.nodes.filter(function(n) {
    return !n.readonly;
  });
  var roNodes = c.nodes.filter(function(n) {
    return n.readonly;
  });
  if (flowNodes.length === 0) {
    flowNodes = [ {
      id: "sv",
      type: "server"
    }, {
      id: "r1",
      type: "router"
    } ];
    roNodes = [ {
      id: "inet",
      type: "isp"
    } ];
  }
  var cfg = window._scenarioConfig || {};
  var allNetworks = cfg.networks || [];
  function inferNetName(fromId, toId) {
    for (var ni = 0; ni < allNetworks.length; ni++) {
      var anet = allNetworks[ni];
      if (!anet.members || anet.members.length !== 2) continue;
      var hasFrom = anet.members.some(function(m) {
        return m.node === fromId;
      });
      var hasTo = anet.members.some(function(m) {
        return m.node === toId;
      });
      if (hasFrom && hasTo) return anet.name;
    }
    return "net-" + fromId + toId;
  }
  var html = '<div class="topo-flow-nodes" style="font-family:monospace">';
  for (var i = 0; i < flowNodes.length; i++) {
    var n = flowNodes[i];
    var cls = n.type === "server" ? "server" : n.type === "isp" ? "isp" : "router";
    html += '<div class="topo-flow-node ' + cls + '">' + n.id.toUpperCase() + "</div>";
    if (i < flowNodes.length - 1) {
      if (i < c.nets.length) {
        html += segHTML(c.nets[i]);
      } else {
        html += placeholderSegHTML(inferNetName(flowNodes[i].id, flowNodes[i + 1].id));
      }
    }
  }
  if (roNodes.length > 0 && c.nets.length > flowNodes.length - 1) {
    var lastNet = c.nets[c.nets.length - 1];
    html += segHTML(lastNet);
    html += '<div class="topo-flow-node isp">' + roNodes[0].id.toUpperCase() + "</div>";
  }
  html += "</div>";
  return html;
};

window.xrayShowBeforeAfterFlow = function(initialFlowData, latestFlowData) {
  var container = document.getElementById("before-after-flow");
  if (!container) return;
  container.innerHTML = '<div class="ba-section before"><div class="ba-label">初期状態 (Before)</div><div class="ba-content">' + window.xrayBuildFlowHTML(initialFlowData) + "</div></div>" + '<div class="ba-section after"><div class="ba-label">復旧後 (After)</div><div class="ba-content">' + window.xrayBuildFlowHTML(latestFlowData) + "</div></div>";
  container.style.display = "block";
};

window.xrayShowBeforeAfterRaw = function(initialRawData, latestRawData) {
  var container = document.getElementById("before-after-raw");
  if (!container) return;
  var c = _xrayCaptureCfg();
  var beforeRaw = window.xrayBuildRawHTML(initialRawData);
  var afterRaw = window.xrayBuildRawHTML(latestRawData);
  var beforeSummary = window.xrayBuildRawSummary(initialRawData);
  var afterSummary = window.xrayBuildRawSummary(latestRawData);
  var focusNet = c.nets[c.nets.length - 1];
  function rawColsHTML(rawMap) {
    return c.nets.map(function(n) {
      var id = n.replace("net-", "");
      var hl = n === focusNet && c.nets.length > 1 ? " wan-highlight" : "";
      var label = c.lanes[n] || n;
      return '<div class="raw-col' + hl + '"><div class="raw-col-header">' + label + " (" + n + ")</div>" + '<div class="raw-col-body" style="max-height:200px">' + (rawMap[id] || '<div class="raw-empty">-</div>') + "</div></div>";
    }).join("");
  }
  container.innerHTML = '<div class="ba-section before"><div class="ba-label">初期状態 (Before)</div><div class="ba-content">' + '<div style="padding:6px 10px;margin-bottom:8px;border-radius:4px;font-size:12px;background:#0a0a0a;border-left:3px solid #e74c3c;color:#ccc">' + beforeSummary + "</div>" + '<div class="raw-2col">' + rawColsHTML(beforeRaw) + "</div>" + "</div></div>" + '<div class="ba-section after"><div class="ba-label">復旧後 (After)</div><div class="ba-content">' + '<div style="padding:6px 10px;margin-bottom:8px;border-radius:4px;font-size:12px;background:#0a0a0a;border-left:3px solid #27ae60;color:#ccc">' + afterSummary + "</div>" + '<div class="raw-2col">' + rawColsHTML(afterRaw) + "</div>" + "</div></div>";
  container.style.display = "block";
};

function _xrayCountTargetPeers(config, targetId) {
  var nets = config.networks || config.topology && config.topology.networks || [];
  return nets.filter(function(net) {
    return (net.members || []).some(function(m) {
      return (m.node || m.name) === targetId;
    });
  }).length;
}

function _xrayIsDualLinkApexLayout(config) {
  if (!config || config.layout !== "inverted_v") return false;
  var target = (config.nodes || []).find(function(n) {
    return n.target;
  });
  if (!target) return false;
  return _xrayCountTargetPeers(config, target.id) >= 2;
}

function _xrayApplyDualLinkLabels(s, peers) {
  var lIf = s[peers.left + "_iface"] || "?";
  var rIf = s[peers.right + "_iface"] || "?";
  var lLabel = document.querySelector(".de-label.in");
  var rLabel = document.querySelector(".de-label.out");
  if (lLabel) lLabel.textContent = lIf + " - " + peers.left;
  if (rLabel) rLabel.textContent = rIf + " - " + peers.right;
}

function _xrayApplyDualLinkBeam(beam, linkInfo, ifaces) {
  if (!beam) return;
  var ifDown = linkInfo.ifName && ifaces[linkInfo.ifName] && !ifaces[linkInfo.ifName].up;
  if (ifDown) {
    beam.style.setProperty("background", "repeating-linear-gradient(90deg,rgba(255,60,60,0.5) 0px,rgba(255,60,60,0.5) 8px,transparent 8px,transparent 16px)", "important");
    beam.style.setProperty("box-shadow", "none", "important");
  } else {
    beam.style.setProperty("background", "var(--xto-link,#00e5ff)", "important");
    beam.style.setProperty("box-shadow", "0 0 20px rgba(var(--xto-link-rgb,0,229,255),0.7),0 0 50px rgba(var(--xto-link-rgb,0,229,255),0.3)", "important");
  }
}

function _xrayApplyDualLinkBeams(s, leftLink, rightLink) {
  var ifaces = s.interfaces || {};
  _xrayApplyDualLinkBeam(document.querySelector(".de-beam.in"), leftLink, ifaces);
  _xrayApplyDualLinkBeam(document.querySelector(".de-beam.out"), rightLink, ifaces);
}

function _xrayApplyDualLinkEnergyOrb(orb, linkInfo, ifaces) {
  if (!orb) return;
  var ifDown = linkInfo.ifName && ifaces[linkInfo.ifName] && !ifaces[linkInfo.ifName].up;
  if (ifDown) {
    orb.style.setProperty("background", "radial-gradient(circle,rgba(255,80,60,0.6) 0%,rgba(255,60,60,0.2) 40%,transparent 70%)", "important");
    orb.style.setProperty("box-shadow", "0 0 10px rgba(255,60,60,0.3)", "important");
    orb.style.setProperty("animation", "none", "important");
  } else {
    orb.style.setProperty("background", "radial-gradient(circle,#fff 0%,rgba(var(--xto-link-rgb,0,229,255),0.9) 25%,rgba(var(--xto-link-rgb,0,229,255),0.3) 50%,transparent 70%)", "important");
    orb.style.setProperty("box-shadow", "0 0 25px 10px rgba(var(--xto-link-rgb,0,229,255),0.5),0 0 60px rgba(var(--xto-link-rgb,0,229,255),0.25)", "important");
    orb.style.removeProperty("animation");
  }
}

function _xrayApplyDualLinkEnergies(s, leftLink, rightLink) {
  var ifaces = s.interfaces || {};
  _xrayApplyDualLinkEnergyOrb(document.querySelector(".de-energy.el"), leftLink, ifaces);
  _xrayApplyDualLinkEnergyOrb(document.querySelector(".de-energy.er"), rightLink, ifaces);
}

function _xrayApplyDualLinkTunnels(leftLink, rightLink) {
  var tLeft = document.getElementById("de-tunnel-left");
  var tRight = document.getElementById("de-tunnel-right");
  function _apply(el, link) {
    if (!el) return;
    el.classList.remove("tunnel-2way", "de-side-bgp", "de-side-bgp-idle", "de-side-ospf-full", "de-side-ospf-exchange", "de-side-ospf-2way", "de-side-ospf-init");
    if (link.proto === "bgp") {
      el.classList.toggle("tunnel-active", true);
      el.classList.toggle("de-side-bgp", !!link.up);
      el.classList.toggle("de-side-bgp-idle", !link.up);
      return;
    }
    var _ob = _xrayOspfBucket(link.nbrState || (link.up ? "Full" : ""));
    var _ospf = _ob !== "none";
    el.classList.toggle("tunnel-active", !!link.up || _ospf);
    [ "full", "exchange", "2way", "init" ].forEach(function(b) {
      el.classList.toggle("de-side-ospf-" + b, _ospf && b === _ob);
    });
  }
  _apply(tLeft, leftLink);
  _apply(tRight, rightLink);
}

function _xrayApplyDualLinkDirection(s, peers) {
  var rr = s.route_resolution || {};
  if (window._xrayIsTransit) {
    window._xrayFwdDirection = "right";
    document.body.classList.remove("ping-left");
    return;
  }
  var _edIfk = Object.keys(s.interfaces || {});
  var _edNonLo = _edIfk.filter(function(k) {
    return k !== "lo";
  });
  var _edWan = s.wan_iface || rr.out_iface || _edIfk[0] || "";
  var _edLan = s.lan_iface || _edIfk[_edIfk.length - 1] || _edWan;
  if (_edWan && _edWan === _edLan && _edNonLo.length <= 1) {
    window._xrayFwdDirection = "right";
    document.body.classList.remove("ping-left");
    window._xrayDirDbg = {
      singleLinkEdge: true,
      out: rr.out_iface,
      wan: _edWan
    };
    return;
  }
  var _lIf = s[peers.left + "_iface"];
  var _rIf = s[peers.right + "_iface"];
  var _lan = s.lan_iface || function() {
    var k = Object.keys(s.interfaces || {});
    return k[k.length - 1];
  }();
  var out = rr.out_iface;
  var goesLeft = out ? out === _lIf ? true : out === _rIf ? false : out === _lan : false;
  window._xrayDirDbg = {
    out: out,
    lIf: _lIf,
    rIf: _rIf,
    lan: _lan,
    peers: peers,
    goesLeft: goesLeft
  };
  window._xrayFwdDirection = out ? goesLeft ? "left" : "right" : null;
  if (goesLeft) document.body.classList.add("ping-left"); else document.body.classList.remove("ping-left");
  var _fwdArrow = document.getElementById("de-cyl-fwd-arrow");
  if (_fwdArrow && window._xrayFwdDirection) {
    var _fwdTf = window._xrayFwdDirection === "left" ? "translate(200, 0) scale(-1, 1)" : "";
    _fwdArrow.setAttribute("transform", _fwdTf);
    var _fwdArrowText = _fwdArrow.querySelector("text");
    if (_fwdArrowText) _fwdArrowText.setAttribute("transform", _fwdTf);
  }
}

function xrayBuildApplyState(config) {
  var xray = config.xray || {};
  var pattern = xray.pattern || "ospf_linear";
  var protocol = xray.protocol || "ospf";
  var pingMode = xray.ping_mode || "from-r1";
  var holoFields = xray.holo_fields || [];
  var _isDualLinkApex = pattern === "ospf_triangle" || _xrayIsDualLinkApexLayout(config);
  var _triNodes = null;
  if (_isDualLinkApex) {
    var nodes = config.nodes || [];
    var targetN = nodes.find(function(n) {
      return n.target;
    }) || nodes[0];
    var others = nodes.filter(function(n) {
      return n !== targetN;
    });
    if (others.length >= 2) {
      _triNodes = {
        target: targetN.id,
        left: others[0].id,
        right: others[1].id
      };
    }
  }
  window._triNodes = _triNodes;
  if (_triNodes) {
    document.body.setAttribute("data-topo-triangle", "");
  }
  var _capturePingSrc = (config.capture || {}).ping_src;
  var _targetNodeId = ((config.nodes || []).find(function(n) {
    return n.target;
  }) || {}).id;
  var _legacyIsTransit = !!(_capturePingSrc && _targetNodeId && _capturePingSrc !== _targetNodeId);
  function _xrayResolveTransit(s) {
    var currentTargetId = window._xrayTargetNode ? window._xrayTargetNode.replace("topo-node-", "") : _targetNodeId;
    var dynamicLegacyIsTransit = !!(_capturePingSrc && currentTargetId && _capturePingSrc !== currentTargetId);
    if (s && typeof s.target_on_path === "boolean") {
      if (!s.target_on_path) {
        return {
          isTransit: false,
          onPath: false,
          bypassed: dynamicLegacyIsTransit
        };
      }
      return {
        isTransit: dynamicLegacyIsTransit,
        onPath: true,
        bypassed: false
      };
    }
    return {
      isTransit: dynamicLegacyIsTransit,
      onPath: true,
      bypassed: false
    };
  }
  function _xrayResolveEffectivePingMode(s, declaredMode, isTransit) {
    var ids = typeof _xrayGetTargetIds === "function" ? _xrayGetTargetIds() : [];
    var currentTargetId = window._xrayTargetNode ? window._xrayTargetNode.replace("topo-node-", "") : null;
    var _advNodes = window._scenarioConfig && window._scenarioConfig.xray && window._scenarioConfig.xray.advertiser_nodes || [];
    if (s && s.is_advertiser || currentTargetId && _advNodes.indexOf(currentTargetId) >= 0) {
      return "cylinder-to-left";
    }
    if (ids.length > 1 && currentTargetId && ids[0] !== currentTargetId) {
      return "through";
    }
    if (!isTransit) return declaredMode;
    var rr = s && s.route_resolution || {};
    if (!rr.resolved) return declaredMode;
    var outIf = rr.out_iface || "";
    if (outIf && outIf !== "lo") return "through";
    return declaredMode;
  }
  window.applyXrayState = function applyXrayState(s) {
    window._lastXrayState = s;
    window._xrayProtocol = protocol;
    try {
      _xrayRenderUnifiedLive(s);
    } catch (_e) {}
    try {
      _xrayDeAngleView(s);
    } catch (_e) {}
    document.body.classList.toggle("xray-advertiser-view", !!s.is_advertiser);
    var _tr = _xrayResolveTransit(s);
    var _isTransit = _tr.isTransit;
    var _bypassed = _tr.bypassed;
    var _effectivePingMode = _xrayResolveEffectivePingMode(s, pingMode, _isTransit);
    window._xrayIsTransit = _isTransit;
    window._xrayTargetBypassed = _bypassed;
    if (_bypassed) {
      document.body.classList.add("xray-target-bypassed");
    } else {
      document.body.classList.remove("xray-target-bypassed");
    }
    if (s.input_bgp_established) {
      document.body.classList.add("xray-input-session-up");
    } else {
      document.body.classList.remove("xray-input-session-up");
    }
    window._xrayPingMode = _effectivePingMode;
    document.documentElement.setAttribute("data-xray-proto", protocol);
    document.body.classList.add("xray-state-ready");
    var h = xrayEvaluateState(s);
    var state = h;
    if (_triNodes) _xrayApplyDualLinkDirection(s, _triNodes);
    if (_triNodes) {
      var _lsaGatherFn = function(ns) {
        ns = (ns || "").toLowerCase();
        return ns === "exchange" || ns === "loading";
      };
      window._xrayLsaGather = {
        left: _lsaGatherFn(s[_triNodes.left + "_neighbor_state"]),
        right: _lsaGatherFn(s[_triNodes.right + "_neighbor_state"])
      };
    } else {
      window._xrayLsaGather = null;
    }
    xrayApplyHierarchy(h);
    xrayUpdateIfaceIndicators(s.interfaces);
    var logicLines;
    if (pattern === "ospf_linear" || pattern === "ospf_triangle" || pattern === "ospf_multi") {
      logicLines = xrayOspfLogicLines(s);
    } else if (protocol === "bgp") {
      logicLines = typeof xrayBgpLogicLines === "function" ? xrayBgpLogicLines(s) : [];
    } else {
      logicLines = typeof xrayStaticLogicLines === "function" ? xrayStaticLogicLines(s) : [];
    }
    var targetNode = (config.nodes || []).find(function(n) {
      return n.target;
    });
    var targetId = targetNode ? targetNode.id : "r1";
    xraySetLogicBlock("xray-" + targetId + "-initial", logicLines);
    xraySetLogicBlock("xray-" + targetId + "-cleared", logicLines);
    function _holoVal(obj, path) {
      var parts = path.split(".");
      var v = obj;
      for (var pi = 0; pi < parts.length; pi++) {
        if (v == null) return undefined;
        v = v[parts[pi]];
      }
      return v;
    }
    var holo = "";
    for (var fi = 0; fi < holoFields.length; fi++) {
      var f = holoFields[fi];
      var val = _holoVal(s, f.field);
      if (f.condition && !s[f.condition]) continue;
      if (f.condition_not && s[f.condition_not]) continue;
      if (f.ok !== undefined && f.field && val === undefined) continue;
      if (f.format) {
        var txt = f.format.replace(/\{(\w+)\}/g, function(m, k) {
          return s[k] || "?";
        });
        holo += "<div>&gt; " + txt + "</div>";
      } else if (f.ok !== undefined) {
        var isOk = f.ok_value !== undefined ? val === f.ok_value : !!val;
        var display = isOk ? f.ok || val : f.fallback ? _holoVal(s, f.fallback) || f.err || "NG" : f.err || "NG";
        holo += "<div>&gt; " + f.label + ': <span class="' + (isOk ? "ok" : "err") + '">' + display + "</span></div>";
      }
    }
    var holoBody = document.getElementById("xray-holo-body");
    if (holoBody) holoBody.innerHTML = holo;
    var deepLines;
    if (_triNodes) {
      var _lId = _triNodes.left, _rId = _triNodes.right;
      var _leftLink, _rightLink;
      if (pattern === "ospf_triangle") {
        var _lFull = s[_lId + "_has_full"] !== undefined ? !!s[_lId + "_has_full"] : !!s.has_full;
        var _rFull = s[_rId + "_has_full"] !== undefined ? !!s[_rId + "_has_full"] : false;
        var _lNbr = s[_lId + "_neighbor_state"] || "None";
        var _rNbr = s[_rId + "_neighbor_state"] || "None";
        var _hasStatic = !!(s.has_static || s.has_floating_static);
        var _lHasOspfActivity = _lFull || _lNbr !== "None";
        var _rHasOspfActivity = _rFull || _rNbr !== "None";
        var _lIsStatic = _hasStatic && !_lHasOspfActivity && (_rHasOspfActivity || !_lFull);
        var _rIsStatic = _hasStatic && !_rHasOspfActivity && (_lHasOspfActivity || !_rFull);
        if (_hasStatic && !_lHasOspfActivity && !_rHasOspfActivity) {
          var _rr0 = s.route_resolution || {};
          _lIsStatic = _rr0.protocol === "static" && _rr0.out_iface === s[_lId + "_iface"];
          _rIsStatic = _rr0.protocol === "static" && _rr0.out_iface === s[_rId + "_iface"];
        }
        _leftLink = {
          up: _lFull,
          fallback: _lIsStatic,
          ifName: s[_lId + "_iface"],
          nbrState: _lNbr,
          proto: "ospf"
        };
        _rightLink = {
          up: _rFull,
          fallback: _rIsStatic,
          ifName: s[_rId + "_iface"],
          nbrState: _rNbr,
          proto: "ospf"
        };
        deepLines = xrayTriDeepLines(s, {
          targetName: _triNodes.target,
          primaryName: _lId,
          secondaryName: _rId,
          primaryFull: _lFull,
          secondaryFull: _rFull,
          secondaryState: _rNbr,
          primaryStatic: _lIsStatic,
          secondaryStatic: _rIsStatic,
          target: (s.route_resolution || {}).target || "3.3.3.3"
        });
      } else {
        _leftLink = {
          up: !!s[_lId + "_established"],
          fallback: false,
          ifName: s[_lId + "_iface"],
          proto: "bgp"
        };
        _rightLink = {
          up: !!s[_rId + "_established"],
          fallback: false,
          ifName: s[_rId + "_iface"],
          proto: "bgp"
        };
        deepLines = typeof xrayBgpDeepLines === "function" ? xrayBgpDeepLines(s) : [];
      }
      _xrayApplyDualLinkLabels(s, _triNodes);
      _xrayApplyDualLinkBeams(s, _leftLink, _rightLink);
      _xrayApplyDualLinkEnergies(s, _leftLink, _rightLink);
      _xrayApplyDualLinkTunnels(_leftLink, _rightLink);
      _xrayApplyDualLinkDirection(s, _triNodes);
      var _dlIfaces = s.interfaces || {};
      var _liDown = !!(_leftLink.ifName && _dlIfaces[_leftLink.ifName] && !_dlIfaces[_leftLink.ifName].up);
      var _riDown = !!(_rightLink.ifName && _dlIfaces[_rightLink.ifName] && !_dlIfaces[_rightLink.ifName].up);
      document.body.classList.toggle("is-input-down", _liDown);
      document.body.classList.toggle("is-output-down", _riDown);
      if (pattern === "ospf_triangle") {
        var _ifaces = s.interfaces || {};
        var _lIfDown = s[_lId + "_iface"] && _ifaces[s[_lId + "_iface"]] && !_ifaces[s[_lId + "_iface"]].up;
        _xrayApplyDualLinkHello(s, _leftLink.ifName, _rightLink.ifName, _lId, _rId);
        var _lNbr2 = s[_lId + "_neighbor_state"] || "None";
        var _rNbr2 = s[_rId + "_neighbor_state"] || "None";
        var _lFull2 = _leftLink.up;
        var _rFull2 = _rightLink.up;
        var _rIfDown = s[_rId + "_iface"] && _ifaces[s[_rId + "_iface"]] && !_ifaces[s[_rId + "_iface"]].up;
        var _btKey = [ _lId, _rId ].sort().join("");
        var _btKeyU = [ _lId, _rId ].sort().join("_");
        var _btNbrState;
        if (s[_btKey + "_has_full"] !== undefined) {
          _btNbrState = s[_btKey + "_has_full"] ? "Full" : "None";
        } else if (window._xrayLiveNeighbors && window._xrayLiveNeighbors[_btKeyU]) {
          _btNbrState = window._xrayLiveNeighbors[_btKeyU].state || "None";
        } else {
          _btNbrState = "None";
        }
        var _xVizActive = document.body.classList.contains("is-xray-mode") || document.body.classList.contains("is-replaying");
        if (_xVizActive) {
          xraySetSvgLine("tri-line-tl", _lIfDown ? "if-down" : "up");
          xraySetSvgLine("tri-line-tr", _rIfDown ? "if-down" : "up");
          var _btDown = window._xrayLiveLinks && window._xrayLiveLinks[_btKeyU] && window._xrayLiveLinks[_btKeyU].if_status === "down";
          xraySetSvgLine("tri-line-bt", _btDown ? "if-down" : "up");
          xraySetSvgTunnel("tri-tunnel-tl", _lFull2 ? "Full" : _lNbr2, "ospf");
          xraySetSvgTunnel("tri-tunnel-tr", _rFull2 ? "Full" : _rNbr2, "ospf");
          xraySetSvgTunnel("tri-tunnel-bt", _btNbrState, "ospf");
        } else {
          xraySetSvgTunnel("tri-tunnel-tl", "None", "ospf");
          xraySetSvgTunnel("tri-tunnel-tr", "None", "ospf");
          xraySetSvgTunnel("tri-tunnel-bt", "None", "ospf");
        }
      } else if (pattern === "bgp_multi" && document.getElementById("topo-iv-svg")) {
        var _ivIf = s.interfaces || {};
        var _liDownIv = !!(_leftLink.ifName && _ivIf[_leftLink.ifName] && !_ivIf[_leftLink.ifName].up);
        var _riDownIv = !!(_rightLink.ifName && _ivIf[_rightLink.ifName] && !_ivIf[_rightLink.ifName].up);
        var _ivViz = document.body.classList.contains("is-xray-mode") || document.body.classList.contains("is-replaying");
        if (_ivViz) {
          if (typeof xraySetSvgLine === "function") {
            xraySetSvgLine("tri-line-tl", _liDownIv ? "if-down" : "up");
            xraySetSvgLine("tri-line-tr", _riDownIv ? "if-down" : "up");
          }
          xraySetSvgTunnel("tri-tunnel-tl", _leftLink.up ? "Full" : "None", _leftLink.up ? "bgp" : "ospf");
          xraySetSvgTunnel("tri-tunnel-tr", _rightLink.up ? "Full" : "None", _rightLink.up ? "bgp" : "ospf");
        } else {
          xraySetSvgTunnel("tri-tunnel-tl", "None", "ospf");
          xraySetSvgTunnel("tri-tunnel-tr", "None", "ospf");
        }
      }
    } else if (pattern === "ospf_linear") {
      deepLines = xrayOspfDeepLines(s);
    } else if (pattern === "bgp" || pattern === "bgp_multi") {
      deepLines = typeof xrayBgpDeepLines === "function" ? xrayBgpDeepLines(s) : [];
    } else {
      deepLines = typeof xrayStaticDeepLines === "function" ? xrayStaticDeepLines(s) : [];
    }
    var _linPipes = document.querySelectorAll(".topo-link-pipe");
    if (_linPipes.length) {
      var _linVizActive = document.body.classList.contains("is-xray-mode") || document.body.classList.contains("is-replaying");
      var _linIsBgp = pattern.indexOf("bgp") === 0;
      var _linIsOspf = pattern.indexOf("ospf") === 0;
      var _pipeCfg = window._scenarioConfig || {};
      var _pipeTgt = (window._xrayTargetNode ? String(window._xrayTargetNode).replace("topo-node-", "") : "") || targetId;
      for (var _lp = 0; _lp < _linPipes.length; _lp++) {
        var _pe = _linPipes[_lp];
        var _dn = _pe.getAttribute("data-net");
        var _isInner = _pe.classList.contains("pipe-inner");
        if (!_linVizActive) {
          _xraySetCssPipe(_pe, "None", "ospf");
          continue;
        }
        var _bup = _xrayBgpUpForNet(s, _dn);
        var _ofsm = _xrayOspfFsmForNet(_pipeCfg, _pipeTgt, s, _dn);
        var _hasBgp = _bup !== undefined, _hasOspf = !!_ofsm;
        if (_hasBgp || _hasOspf) {
          if (_isInner) {
            if (_bup && _hasOspf) _xraySetCssPipe(_pe, _ofsm, "ospf"); else _xraySetCssPipe(_pe, "None", "ospf");
          } else {
            if (_bup) _xraySetCssPipe(_pe, "None", "bgp"); else if (_hasOspf) _xraySetCssPipe(_pe, _ofsm, "ospf"); else if (_hasBgp) _xraySetCssPipe(_pe, "None", "bgp-idle"); else _xraySetCssPipe(_pe, "None", "ospf");
            if (_bup && _hasOspf) _pe.classList.add("pipe-coexist"); else _pe.classList.remove("pipe-coexist");
          }
          continue;
        }
        if (_isInner) {
          _xraySetCssPipe(_pe, "None", "ospf");
          continue;
        }
        if (_linIsBgp) {
          var _est = s.bgp_links && s.bgp_links[_dn] !== undefined ? !!s.bgp_links[_dn] : s.is_established !== undefined ? !!s.is_established : s.bgp_state === "Established";
          _xraySetCssPipe(_pe, "None", _est ? "bgp" : "bgp-idle");
        } else if (_linIsOspf) {
          _xraySetCssPipe(_pe, s.has_full ? "Full" : s.neighbor_state || "None", "ospf");
        } else {
          _xraySetCssPipe(_pe, "None", "ospf");
        }
      }
    }
    (function() {
      var _leftDt = document.querySelector(".de-tunnel.left-side");
      if (!_leftDt || document.getElementById("de-tunnel-left")) return;
      var _rightDt = document.querySelector(".de-tunnel:not(.left-side)");
      var _dtCfg = window._scenarioConfig || {};
      var _dtTgt = (window._xrayTargetNode ? String(window._xrayTargetNode).replace("topo-node-", "") : "") || targetId;
      var _coexistQ = !!(_dtCfg.xray && _dtCfg.xray.deep_coexist_ospf);
      var _crossSide = !!(s.lan_iface && s.wan_iface && s.lan_iface !== s.wan_iface);
      function _sideCoexist(el, iface, isEgress) {
        if (!el) return;
        el.classList.remove("de-coexist", "de-coexist-init", "de-coexist-2way", "de-coexist-exchange", "de-coexist-full", "de-coexist-none", "de-side-show", "de-side-bgp", "de-side-bgp-idle", "de-side-ospf-init", "de-side-ospf-2way", "de-side-ospf-exchange", "de-side-ospf-full");
        var net = iface ? _xrayNetForIface(_dtCfg, _dtTgt, s, iface) : null;
        var bup = net ? _xrayBgpUpForNet(s, net.name) : undefined;
        var hasBgp = bup !== undefined;
        var ospf = net ? _xrayOspfFsmForNet(_dtCfg, _dtTgt, s, net.name) : "";
        if (!_coexistQ) {
          if (hasBgp && ospf) el.classList.add("de-coexist", "de-coexist-" + _xrayOspfBucket(ospf));
          return;
        }
        if (!hasBgp && !ospf) return;
        if (bup) el.classList.add("de-side-bgp"); else if (ospf) el.classList.add("de-side-ospf-" + _xrayOspfBucket(ospf)); else if (hasBgp) el.classList.add("de-side-bgp-idle");
        if (bup && ospf) el.classList.add("de-coexist", "de-coexist-" + _xrayOspfBucket(ospf));
        if (_crossSide || isEgress) el.classList.add("de-side-show");
      }
      _sideCoexist(_leftDt, s.lan_iface, false);
      _sideCoexist(_rightDt, s.wan_iface, true);
    })();
    xraySetDeepDive("#de-re-panel", deepLines);
    xrayUpdateLsdb(s);
    if ((document.body.classList.contains("trace-active") || window._replayLock || document.body.classList.contains("is-replaying")) && typeof xrayRenderBgpTableReplay === "function") {
      xrayRenderBgpTableReplay();
    }
    if (document.body.classList.contains("de-loading")) {
      if (window._xrayDeRevealTimer) {
        clearTimeout(window._xrayDeRevealTimer);
        window._xrayDeRevealTimer = null;
      }
      document.body.classList.remove("de-loading");
      document.body.classList.add("de-applied");
    }
  };
}

window.traceH = {
  title: function(target) {
    return '<div class="de-title">[Routing Engine]</div><div>&gt; Lookup: ' + target + "</div>";
  },
  ifLine: function(name, ip, up) {
    var c = up ? "#39ff14" : "#ff4444";
    var st = up ? "" : "color:#ff6b35;font-weight:700";
    return "<div" + (st ? ' style="' + st + '"' : "") + ">&gt; " + name + ': <span style="color:' + c + '">' + (up ? "UP" : "DOWN") + "</span>" + (ip ? ' <span class="de-dim">' + ip + "</span>" : "") + "</div>";
  },
  config: function(prefix, nh, installed) {
    return installed ? '<div>&gt; Config: <span class="de-hl">S ' + prefix + " via " + nh + "</span></div>" : '<div>&gt; Config: <span class="de-dim">S ' + prefix + " via " + nh + "</span></div>";
  },
  noConfig: function() {
    return '<div style="color:#ff6b35;font-weight:700">&gt; Config: <span style="color:#ff4444">NO default route</span></div>';
  },
  ribNot: function(reason) {
    return '<div style="color:#ff6b35;font-weight:700">&gt; RIB: <span style="color:#ff4444">NOT INSTALLED</span> <span class="de-dim">(' + reason + ")</span></div>";
  },
  ribInstalling: function() {
    return '<div style="color:#ff6b35">&gt; RIB: <span style="color:#ff4444">installing...</span></div>';
  },
  ribInstalled: function(prefix, ad) {
    return '<div>&gt; RIB: <span class="de-hl">S>* ' + prefix + " [" + (ad || "1/0") + "]</span></div>";
  },
  route: function(proto, prefix) {
    return '<div>&gt; Route: <span class="de-hl">' + proto + " " + prefix + "</span></div>";
  },
  routeNone: function() {
    return '<div style="color:#ff6b35">&gt; Route NOT installed in RIB</div>';
  },
  match: function(prefix) {
    return '<div>&gt; Match: <span class="de-hl">' + prefix + "</span></div>";
  },
  nextHop: function(nh) {
    return '<div>&gt; Next-Hop: <span class="de-hl">' + nh + "</span></div>";
  },
  out: function(iface) {
    return '<div>&gt; Out: <span class="de-hl">' + iface + "</span></div>";
  },
  action: function(act) {
    if (act === "FORWARD") return '<div>&gt; Action: <span style="color:#39ff14;font-weight:700">FORWARD</span></div>';
    if (act === "DROP") return '<div>&gt; Action: <span style="color:#ff4444;font-weight:700">DROP</span></div>';
    return '<div>&gt; Action: <span style="color:#666">' + act + "</span></div>";
  },
  dim: function(text) {
    return '<div class="de-dim">&gt; ' + text + "</div>";
  },
  ping: function(loss) {
    return '<div>&gt; Ping: <span class="de-hl">' + (loss || "0% loss") + "</span></div>";
  },
  nhReachable: function(nh, ok) {
    return ok ? '<div>&gt; Next Hop: <span class="de-hl">REACHABLE</span> <span class="de-dim">(connected)</span></div>' : '<div style="color:#ff6b35">&gt; Next Hop: <span style="color:#ff4444">NOT REACHABLE</span></div>';
  },
  nhConfig: function(prefix, nh, ok) {
    return ok ? "<div>&gt; Config: S " + prefix + ' via <span class="de-hl">' + nh + "</span></div>" : '<div style="color:#ff6b35">&gt; Config: S ' + prefix + ' via <span style="color:#ff4444">' + nh + "</span></div>";
  },
  ospfTitle: function(target) {
    return '<div class="de-title">[OSPF Process]</div><div>&gt; Destination: ' + target + "</div>";
  },
  ospfState: function(state) {
    var c = state === "Full" ? "#39ff14" : state === "None" ? "#ff4444" : "#ff8c00";
    return '<div>&gt; Neighbor: <span style="color:' + c + '">' + state + "</span></div>";
  },
  ospfHello: function(sent, received) {
    return '<div>&gt; Hello: <span style="color:' + (sent ? "#39ff14" : "#ff4444") + '">' + (sent ? "Sending" : "Not Sending") + "</span>" + ' / <span style="color:' + (received ? "#39ff14" : "#ff4444") + '">' + (received ? "Receiving" : "Not Receiving") + "</span></div>";
  },
  ospfRoute: function(prefix, installed) {
    return installed ? '<div>&gt; Route: <span class="de-hl">O>* ' + prefix + "</span></div>" : '<div style="color:#ff6b35">&gt; Route: <span style="color:#ff4444">NONE</span></div>';
  },
  ospfLsa: function(synced, collecting) {
    return synced ? '<div>&gt; LSDB: <span class="de-hl">Synchronized</span></div>' : '<div>&gt; LSDB: <span style="color:#ff8c00">' + (collecting ? "収集中" : "自装置のみ") + "</span></div>";
  },
  timerMatch: function(r1, r2, match) {
    return "<div>&gt; Hello Timer: r1=" + r1 + "s r2=" + r2 + 's <span style="color:' + (match ? "#39ff14" : "#ff4444") + '">' + (match ? "MATCH" : "MISMATCH") + "</span></div>";
  },
  areaMatch: function(r1, r2, match, peerLabel) {
    var _pl = peerLabel || "r2";
    return "<div>&gt; Area ID: r1=" + r1 + " " + _pl + "=" + r2 + ' <span style="color:' + (match ? "#39ff14" : "#ff4444") + '">' + (match ? "MATCH" : "MISMATCH") + "</span></div>";
  }
};

window.xrayBuildTraceSteps = function(tracePattern, labMode) {
  var h = new Proxy({}, {
    get: function(_, k) {
      return window.traceH[k];
    }
  });
  var patterns = {
    static_if_down: {
      title: "Recovery Sequence",
      destroyTitle: "Destruction Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no shutdown";
        },
        engine: "fault if-down",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, false) + h.config("0.0.0.0/0", s._nh, false) + h.ribNot("nexthop unreachable") + h.action("DROP");
        }
      }, {
        label: "② インターフェース",
        text: function(s) {
          return s._wanIf + " が UP になった";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, true) + h.config("0.0.0.0/0", s._nh, false) + h.ribInstalling() + h.action("DROP") + h.dim("connected route 復活中...");
        }
      }, {
        label: "③ Connected Route",
        text: function(s) {
          return "next-hop が到達可能に";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, true) + h.nhReachable(s._nh, true) + h.config("0.0.0.0/0", s._nh, true) + h.ribInstalling() + h.dim("next-hop " + s._nh + " → connected");
        }
      }, {
        label: "④ RIB",
        text: function(s) {
          return "デフォルトルート インストール";
        },
        engine: "fault",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, true) + h.nhReachable(s._nh, true) + h.config("0.0.0.0/0", s._nh, true) + h.ribInstalled("0.0.0.0/0", "1/0") + h.action("FORWARD");
        }
      }, {
        label: "⑤ FORWARD",
        text: function(s) {
          return "r1 がパケットを転送した";
        },
        engine: "cleared",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.match("0.0.0.0/0") + h.nextHop(s._nh) + h.out(s._wanIf) + h.action("FORWARD") + h.dim("proto: static, metric: 0");
        }
      }, {
        label: "⑥ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.match("0.0.0.0/0") + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss") + h.dim("iface: " + s._wanIf);
        }
      } ],
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "shutdown";
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, true) + h.match("0.0.0.0/0") + h.nextHop(s._nh) + h.action("FORWARD") + h.dim("正常稼働中...");
        }
      }, {
        label: "② IF DOWN",
        text: function(s) {
          return s._wanIf + " が DOWN になった";
        },
        engine: "fault if-down route-pending",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, false) + h.config("0.0.0.0/0", s._nh, true) + h.dim("connected route 消失中...");
        }
      }, {
        label: "③ ルート消失",
        text: function(s) {
          return "connected 消失 → NH 到達不能 → ルート撤回";
        },
        engine: "fault if-down",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, false) + h.nhReachable(s._nh, false) + h.config("0.0.0.0/0", s._nh, false) + h.ribNot("nexthop unreachable") + h.action("DROP");
        }
      }, {
        label: "④ 通信断",
        text: function(s) {
          return "sv → " + s._target + " 通信不可";
        },
        engine: "fault if-down",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ifLine(s._wanIf, s._wanIp, false) + h.config("0.0.0.0/0", s._nh, false) + h.ribNot("nexthop unreachable") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    static_route_missing: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip route 0.0.0.0/0 " + s._nh;
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.noConfig() + h.ribNot("no matching route") + h.action("DROP");
        }
      }, {
        label: "② ルート設定",
        text: function(s) {
          return "デフォルトルート設定完了";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.config("0.0.0.0/0", s._nh, true) + h.ribInstalling() + h.dim("next-hop " + s._nh + " を検証中...");
        }
      }, {
        label: "③ RIB → FORWARD",
        text: function(s) {
          return "ルートインストール → 転送開始";
        },
        engine: "cleared",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.config("0.0.0.0/0", s._nh, true) + h.ribInstalled("0.0.0.0/0", "1/0") + h.nextHop(s._nh) + h.out(s._wanIf) + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.match("0.0.0.0/0") + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip route 0.0.0.0/0 " + s._nh;
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.config("0.0.0.0/0", s._nh, true) + h.ribInstalled("0.0.0.0/0", "1/0") + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② ルート削除",
        text: function(s) {
          return "デフォルトルート消失";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.noConfig() + h.ribNot("no matching route") + h.action("DROP");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "ping " + s._target + " 100% loss";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.noConfig() + h.ribNot("no matching route") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_missing: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "router ospf + network";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: NOT RUNNING") + h.ospfState("None") + h.ospfRoute(s._target, false) + h.action("DROP");
        }
      }, {
        label: "② Hello 送信開始",
        text: function(s) {
          return "OSPF Hello パケット送信";
        },
        engine: "fault ospf-hello-out",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: STARTING") + h.ospfHello(true, false) + h.ospfState("Init") + h.ospfRoute(s._target, false);
        }
      }, {
        label: "③ Hello 交換",
        text: function(s) {
          return "Neighbor 検出";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfHello(true, true) + h.ospfState("2-Way") + h.ospfLsa(false);
        }
      }, {
        label: "④ LSA 交換",
        text: function(s) {
          return "LSDB 同期完了";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, false) + h.dim("SPF 計算中...");
          }
        } ]
      }, {
        label: "⑤ ルート学習",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, true) + h.action("FORWARD");
        }
      }, {
        label: "⑥ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no router ospf";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② OSPF 停止",
        text: function(s) {
          return "OSPF プロセス終了";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: NOT RUNNING") + h.ospfState("None") + h.dim("neighbor 関係消失...");
        }
      }, {
        label: "③ ルート撤回",
        text: function(s) {
          return s._target + " が RIB から消失";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: NOT RUNNING") + h.ospfState("None") + h.ospfRoute(s._target, false) + h.action("DROP");
        }
      }, {
        label: "④ 通信断",
        text: function(s) {
          return "ping " + s._target + " 100% loss";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: NOT RUNNING") + h.ospfRoute(s._target, false) + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    static_nh_wrong: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip route + ip route (正しいNH)";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", s._nh, false) + h.nhReachable(s._nh, false) + h.ribNot("nexthop unreachable") + h.action("DROP");
        }
      }, {
        label: "② NH 変更",
        text: function(s) {
          return "next-hop が到達可能に";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", s._nh, true) + h.nhReachable(s._nh, true) + h.ribInstalling();
        }
      }, {
        label: "③ RIB",
        text: function(s) {
          return "ルート インストール";
        },
        engine: "fault",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", s._nh, true) + h.nhReachable(s._nh, true) + h.ribInstalled(s._rr.matched_prefix || "2.2.2.2/32", "1/0") + h.action("FORWARD");
        }
      }, {
        label: "④ FORWARD",
        text: function(s) {
          return "パケット転送開始";
        },
        engine: "cleared",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.match(s._rr.matched_prefix || "2.2.2.2/32") + h.nextHop(s._nh) + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.match(s._rr.matched_prefix || "2.2.2.2/32") + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip route + ip route (到達不能NH)";
        },
        engine: "cleared",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", s._nh, true) + h.nhReachable(s._nh, true) + h.ribInstalled(s._rr.matched_prefix || "2.2.2.2/32", "1/0") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② NH 変更",
        text: function(s) {
          return "next-hop を到達不能 IP に変更";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", "(到達不能IP)", false) + h.nhReachable("(到達不能IP)", false) + h.ribNot("nexthop unreachable");
        }
      }, {
        label: "③ ブラックホール化",
        text: function(s) {
          return "パケット転送不能";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", "(到達不能IP)", false) + h.nhReachable("(到達不能IP)", false) + h.ribNot("nexthop unreachable") + h.action("DROP");
        }
      }, {
        label: "④ 通信断",
        text: function(s) {
          return "ping 2.2.2.2 100% loss";
        },
        engine: "fault",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.nhConfig(s._rr.matched_prefix || "2.2.2.2/32", "10.255.255.1", false) + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    static_ospf_override: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip route 2.2.2.2/32 (不正NH)";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.ospfRoute(s._rr.matched_prefix || "2.2.2.2/32", true) + h.nhConfig("2.2.2.2/32", "(到達不能IP)", false) + h.dim("S>* AD=1 が O AD=110 に勝利") + h.ribInstalled("2.2.2.2/32", "1/0") + h.dim("NH(到達不能)は下流 ARP 失敗 → DROP") + h.action("DROP");
        }
      }, {
        label: "② Static 削除",
        text: function(s) {
          return "OSPF 経路が best に昇格";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.ospfRoute(s._rr.matched_prefix || "2.2.2.2/32", true) + h.route("OSPF", s._rr.matched_prefix || "2.2.2.2/32") + h.ribInstalling() + h.dim("OSPF 経路 (AD=110) → best");
        }
      }, {
        label: "③ RIB → FORWARD",
        text: function(s) {
          return "OSPF 経路で転送開始";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.ospfRoute(s._rr.matched_prefix || "2.2.2.2/32", true) + h.ribInstalled(s._rr.matched_prefix || "2.2.2.2/32", "110/10") + h.nextHop(s._nh) + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.match(s._rr.matched_prefix || "2.2.2.2/32") + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip route 2.2.2.2/32 (到達不能IP)";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.ospfRoute(s._rr.matched_prefix || "2.2.2.2/32", true) + h.nextHop(s._nh) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② AD 競合",
        text: function(s) {
          return "Static(AD=1) が OSPF(AD=110) を上書き";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.nhConfig("2.2.2.2/32", "(到達不能IP)", false) + h.dim("S>* AD=1 が O AD=110 に勝利") + h.ribInstalled("2.2.2.2/32", "1/0") + h.dim("NH(到達不能)は下流 ARP 失敗 → DROP") + h.action("DROP");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "ping 2.2.2.2 100% loss";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.ospfState("Full") + h.nhConfig("2.2.2.2/32", "(到達不能IP)", false) + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_timer_mismatch: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip ospf hello-interval 5";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.timerMatch(s._r1Hello || 10, s._r2Hello || 5, false) + h.dim("Timer 不一致 → Hello 無視") + h.ospfState("None") + h.action("DROP");
        }
      }, {
        label: "② Timer 一致",
        text: function(s) {
          return "Hello Interval が一致";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.timerMatch(s._r2Hello || 5, s._r2Hello || 5, true) + h.dim("Hello 再送信中...");
        }
      }, {
        label: "③ Hello 受理",
        text: function(s) {
          return "Neighbor 検出";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("2-Way") + h.ospfLsa(false);
        }
      }, {
        label: "④ Full",
        text: function(s) {
          return "LSA 交換 + neighbor Full";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, false) + h.dim("SPF 計算中...");
          }
        } ]
      }, {
        label: "⑤ ルート学習",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD");
        }
      }, {
        label: "⑥ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip ospf hello-interval";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.timerMatch(s._r2Hello || 5, s._r2Hello || 5, true) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Timer 不一致",
        text: function(s) {
          return "r1 の Hello Interval を r2(5s) と不一致に変更";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.timerMatch(10, s._r2Hello || 5, false) + h.dim("Timer 不一致 → Hello 無視") + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.dim("Dead Timer カウント中...");
        }
      }, {
        label: "③ Neighbor 消失",
        text: function(s) {
          return "Dead Timer 満了 → neighbor 消失 + ルート撤回";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.timerMatch(10, s._r2Hello || 5, false) + h.ospfState("None") + h.ospfRoute(s._target, false) + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_area_mismatch: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "network X.X.X.0/24 area 1";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch(s._r1Area || "0", s._r2Area || "1", false) + h.dim("Area 不一致 → Hello 無視") + h.ospfState("None") + h.action("DROP");
        }
      }, {
        label: "② Area 一致",
        text: function(s) {
          return "Area ID が一致";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch(s._r2Area || "1", s._r2Area || "1", true) + h.dim("Hello 再送信中...");
        }
      }, {
        label: "③ Hello 受理",
        text: function(s) {
          return "Neighbor 検出";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("2-Way") + h.ospfLsa(false);
        }
      }, {
        label: "④ Full",
        text: function(s) {
          return "LSA 交換 + neighbor Full";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, false) + h.dim("SPF 計算中...");
          }
        } ]
      }, {
        label: "⑤ ルート学習",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD");
        }
      }, {
        label: "⑥ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常稼働",
        text: function(s) {
          return "r1/r2 ともに area 0 → neighbor Full";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch(s._r2Area || "0", s._r2Area || "0", true) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Area 変更 → 即時 teardown",
        text: function(s) {
          return "no network … area 0 → IF が area 0 から外れる";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("1", s._r2Area || "0", false) + h.dim("r1: IF を area 0 から除外 → adjacency 即時消失（Dead Timer 無関係）") + h.ospfState("None") + h.ospfRoute(s._target, false) + h.action("DROP");
        }
      }, {
        label: "③ 再隣接不成立",
        text: function(s) {
          return "r1 の area 1 Hello を r2(area 0) が拒否 → 通信断";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("1", s._r2Area || "0", false) + h.dim("r1: area 1 Hello 送信 → r2 が area 不一致で拒否 → 再隣接せず") + h.dim("r2 側: area 0 Hello 途絶 → Dead Timer 満了まで stale neighbor 保持") + h.ospfState("None") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_passive: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no ip ospf passive";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: passive-interface") + h.dim("Hello 送信停止") + h.ospfState("None") + h.action("DROP");
        }
      }, {
        label: "② Hello 送信開始",
        text: function(s) {
          return "passive 解除 → Hello パケット送信";
        },
        engine: "fault ospf-hello-out",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: ACTIVE") + h.ospfHello(true, false) + h.ospfState("Init");
        }
      }, {
        label: "③ Hello 交換",
        text: function(s) {
          return "Neighbor 検出";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfHello(true, true) + h.ospfState("2-Way") + h.ospfLsa(false);
        }
      }, {
        label: "④ Full",
        text: function(s) {
          return "LSA 交換 + neighbor Full";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, false) + h.dim("SPF 計算中...");
          }
        } ]
      }, {
        label: "⑤ ルート学習",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD");
        }
      }, {
        label: "⑥ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip ospf passive";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Hello 停止",
        text: function(s) {
          return "passive-interface 設定 → Hello 送信停止";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: passive-interface") + h.dim("Hello 送信停止") + h.ospfState("Full") + h.ospfRoute(s._target, true) + h.action("FORWARD") + h.dim("Dead Timer カウント中...");
        }
      }, {
        label: "③ Neighbor 消失",
        text: function(s) {
          return "Dead Timer 満了 → neighbor 消失 + ルート撤回";
        },
        engine: "fault ospf-inactive",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("OSPF: passive-interface") + h.ospfState("None") + h.ospfRoute(s._target, false) + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_redistribute_deny: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "route-map BLOCK permit 10";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("redistribute static route-map BLOCK") + h.dim("route-map: deny → 再配布ブロック") + h.dim("r2: 8.8.8.0/24 なし") + h.action("DROP");
        }
      }, {
        label: "② route-map permit",
        text: function(s) {
          return "route-map を permit に変更";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("redistribute static route-map BLOCK") + h.dim("route-map: permit → 再配布許可") + h.dim("LSA 生成中...");
        }
      }, {
        label: "③ LSA 広報",
        text: function(s) {
          return "8.8.8.0/24 を OSPF external で広報";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        lsdb: true,
        lsdbPrefix: "8.8.8.0/24",
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("Type-5 LSA: 8.8.8.0/24 → r2 へ広報") + h.dim("r2: O>* 8.8.8.0/24 学習");
        }
      }, {
        label: "④ r2 ルート学習",
        text: function(s) {
          return "r2 が 8.8.8.0/24 をインストール";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        lsdb: true,
        lsdbPrefix: "8.8.8.0/24",
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("r2: O>* 8.8.8.0/24 via r1") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        lsdb: true,
        lsdbPrefix: "8.8.8.0/24",
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("r2: O>* 8.8.8.0/24 via r1") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "route-map BLOCK deny 10";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        lsdb: true,
        lsdbPrefix: "8.8.8.0/24",
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("redistribute static route-map BLOCK") + h.dim("route-map: permit → 再配布許可中") + h.dim("r2: O>* 8.8.8.0/24 via r1") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② route-map deny",
        text: function(s) {
          return "route-map を deny に変更 → 再配布ブロック";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("redistribute static route-map BLOCK") + h.dim("route-map: deny → 再配布ブロック") + h.dim("LSA 撤回中...");
        }
      }, {
        label: "③ ルート撤回",
        text: function(s) {
          return "r2 から 8.8.8.0/24 消失 → 通信断";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("route-map: deny") + h.dim("r2: 8.8.8.0/24 なし") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_area_floating: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 障害分析",
        text: function(s) {
          return "Area 不一致 + Floating 未設定";
        },
        engine: "fault ospf-hello-out",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("0.0.0.1", "0.0.0.0", false, "r3") + h.dim("Area 不一致 → r1-r3 neighbor 不成立") + h.dim("Floating Static: なし") + h.action("DROP");
        }
      }, {
        label: "② Area 修正",
        text: function(s) {
          return "network ... area 0";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("0.0.0.0", "0.0.0.0", true, "r3") + h.dim("Area 一致 → Hello 交換中...");
        }
      }, {
        label: "③ OSPF 復旧",
        text: function(s) {
          return "Neighbor Full + ルート学習";
        },
        engine: "fault ospf-hello-both",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true);
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target, true) + h.dim("O>* via r3 (AD=110, 直結)");
          }
        } ]
      }, {
        label: "④ Floating Static 追加",
        text: function(s) {
          return "ip route 3.3.3.3/32 (r2) 120";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("O>* 3.3.3.3 via r3 (AD=110, best)") + h.dim("S   3.3.3.3 via r2 (AD=120, backup)") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功 — OSPF main + Static backup";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("Main: OSPF via r3 (AD=110)") + h.dim("Backup: Floating Static via r2 (AD=120)") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "OSPF + Floating Static";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("Main: OSPF via r3 (AD=110, best)") + h.dim("Backup: Floating Static via r2 (AD=120)") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Area 変更",
        text: function(s) {
          return "Area 不一致 → neighbor 破壊";
        },
        engine: "fault ospf-hello-out",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("0.0.0.1", "0.0.0.0", false, "r3") + h.dim("OSPF 経路消失 → Floating Static が浮上") + h.dim("S>* 3.3.3.3 via r2 (AD=120, now best)");
        }
      }, {
        label: "③ Floating 削除",
        text: function(s) {
          return "no ip route → バックアップも消失";
        },
        engine: "fault ospf-hello-out",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.areaMatch("0.0.0.1", "0.0.0.0", false, "r3") + h.dim("OSPF: なし") + h.dim("Floating Static: 削除") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    static_ad_override: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "OSPF 経路のみ（r3 直結パス）";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("O>* 3.3.3.3/32 via r3 (AD=110, direct)") + h.dim("Static route: なし") + h.dim("r2 経由ではない");
        }
      }, {
        label: "② あなたのコマンド",
        text: function(s) {
          return "ip route 3.3.3.3/32 (r2のIP)";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static route 追加中...") + h.dim("AD=1 (Static) vs AD=110 (OSPF)");
        }
      }, {
        label: "③ AD 競合 → Static 優先",
        text: function(s) {
          return "Static(AD=1) が OSPF(AD=110) を上書き";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("S>* 3.3.3.3/32 via r2 (AD=1, best)") + h.dim("O   3.3.3.3/32 via r3 (AD=110, not selected)") + h.action("FORWARD via r2");
        }
      }, {
        label: "④ Ping (r2 経由)",
        text: function(s) {
          return "成功 — r2 経由で到達";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("S>* 3.3.3.3/32 via r2") + h.action("FORWARD via r2") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "OSPF 直結（r3 経由, AD=110）";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("O>* 3.3.3.3/32 via r3 (AD=110, direct, best)") + h.dim("Static route: なし") + h.action("FORWARD via r3 (直結)") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② あなたのコマンド",
        text: function(s) {
          return "ip route 3.3.3.3/32 (r2のIP) AD=1";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static route 追加中...") + h.dim("AD=1 (Static) < AD=110 (OSPF) → Static が優先") + h.dim("OSPF 直結を押しのける...");
        }
      }, {
        label: "③ AD 競合 → r2 迂回",
        text: function(s) {
          return "Static(AD=1) が OSPF(AD=110) を上書き";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("S>* 3.3.3.3/32 via r2 (AD=1, best)") + h.dim("O   3.3.3.3/32 via r3 (AD=110, not selected)") + h.action("FORWARD via r2 (2ホップ迂回)") + h.ping("0% loss（到達するが迂回）");
        }
      } ]
    },
    dual_static_rid: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 障害分析",
        text: function(s) {
          return "2つの障害を特定";
        },
        engine: "fault",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static NH: Connected 帯内 → RIB install") + h.ribInstalled(s._target + "/32", "1/0") + h.nhReachable("", false) + h.dim("障害②: r1 RID = 2.2.2.2 (r2 と重複) → backup 未確立") + h.action("DROP");
        }
      }, {
        label: "② メイン修復",
        text: function(s) {
          return "Static NH 修正 → メイン復旧";
        },
        engine: "fault",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static NH → 正しい r3 IP に修正") + h.ribInstalled(s._target + "/32", "1/0") + h.nhReachable("", true) + h.action("FORWARD") + h.ping("0% loss") + h.dim("※ backup(OSPF)は RID 重複で未復旧");
        }
      }, {
        label: "③ RID 修正",
        text: function(s) {
          return "RID 一意化 → OSPF 再起動";
        },
        engine: "fault",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1 RID → ユニーク値に変更") + h.dim("clear ip ospf process → OSPF 再起動") + h.ribInstalled(s._target + "/32", "1/0") + h.action("FORWARD") + h.dim("main(Static) 維持 / backup 再確立中...");
        }
      }, {
        label: "④ OSPF 再確立",
        text: function(s) {
          return "LSA 再交換 → backup 学習";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.ospfState("Full") + h.dim("RID ユニーク → LSA 正常") + h.ospfRoute(s._target + "/32", true) + h.dim("main=Static(AD1) 維持 / backup=OSPF 学習");
        },
        sequence: [ {
          delay: 0,
          engineOverride: "fault ospf-hello-both",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("ExStart") + h.ospfLsa(false, true) + h.dim("main(Static) 維持");
          }
        }, {
          delay: 5e3,
          engineOverride: "fault ospf-full",
          panel: function(s) {
            return h.ospfTitle(s._target) + h.ospfState("Full") + h.ospfLsa(true) + h.ospfRoute(s._target + "/32", true) + h.dim("backup(OSPF) 学習完了");
          }
        } ]
      }, {
        label: "⑤ 冗長確立",
        text: function(s) {
          return "Static + OSPF 両経路 有効";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static: " + s._target + "/32 via r3 (AD=1, best)") + h.dim("OSPF: " + s._target + "/32 via r2→r3 (AD=110)") + h.action("FORWARD") + h.ping("0% loss");
        }
      }, {
        label: "⑥ 冗長切替",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        failover: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static (main) via r3 → DOWN (link 断)") + h.dim("OSPF (backup) via r2 → ACTIVE") + h.action("FORWARD via r2 (backup)") + h.ping("0% loss (冗長切替 成功)");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "Static + OSPF 両経路で冗長";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static: 3.3.3.3/32 via r3 (正常)") + h.dim("OSPF: 3.3.3.3/32 via r2→r3 (正常)") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Static NH 破壊",
        text: function(s) {
          return "NH を到達不能 IP に変更";
        },
        engine: "fault ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static NH → 到達不能 IP に変更") + h.dim("OSPF バックアップ(Full)で まだ到達可能");
        }
      }, {
        label: "③ RID 重複",
        text: function(s) {
          return "r1 RID を 2.2.2.2 に変更";
        },
        engine: "fault",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1 RID = 2.2.2.2 → r2 と重複") + h.dim("LSA 矛盾 → OSPF 経路も消失");
        }
      }, {
        label: "④ 全経路遮断",
        text: function(s) {
          return "Static も OSPF も使用不能";
        },
        engine: "fault",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("Static: NH 到達不能 → ARP 失敗") + h.dim("OSPF: RID 重複 → 経路学習不可") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_neighbor_ip: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "neighbor (正しいIP) remote-as";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP neighbor IP: 誤り") + h.dim("TCP SYN → 到達不能") + h.dim("State: Idle") + h.action("DROP");
        }
      }, {
        label: "② TCP 接続",
        text: function(s) {
          return "TCP SYN → port 179";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("neighbor IP 修正 → TCP SYN 送信中...");
        }
      }, {
        label: "③ Established",
        text: function(s) {
          return "BGP セッション確立";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [],
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP State: Established") + h.dim("経路受信中...");
        }
      }, {
        label: "④ ルート受信",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: " + s._target + " received") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "neighbor (誤ったIP) remote-as";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② セッション断",
        text: function(s) {
          return "neighbor 変更 → TCP 切断";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("neighbor IP 誤り → TCP 不能") + h.dim("State: Idle");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "ルート消失 → 通信不能";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Idle") + h.dim("ルートなし") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_update_source: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "neighbor ... update-source lo";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("update-source: 未設定") + h.dim("TCP src = 物理IP → r2 が拒否") + h.dim("State: Active") + h.action("DROP");
        }
      }, {
        label: "② TCP ソース変更",
        text: function(s) {
          return "TCP src → Loopback IP";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("update-source lo 設定") + h.dim("TCP SYN (src=Loopback) → r2");
        }
      }, {
        label: "③ Established",
        text: function(s) {
          return "iBGP セッション確立";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP State: Established") + h.dim("経路受信中...");
        }
      }, {
        label: "④ ルート受信",
        text: function(s) {
          return s._target + " を学習";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP: " + s._target + " received") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP: Established") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no neighbor ... update-source";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP: Established") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② TCP ソース不一致",
        text: function(s) {
          return "update-source 削除 → 物理IP に戻る";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("TCP src = 物理IP → r2 が拒否") + h.dim("State: Active");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "セッション断 → ルート消失";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP: Active") + h.dim("ルートなし") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_prefix_list: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "prefix-list permit 8.8.8.0/24";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("prefix-list FILTER: deny 8.8.8.0/24") + h.dim("1.1.1.0/24 は受信可、8.8.8.0/24 はフィルタ") + h.action("DROP (8.8.8.8)");
        }
      }, {
        label: "② prefix-list 修正",
        text: function(s) {
          return "deny → permit に変更";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("prefix-list FILTER: permit 8.8.8.0/24") + h.dim("soft reconfiguration 適用中...");
        }
      }, {
        label: "③ ルート受信",
        text: function(s) {
          return "8.8.8.0/24 が BGP テーブルに追加";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: 8.8.8.0/24 received") + h.dim("1.1.1.0/24 + 8.8.8.0/24") + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established, all routes") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "prefix-list deny 8.8.8.0/24";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("8.8.8.0/24 + 1.1.1.0/24 受信中") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② フィルタ適用",
        text: function(s) {
          return "prefix-list deny → 8.8.8.0/24 除外";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("prefix-list FILTER: deny 8.8.8.0/24") + h.dim("8.8.8.0/24 が BGP テーブルから除外");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "8.8.8.8 への経路消失";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established (session OK)") + h.dim("8.8.8.0/24: FILTERED") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_max_prefix: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "maximum-prefix 20";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP State: Idle (PfxCt)") + h.dim("maximum-prefix 超過 → セッション切断") + h.action("DROP");
        }
      }, {
        label: "② セッション再確立",
        text: function(s) {
          return "clear bgp → Established";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("maximum-prefix 緩和 → セッション復旧") + h.dim("BGP: Established") + h.dim("経路受信中...");
        }
      }, {
        label: "③ ルート受信",
        text: function(s) {
          return "プレフィックス受信完了";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("有効経路 + bogon フィルタ") + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "maximum-prefix 5";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Prefix 超過",
        text: function(s) {
          return "maximum-prefix 超過 → 切断";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("受信数 > limit → セッション強制切断") + h.dim("BGP: Idle (PfxCt)");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "ルート消失 → 通信不能";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Idle (PfxCt)") + h.dim("ルートなし") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_as_path_filter: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 障害分析",
        text: function(s) {
          return "prepend + filter の複合";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: set as-path prepend 65099 65099") + h.dim("r2: as-path deny _65099_") + h.dim("→ 1.1.1.0/24 が r2 でフィルタ") + h.action("DROP");
        }
      }, {
        label: "② prepend 除去",
        text: function(s) {
          return "r1: no set as-path prepend";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: prepend 除去") + h.dim("AS-PATH: 65001 (正常)");
        }
      }, {
        label: "③ filter 修正",
        text: function(s) {
          return "r2: deny → permit";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: フィルタ修正") + h.dim("soft reconfiguration 適用中...");
        }
      }, {
        label: "④ ルート復旧",
        text: function(s) {
          return "r2 が 1.1.1.0/24 を受信";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: 1.1.1.0/24 received") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established, routes OK") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "r2 が 1.1.1.0/24 を受信中";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("r2: 1.1.1.0/24 received") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② prepend 追加",
        text: function(s) {
          return "r1: set as-path prepend 65099";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: AS-PATH → 65099 65099 65001") + h.dim("r2: as-path deny _65099_ に一致");
        }
      }, {
        label: "③ ルート消失",
        text: function(s) {
          return "r2 が 1.1.1.0/24 をフィルタ";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: 1.1.1.0/24 FILTERED") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_not_advertised: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 障害分析",
        text: function(s) {
          return "r1 が 1.1.1.1 を広報していない";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established (session OK)") + h.dim("r1: network / redistribute 無し") + h.dim("→ r2 に 1.1.1.1 が来ない") + h.action("DROP");
        }
      }, {
        label: "② 広報追加",
        text: function(s) {
          return "r1: network 1.1.1.1/32 (or redistribute)";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: 1.1.1.1/32 を広報開始") + h.dim("BGP UPDATE 送信中...");
        }
      }, {
        label: "③ ルート受信",
        text: function(s) {
          return "r2 が 1.1.1.1 を受信";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: 1.1.1.1 received") + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established, route OK") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "r2 が 1.1.1.1 を受信中";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("r2: 1.1.1.1 received") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② 広報停止",
        text: function(s) {
          return "r1: no network 1.1.1.1/32";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: 1.1.1.1 を広報停止") + h.dim("BGP WITHDRAW 送信");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "r2 が 1.1.1.1 を失う";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established (session OK)") + h.dim("r2: 1.1.1.1 なし (未広報)") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_next_hop_self: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "neighbor ... next-hop-self";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "i",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.2.3",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65002",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established") + h.dim("8.8.8.0/24 受信済み") + h.dim("Next-Hop: r3 IP → r1 から到達不能") + h.dim("RIB: NOT installed") + h.action("DROP");
        }
      }, {
        label: "② Next-Hop 変更",
        text: function(s) {
          return "NH → r2 自身のアドレスに変更";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "2.2.2.2",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65002",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("next-hop-self 設定") + h.dim("soft reconfiguration 適用中...");
        }
      }, {
        label: "③ RIB インストール",
        text: function(s) {
          return "Next-Hop 到達可能 → RIB に追加";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "2.2.2.2",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65002",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("Next-Hop: r2 (到達可能)") + h.dim("RIB: installed") + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "2.2.2.2",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65002",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established, NH reachable") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no neighbor ... next-hop-self";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established, NH = r2") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② NH 変更",
        text: function(s) {
          return "Next-Hop が r3 に戻る → 到達不能";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("Next-Hop: r3 IP (到達不能)") + h.dim("RIB: NOT installed");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "経路あるが転送不能";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established (session OK)") + h.dim("NH unreachable → RIB not installed") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_local_pref: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "r3 (遅い ISP) が best path";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.13.3",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65003",
          origin: "i"
        }, {
          status: "*",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.12.2",
          metric: "0",
          locprf: "50",
          weight: 0,
          as_path: "65002",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("best path: via r3 (遅い ISP)") + h.dim("r3 LP > r2 LP → r3 が優先") + h.dim("通信は可能だが遅い経路");
        }
      }, {
        label: "② あなたのコマンド",
        text: function(s) {
          return "set local-preference 200 (r2)";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.12.2",
          metric: "0",
          locprf: "200",
          weight: 0,
          as_path: "65002",
          origin: "i"
        }, {
          status: "*",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.13.3",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("r2 LP を 200 に設定") + h.dim("r2 LP=200 > r3 LP → r2 が優先");
        }
      }, {
        label: "③ Best Path 変更",
        text: function(s) {
          return "r2 (速い ISP) が best に昇格";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.12.2",
          metric: "0",
          locprf: "200",
          weight: 0,
          as_path: "65002",
          origin: "i"
        }, {
          status: "*",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.13.3",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("best path: via r2 (速い ISP)") + h.dim("LP: r2=200 > r3") + h.action("FORWARD via r2");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功 — 速い ISP 経由";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.12.2",
          metric: "0",
          locprf: "200",
          weight: 0,
          as_path: "65002",
          origin: "i"
        }, {
          status: "*",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.13.3",
          metric: "0",
          locprf: "100",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("best: r2 (fast ISP)") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "set local-preference 50 (r2)";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("best path: via r2 (速い ISP)") + h.dim("LP: r2=200 > r3") + h.action("FORWARD via r2") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② LP 変更",
        text: function(s) {
          return "r2 LP=50 → r3 LP より低い";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("r2 LP=50 < r3 LP=100") + h.dim("r3 が best path に昇格");
        }
      }, {
        label: "③ 遅い ISP 優先",
        text: function(s) {
          return "best path: r3 (遅い ISP)";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("best path: via r3 (遅い ISP)") + h.dim("LP: r3=100 > r2=50") + h.action("FORWARD via r3 (slow)");
        }
      } ]
    },
    bgp_aspath_loop_allowas_in: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "AS-PATH=65002 65001 → 自AS で drop";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP State: Established") + h.dim("受信経路 8.8.8.0/24 AS-PATH に自AS 65002 を含む") + h.dim("inbound で drop") + h.action("DROP (PfxRcd=0)");
        }
      }, {
        label: "② あなたのコマンド",
        text: function(s) {
          return "neighbor 1.1.1.1 allowas-in 1";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("allowas-in 1 設定") + h.dim("自AS を最大 1 回まで AS-PATH に含む経路を受信許容");
        }
      }, {
        label: "③ ループ filter 緩和",
        text: function(s) {
          return "clear bgp 1.1.1.1 soft in";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("inbound 再評価") + h.dim("8.8.8.0/24 (AS-PATH=65002 65001) 受け入れ");
        }
      }, {
        label: "④ RIB インストール",
        text: function(s) {
          return "8.8.8.0/24 が r2 BGP RIB に登場";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP RIB: *> 8.8.8.0/24") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("8.8.8.0/24 経路 OK") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "no neighbor 1.1.1.1 allowas-in";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established / 8.8.8.0/24 受信中") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② ループ filter 復活",
        text: function(s) {
          return "AS-PATH 自AS check 再開";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("allowas-in 削除済み") + h.dim("AS-PATH に自AS 65002 含有 → drop");
        }
      }, {
        label: "③ 経路消失",
        text: function(s) {
          return "8.8.8.0/24 が r2 RIB から消失";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("BGP: Established (維持)") + h.dim("PfxRcd: 0") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_compound_redist_nhs: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "2つの障害: redistribute deny + no NHS";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("障害A: redistribute route-map BLOCK = deny") + h.dim("障害B: next-hop-self 未設定") + h.dim("r1 → 8.8.8.8 通信不能") + h.action("DROP");
        }
      }, {
        label: "② route-map 修正",
        text: function(s) {
          return "BLOCK → permit に変更";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("route-map BLOCK permit 10") + h.dim("r2-r3 セグメント再配布開始") + h.dim("まだ障害B が残存...");
        }
      }, {
        label: "③ next-hop-self 追加",
        text: function(s) {
          return "neighbor ... next-hop-self";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("next-hop-self 設定") + h.dim("NH: r3 IP → r2 Loopback に変更");
        }
      }, {
        label: "④ 経路伝搬",
        text: function(s) {
          return "NH 到達可能 → RIB インストール";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("8.8.8.0/24 NH=2.2.2.2 (到達可能)") + h.dim("RIB: installed") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("redistribute OK + NHS OK") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド (1)",
        text: function(s) {
          return "route-map BLOCK deny 10";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("redistribute OK + NHS OK") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② あなたのコマンド (2)",
        text: function(s) {
          return "no neighbor ... next-hop-self";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.title(s._target) + h.dim("障害A: redistribute blocked") + h.dim("障害B: NHS 削除中...");
        }
      }, {
        label: "③ 複合障害",
        text: function(s) {
          return "再配布 deny + NH 到達不能";
        },
        engine: "fault xray-bgp-idle",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.title(s._target) + h.dim("redistribute: BLOCKED") + h.dim("next-hop: r3 IP (到達不能)") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    bgp_lo_advertise_return_path: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "2つの障害: lo 未OSPF + return path 無";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("障害①: r2 lo(2.2.2.2) が OSPF 未参加 → r1 iBGP Active") + h.dim("障害②: r1-r2 を BGP 未広報 → r3 return path 無") + h.dim("r2: 8.8.8.0/24 受信済 (r3 eBGP)") + h.action("DROP (r1→8.8.8.8)");
        }
      }, {
        label: "② 障害①修復",
        text: function(s) {
          return "r2: OSPF に 2.2.2.2 追加";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: network 2.2.2.2/32 area 0") + h.dim("r1 が 2.2.2.2 を OSPF 学習 → r1-r2 iBGP Established");
        }
      }, {
        label: "③ 障害②修復",
        text: function(s) {
          return "r2: BGP に r1-r2 を広報";
        },
        engine: "cleared xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        }, {
          status: "*>",
          prefix: "10.0.12.0/24",
          nexthop: "0.0.0.0",
          metric: "0",
          locprf: "",
          weight: 32768,
          as_path: "",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("r2: network 10.0.12.0/24 (r1-r2 セグメント)") + h.dim("r3 が r1-r2 を学習 → return path 確立");
        }
      }, {
        label: "④ 経路伝搬",
        text: function(s) {
          return "r1 が 8.8.8.0/24 学習・双方向到達";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        }, {
          status: "*>",
          prefix: "10.0.12.0/24",
          nexthop: "0.0.0.0",
          metric: "0",
          locprf: "",
          weight: 32768,
          as_path: "",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("r1: iBGP で 8.8.8.0/24 学習") + h.dim("echo/reply 双方向 reachable") + h.action("FORWARD");
        }
      }, {
        label: "⑤ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        }, {
          status: "*>",
          prefix: "10.0.12.0/24",
          nexthop: "0.0.0.0",
          metric: "0",
          locprf: "",
          weight: 32768,
          as_path: "",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP Established + return path OK") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① 正常状態",
        text: function(s) {
          return "iBGP + return path 正常";
        },
        engine: "cleared xray-bgp-established",
        arrow: true,
        ping: true,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        }, {
          status: "*>",
          prefix: "10.0.12.0/24",
          nexthop: "0.0.0.0",
          metric: "0",
          locprf: "",
          weight: 32768,
          as_path: "",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP Established / r1-r2 広報済") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② 2障害を再現",
        text: function(s) {
          return "r2: lo を OSPF 除外 + r1-r2 広報削除";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("r1 iBGP Active (2.2.2.2 未学習)") + h.dim("r3 return path 消失 (r1-r2 撤回)");
        }
      }, {
        label: "③ 通信断",
        text: function(s) {
          return "r1 → 8.8.8.8 不達";
        },
        engine: "fault xray-bgp-established",
        arrow: false,
        ping: false,
        bgpRoutes: [ {
          status: "*>",
          prefix: "8.8.8.0/24",
          nexthop: "10.0.23.3",
          metric: "0",
          locprf: "",
          weight: 0,
          as_path: "65003",
          origin: "i"
        } ],
        panel: function(s) {
          return h.title(s._target) + h.dim("iBGP Active + return path 無") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    },
    ospf_cost_detour: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① 現状確認",
        text: function(s) {
          return "direct link cost=1000 → r2 迂回";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("net-r1r3 cost: 1000") + h.dim("r1→r2→r3 cost: 20") + h.dim("迂回パスが選択中");
        }
      }, {
        label: "② あなたのコマンド",
        text: function(s) {
          return "no ip ospf cost";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("コストをデフォルト(10)に戻す") + h.dim("SPF 再計算中...");
        }
      }, {
        label: "③ 直結パス選択",
        text: function(s) {
          return "direct link cost=10 → 直結が最短";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("net-r1r3 cost: 10 (default)") + h.dim("r1→r3 direct: 1 hop") + h.action("FORWARD (direct)");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功 — 直結パス";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("path: direct (1 hop)") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip ospf cost 1000";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("path: direct (1 hop)") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② コスト変更",
        text: function(s) {
          return "direct cost=1000 > detour cost=20";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("net-r1r3 cost: 1000") + h.dim("SPF 再計算 → 迂回パスが最短に");
        }
      }, {
        label: "③ 迂回確定",
        text: function(s) {
          return "r1→r2→r3 (2 hops) が選択";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("path: r1→r2→r3 (detour, 2 hops)") + h.dim("cost: 20 < 1000") + h.action("FORWARD (detour)");
        }
      } ]
    },
    ospf_dr_priority: {
      title: "Recovery Sequence",
      steps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip ospf priority 255";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1 Priority: 低/0 → DR になれない") + h.dim("DR: 別のルータが選出") + h.action("DROP");
        }
      }, {
        label: "② Priority 設定",
        text: function(s) {
          return "Priority を最大値に変更";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1 Priority: 255") + h.dim("clear ip ospf process → DR 再選出");
        }
      }, {
        label: "③ DR 再選出",
        text: function(s) {
          return "r1 が DR に選出";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1: DR (Priority 255)") + h.ospfState("Full") + h.action("FORWARD");
        }
      }, {
        label: "④ Ping",
        text: function(s) {
          return "成功";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1: DR") + h.ospfState("Full") + h.action("FORWARD") + h.ping("0% loss");
        }
      } ],
      destroyTitle: "Destruction Sequence",
      destroySteps: [ {
        label: "① あなたのコマンド",
        text: function(s) {
          return "ip ospf priority 0";
        },
        engine: "cleared ospf-full",
        arrow: true,
        ping: true,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1: DR (Priority 255)") + h.ospfState("Full") + h.action("FORWARD") + h.ping("0% loss") + h.dim("正常稼働中...");
        }
      }, {
        label: "② Priority 変更",
        text: function(s) {
          return "Priority 0 → DR 選出から除外";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1 Priority: 0 → DR/BDR 選出不参加") + h.dim("clear ip ospf process → DR 再選出");
        }
      }, {
        label: "③ DR 変更",
        text: function(s) {
          return "別ルータが DR に → r1 は DROther";
        },
        engine: "fault ospf-full",
        arrow: false,
        ping: false,
        panel: function(s) {
          return h.ospfTitle(s._target) + h.dim("r1: DROther (Priority 0)") + h.dim("DR: r4 に変更") + h.action("DROP") + h.ping("100% loss");
        }
      } ]
    }
  };
  var p = patterns[tracePattern];
  if (!p) {
    console.warn("[xray] Unknown trace_pattern:", tracePattern);
    return null;
  }
  var steps = labMode === "destroy" && p.destroySteps ? p.destroySteps : p.steps;
  var title = labMode === "destroy" && p.destroyTitle ? p.destroyTitle : p.title;
  return {
    steps: steps,
    title: title,
    pattern: tracePattern
  };
};

window.xrayPrepareTraceState = function(state) {
  var s = state;
  var ifaces = s.interfaces || {};
  var ifKeys = Object.keys(ifaces);
  s._wanIf = s.wan_iface || ifKeys[0] || "?";
  s._lanIf = s.lan_iface || ifKeys[ifKeys.length - 1] || "?";
  s._wanIp = ifaces[s._wanIf] ? ifaces[s._wanIf].ip : "";
  s._lanIp = ifaces[s._lanIf] ? ifaces[s._lanIf].ip : "";
  s._nh = s.config_next_hop || s.route_resolution && s.route_resolution.next_hop || "...";
  s._rr = s.route_resolution || {};
  var _capPingDst = window._scenarioConfig && window._scenarioConfig.capture && window._scenarioConfig.capture.ping_dst || "";
  s._target = _capPingDst || s._rr && s._rr.target || "8.8.8.8";
  s._r1Hello = s.r1_hello || 10;
  s._r2Hello = s.r2_hello || 10;
  s._r1Area = s.r1_area || "";
  s._r2Area = s.r2_area || "";
  var _trProto = window._scenarioConfig && window._scenarioConfig.xray && window._scenarioConfig.xray.protocol;
  if (_trProto === "bgp") {
    s.is_established = true;
    s.bgp_state = "Established";
    s.has_bgp_route = true;
  }
  return s;
};

function _xrayTriBottomLinkKey() {
  var cfg = window._scenarioConfig;
  if (!cfg || !cfg.nodes) return null;
  var others = cfg.nodes.filter(function(n) {
    return !n.target;
  });
  if (others.length < 2) return null;
  return [ others[0].id, others[1].id ].sort().join("");
}

function _xrayForceLessonStaticLinks(fs) {
  if (window._scenarioConfig && window._scenarioConfig.xray && window._scenarioConfig.xray.pattern === "ospf_triangle") {
    var btKey = _xrayTriBottomLinkKey();
    if (btKey) {
      fs[btKey + "_has_full"] = true;
      fs[btKey + "_hello_active"] = true;
    }
  }
  return fs;
}

window.xrayBuildClearedState = function(state) {
  if (!state) return null;
  var cs = JSON.parse(JSON.stringify(state));
  cs.cleared = true;
  return _xrayForceLessonStaticLinks(cs);
};

function _xrayApplyDeclaredFaultState(fs, decl) {
  if (!decl || typeof decl !== "object") return;
  var RESERVED = {
    per_peer: 1,
    field_overrides: 1
  };
  Object.keys(decl).forEach(function(k) {
    if (RESERVED[k]) return;
    fs[k] = decl[k];
  });
  if (decl.per_peer && typeof decl.per_peer === "object") {
    Object.keys(decl.per_peer).forEach(function(peerId) {
      var peer = decl.per_peer[peerId];
      if (!peer || typeof peer !== "object") return;
      Object.keys(peer).forEach(function(fld) {
        fs[peerId + "_" + fld] = peer[fld];
      });
    });
  }
  if (decl.field_overrides && typeof decl.field_overrides === "object") {
    Object.keys(decl.field_overrides).forEach(function(k) {
      fs[k] = decl.field_overrides[k];
    });
  }
}

window.xrayBuildFaultState = function(state, tracePattern) {
  if (!state) return null;
  var fs = JSON.parse(JSON.stringify(state));
  fs.ping_ok = false;
  fs.r1_ping_ok = false;
  fs.cleared = false;
  var _tsRR = window._scenarioConfig && window._scenarioConfig.trace_state && window._scenarioConfig.trace_state.route_resolution;
  if (_tsRR && typeof _tsRR === "object" && _tsRR.resolved) {
    fs.route_resolution = JSON.parse(JSON.stringify(_tsRR));
  } else if (fs.route_resolution) {
    fs.route_resolution.resolved = false;
    fs.route_resolution.installed = false;
  }
  var _tsHolo = window._scenarioConfig && window._scenarioConfig.trace_state && window._scenarioConfig.trace_state.holo;
  if (_tsHolo && typeof _tsHolo === "object") {
    Object.keys(_tsHolo).forEach(function(k) {
      fs[k] = _tsHolo[k];
    });
    if (_tsHolo.ping_ok === true) {
      fs.ping_ok = true;
      fs.r1_ping_ok = true;
    }
  }
  var _cfg = window._scenarioConfig;
  var _declaredFault = _cfg && _cfg.xray && _cfg.xray.fault_state;
  if (_declaredFault) {
    _xrayApplyDeclaredFaultState(fs, _declaredFault);
    _xrayForceLessonStaticLinks(fs);
    return fs;
  }
  switch (tracePattern) {
   case "static_if_down":
    var wanKey = fs.wan_iface;
    if (wanKey && fs.interfaces && fs.interfaces[wanKey]) fs.interfaces[wanKey].up = false;
    fs.iface_up = false;
    fs.has_default_route = false;
    break;

   case "static_route_missing":
    fs.has_default_route = false;
    fs.iface_up = true;
    break;

   case "static_ospf_override":
    fs.iface_up = true;
    fs.has_static = true;
    fs.static_is_best = true;
    fs.ospf_route_available = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.peer_sending_hello = true;
    fs.neighbor_state = "Full";
    fs.has_full = true;
    fs.has_ospf_route = true;
    if (fs.route_resolution) {
      fs.route_resolution.resolved = true;
      fs.route_resolution.matched_prefix = fs.route_resolution.target ? fs.route_resolution.target + "/32" : "2.2.2.2/32";
    }
    break;

   case "ospf_missing":
    fs.iface_up = true;
    fs.ospf_configured = false;
    fs.ospf_active_on_interface = false;
    fs.neighbor_state = "None";
    fs.has_full = false;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = false;
    break;

   case "static_nh_wrong":
    fs.iface_up = true;
    fs.has_default_route = true;
    if (fs.route_resolution) fs.route_resolution.resolved = false;
    break;

   case "ospf_timer_mismatch":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = true;
    fs.r1_hello = 10;
    fs.target_hello = 10;
    fs.timer_match = false;
    var _peerHasFullKey = state.peer_id ? state.peer_id + "_has_full" : null;
    if (_peerHasFullKey && state[_peerHasFullKey] !== undefined) {
      fs[_peerHasFullKey] = false;
      fs[state.peer_id + "_neighbor_state"] = "None";
    } else {
      fs.neighbor_state = "None";
      fs.has_full = false;
    }
    break;

   case "ospf_area_mismatch":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.neighbor_state = "None";
    fs.has_full = false;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = true;
    fs.area_match = false;
    break;

   case "ospf_passive":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = false;
    fs.neighbor_state = "None";
    fs.has_full = false;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = false;
    fs.is_passive = true;
    break;

   case "ospf_redistribute_deny":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.neighbor_state = "Full";
    fs.has_full = true;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = true;
    fs.route_map_status = "deny";
    break;

   case "bgp_neighbor_ip":
    fs.iface_up = true;
    fs.is_established = false;
    fs.bgp_state = "Idle";
    fs.has_bgp_route = false;
    break;

   case "bgp_update_source":
    fs.iface_up = true;
    fs.is_established = false;
    fs.bgp_state = "Active";
    fs.has_bgp_route = false;
    break;

   case "bgp_prefix_list":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = false;
    break;

   case "bgp_max_prefix":
    fs.iface_up = true;
    fs.is_established = false;
    fs.bgp_state = "Idle";
    fs.has_bgp_route = false;
    break;

   case "bgp_as_path_filter":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = false;
    break;

   case "bgp_not_advertised":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = false;
    break;

   case "bgp_next_hop_self":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = true;
    fs.rib_installed = false;
    break;

   case "bgp_local_pref":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = true;
    break;

   case "bgp_aspath_loop_allowas_in":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = false;
    fs.rib_installed = false;
    break;

   case "bgp_lo_advertise_return_path":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = true;
    fs.rib_installed = true;
    break;

   case "bgp_compound_redist_nhs":
    fs.iface_up = true;
    fs.is_established = true;
    fs.bgp_state = "Established";
    fs.has_bgp_route = true;
    fs.rib_installed = false;
    break;

   case "ospf_cost_detour":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.has_full = true;
    fs.has_ospf_route = true;
    break;

   case "ospf_dr_priority":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.has_full = true;
    fs.has_ospf_route = false;
    fs.r1_is_dr = false;
    break;

   case "ospf_area_floating":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.neighbor_state = "None";
    fs.has_full = false;
    fs.has_ospf_route = false;
    fs.peer_sending_hello = true;
    fs.area_match = false;
    fs.has_floating_static = false;
    break;

   case "static_ad_override":
    fs.iface_up = true;
    fs.ospf_configured = true;
    fs.ospf_active_on_interface = true;
    fs.has_full = true;
    fs.has_ospf_route = true;
    var _fsScen = state.scenario || window._scenarioConfig && window._scenarioConfig.id || "";
    if (_fsScen === "q16" || _fsScen === "q11") {
      fs.has_static = true;
      fs.static_via_r2 = true;
      fs.path_direct = false;
      fs.ping_ok = true;
      fs.r1_ping_ok = true;
      fs.cleared = false;
      if (!fs.route_resolution) fs.route_resolution = {};
      fs.route_resolution.resolved = true;
      fs.route_resolution.installed = true;
      fs.route_resolution.protocol = "static";
      if (!fs.route_resolution.matched_prefix) {
        fs.route_resolution.matched_prefix = (fs.route_resolution.target || "3.3.3.3") + "/32";
      }
      if (fs.r2_iface) fs.route_resolution.out_iface = fs.r2_iface;
      var _nh = fs.selected_nh || "";
      if (!_nh && fs.interfaces && fs.r2_iface && fs.interfaces[fs.r2_iface]) {
        var _myip = String(fs.interfaces[fs.r2_iface].ip || "").split("/")[0];
        if (/\.\d+$/.test(_myip)) _nh = _myip.replace(/\.\d+$/, ".20");
      }
      if (_nh) fs.route_resolution.next_hop = _nh;
    } else {
      fs.has_static = false;
    }
    break;

   case "dual_static_rid":
    fs.iface_up = true;
    fs.has_static = true;
    fs.static_nh_valid = false;
    fs.static_is_best = true;
    fs.rid_duplicate = true;
    fs.has_full = false;
    fs.neighbor_state = "None";
    fs.r2_has_full = false;
    fs.r2_neighbor_state = "None";
    fs.r3_has_full = false;
    fs.r3_neighbor_state = "None";
    fs.has_ospf = false;
    fs.has_ospf_route = false;
    fs.ospf_active_on_interface = true;
    fs.peer_sending_hello = true;
    if (fs.route_resolution) {
      fs.route_resolution.protocol = "static";
      fs.route_resolution.matched_prefix = fs.route_resolution.target ? fs.route_resolution.target + "/32" : "3.3.3.3/32";
      if (!fs.route_resolution.resolved && (fs.route_resolution.out_iface || fs.r3_iface)) {
        fs.route_resolution.resolved = true;
        if (!fs.route_resolution.out_iface && fs.r3_iface) fs.route_resolution.out_iface = fs.r3_iface;
      }
    }
    break;

   default:
    fs.has_default_route = false;
    break;
  }
  if (fs.has_bgp_route === false && fs.route_resolution) {
    fs.route_resolution.resolved = false;
    fs.route_resolution.installed = false;
  }
  _xrayForceLessonStaticLinks(fs);
  return fs;
};

function _xrayApplyDualLinkHello(s, leftIf, rightIf, leftNode, rightNode) {
  if (typeof _xrayUnifiedActive === "function" && _xrayUnifiedActive(window._scenarioConfig || {})) {
    var _duh = document.querySelectorAll(".de-hello-orb");
    for (var _du = 0; _du < _duh.length; _du++) {
      if (_duh[_du].style && _duh[_du].style.setProperty) {
        _duh[_du].style.setProperty("animation", "none", "important");
        _duh[_du].style.setProperty("display", "none", "important");
      }
    }
    return;
  }
  var ifaces = s.interfaces || {};
  var hellos = s.iface_hellos || {};
  var peerHellos = s.peer_hellos || {};
  var _deHM = document.querySelector(".xray-deep-engine");
  var _kfParts = [];
  var _travSec = typeof _XRAY_DE !== "undefined" && _XRAY_DE.helloTravelSec > 0 ? _XRAY_DE.helloTravelSec : 2;
  var _mkKf = function(name, from, to, period) {
    var tp = Math.max(8, Math.min(80, Math.round(_travSec / (period || 10) * 100)));
    var fp = Math.min(tp + 12, 90);
    return "@keyframes " + name + "{0%{left:" + from + ";opacity:0}4%{opacity:0.95}" + tp + "%{left:" + to + ";opacity:0.9}" + fp + "%{left:" + to + ";opacity:0}100%{left:" + to + ";opacity:0}}";
  };
  var _selfId = typeof xrayDeepTargetRouter === "function" ? String(xrayDeepTargetRouter() || "").replace("topo-node-", "") : "";
  var _selfIdR = window._triNodes && window._triNodes.target || _selfId;
  var _isTraceH = document.body.classList.contains("trace-active");
  if (!_isTraceH) {
    var _hpc = window._xrayHelloPeriodCache || (window._xrayHelloPeriodCache = {
      iface: {},
      node: {}
    });
    for (var _hk in hellos) {
      if (hellos[_hk] > 0) _hpc.iface[_hk] = hellos[_hk];
    }
    Object.keys(s).forEach(function(k) {
      var m = k.match(/^(.+)_hello$/);
      if (m && s[k] > 0) _hpc.node[m[1]] = s[k];
    });
  }
  var _hpcU = window._xrayHelloPeriodCache || {
    iface: {},
    node: {}
  };
  function drive(outOrb, inOrb, ifName, peerNode, kfOut, kfIn) {
    var up = ifName && ifaces[ifName] && ifaces[ifName].up;
    var active = ifName && Object.prototype.hasOwnProperty.call(hellos, ifName);
    var showOut = active && up;
    var _psm = s.peer_sending_hellos;
    var peerSending;
    if (peerNode && _psm && Object.prototype.hasOwnProperty.call(_psm, peerNode)) {
      peerSending = !!_psm[peerNode];
    } else if (peerNode && peerNode === s.peer_id && s.peer_sending_hello !== undefined) {
      peerSending = !!s.peer_sending_hello;
    } else {
      peerSending = active;
    }
    var showIn = up && peerSending;
    var _selfH = _selfIdR && s[_selfIdR + "_hello"] > 0 ? s[_selfIdR + "_hello"] : 0;
    var _peerH = peerNode && s[peerNode + "_hello"] > 0 ? s[peerNode + "_hello"] : 0;
    var _traceOutH = _isTraceH ? _hpcU.iface[ifName] > 0 ? _hpcU.iface[ifName] : _selfIdR && _hpcU.node[_selfIdR] > 0 ? _hpcU.node[_selfIdR] : 0 : 0;
    var _traceInH = _isTraceH ? peerNode && _hpcU.node[peerNode] > 0 ? _hpcU.node[peerNode] : 0 : 0;
    var outH = _traceOutH > 0 ? _traceOutH : hellos[ifName] > 0 ? hellos[ifName] : _hpcU.iface[ifName] > 0 ? _hpcU.iface[ifName] : _selfH || _selfIdR && _hpcU.node[_selfIdR] || 10;
    var inH = _traceInH > 0 ? _traceInH : peerNode && peerHellos[peerNode] > 0 ? peerHellos[peerNode] : _peerH || peerNode && _hpcU.node[peerNode] || outH;
    var _phF = /Left/.test(kfOut) && _XRAY_DE.helloLeftPhaseFrac > 0 ? _XRAY_DE.helloLeftPhaseFrac : 0;
    var _srF = _XRAY_DE.helloSendRecvPhaseFrac > 0 ? _XRAY_DE.helloSendRecvPhaseFrac : 0;
    var _inDelay = Math.floor(inH / 2) - inH * _phF + inH * _srF;
    var _isLeftB = /Left/.test(kfOut);
    var _far = _isLeftB ? _deHM && _deHM._helloFarL : _deHM && _deHM._helloFarR;
    if (_far > 0) {
      var _fromC = _isLeftB ? "calc(50% - 10px)" : "calc(50% + 10px)";
      var _endStr = _isLeftB ? "calc(50% - " + _far + "px)" : "calc(50% + " + _far + "px)";
      _kfParts.push(_mkKf(kfOut + "P", _fromC, _endStr, outH));
      _kfParts.push(_mkKf(kfIn + "P", _endStr, _fromC, inH));
    }
    var _oAnim = kfOut + "P " + outH + "s linear " + (-(outH * _phF)).toFixed(2) + "s infinite";
    var _iAnim = kfIn + "P " + inH + "s linear " + _inDelay.toFixed(2) + "s infinite";
    if (outOrb) {
      var _sigO = showOut ? "b|" + _oAnim : "n";
      if (outOrb._helloSig !== _sigO) {
        if (showOut) {
          outOrb.style.setProperty("display", "block", "important");
          outOrb.style.setProperty("animation", _oAnim, "important");
        } else {
          outOrb.style.setProperty("display", "none", "important");
          outOrb.style.setProperty("animation", "none", "important");
        }
        outOrb._helloSig = _sigO;
      }
    }
    if (inOrb) {
      var _sigI = showIn ? "b|" + _iAnim : "n";
      if (inOrb._helloSig !== _sigI) {
        if (showIn) {
          inOrb.style.setProperty("display", "block", "important");
          inOrb.style.setProperty("animation", _iAnim, "important");
        } else {
          inOrb.style.setProperty("display", "none", "important");
          inOrb.style.setProperty("animation", "none", "important");
        }
        inOrb._helloSig = _sigI;
      }
    }
  }
  drive(document.querySelector(".de-hello-orb.left-out"), document.querySelector(".de-hello-orb.left-in"), leftIf, leftNode, "deHelloLeftOut", "deHelloLeftIn");
  drive(document.querySelector(".de-hello-orb.out"), document.querySelector(".de-hello-orb.in"), rightIf, rightNode, "deHelloOut", "deHelloIn");
  if (_deHM && _kfParts.length) {
    var _okfH = document.getElementById("xray-de-hello-kf");
    if (!_okfH) {
      _okfH = document.createElement("style");
      _okfH.id = "xray-de-hello-kf";
      (document.head || document.body).appendChild(_okfH);
    }
    var _cssH = _kfParts.join("");
    if (_okfH.textContent !== _cssH) _okfH.textContent = _cssH;
  }
}

function _xrayDeepDeconflict() {
  return window._xrayDeepReady === false && document.body.classList.contains("is-xray-deep") && !document.body.classList.contains("is-replaying") && !document.body.classList.contains("trace-active");
}

(function(root) {
  "use strict";
  var PRESETS = {
    cinema: {
      engineShape: "rect",
      processGlyph: "outside",
      arrowMode: "proto",
      tunnelMode: "concentric",
      panelContent: "full",
      protocolOrder: "bgp-top"
    },
    light: {
      engineShape: "circle",
      processGlyph: "none",
      arrowMode: "mono",
      tunnelMode: "concentric",
      panelContent: "none",
      protocolOrder: "bgp-top"
    }
  };
  function resolveAxes(a) {
    var base = a && a.preset && PRESETS[a.preset] ? PRESETS[a.preset] : PRESETS.cinema;
    var out = {};
    Object.keys(base).forEach(function(k) {
      out[k] = a && a[k] != null ? a[k] : base[k];
    });
    return out;
  }
  function xrayRadialGeometry(node, opt) {
    opt = opt || {};
    var pos = node.positions || {}, self = pos[node.target] || null;
    var realang = opt.realAngle !== false;
    var links = (node.links || []).map(function(lk) {
      return {
        iface: lk.iface,
        peer: lk.peer,
        link: lk
      };
    });
    var miss = [];
    links.forEach(function(L) {
      var pp = pos[L.peer];
      if (realang && self && pp) L.angle = Math.atan2(pp.y - self.y, pp.x - self.x); else {
        L.angle = null;
        miss.push(L);
      }
    });
    miss.forEach(function(L, i) {
      L.angle = -Math.PI / 2 + (i + 1) * (Math.PI / (miss.length + 1));
    });
    if (opt.legacyPin) {
      if (links.length === 1) links[0].angle = 0; else if (links.length === 2) {
        links[0].angle = Math.PI;
        links[1].angle = 0;
      }
    }
    return links;
  }
  function linkLayers(link) {
    return (link.protocols || []).filter(function(p) {
      return p.up;
    });
  }
  function protoCol(p) {
    return p === "bgp" ? "var(--xto-bgp,#a855f7)" : p === "static" ? "var(--xto-static,#ffb347)" : "var(--xto-ospf,#39ff14)";
  }
  function xrayRenderUnified(node, axes) {
    var ax = resolveAxes(axes);
    var rich = ax.engineShape === "rect";
    var shape = ax.engineShape === "rect" ? "rect" : "circle";
    var imm = axes && axes.immersive;
    var W = imm ? axes && +axes.viewW > 300 ? Math.round(+axes.viewW) : 1125 : 460, H = imm ? axes && +axes.viewH > 300 ? Math.round(+axes.viewH) : 400 : 340, CX = W / 2, CY = H / 2;
    var lp = !!(axes && axes.legacyPin);
    var fullFrame = imm && rich;
    var R = imm ? Math.round(W * .485) : 140, HW = fullFrame ? Math.round(W * .4833) : imm ? Math.round(W * .44) : 66, HH = fullFrame ? Math.round(H * .4857) : imm ? 150 : 46, RER = imm ? 150 : 32;
    var CYLW = fullFrame ? 64 : imm ? 46 : HW * .4, CYLH = fullFrame ? 168 : imm ? 88 : HH * .44;
    var cylEdge = function(a) {
      var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? CYLW / Math.abs(dx) : 1e9, dy ? CYLH / Math.abs(dy) : 1e9);
      return [ CX + dx * t, CY + dy * t ];
    };
    var links = xrayRadialGeometry(node, axes || {});
    function pt(a, r) {
      return [ CX + Math.cos(a) * r, CY + Math.sin(a) * r ];
    }
    function bodyEdge(a) {
      if (shape === "rect") {
        var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? HW / Math.abs(dx) : 1e9, dy ? HH / Math.abs(dy) : 1e9);
        return [ CX + dx * t, CY + dy * t ];
      }
      return pt(a, RER);
    }
    function reachFor(a) {
      if (!imm) return R;
      var ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      if (fullFrame) {
        var _vy = lp ? HH : Math.max(HH - 42, HH * .7);
        return Math.min(ca > .01 ? HW / ca : 1e9, sa > .01 ? _vy / sa : 1e9);
      }
      var mx = CX - 18, my = CY - 52;
      return Math.min(R, Math.min(ca > .01 ? mx / ca : 1e9, sa > .01 ? my / sa : 1e9));
    }
    function ln(p, q, col, w, glow, dash, op) {
      return '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (dash ? ' stroke-dasharray="6 5"' : "") + (op != null && op < 1 ? ' opacity="' + op + '"' : "") + (glow ? ' style="filter:drop-shadow(0 0 4px ' + col + ')"' : "") + "/>";
    }
    function protoStyle(p) {
      if (!p || p.proto === "static") return null;
      if (p.proto === "bgp") return node.bgpProcRunning === false ? null : p.up ? {
        col: "var(--xto-bgp,#a855f7)",
        dash: 0,
        op: 1
      } : {
        col: "var(--xto-bgp,#a855f7)",
        dash: 1,
        op: .42
      };
      var st = String(p.fsm || "").split("/")[0], orange = "var(--xto-idle,#ff8c00)", green = "var(--xto-ospf,#39ff14)";
      if (st === "Full") return {
        col: green,
        dash: 0,
        op: 1
      };
      if (st === "ExStart" || st === "Exchange" || st === "Loading") return {
        col: green,
        dash: 1,
        op: 1
      };
      if (st === "2-Way") return {
        col: orange,
        dash: 0,
        op: 1
      };
      if (st === "Init" || st === "Attempt") return {
        col: orange,
        dash: 1,
        op: 1
      };
      return null;
    }
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" class="xu-fig">';
    links.forEach(function(L) {
      if (fullFrame) return;
      var a = L.angle, r0 = bodyEdge(a), reach = reachFor(a), ex = pt(a, reach), layers = linkLayers(L.link), linkUp = L.link.up !== false, markerCol;
      var perp = [ -Math.sin(a), Math.cos(a) ];
      function offLn(off, col, w, glow, dash, op) {
        return ln([ r0[0] + perp[0] * off, r0[1] + perp[1] * off ], [ ex[0] + perp[0] * off, ex[1] + perp[1] * off ], col, w, glow, dash, op);
      }
      var lw = rich ? 2 : 1.8, gap = rich ? 4 : 3;
      if (!linkUp) {
        s += '<line x1="' + r0[0].toFixed(1) + '" y1="' + r0[1].toFixed(1) + '" x2="' + ex[0].toFixed(1) + '" y2="' + ex[1].toFixed(1) + '" stroke="var(--xto-linkDown,#ff4d4d)" stroke-width="' + (rich ? 3.5 : 2.5) + '" stroke-dasharray="6 5" stroke-linecap="round"/>';
        markerCol = "var(--xto-linkDown,#ff4d4d)";
      } else {
        s += offLn(0, "var(--xto-link,#00e5ff)", lw, false);
        var _allP = L.link.protocols || [];
        var _ringP = ax.tunnelMode === "concentric" ? _allP.slice().reverse() : _allP[0] ? [ _allP[0] ] : [];
        var gapX = imm ? 3 : 2, _ri = 0;
        _ringP.forEach(function(p) {
          var stl = protoStyle(p);
          if (!stl) return;
          var off = lw + gap + gapX + _ri * (lw + 2);
          var glow = stl.op >= 1 && !stl.dash;
          s += offLn(+off, stl.col, lw, glow, stl.dash, stl.op);
          s += offLn(-off, stl.col, lw, glow, stl.dash, stl.op);
          _ri++;
        });
        markerCol = "var(--xto-link,#00e5ff)";
      }
    });
    if (shape === "rect") s += '<rect x="' + (CX - HW) + '" y="' + (CY - HH) + '" width="' + HW * 2 + '" height="' + HH * 2 + '" rx="14" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-ok,#39ff14)" stroke-width="2"/>'; else s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + RER + '" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-fg,#e6f2f5)" stroke-width="2"/>';
    if (shape === "rect" && rich) {
      var cw = CYLW, cyT = CY - CYLH, cyB = CY + CYLH, ery = cw * (fullFrame ? .275 : imm ? .3 : .34);
      var oCap = imm ? .55 : .26, oSide = imm ? .42 : .2, oBot = imm ? .5 : .18, cCol = imm ? "var(--xto-link,#00e5ff)" : "var(--xto-fg,#e6f2f5)";
      s += '<ellipse cx="' + CX + '" cy="' + cyT.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + ery.toFixed(1) + '" fill="none" stroke="' + cCol + '" stroke-width="1" opacity="' + oCap + '"/>';
      s += '<line x1="' + (CX - cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX - cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="' + cCol + '" stroke-width="1" opacity="' + oSide + '"/>';
      s += '<line x1="' + (CX + cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX + cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="' + cCol + '" stroke-width="1" opacity="' + oSide + '"/>';
      if (imm) s += '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + cw.toFixed(1) + '" ry="' + ery.toFixed(1) + '" fill="none" stroke="' + cCol + '" stroke-width="1" opacity="0.16"/>';
      s += '<ellipse cx="' + CX + '" cy="' + cyB.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + ery.toFixed(1) + '" fill="none" stroke="' + cCol + '" stroke-width="1" opacity="' + oBot + '"/>';
    }
    if (imm && shape === "rect" && rich) {
      links.forEach(function(L) {
        var a = L.angle, ce = cylEdge(a), be = bodyEdge(a), linkUp = L.link.up !== false, iperp = [ -Math.sin(a), Math.cos(a) ];
        function ioff(o, col, w, glow, dash, op) {
          return ln([ ce[0] + iperp[0] * o, ce[1] + iperp[1] * o ], [ be[0] + iperp[0] * o, be[1] + iperp[1] * o ], col, w, glow, dash, op);
        }
        if (!linkUp) {
          s += '<line x1="' + ce[0].toFixed(1) + '" y1="' + ce[1].toFixed(1) + '" x2="' + be[0].toFixed(1) + '" y2="' + be[1].toFixed(1) + '" stroke="var(--xto-linkDown,#ff4d4d)" stroke-width="3.5" stroke-dasharray="6 5" stroke-linecap="round"/>';
        } else {
          s += ioff(0, "var(--xto-link,#00e5ff)", 2, false);
          var _iri = 0;
          (L.link.protocols || []).slice().reverse().forEach(function(p) {
            var stl = protoStyle(p);
            if (!stl) return;
            var o = 2 + 4 + 3 + _iri * 4;
            var g = stl.op >= 1 && !stl.dash;
            s += ioff(+o, stl.col, 2, g, stl.dash, stl.op) + ioff(-o, stl.col, 2, g, stl.dash, stl.op);
            _iri++;
          });
          s += '<circle cx="' + ce[0].toFixed(1) + '" cy="' + ce[1].toFixed(1) + '" r="3.5" fill="var(--xto-link,#00e5ff)"/>';
        }
      });
    }
    links.forEach(function(L) {
      var m = bodyEdge(L.angle), mc = L.link.up !== false ? "var(--xto-link,#00e5ff)" : "var(--xto-linkDown,#ff4d4d)";
      s += '<rect x="' + (m[0] - 4).toFixed(1) + '" y="' + (m[1] - 4).toFixed(1) + '" width="8" height="8" fill="var(--xto-bg,#0d1620)" stroke="' + mc + '" stroke-width="1.5"/>';
    });
    links.forEach(function(L) {
      if (ax.panelContent !== "full") return;
      var a = L.angle, linkUp = L.link.up !== false, _co = Math.cos(a);
      if (imm) {
        var _pin = !(node.positions && Object.keys(node.positions).length);
        var base = _pin ? bodyEdge(a) : pt(a, reachFor(a));
        var _lblIn = fullFrame && lp ? -1 : 1;
        var lx = (base[0] + _co * 8 * _lblIn).toFixed(1), by = base[1];
        var anc = fullFrame && lp ? _co > .35 ? "end" : _co < -.35 ? "start" : "middle" : _co > .35 ? "start" : _co < -.35 ? "end" : "middle";
        var col = "var(--xto-link,#00e5ff)";
        var l2 = L.peer ? "- " + L.peer : "";
        var _nr = (L.link.protocols || []).filter(function(p) {
          return p && p.proto && p.proto !== "static";
        }).length;
        var _outer = _nr ? 10 + (_nr - 1) * 4 + 5 : 4;
        var _ly1 = by + _outer + 15, _ly2 = _ly1 + 14;
        if (!(fullFrame && lp)) {
          var _one = L.iface + (L.peer ? " - " + L.peer : "");
          var _lyR = CY + HH + 16;
          s += '<text x="' + lx + '" y="' + _lyR.toFixed(1) + '" fill="' + col + '" font-size="12" font-family="monospace" text-anchor="' + anc + '" paint-order="stroke" stroke="var(--xto-bg,#0d1620)" stroke-width="3" stroke-linejoin="round">' + _one + "</text>";
          return;
        }
        s += '<text x="' + lx + '" y="' + _ly1.toFixed(1) + '" fill="' + col + '" font-size="12" font-family="monospace" text-anchor="' + anc + '">' + L.iface + "</text>";
        if (l2) s += '<text x="' + lx + '" y="' + _ly2.toFixed(1) + '" fill="' + col + '" font-size="12" font-family="monospace" text-anchor="' + anc + '">' + l2 + "</text>";
        return;
      }
      var reach = reachFor(a), lbl = L.iface + (L.peer ? " - " + L.peer : "");
      var lp = pt(a, reach + 6), anc2 = _co < -.35 ? "end" : _co > .35 ? "start" : "middle";
      s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" fill="var(--xto-accent,#7fb2c2)" font-size="12" font-family="monospace" text-anchor="' + anc2 + '">' + lbl + "</text>";
    });
    if (ax.processGlyph === "inside" || ax.processGlyph === "outside") {
      var order = [], rank = {
        bgp: 2,
        ospf: 1,
        static: 0
      }, upset = {}, ospfFwd = false;
      (node.links || []).forEach(function(lk) {
        (lk.protocols || []).forEach(function(p) {
          if (order.indexOf(p.proto) < 0) order.push(p.proto);
          if (p.up) upset[p.proto] = 1;
          if (p.proto === "ospf") {
            var _st = String(p.fsm || "").split("/")[0];
            if (_st === "Full" || _st === "ExStart" || _st === "Exchange" || _st === "Loading") ospfFwd = true;
          }
        });
      });
      if (node.deepCoexistOspf && node.ospfProcRunning === false && order.indexOf("ospf") < 0) order.push("ospf");
      order.sort(function(a, b) {
        return (rank[b] || 0) - (rank[a] || 0);
      });
      if (ax.protocolOrder === "ospf-top") order.reverse();
      var topY = shape === "rect" ? CY - HH : CY - RER, leftX = shape === "rect" ? CX - HW : CX - RER;
      var gFs = imm ? 18 : 10.5, gR = imm ? 7 : 4, gLh = imm ? 24 : 14, gGap = imm ? 13 : 8, gDy = imm ? 5 : 3;
      function glyphCol(p) {
        if (p === "ospf") return !node.ospfProcRunning ? "var(--xto-down,#555)" : ospfFwd ? "var(--xto-ospf,#39ff14)" : "var(--xto-idle,#ff8c00)";
        if (p === "bgp") return node.bgpProcRunning === false ? "var(--xto-down,#555)" : upset[p] ? "var(--xto-bgp,#a855f7)" : "var(--xto-idle,#ff8c00)";
        return "var(--xto-pale,#8aa0ab)";
      }
      function glyphRow(p, lx, ly) {
        var col = glyphCol(p);
        return '<circle cx="' + lx.toFixed(1) + '" cy="' + (ly - gDy).toFixed(1) + '" r="' + gR + '" fill="' + col + '"/>' + '<text x="' + (lx + gGap).toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + col + '" font-size="' + gFs + '" font-family="monospace">' + p.toUpperCase() + "</text>";
      }
      var gp = axes && axes.glyphPos || "inner";
      if (imm && gp !== "outer") {
        var cyTop = CY - CYLH * .5;
        order.forEach(function(p, i) {
          var lw = p.length * gFs * .6;
          s += glyphRow(p, CX - (gGap + lw) / 2, cyTop + i * gLh);
        });
      } else if (ax.processGlyph === "inside") {
        order.forEach(function(p, i) {
          s += glyphRow(p, leftX + (imm ? 14 : 9), topY + (imm ? 26 : 15) + i * gLh);
        });
      } else {
        var angs = links.map(function(L) {
          return L.angle;
        }).sort(function(a, b) {
          return a - b;
        });
        var gapMid = -Math.PI / 2, gapSize = -1;
        for (var gi = 0; gi < angs.length; gi++) {
          var a1 = angs[gi], a2 = gi + 1 < angs.length ? angs[gi + 1] : angs[0] + 2 * Math.PI, g = a2 - a1;
          if (g > gapSize) {
            gapSize = g;
            gapMid = a1 + g / 2;
          }
        }
        if (gapMid > Math.PI) gapMid -= 2 * Math.PI;
        var lr = (shape === "rect" ? Math.max(HW, HH) : RER) + (imm ? 52 : 26), anc = pt(gapMid, lr), totalH = order.length * gLh;
        order.forEach(function(p, i) {
          s += glyphRow(p, anc[0] - (imm ? 20 : 14), anc[1] - totalH / 2 + 10 + i * gLh);
        });
      }
    }
    var fwd = !(axes && axes.forwarding === false);
    var selL = links.filter(function(L) {
      return L.link.selected;
    })[0] || links[0];
    var _inLtr = links.filter(function(L) {
      return L !== selL && L.link.up !== false;
    })[0];
    var _canTr = (axes && axes.pingMode || "from-r1") === "through" && !!_inLtr && !(axes && axes.realAngle);
    if (selL && fwd) {
      var oa = selL.angle, hs = imm ? 14 : 9, ti, from;
      if (imm) {
        from = [ CX, CY ];
        var _ceA = cylEdge(oa);
        ti = [ _ceA[0] - Math.cos(oa) * 6, _ceA[1] - Math.sin(oa) * 6 ];
      } else {
        var _e = bodyEdge(oa);
        ti = [ _e[0] - Math.cos(oa) * 9, _e[1] - Math.sin(oa) * 9 ];
        from = pt(oa, (shape === "rect" ? Math.min(HW, HH) : RER) * .2);
      }
      if (_canTr) from = imm ? cylEdge(_inLtr.angle) : bodyEdge(_inLtr.angle);
      var acol = ax.arrowMode === "proto" ? protoCol((linkLayers(selL.link)[0] || {}).proto) : "var(--xto-ok,#39ff14)";
      s += ln(from, ti, acol, 3.5, false);
      s += '<polygon fill="' + acol + '" points="' + ti[0].toFixed(1) + "," + ti[1].toFixed(1) + " " + (ti[0] - Math.cos(oa - .5) * hs).toFixed(1) + "," + (ti[1] - Math.sin(oa - .5) * hs).toFixed(1) + " " + (ti[0] - Math.cos(oa + .5) * hs).toFixed(1) + "," + (ti[1] - Math.sin(oa + .5) * hs).toFixed(1) + '"/>';
    }
    var spd = axes && +axes.animSpeed || 1;
    if (axes && axes.animMode === "on") {
      var _pm = axes && axes.pingMode || "from-r1";
      var _pDur = 4 / spd;
      var _reach = !(axes && axes.reachable === false);
      function _pOrb(a0, a1, delay) {
        var dx = (a1[0] - a0[0]).toFixed(1), dy = (a1[1] - a0[1]).toFixed(1), bg = delay ? ' begin="' + delay.toFixed(2) + 's"' : "";
        return '<circle cx="' + a0[0].toFixed(1) + '" cy="' + a0[1].toFixed(1) + '" r="' + (rich ? 4 : 3) + '" fill="var(--xto-link,#00e5ff)" opacity="0" style="filter:drop-shadow(0 0 5px var(--xto-link,#00e5ff))">' + '<animateMotion dur="' + _pDur.toFixed(2) + 's"' + bg + ' repeatCount="indefinite" calcMode="linear" keyTimes="0;0.48;1" keyPoints="0;1;1" path="M 0 0 L ' + dx + " " + dy + '"/>' + '<animate attributeName="opacity" dur="' + _pDur.toFixed(2) + 's"' + bg + ' repeatCount="indefinite" keyTimes="0;0.04;0.45;0.48;1" values="0;1;0.85;0;0"/></circle>';
      }
      function _pOrb3(a0, amid, a1, delay) {
        var d1x = (amid[0] - a0[0]).toFixed(1), d1y = (amid[1] - a0[1]).toFixed(1), d2x = (a1[0] - a0[0]).toFixed(1), d2y = (a1[1] - a0[1]).toFixed(1), bg = delay ? ' begin="' + delay.toFixed(2) + 's"' : "";
        return '<circle cx="' + a0[0].toFixed(1) + '" cy="' + a0[1].toFixed(1) + '" r="' + (rich ? 4 : 3) + '" fill="var(--xto-link,#00e5ff)" opacity="0" style="filter:drop-shadow(0 0 5px var(--xto-link,#00e5ff))">' + '<animateMotion dur="' + _pDur.toFixed(2) + 's"' + bg + ' repeatCount="indefinite" calcMode="linear" keyTimes="0;0.24;0.48;1" keyPoints="0;0.5;1;1" path="M 0 0 L ' + d1x + " " + d1y + " L " + d2x + " " + d2y + '"/>' + '<animate attributeName="opacity" dur="' + _pDur.toFixed(2) + 's"' + bg + ' repeatCount="indefinite" keyTimes="0;0.04;0.45;0.48;1" values="0;1;0.85;0;0"/></circle>';
      }
      var _egL = selL, _inL = links.filter(function(L) {
        return L !== _egL && L.link.up !== false;
      })[0];
      var _canTransit = _pm === "through" && !!_inL && !(axes && axes.realAngle);
      if (fwd && selL && _reach) {
        if (_canTransit) {
          var _ia = _inL.angle, _ea = _egL.angle, _iEnd = pt(_ia, reachFor(_ia) - 6), _eEnd = pt(_ea, reachFor(_ea) - 6), _ctr = [ CX, CY ];
          s += _pOrb3(_iEnd, _ctr, _eEnd, 0);
          s += _pOrb3(_eEnd, _ctr, _iEnd, _pDur * .5);
        } else {
          var pa = _egL.angle, pp0 = pt(pa, (shape === "rect" ? Math.min(HW, HH) : RER) * .2), pp1 = pt(pa, reachFor(pa) - 6);
          s += _pOrb(pp0, pp1, 0);
          s += _pOrb(pp1, pp0, _pDur * .5);
        }
      } else if (!fwd && _canTransit) {
        var _fia = _inL.angle, _fiEnd = pt(_fia, reachFor(_fia) - 6), _fdx = (CX - _fiEnd[0]).toFixed(1), _fdy = (CY - _fiEnd[1]).toFixed(1);
        s += '<circle cx="' + _fiEnd[0].toFixed(1) + '" cy="' + _fiEnd[1].toFixed(1) + '" r="' + (rich ? 4 : 3) + '" fill="var(--xto-link,#00e5ff)" opacity="0" style="filter:drop-shadow(0 0 5px var(--xto-link,#00e5ff))"><animateMotion dur="' + _pDur.toFixed(2) + 's" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.4;1" keyPoints="0;1;1" path="M 0 0 L ' + _fdx + " " + _fdy + '"/><animate attributeName="opacity" dur="' + _pDur.toFixed(2) + 's" repeatCount="indefinite" keyTimes="0;0.05;0.32;0.4;1" values="0;1;0.9;0;0"/></circle>';
      }
      links.forEach(function(L) {
        if (L.link.up === false) return;
        var oh = L.link.ospfHello, hSend, hRecv;
        if (oh) {
          hSend = !!oh.send;
          hRecv = !!oh.recv;
        } else {
          var _on = (L.link.protocols || []).some(function(p) {
            return p.proto === "ospf" && p.up;
          });
          hSend = _on;
          hRecv = _on;
        }
        if (!hSend && !hRecv) return;
        var ha = L.angle, perp = [ -Math.sin(ha), Math.cos(ha) ], off = imm ? 3.5 : rich ? 3 : 2.5, hc = "var(--xto-idle,#ff8c00)";
        var hb = imm ? cylEdge(ha) : bodyEdge(ha), he = pt(ha, reachFor(ha) - 6);
        function o2(p, d) {
          return [ p[0] + perp[0] * d, p[1] + perp[1] * d ];
        }
        var sb = o2(hb, off), se = o2(he, off), rb = o2(he, -off), rE = o2(hb, -off);
        var travel = 1.8 / spd;
        function hOrb(cxy, dxy, intervalSec) {
          var interval = intervalSec ? intervalSec / spd : travel;
          var hasInt = !!intervalSec && interval > travel * 1.05;
          var tf = hasInt ? Math.min(.9, travel / interval) : 1, tf2 = Math.min(.98, tf + .03);
          var head = '<circle cx="' + cxy[0].toFixed(1) + '" cy="' + cxy[1].toFixed(1) + '" r="2.6" fill="' + hc + '" opacity="0.9">';
          var mot = '<animateMotion dur="' + interval.toFixed(2) + 's" repeatCount="indefinite"' + (hasInt ? ' calcMode="linear" keyPoints="0;1;1" keyTimes="0;' + tf.toFixed(3) + ';1"' : "") + ' path="M 0 0 L ' + dxy[0].toFixed(1) + " " + dxy[1].toFixed(1) + '"/>';
          var op = hasInt ? '<animate attributeName="opacity" dur="' + interval.toFixed(2) + 's" repeatCount="indefinite" keyTimes="0;' + tf.toFixed(3) + ";" + tf2.toFixed(3) + ';1" values="0.9;0.9;0;0"/>' : "";
          return head + mot + op + "</circle>";
        }
        if (hSend) s += hOrb(sb, [ se[0] - sb[0], se[1] - sb[1] ], axes && +axes.helloSendSec || 0);
        if (hRecv) s += hOrb(rb, [ rE[0] - rb[0], rE[1] - rb[1] ], axes && +axes.helloRecvSec || 0);
      });
    }
    var _tnX = shape === "rect" ? fullFrame ? 60 : CX - HW + 20 : CX, _tnY = shape === "rect" ? fullFrame ? 50 : CY - HH + 28 : CY + RER - 6, _tnA = shape === "rect" ? "start" : "middle";
    var _tnFs = fullFrame ? 22 : imm ? 20 : 9;
    var _tnFam = fullFrame ? "sans-serif" : "monospace", _tnLs = fullFrame ? ' letter-spacing="3"' : "";
    s += '<text x="' + _tnX.toFixed(1) + '" y="' + _tnY.toFixed(1) + '" fill="var(--xto-ok,#39ff14)" font-size="' + _tnFs + '" font-weight="700" font-family="' + _tnFam + '"' + _tnLs + ' text-anchor="' + _tnA + '">' + node.target + "</text>";
    s += "</svg>";
    return s;
  }
  function fromLegacyState(state) {
    var ifs = state.interfaces || {}, links = [];
    Object.keys(ifs).forEach(function(ifn) {
      if (ifn === "lo") return;
      var peer = "";
      Object.keys(state).forEach(function(k) {
        var m = /^(.+)_iface$/.exec(k);
        if (m && state[k] === ifn) peer = m[1];
      });
      var proto = peer && state[peer + "_proto"] || state.protocol || "ospf";
      var up = peer && state[peer + "_has_full"] != null ? !!state[peer + "_has_full"] : true;
      links.push({
        iface: ifn,
        peer: peer,
        protocols: [ {
          proto: proto === "bgp" ? "bgp" : "ospf",
          up: up
        } ]
      });
    });
    return {
      target: state.target_node,
      links: links,
      positions: state._positions || {}
    };
  }
  function render(container, node, axes) {
    if (container) container.innerHTML = xrayRenderUnified(node, axes);
  }
  root.XrayUnified = {
    render: render,
    renderSvg: xrayRenderUnified,
    geometry: xrayRadialGeometry,
    fromLegacyState: fromLegacyState,
    PRESETS: PRESETS
  };
})(typeof window !== "undefined" ? window : this);

function xrayDeepMode() {
  try {
    if (typeof localStorage === "undefined") return "simple";
    return localStorage.getItem("routecrush_deepdive_mode") === "simple" ? "simple" : "normal";
  } catch (e) {
    return "simple";
  }
}

function _xrayDeepCapable(config) {
  return !!(config && (config.xray && config.xray.deep_engine === "unified" || config.deep_engine === "unified"));
}

function _xrayUnifiedActive(config) {
  return (!!(config && config.positions && Object.keys(config.positions).length) || _xrayDeepCapable(config)) && xrayDeepMode() === "simple";
}

function _xrayCanonicalPositions(targetId, peerIds) {
  var pos = {};
  pos[targetId] = {
    x: 250,
    y: 70
  };
  var n = peerIds.length;
  peerIds.forEach(function(pid, i) {
    var frac = n <= 1 ? .5 : i / (n - 1);
    pos[pid] = {
      x: 40 + frac * 420,
      y: 270
    };
  });
  return pos;
}

function _xrayUnifiedPositionsFor(config, targetId, peerIds) {
  var cp = config && config.positions;
  if (cp && cp[targetId] && peerIds.length && peerIds.every(function(pid) {
    return cp[pid];
  })) {
    var out = {};
    out[targetId] = cp[targetId];
    peerIds.forEach(function(pid) {
      out[pid] = cp[pid];
    });
    return out;
  }
  return _xrayCanonicalPositions(targetId, peerIds);
}

function _xrayNetsForTarget(config, targetId) {
  var nets = config && (config.networks || config.topology && config.topology.networks) || [];
  return nets.filter(function(net) {
    return (net.members || []).some(function(m) {
      return (m.node || m.name) === targetId;
    });
  });
}

function _xrayNetForIface(config, targetId, s, iface) {
  var nets = _xrayNetsForTarget(config, targetId);
  if (!nets.length) return null;
  var ipr = s.interfaces && s.interfaces[iface] && s.interfaces[iface].ip || "";
  var oct = ipr ? parseInt(String(ipr).split("/")[0].split(".").pop(), 10) : NaN;
  if (!isNaN(oct)) {
    for (var i = 0; i < nets.length; i++) {
      var tm = (nets[i].members || []).filter(function(m) {
        return (m.node || m.name) === targetId;
      })[0];
      if (tm && tm.host_id != null && +tm.host_id === oct) return nets[i];
    }
  }
  return nets.length === 1 ? nets[0] : null;
}

function _xrayPeerOfNet(net, targetId) {
  var m = (net && net.members || []).filter(function(x) {
    return (x.node || x.name) !== targetId;
  })[0];
  return m ? m.node || m.name : "";
}

function _xrayOspfBucket(fsm) {
  var st = String(fsm || "").split("/")[0];
  if (st === "Full") return "full";
  if (st === "ExStart" || st === "Exchange" || st === "Loading") return "exchange";
  if (st === "2-Way") return "2way";
  if (st === "Init" || st === "Attempt") return "init";
  return "none";
}

function _xrayOspfFsmForIface(s, iface, ifKeys) {
  var ns = String(s && s.neighbor_state || "");
  if (!ns || ns === "None" || ns === "none") return "";
  if (s && s.ospf_configured === false) return "";
  var hellos = s.iface_hellos || null;
  if (hellos && Object.keys(hellos).length) return iface in hellos ? ns : "";
  return ifKeys && ifKeys.length === 1 ? ns : "";
}

function _xrayBgpUpForNet(s, netName) {
  if (!netName || !s || !s.bgp_links || !(netName in s.bgp_links)) return undefined;
  return !!s.bgp_links[netName];
}

function _xrayOspfFsmForNet(config, targetId, s, netName) {
  var nets = _xrayNetsForTarget(config, targetId), net = null;
  for (var i = 0; i < nets.length; i++) {
    if (nets[i].name === netName) {
      net = nets[i];
      break;
    }
  }
  if (!net) return "";
  var tm = (net.members || []).filter(function(m) {
    return (m.node || m.name) === targetId;
  })[0];
  if (!tm || tm.host_id == null) return "";
  var ifs = s && s.interfaces || {}, iface = "";
  for (var k in ifs) {
    if (k === "lo" || !ifs.hasOwnProperty(k)) continue;
    var ip = ifs[k] && ifs[k].ip;
    if (!ip) continue;
    if (parseInt(String(ip).split("/")[0].split(".").pop(), 10) === +tm.host_id) {
      iface = k;
      break;
    }
  }
  if (!iface) return "";
  return _xrayOspfFsmForIface(s, iface, Object.keys(ifs).filter(function(x) {
    return x !== "lo";
  }));
}

function _xrayProtocolsForIface(config, targetId, s, iface, ifKeys) {
  var net = _xrayNetForIface(config, targetId, s, iface);
  if (!net) return null;
  var protos = [];
  var bup = _xrayBgpUpForNet(s, net.name);
  var ofsm = _xrayOspfFsmForIface(s, iface, ifKeys);
  var _coex = !!(config && config.xray && config.xray.deep_coexist_ospf);
  if (bup !== undefined && !(_coex && bup === false && ofsm)) protos.push({
    proto: "bgp",
    up: bup
  });
  if (ofsm) protos.push({
    proto: "ospf",
    up: ofsm.split("/")[0] === "Full",
    fsm: ofsm
  });
  return {
    net: net,
    peer: _xrayPeerOfNet(net, targetId),
    protocols: protos
  };
}

function _xrayUnifiedNodeFromLive(config, s) {
  s = s || {};
  var xray = config && config.xray || {};
  var protoRaw = xray.protocol || "ospf";
  var proto = protoRaw === "bgp" ? "bgp" : "ospf";
  var nodes = config && config.nodes || [];
  var targetId = (window._xrayTargetNode ? String(window._xrayTargetNode).replace("topo-node-", "") : "") || (nodes.find(function(n) {
    return n.target;
  }) || {}).id || "r1";
  var ifs = s.interfaces || {};
  var rr = s.route_resolution || {};
  var ifKeys = Object.keys(ifs).filter(function(k) {
    return k !== "lo";
  });
  var _realIfKeys = ifKeys.filter(function(k) {
    var _ip = ifs[k] && ifs[k].ip;
    return !(_ip && /^172\.20\.20\./.test(String(_ip)));
  });
  if (_realIfKeys.length) ifKeys = _realIfKeys;
  var outIf = s.wan_iface || rr.out_iface || "";
  if (outIf && ifKeys.indexOf(outIf) < 0) outIf = ifKeys[0] || outIf;
  function ifUp(n) {
    return !ifs[n] || ifs[n].up !== false;
  }
  var adjUp = proto === "bgp" ? !!(s.is_established || s.bgp_state === "Established") : !!(s.has_full || s.neighbor_state === "Full");
  var peerId = (nodes.filter(function(n) {
    return n.id !== targetId;
  })[0] || {}).id || "";
  var hasProto = protoRaw === "ospf" || protoRaw === "bgp";
  var bgpProcRunning = s.bgp_configured !== false;
  var isOspf = protoRaw === "ospf";
  var ospfFull = !!(s.has_full || s.neighbor_state === "Full");
  var helloSend = isOspf && !!(ospfFull || s.ospf_active_on_interface);
  var helloRecv = isOspf;
  var peers = nodes.filter(function(n) {
    return n.id !== targetId;
  });
  var isMulti = peers.length >= 2 && peers.some(function(p) {
    return s[p.id + "_iface"];
  });
  var ospfProcRunning = !!(s.ospf_active_on_interface || s.ospf_configured || ospfFull || peers.some(function(p) {
    return s[p.id + "_has_full"] || s[p.id + "_neighbor_state"] === "Full";
  }));
  if (isMulti) {
    var bpv = s.best_path_via || "";
    var _ifHellos = s.iface_hellos || {};
    var _psh = s.peer_sending_hellos || {};
    var mlinks = peers.map(function(p) {
      var pid = p.id, iface = s[pid + "_iface"] || "";
      var est = protoRaw === "bgp" ? !!(s[pid + "_established"] || s[pid + "_has_full"] || s[pid + "_neighbor_state"] === "Established" || s[pid + "_neighbor_state"] === "Full") : !!(s[pid + "_has_full"] || s[pid + "_neighbor_state"] === "Full");
      var _egIf = rr && rr.out_iface || outIf;
      var isBest = bpv === pid || !!_egIf && !!iface && _egIf === iface;
      var ph = null, _linkOspf = false;
      if (isOspf) {
        var _selfHello = !!(iface && Object.prototype.hasOwnProperty.call(_ifHellos, iface));
        var _nbrActive = !!(s[pid + "_neighbor_state"] && s[pid + "_neighbor_state"] !== "None");
        var _peerKnown = Object.prototype.hasOwnProperty.call(_psh, pid);
        var _peerHello = _peerKnown ? !!_psh[pid] : _selfHello || est || _nbrActive;
        _linkOspf = _selfHello || est || _nbrActive || _peerKnown && _peerHello;
        if (_linkOspf) ph = {
          send: !!(_selfHello || est),
          recv: !!_peerHello
        };
      }
      return {
        iface: iface || pid,
        peer: pid,
        protocols: hasProto && (proto === "bgp" || _linkOspf) ? [ {
          proto: proto,
          up: est,
          fsm: proto === "ospf" ? s[pid + "_neighbor_state"] || (est ? "Full" : "") : ""
        } ] : [],
        ospfHello: ph,
        selected: isBest,
        up: iface ? ifUp(iface) : true
      };
    });
    return {
      target: targetId,
      positions: _xrayUnifiedPositionsFor(config, targetId, peers.map(function(p) {
        return p.id;
      })),
      links: mlinks,
      ospfProcRunning: ospfProcRunning,
      bgpProcRunning: bgpProcRunning,
      deepCoexistOspf: !!xray.deep_coexist_ospf
    };
  }
  var links = ifKeys.map(function(ifn) {
    var isOut = ifn === outIf || ifKeys.length === 1;
    var pl = _xrayProtocolsForIface(config, targetId, s, ifn, ifKeys);
    if (pl && pl.protocols.length) {
      return {
        iface: ifn,
        peer: pl.peer || (isOut ? peerId || s.peer_node || "" : ""),
        protocols: pl.protocols,
        ospfHello: isOspf && (isOut || pl.protocols.some(function(x) {
          return x.proto === "ospf";
        })) ? {
          send: helloSend,
          recv: helloRecv
        } : null,
        selected: isOut,
        up: ifUp(ifn)
      };
    }
    return {
      iface: ifn,
      peer: pl && pl.peer || (isOut ? peerId || s.peer_node || "" : ""),
      protocols: hasProto && isOut ? [ {
        proto: proto,
        up: adjUp,
        fsm: proto === "ospf" ? s.neighbor_state || (adjUp ? "Full" : "") : ""
      } ] : [],
      ospfHello: isOut && isOspf ? {
        send: helloSend,
        recv: helloRecv
      } : null,
      selected: isOut,
      up: ifUp(ifn)
    };
  });
  if (!links.length) {
    links = [ {
      iface: outIf || "link",
      peer: peerId,
      protocols: hasProto ? [ {
        proto: proto,
        up: false,
        fsm: ""
      } ] : [],
      selected: true,
      up: true
    } ];
  }
  if (links.length > 1 && (s.lan_iface || s.wan_iface)) {
    links.sort(function(a, b) {
      function rank(l) {
        return l.iface === s.wan_iface ? 1 : l.iface === s.lan_iface ? -1 : 0;
      }
      return rank(a) - rank(b);
    });
  }
  var _slPeers = links.map(function(l) {
    return l.peer;
  }).filter(function(p) {
    return p && p !== targetId;
  });
  var _slCp = config && config.positions;
  var _slPos = {};
  if (_slCp && _slCp[targetId] && _slPeers.length && _slPeers.every(function(pid) {
    return _slCp[pid];
  })) {
    _slPos = _xrayUnifiedPositionsFor(config, targetId, _slPeers);
  }
  return {
    target: targetId,
    positions: _slPos,
    links: links,
    ospfProcRunning: ospfProcRunning,
    bgpProcRunning: bgpProcRunning,
    deepCoexistOspf: !!xray.deep_coexist_ospf
  };
}

var _XU_GEOM = [ "de-box-svg", "de-cyl-svg", "de-beam", "de-tunnel", "de-energy", "de-label", "de-packet", "de-ping-orb", "de-hello-orb", "de-r1-label", "de-lsa-container", "de-if-marker" ];

function _xrayUnifiedHideLegacy(deEng) {
  if (deEng && deEng.children) {
    var kids = deEng.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (!el || !el.classList || !el.style || !el.style.setProperty) continue;
      for (var g = 0; g < _XU_GEOM.length; g++) {
        if (el.classList.contains(_XU_GEOM[g])) {
          el.style.setProperty("display", "none", "important");
          break;
        }
      }
    }
  }
  try {
    var out = document.querySelectorAll(".xray-hello-container, .xray-fib-entry");
    for (var j = 0; j < out.length; j++) {
      if (out[j].style && out[j].style.setProperty) out[j].style.setProperty("display", "none", "important");
    }
  } catch (_e) {}
}

function _xrayRenderUnifiedLive(s) {
  var cfg = window._scenarioConfig || {};
  var deEng = document.getElementById("xray-deep-engine");
  if (!_xrayUnifiedActive(cfg)) {
    if (deEng) deEng.classList.remove("xray-unified-mode");
    if (deEng && typeof _xrayUnifiedUnhideLegacy === "function") _xrayUnifiedUnhideLegacy(deEng);
    var _h0 = document.getElementById("xray-deep-unified");
    if (_h0 && _h0.firstChild) _h0.innerHTML = "";
    return;
  }
  if (deEng) deEng.classList.add("xray-unified-mode");
  if (deEng && typeof _XRAY_DE !== "undefined" && _XRAY_DE.deEngineH) deEng.style.minHeight = _XRAY_DE.deEngineH;
  if (!window.XrayUnified || typeof window.XrayUnified.renderSvg !== "function") return;
  _xrayUnifiedHideLegacy(deEng);
  var host = document.getElementById("xray-deep-unified");
  if (!host) {
    if (!deEng) return;
    host = document.createElement("div");
    host.id = "xray-deep-unified";
    deEng.appendChild(host);
  }
  var rawSt = s || window._lastXrayState || {};
  var st = rawSt && rawSt.xray_state && typeof rawSt.xray_state === "object" ? rawSt.xray_state : rawSt;
  var node = _xrayUnifiedNodeFromLive(cfg, st);
  var _vw = Math.round(host && host.clientWidth || deEng && deEng.clientWidth || 0);
  var _vh = Math.round(host && host.clientHeight || deEng && deEng.clientHeight || 0);
  var _deH = typeof _XRAY_DE !== "undefined" && _XRAY_DE.deEngineH ? parseInt(String(_XRAY_DE.deEngineH), 10) || 0 : 0;
  if (_deH && _deH > _vh) _vh = _deH;
  var _ifs = st.interfaces || {}, _realIf = Object.keys(_ifs).some(function(k) {
    return k !== "lo";
  });
  var _ph = !(node.links || []).length || (node.links || []).every(function(l) {
    return !l.iface || l.iface === "link";
  });
  var _xProto = cfg.xray && cfg.xray.protocol || "";
  var _protoReady;
  if (_xProto === "bgp" || _xProto === "ospf") {
    var _isApexRdy = !!(node.positions && Object.keys(node.positions).length);
    if (_isApexRdy) {
      _protoReady = st.bgp_links !== undefined || st.neighbor_state !== undefined || st.is_established !== undefined;
    } else {
      var _pnetsRdy = _xrayNetsForTarget(cfg, node.target);
      var _pnodesRdy = (cfg.nodes || []).map(function(n) {
        return n.id;
      });
      var _hasBl = st.bgp_links !== undefined;
      var _rifsRdy = st.interfaces || {};
      function _netHasIfaceRdy(net) {
        var tm = (net.members || []).filter(function(m) {
          return (m.node || m.name) === node.target;
        })[0];
        if (!tm || tm.host_id == null) return true;
        for (var k in _rifsRdy) {
          if (k === "lo" || !_rifsRdy.hasOwnProperty(k)) continue;
          var ip = _rifsRdy[k] && _rifsRdy[k].ip;
          if (ip && parseInt(String(ip).split("/")[0].split(".").pop(), 10) === +tm.host_id) return true;
        }
        return false;
      }
      _protoReady = _pnetsRdy.length > 0 && _pnetsRdy.every(function(net) {
        var peer = _xrayPeerOfNet(net, node.target);
        if (_pnodesRdy.indexOf(peer) < 0) return true;
        if (!_netHasIfaceRdy(net)) return false;
        var ospfOk = !!_xrayOspfFsmForNet(cfg, node.target, st, net.name);
        return _hasBl ? net.name in st.bgp_links || ospfOk : st.is_established !== undefined || st.bgp_state !== undefined || ospfOk;
      });
    }
  } else {
    _protoReady = true;
  }
  if (!_realIf || _ph || !_protoReady) {
    var _sksig = "SKELETON|" + _vw + "|" + _vh;
    if (host.firstChild && window._xrayUnifiedLastSig === _sksig) return;
    host.innerHTML = window.XrayUnified.renderSvg({
      target: node.target,
      positions: {},
      links: []
    }, {
      preset: "cinema",
      realAngle: false,
      legacyPin: true,
      immersive: true,
      forwarding: false,
      glyphPos: "inner",
      animMode: "off",
      animSpeed: 1,
      viewW: _vw,
      viewH: _vh
    });
    window._xrayUnifiedLastSig = _sksig;
    return;
  }
  var fwd = !!(st.route_resolution && st.route_resolution.resolved);
  var reachable = xrayCanForward(st);
  var helloSendSec = +st.r1_hello || 10;
  var helloRecvSec = +st.r2_hello || 10;
  var multi = !!(node.positions && Object.keys(node.positions).length);
  var _topoU = deEng && deEng.closest && deEng.closest(".topology");
  if (_topoU && typeof _XRAY_DE !== "undefined") {
    if (multi) {
      _topoU.style.setProperty("padding-top", (_XRAY_DE.deCardPadTopPx || 32) + "px", "important");
      _topoU.style.setProperty("padding-bottom", (_XRAY_DE.deCardPadBottomPx || 44) + "px", "important");
    } else {
      _topoU.style.removeProperty("padding-top");
      _topoU.style.removeProperty("padding-bottom");
    }
  }
  var glyphPos = "inner";
  var sig = JSON.stringify(node) + "|" + fwd + "|" + reachable + "|" + helloSendSec + "|" + helloRecvSec + "|" + glyphPos + "|" + _vw + "|" + _vh + "|" + (window._xrayPingMode || "");
  if (host.firstChild && sig === window._xrayUnifiedLastSig) return;
  window._xrayUnifiedLastSig = sig;
  host.innerHTML = window.XrayUnified.renderSvg(node, {
    preset: "cinema",
    realAngle: multi,
    legacyPin: !multi,
    immersive: true,
    forwarding: fwd,
    reachable: reachable,
    glyphPos: glyphPos,
    animMode: "on",
    animSpeed: 1,
    helloSendSec: helloSendSec,
    helloRecvSec: helloRecvSec,
    viewW: _vw,
    viewH: _vh,
    pingMode: window._xrayPingMode || "from-r1"
  });
  if (document.body.classList.contains("de-loading")) {
    document.body.classList.remove("de-loading");
    document.body.classList.add("de-applied");
  }
}

function _xrayUnifiedUnhideLegacy(deEng) {
  try {
    if (deEng && deEng.children) {
      for (var i = 0; i < deEng.children.length; i++) {
        var el = deEng.children[i];
        if (!el || !el.classList || !el.style || !el.style.removeProperty) continue;
        for (var g = 0; g < _XU_GEOM.length; g++) {
          if (el.classList.contains(_XU_GEOM[g])) {
            el.style.removeProperty("display");
            break;
          }
        }
      }
    }
    var ext = document.querySelectorAll(".xray-hello-container, .xray-fib-entry");
    for (var j = 0; j < ext.length; j++) {
      if (ext[j].style && ext[j].style.removeProperty) ext[j].style.removeProperty("display");
    }
  } catch (e) {}
}

function _xrayUnifiedMount(config) {
  var _cfg = window._scenarioConfig || config || {};
  var _capable = _xrayDeepCapable(_cfg) || !!(_cfg.positions && Object.keys(_cfg.positions).length);
  var _active = _capable && xrayDeepMode() === "simple";
  var deEng = document.getElementById("xray-deep-engine");
  if (document.body) document.body.classList.toggle("xray-unified-active", _active);
  if (deEng) deEng.classList.toggle("xray-unified-mode", _active);
  if (!_capable) return;
  if (!document.getElementById("xray-unified-style")) {
    var st = document.createElement("style");
    st.id = "xray-unified-style";
    st.textContent = ".xray-deep-engine.xray-unified-mode .de-box-svg," + ".xray-deep-engine.xray-unified-mode .de-cyl-svg," + ".xray-deep-engine.xray-unified-mode .de-beam," + ".xray-deep-engine.xray-unified-mode .de-tunnel," + ".xray-deep-engine.xray-unified-mode .de-energy," + ".xray-deep-engine.xray-unified-mode .de-label," + ".xray-deep-engine.xray-unified-mode .de-packet," + ".xray-deep-engine.xray-unified-mode .de-ping-orb," + ".xray-deep-engine.xray-unified-mode .de-hello-orb," + ".xray-deep-engine.xray-unified-mode .de-lsa-container," + ".xray-deep-engine.xray-unified-mode .de-r1-label{display:none!important}" + ".is-xray-deep .xray-deep-engine.xray-unified-mode .de-label.in,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-label.out{display:none!important}" + ".is-xray-deep .xray-deep-engine.xray-unified-mode .de-if-marker,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-side-left,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-side-right,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-beam.in,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-beam.out,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-tunnel.left-side,.is-xray-deep .xray-deep-engine.xray-unified-mode .de-tunnel.right-side{display:none!important}" + "#xray-deep-unified{position:absolute;inset:0;z-index:60;pointer-events:none}" + "#xray-deep-unified svg{position:absolute;inset:0;width:100%;height:100%}" + ".xray-deep-engine.xray-unified-mode{overflow:visible}" + ".xray-deep-engine.xray-unified-mode #xray-deep-unified{overflow:visible}" + ".xray-deep-engine.xray-unified-mode #xray-deep-unified svg{overflow:visible}" + "body.xray-unified-active .xray-hello-container,body.xray-unified-active .xray-fib-entry{display:none!important}" + ".xray-deep-engine.xray-unified-mode #de-re-panel,.xray-deep-engine.xray-unified-mode #de-lsdb," + ".xray-deep-engine.xray-unified-mode .de-bgp-panel,.xray-deep-engine.xray-unified-mode .de-bgp-decision-panel{z-index:61}" + ".xray-deep-engine.xray-unified-mode .xray-focus-close{z-index:71}" + ".xray-deep-mode-toggle{position:absolute;top:6px;left:6px;z-index:70;pointer-events:auto;font:11px monospace;background:rgba(0,20,30,0.85);color:#7fd;border:1px solid #2b5;border-radius:4px;padding:3px 8px;cursor:pointer}";
    document.head.appendChild(st);
  }
  if (deEng && !document.getElementById("xray-deep-mode-toggle")) {
    var tg = document.createElement("button");
    tg.id = "xray-deep-mode-toggle";
    tg.className = "xray-deep-mode-toggle";
    tg.textContent = "DeepDive: " + (xrayDeepMode() === "simple" ? "Simple" : "Standard");
    tg.onclick = function() {
      var nm = xrayDeepMode() === "simple" ? "normal" : "simple";
      try {
        localStorage.setItem("routecrush_deepdive_mode", nm);
      } catch (e) {}
      tg.textContent = "DeepDive: " + (nm === "simple" ? "Simple" : "Standard");
      window._xrayUnifiedLastSig = null;
      _xrayUnifiedMount(config);
      if (window.applyXrayState && window._lastXrayState) {
        try {
          window.applyXrayState(window._lastXrayState);
        } catch (e) {}
      }
    };
    deEng.appendChild(tg);
  }
  if (_active) {
    if (deEng && !document.getElementById("xray-deep-unified")) {
      var uh = document.createElement("div");
      uh.id = "xray-deep-unified";
      deEng.appendChild(uh);
    }
    _xrayRenderUnifiedLive(window._lastXrayState || {});
  } else {
    var host = document.getElementById("xray-deep-unified");
    if (host) host.innerHTML = "";
    _xrayUnifiedUnhideLegacy(deEng);
  }
}

function xrayDeepTargetRouter() {
  return (window._xrayTargetNode || "topo-node-r1").replace("topo-node-", "");
}

function xrayEnsureBgpTableBox(config) {
  var cfg = config || window._scenarioConfig || {};
  var xc = cfg.xray || {};
  if (xc.protocol !== "bgp") return;
  var re = document.getElementById("de-re-panel");
  if (!re || !re.parentElement) return;
  var tgt = xrayDeepTargetRouter();
  if (!document.getElementById("de-bgp-panel")) {
    var box = document.createElement("div");
    box.className = "de-panel de-bgp-panel";
    box.id = "de-bgp-panel";
    box.innerHTML = '<div class="de-title">BGP Table — show ip bgp (<span class="de-bgp-tgt">' + tgt + "</span>)" + '<span class="de-bgp-fs-ctl"><button type="button" style="pointer-events:auto!important" onclick="deBgpFontZoom(event,-1)" title="文字を小さく">A&#8722;</button><button type="button" style="pointer-events:auto!important" onclick="deBgpFontZoom(event,1)" title="文字を大きく">A+</button></span></div>' + '<div class="de-bgp-rows"><div class="de-dim">Loading...</div></div>';
    re.parentElement.appendChild(box);
  } else {
    var _tSpan0 = document.querySelector("#de-bgp-panel .de-bgp-tgt");
    if (_tSpan0 && _tSpan0.textContent !== tgt) _tSpan0.textContent = tgt;
  }
  if (!document.getElementById("de-bgp-decision-panel")) {
    var dbox = document.createElement("div");
    dbox.className = "de-panel de-bgp-decision-panel";
    dbox.id = "de-bgp-decision-panel";
    dbox.style.display = "none";
    dbox.innerHTML = '<div class="de-title">Best-Path Decision</div>' + '<div class="de-bgp-decision-rows"></div>';
    re.parentElement.appendChild(dbox);
  }
  _deBgpApplyFontSize();
}

var _DE_BGP_FS_STEPS = [ .85, 1, 1.15, 1.3, 1.5, 1.75 ];

function _deBgpApplyFontSize(v) {
  if (v == null) {
    v = parseFloat(localStorage.getItem("routecrush_de_bgp_fs"));
    if (!(v > 0)) v = 1;
  }
  [ "de-bgp-panel", "de-bgp-decision-panel" ].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.setProperty("--de-bgp-fs", String(v));
  });
}

function deBgpFontZoom(e, dir) {
  if (e && e.stopPropagation) e.stopPropagation();
  var cur = parseFloat(localStorage.getItem("routecrush_de_bgp_fs"));
  if (!(cur > 0)) cur = 1;
  var i = 0, best = 1e9;
  for (var k = 0; k < _DE_BGP_FS_STEPS.length; k++) {
    var d = Math.abs(_DE_BGP_FS_STEPS[k] - cur);
    if (d < best) {
      best = d;
      i = k;
    }
  }
  i = Math.max(0, Math.min(_DE_BGP_FS_STEPS.length - 1, i + dir));
  var v = _DE_BGP_FS_STEPS[i];
  try {
    localStorage.setItem("routecrush_de_bgp_fs", String(v));
  } catch (_e) {}
  _deBgpApplyFontSize(v);
}

function xrayRenderBgpTableReplay() {
  var panel = document.getElementById("de-bgp-panel");
  if (!panel) return;
  var rows = panel.querySelector(".de-bgp-rows");
  if (!rows) return;
  var dbox = document.getElementById("de-bgp-decision-panel");
  var drows = dbox ? dbox.querySelector(".de-bgp-decision-rows") : null;
  function showDecision(html) {
    if (!dbox) return;
    if (document.querySelector(".de-bgp-bracket-pop.open")) return;
    if (drows) drows.innerHTML = html || "";
    dbox.style.display = html ? "" : "none";
  }
  var _cfgX = window._scenarioConfig && window._scenarioConfig.xray || {};
  var _isTrace = document.body.classList.contains("trace-active");
  var _perStep = null;
  if (_isTrace && Array.isArray(window._traceStepStates) && Array.isArray(window.TRACE_STEPS)) {
    var _si = window._traceStepStates.indexOf(window._lastXrayState);
    if (_si >= 0 && window.TRACE_STEPS[_si] && window.TRACE_STEPS[_si].bgpRoutes !== undefined) {
      var _br = window.TRACE_STEPS[_si].bgpRoutes;
      _perStep = typeof _br === "function" ? _br(window._lastXrayState) : _br;
      if (!Array.isArray(_perStep)) _perStep = [];
    }
  }
  var _canonRoutes = _isTrace && Array.isArray(_cfgX.bgp_routes) && _cfgX.bgp_routes.length ? _cfgX.bgp_routes : null;
  var _replayRoutes = !_isTrace && window._scenarioConfig && window._scenarioConfig.trace_state && Array.isArray(window._scenarioConfig.trace_state.bgp_routes) && window._scenarioConfig.trace_state.bgp_routes.length ? window._scenarioConfig.trace_state.bgp_routes : null;
  if (_isTrace && _perStep === null && !_canonRoutes) {
    panel.style.display = "none";
    if (dbox) dbox.style.display = "none";
    return;
  }
  panel.style.display = "";
  var _replayCtx = document.body.classList.contains("is-replaying") || window._replayLock;
  var _isCleared = !!(window._lastXrayState && window._lastXrayState.cleared);
  var _recoveredRoutes = null;
  if (_replayCtx && _isCleared) {
    var _recTp = _cfgX.trace_pattern;
    if (_recTp && typeof window.xrayBuildTraceSteps === "function") {
      try {
        var _recDefs = window.xrayBuildTraceSteps(_recTp, "troubleshoot");
        var _recSteps = _recDefs && Array.isArray(_recDefs.steps) ? _recDefs.steps : [];
        var _recLast = null;
        for (var _recI = _recSteps.length - 1; _recI >= 0; _recI--) {
          if (_recSteps[_recI] && _recSteps[_recI].bgpRoutes !== undefined) {
            _recLast = _recSteps[_recI].bgpRoutes;
            break;
          }
        }
        if (Array.isArray(_recLast) && _recLast.length) _recoveredRoutes = _recLast;
      } catch (_recE) {}
    }
    if (!_recoveredRoutes && Array.isArray(_cfgX.bgp_routes) && _cfgX.bgp_routes.length) {
      _recoveredRoutes = _cfgX.bgp_routes;
    }
  }
  var _faultRoutes = null;
  if (_replayCtx && !_isCleared) {
    var _fltTp = _cfgX.trace_pattern;
    if (_fltTp && typeof window.xrayBuildTraceSteps === "function") {
      try {
        var _fltDefs = window.xrayBuildTraceSteps(_fltTp, "troubleshoot");
        var _fltSteps = _fltDefs && Array.isArray(_fltDefs.steps) ? _fltDefs.steps : [];
        for (var _fltI = 0; _fltI < _fltSteps.length; _fltI++) {
          if (_fltSteps[_fltI] && Array.isArray(_fltSteps[_fltI].bgpRoutes) && _fltSteps[_fltI].bgpRoutes.length) {
            _faultRoutes = _fltSteps[_fltI].bgpRoutes;
            break;
          }
        }
      } catch (_fltE) {}
    }
  }
  if (_replayCtx && !_isCleared && _perStep === null && !_canonRoutes && !_replayRoutes && !_faultRoutes) {
    if (!window._xrayCfgRefetching && (window._xrayCfgRefetchN || 0) < 20) {
      window._xrayCfgRefetching = true;
      window._xrayCfgRefetchN = (window._xrayCfgRefetchN || 0) + 1;
      fetch("api/scenario-config", {
        cache: "no-store"
      }).then(function(r) {
        return r.json();
      }).then(function(cfg) {
        window._xrayCfgRefetching = false;
        if (cfg && cfg.trace_state && window._scenarioConfig) {
          window._scenarioConfig.trace_state = cfg.trace_state;
          if (Array.isArray(cfg.trace_state.bgp_routes) && cfg.trace_state.bgp_routes.length) window._xrayCfgRefetchN = 0;
        }
        xrayRenderBgpTableReplay();
      }).catch(function() {
        window._xrayCfgRefetching = false;
      });
    }
    rows.innerHTML = '<div class="de-dim">障害状態の BGP テーブルを取得中…<br>(復旧値は表示しません)</div>';
    showDecision("");
    return;
  }
  if (_replayCtx && _isCleared && !_recoveredRoutes) {
    rows.innerHTML = '<div class="de-dim">復旧状態の BGP テーブルを準備中…</div>';
    showDecision("");
    return;
  }
  if (_perStep === null && !_canonRoutes && !_replayRoutes && typeof window._xrayBgpLiveRoutes === "undefined") {
    if (!window._xrayBgpReplayFetching) {
      window._xrayBgpReplayFetching = true;
      var _tgt = typeof xrayDeepTargetRouter === "function" ? xrayDeepTargetRouter() : "r1";
      fetch("api/bgp-routes?target=" + encodeURIComponent(_tgt)).then(function(r) {
        return r.json();
      }).then(function(data) {
        window._xrayBgpReplayFetching = false;
        window._xrayBgpLiveRoutes = data && data.success && data.routes ? data.routes : [];
        xrayRenderBgpTableReplay();
      }).catch(function() {
        window._xrayBgpReplayFetching = false;
        window._xrayBgpLiveRoutes = [];
        xrayRenderBgpTableReplay();
      });
    }
    rows.innerHTML = '<div class="de-dim">Loading BGP table...</div>';
    showDecision("");
    return;
  }
  var s = window._lastXrayState || {};
  var rr = s.route_resolution || {};
  if (_perStep === null && !_recoveredRoutes && !_faultRoutes && s.is_established === false) {
    rows.innerHTML = '<div class="de-dim">No routes<br>(BGP session not established)</div>';
    showDecision("");
    return;
  }
  var routes = (_perStep !== null ? _perStep : _recoveredRoutes || _canonRoutes || _replayRoutes || _faultRoutes || (_replayCtx ? null : window._xrayBgpLiveRoutes) || []).slice();
  var _filterTgt = window._scenarioConfig && window._scenarioConfig.capture && window._scenarioConfig.capture.ping_dst || rr.target;
  if (_perStep === null && !_recoveredRoutes && !_faultRoutes && s.has_bgp_route === false && _filterTgt) {
    routes = routes.filter(function(r) {
      return !xrayIpInPrefix(_filterTgt, r.prefix || "");
    });
  }
  if (!routes.length) {
    rows.innerHTML = '<div class="de-dim">No routes<br>(advertised route not received)</div>';
    showDecision("");
    return;
  }
  if (_replayRoutes && !_recoveredRoutes && rr.next_hop && document.body.classList.contains("is-cleared")) {
    var _recNH = rr.next_hop;
    var _recVia = s.best_path_via;
    var _recLP = _recVia ? s[_recVia + "_lp"] : undefined;
    if (routes.some(function(r) {
      return r.nexthop === _recNH;
    })) {
      routes = routes.map(function(r) {
        var nr = JSON.parse(JSON.stringify(r));
        var _isBest = nr.nexthop === _recNH;
        nr.status = _isBest ? "*>" : "* ";
        nr.best = _isBest;
        if (_isBest && _recLP !== undefined && _recLP !== null && _recLP !== "") nr.locprf = _recLP;
        return nr;
      });
    }
  }
  var view = xrayBuildBgpView(routes);
  rows.innerHTML = view.table;
  showDecision(view.decision);
}

function xrayIpInPrefix(ip, prefix) {
  if (!ip || !prefix) return false;
  var parts = String(prefix).split("/");
  var net = parts[0];
  var len = parseInt(parts[1], 10);
  function toInt(a) {
    var o = String(a).split(".");
    if (o.length !== 4) return null;
    return (+o[0] << 24 | +o[1] << 16 | +o[2] << 8 | +o[3]) >>> 0;
  }
  var ipN = toInt(ip), netN = toInt(net);
  if (ipN === null || netN === null) return ip === net;
  if (isNaN(len)) return ipN === netN;
  var mask = len === 0 ? 0 : 4294967295 << 32 - len >>> 0;
  return (ipN & mask) === (netN & mask);
}

var XRAY_BGP_CRITERIA = [ {
  key: "weight",
  col: "weight",
  label: "Weight",
  dir: 1,
  val: function(r) {
    return xrayBgpNum(r.weight, 0);
  }
}, {
  key: "locprf",
  col: "locprf",
  label: "LocPrf",
  dir: 1,
  val: function(r) {
    return xrayBgpNum(r.locprf, 100);
  }
}, {
  key: "aspath",
  col: "path",
  label: "AS-Path",
  dir: -1,
  val: function(r) {
    return r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0;
  }
}, {
  key: "origin",
  col: "path",
  label: "Origin",
  dir: -1,
  val: function(r) {
    var m = {
      i: 0,
      e: 1,
      "?": 2
    };
    return r.origin in m ? m[r.origin] : 3;
  }
}, {
  key: "metric",
  col: "metric",
  label: "MED",
  dir: -1,
  val: function(r) {
    return xrayBgpNum(r.metric, 0);
  }
} ];

function xrayBgpNum(v, dflt) {
  var n = parseInt(v, 10);
  return isNaN(n) ? dflt : n;
}

function xrayBgpNeighborAS(r) {
  var t = (r.as_path || "").split(/\s+/).filter(Boolean);
  return t.length ? t[0] : "";
}

function xrayBgpDecision(group) {
  if (!group || !group.length) return null;
  var best = null;
  for (var i = 0; i < group.length; i++) {
    if ((group[i].status || "").indexOf(">") !== -1) {
      best = group[i];
      break;
    }
  }
  if (!best) return {
    kind: "nobest"
  };
  var localOrigin = xrayBgpNum(best.weight, 0) === 32768;
  if (group.length < 2) return {
    kind: localOrigin ? "local" : "single",
    best: best,
    col: null
  };
  var chain = [], medSkipped = false;
  for (var c = 0; c < XRAY_BGP_CRITERIA.length; c++) {
    var crit = XRAY_BGP_CRITERIA[c];
    var bv = crit.val(best);
    var cohort = group;
    if (crit.key === "metric") {
      var bAS = xrayBgpNeighborAS(best);
      cohort = group.filter(function(r) {
        return xrayBgpNeighborAS(r) === bAS;
      });
      if (cohort.length < 2) {
        var anyDiff = group.some(function(r) {
          return r !== best && crit.val(r) !== bv;
        });
        chain.push({
          crit: crit,
          bestVal: bv,
          cmpVal: null,
          status: anyDiff ? "skip" : "tie"
        });
        if (anyDiff) medSkipped = true;
        continue;
      }
    }
    var cmp = null;
    cohort.forEach(function(r) {
      if (r === best) return;
      var v = crit.val(r);
      cmp = cmp === null ? v : crit.dir > 0 ? Math.max(cmp, v) : Math.min(cmp, v);
    });
    var allEqual = cohort.every(function(r) {
      return crit.val(r) === bv;
    });
    if (allEqual) {
      chain.push({
        crit: crit,
        bestVal: bv,
        cmpVal: cmp,
        status: "tie"
      });
      continue;
    }
    var bestIsUnique = cohort.every(function(r) {
      return r === best || (crit.dir > 0 ? bv > crit.val(r) : bv < crit.val(r));
    });
    if (!bestIsUnique) {
      chain.push({
        crit: crit,
        bestVal: bv,
        cmpVal: cmp,
        status: "amb"
      });
      return {
        kind: "ambiguous",
        best: best,
        chain: chain,
        col: null
      };
    }
    chain.push({
      crit: crit,
      bestVal: bv,
      cmpVal: cmp,
      status: "win"
    });
    return {
      kind: "decided",
      best: best,
      chain: chain,
      criterion: crit,
      bestVal: bv,
      cmpVal: cmp,
      col: crit.col
    };
  }
  return {
    kind: medSkipped ? "medskip" : "tie",
    best: best,
    chain: chain,
    col: null
  };
}

function xrayBgpChainHtml(chain) {
  if (!chain || !chain.length) return "";
  var parts = chain.map(function(st) {
    var op = st.crit.dir > 0 ? ">" : "<";
    if (st.status === "skip") {
      return '<span class="bgp-step-tie">' + st.crit.label + " (skipped: diff AS)</span>";
    }
    if (st.status === "tie") {
      var t = st.crit.key === "origin" ? st.crit.label + " (tie)" : st.crit.label + " " + st.bestVal + "=" + st.cmpVal;
      return '<span class="bgp-step-tie">' + t + "</span>";
    }
    var cmpTxt = st.crit.key === "origin" ? st.crit.label : st.crit.label + " " + st.bestVal + op + st.cmpVal;
    return '<span class="bgp-step-' + (st.status === "win" ? "win" : "amb") + '">' + cmpTxt + (st.status === "win" ? " ✅" : " ?") + "</span>";
  });
  return '<div class="bgp-chain">' + parts.join(" → ") + "</div>";
}

function xrayBgpBracketEnabled() {
  var cfg = window._scenarioConfig || {};
  return !!(cfg.xray && cfg.xray.bgp_decision_bracket);
}

function xrayBgpTier3Href(prefix, grp) {
  try {
    var routes = (grp || []).map(function(r, i) {
      return {
        id: String.fromCharCode(65 + i),
        via: "via " + (r.nexthop || "?"),
        as: "AS" + (xrayBgpNeighborAS(r) || "?"),
        attrs: {
          weight: xrayBgpNum(r.weight, 0),
          localpref: xrayBgpNum(r.locprf, 100),
          aspathlen: r.as_path ? r.as_path.split(/\s+/).filter(Boolean).length : 0,
          origin: {
            i: 1,
            e: 1,
            "?": 1
          }[r.origin] ? r.origin : "i",
          med: xrayBgpNum(r.metric, 0),
          ebgp: false,
          routerid: r.router_id || "0.0.0." + (i + 1)
        }
      };
    });
    var json = JSON.stringify({
      prefix: prefix,
      routes: routes
    });
    var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_");
    var lang = window._xrayLang === "en" ? "en" : "ja";
    return "/static/decision-bracket.html?d=" + b64 + "&lang=" + lang;
  } catch (e) {
    return "/static/decision-bracket.html";
  }
}

function xrayBgpBracketPopHtml(dec, tier3Href) {
  var rows = (dec.chain || []).map(function(st) {
    var op = st.crit.dir > 0 ? "&gt;" : "&lt;";
    if (st.status === "win") {
      var vv = st.crit.key === "origin" ? "" : "<b>" + st.bestVal + " " + op + " " + st.cmpVal + "</b> ";
      return '<div class="bp-row win"><span class="k">' + st.crit.label + '</span><span class="v">' + vv + "✅</span></div>";
    }
    var vtxt = st.crit.key === "origin" || st.status === "skip" ? st.status === "skip" ? "(skipped)" : "=" : st.bestVal + " = " + st.cmpVal;
    return '<div class="bp-row tie"><span class="k">' + st.crit.label + '</span><span class="v">' + vtxt + "</span></div>";
  }).join("");
  var head = dec.criterion.label + " (" + dec.bestVal + " " + (dec.criterion.dir > 0 ? "&gt;" : "&lt;") + " " + dec.cmpVal + ")";
  return '<div class="de-bgp-bracket-pop" onclick="event.stopPropagation()">' + '<div class="bp-h">' + head + '<button type="button" class="bp-x" onclick="xrayBgpCloseBracketPop(event)" title="close (ESC)">✕</button></div>' + rows + '<a class="bp-more" href="' + tier3Href + '" target="_blank" rel="noopener" onclick="event.preventDefault();event.stopPropagation();window.open(this.href,\'_blank\',\'noopener\');">' + (window._xrayLang === "en" ? "See all decision steps" : "判定の全ステップを見る") + " ⧉</a>" + "</div>";
}

function xrayBgpCloseBracketPop(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  var all = document.querySelectorAll(".de-bgp-bracket-pop.open");
  for (var i = 0; i < all.length; i++) all[i].classList.remove("open");
  document.removeEventListener("click", xrayBgpOutsideBracketPop);
  document.removeEventListener("keydown", xrayBgpEscBracketPop);
}

function xrayBgpToggleBracketPop(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  var btn = e && e.currentTarget;
  var reason = btn && btn.closest ? btn.closest(".bgp-reason") : null;
  var pop = reason && reason.nextElementSibling && reason.nextElementSibling.classList.contains("de-bgp-bracket-pop") ? reason.nextElementSibling : null;
  if (!pop) {
    var panel = document.getElementById("de-bgp-decision-panel");
    pop = panel ? panel.querySelector(".de-bgp-bracket-pop") : null;
  }
  if (!pop) return;
  var willOpen = !pop.classList.contains("open");
  var all = document.querySelectorAll(".de-bgp-bracket-pop.open");
  for (var i = 0; i < all.length; i++) all[i].classList.remove("open");
  if (willOpen) {
    pop.classList.add("open");
    setTimeout(function() {
      document.addEventListener("click", xrayBgpOutsideBracketPop);
      document.addEventListener("keydown", xrayBgpEscBracketPop);
    }, 0);
  } else {
    xrayBgpCloseBracketPop();
  }
}

function xrayBgpBracketKey(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    xrayBgpToggleBracketPop(e);
  }
}

function xrayBgpReasonHtml(p, dec, grp) {
  if (!dec) return "";
  if (dec.kind === "nobest") return '<div class="bgp-reason bgp-reason-note">◦ ' + p + " → no valid path</div>";
  if (dec.kind === "single") return '<div class="bgp-reason bgp-reason-note">★ ' + p + " → <b>only path</b> (no alternatives)</div>";
  if (dec.kind === "local") return '<div class="bgp-reason bgp-reason-note">★ ' + p + " → <b>locally originated</b> (always preferred)</div>";
  var chainHtml = xrayBgpChainHtml(dec.chain);
  if (dec.kind === "decided") {
    var op = dec.criterion.dir > 0 ? ">" : "<";
    var cmp = dec.criterion.key !== "origin" && dec.cmpVal !== null ? " (" + dec.bestVal + " " + op + " " + dec.cmpVal + ")" : "";
    if (xrayBgpBracketEnabled()) {
      var _href = xrayBgpTier3Href(p, grp);
      var _btn = '<span class="bgp-crit-btn" role="button" tabindex="0" onclick="xrayBgpToggleBracketPop(event)" onkeydown="xrayBgpBracketKey(event)">' + dec.criterion.label + "</span>";
      return '<div class="bgp-reason">★ ' + p + " → best path by " + _btn + cmp + "</div>" + chainHtml + xrayBgpBracketPopHtml(dec, _href);
    }
    return '<div class="bgp-reason">★ ' + p + " → best path by <b>" + dec.criterion.label + "</b>" + cmp + "</div>" + chainHtml;
  }
  if (dec.kind === "medskip") return '<div class="bgp-reason bgp-reason-note">★ ' + p + " → <b>MED not compared</b> (different neighbor AS) — tiebreak by Router ID</div>" + chainHtml;
  if (dec.kind === "tie") return '<div class="bgp-reason bgp-reason-note">★ ' + p + " → all attributes equal — <b>tiebreak by Router ID</b></div>" + chainHtml;
  return '<div class="bgp-reason bgp-reason-note">★ ' + p + " → <b>no single decider</b> — lower-level tiebreak</div>" + chainHtml;
}

function xrayBuildBgpView(routes) {
  var order = [], groups = {};
  routes.forEach(function(r) {
    var p = r.prefix || "";
    if (!groups[p]) {
      groups[p] = [];
      order.push(p);
    }
    groups[p].push(r);
  });
  var html = '<table class="de-bgp-table"><thead><tr>' + "<th>St</th><th>Network</th><th>Next-Hop</th><th>Metric</th><th>LocPrf</th><th>Weight</th><th>Path</th>" + "</tr></thead><tbody>";
  var reasons = "";
  order.forEach(function(p) {
    var grp = groups[p];
    var dec = xrayBgpDecision(grp);
    var decCol = dec && dec.kind === "decided" ? dec.col : null;
    grp.forEach(function(rt) {
      var st = rt.status || "";
      var isBest = st.indexOf(">") !== -1;
      var w = rt.weight === 0 || rt.weight ? rt.weight : "";
      var pathDisp = (rt.as_path || "") + (rt.origin ? (rt.as_path ? " " : "") + rt.origin : "");
      var lpDisp = (rt.locprf || "") !== "" ? rt.locprf : '<span class="bgp-default">100</span>';
      function cell(colName, val) {
        return "<td" + (isBest && decCol === colName ? ' class="bgp-decider"' : "") + ">" + val + "</td>";
      }
      html += "<tr" + (isBest ? ' class="bgp-best"' : "") + ">" + '<td><span class="bgp-st">' + st + "</span></td>" + "<td>" + (rt.prefix || "") + "</td>" + "<td>" + (rt.nexthop || "") + "</td>" + cell("metric", rt.metric || "") + cell("locprf", lpDisp) + cell("weight", w) + cell("path", pathDisp) + "</tr>";
    });
    reasons += xrayBgpReasonHtml(p, dec, grp);
  });
  html += "</tbody></table>";
  if (reasons) reasons += '<div class="bgp-legend">Best-path order: Weight → LocPrf → AS-Path → Origin → MED</div>';
  return {
    table: html,
    decision: reasons
  };
}

function _xrayInitTriangleTools(config) {
  var _mainEl = document.querySelector(".main");
  var qid = config.id || "q6";
  var mode = config.lab_mode || "troubleshoot";
  var nodes = config.nodes || [];
  var capture = config.capture || {};
  var pingDst = capture.ping_dst || "3.3.3.3";
  var pingSrc = capture.ping_src || "r1";
  if (!document.getElementById("tri-tools-css")) {
    var css = document.createElement("style");
    css.id = "tri-tools-css";
    css.textContent = ".panels-row{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap}" + ".panels-row>.capture-panel{flex:2;min-width:300px;margin-top:0;order:0!important}" + ".neighbor-panel{flex:1;min-width:220px;background:var(--rc-capt-bg,#1a2530);border-radius:8px;border:1px solid var(--rc-capt-border,#37474f);padding:16px;order:1!important}" + ".neighbor-panel h3{margin:0 0 12px 0;font-size:15px;color:var(--rc-accent,#4dd0e1)}" + ".nb-pair{display:flex;align-items:center;gap:8px;padding:8px 10px;margin:4px 0;border-radius:6px;background:rgba(0,0,0,0.2);font-size:14px;font-weight:bold}" + ".nb-pair .nb-label{flex:1;color:#b0bec5}" + ".nb-pair .nb-state{padding:3px 10px;border-radius:4px;font-size:12px;font-weight:bold}" + ".nb-state.full{background:rgba(102,187,106,0.2);color:#66bb6a;border:1px solid #66bb6a}" + ".nb-state.down{background:rgba(239,83,80,0.2);color:#ef5350;border:1px solid #ef5350}" + ".nb-state.init{background:rgba(255,183,77,0.2);color:#ffb74d;border:1px solid #ffb74d}" + ".nb-insight{margin-top:10px;padding:8px;border-radius:4px;font-size:12px;color:#ffb74d;background:rgba(255,183,77,0.08);border:1px solid rgba(255,183,77,0.2);display:none}" + ".topo-link-row{display:flex;gap:20px;align-items:stretch;margin-top:16px}" + ".topo-link-row>.topology{flex:2;min-width:0;margin-top:0;order:0!important}" + ".topo-link-row>.link-status{flex:1;min-width:220px;margin-top:0;display:flex;flex-direction:column;background:var(--rc-capt-bg,#1a2530);border-radius:8px;border:1px solid var(--rc-capt-border,#37474f);padding:16px;order:1!important}" + ".topo-link-row>.link-status .link-controls{margin-top:auto}" + "@media(max-width:800px){.topo-link-row{flex-direction:column}.topo-link-row>.topology,.topo-link-row>.link-status{flex:none;width:100%}}" + ".link-status h3{margin:0 0 12px 0;font-size:15px;color:var(--rc-accent,#4dd0e1)}" + ".link-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}" + ".link-row:last-of-type{border-bottom:none}" + ".link-name{min-width:140px;color:#b0bec5;font-family:monospace;font-size:12px}" + ".link-indicator{font-size:14px;font-weight:bold;min-width:60px}" + ".link-indicator.up{color:#66bb6a}" + ".link-indicator.down{color:#ef5350}" + ".link-indicator.unknown{color:#78909c}" + ".link-ping-rtt{font-size:11px;color:#90a4ae;font-family:monospace}" + ".ping-dots{display:grid;grid-template-columns:repeat(10,22px);gap:5px;margin-top:10px;padding:6px 0}" + ".ping-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid #444;background:rgba(0,0,0,0.2);transition:all 0.3s}" + ".ping-dot.ok{border-color:#66bb6a;color:#66bb6a;background:rgba(102,187,106,0.1)}" + ".ping-dot.fail{border-color:#ef5350;color:#ef5350;background:rgba(239,83,80,0.1)}" + ".link-controls{margin-top:12px;display:flex;gap:8px;align-items:center}" + ".shutdown-btn{padding:8px 16px;background:rgba(231,76,60,0.15);border:1px solid #e74c3c;border-radius:6px;color:#e74c3c;cursor:pointer;font-size:13px;font-weight:bold;transition:all 0.2s}" + ".shutdown-btn:hover{background:#e74c3c;color:#fff}" + ".shutdown-btn.restore{background:rgba(39,174,96,0.15);border-color:#27ae60;color:#27ae60}" + ".shutdown-btn.restore:hover{background:#27ae60;color:#fff}" + ".check-progress{position:fixed;top:0;left:0;right:0;z-index:8600;background:rgba(26,26,46,0.85);backdrop-filter:blur(6px);border-bottom:2px solid var(--rc-accent,#4dd0e1);padding:10px 20px;display:none;flex-wrap:wrap;align-items:center;gap:8px}" + ".check-progress.show{display:flex}" + ".check-dimmer{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:8500}" + ".check-dimmer.show{display:block}" + ".check-step{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:bold;background:#263238;color:#78909c;transition:all 0.5s}" + ".check-step.active{background:rgba(0,172,193,0.2);color:#00acc1;animation:checkPulse 1s ease-in-out infinite}" + ".check-step.pass{background:rgba(102,187,106,0.2);color:#66bb6a}" + ".check-step.fail{background:rgba(239,83,80,0.2);color:#ef5350}" + ".check-step.step-collapsed{display:none}" + ".check-step-ellipsis{padding:6px 4px;color:#78909c;font-size:14px;letter-spacing:1px;align-self:center}" + ".check-phase-msg{font-size:13px;color:#b0bec5;margin-left:auto}" + "@keyframes checkPulse{0%{box-shadow:0 0 0 0 rgba(0,172,193,0.4)}70%{box-shadow:0 0 0 8px rgba(0,172,193,0)}100%{box-shadow:0 0 0 0 rgba(0,172,193,0)}}";
    document.head.appendChild(css);
  }
  var capPanel = document.getElementById("capture-panel");
  if (capPanel) {
    var row = document.createElement("div");
    row.className = "panels-row";
    row.id = "panels-row";
    row.style.order = capPanel.style.order || "3";
    capPanel.parentNode.insertBefore(row, capPanel);
    row.appendChild(capPanel);
    capPanel.style.order = "0";
    var _showNeighbor = !(config.xray && config.xray.show_neighbor === false);
    if (_showNeighbor) {
      var nbPanel = document.createElement("div");
      nbPanel.className = "neighbor-panel";
      nbPanel.id = "neighbor-panel";
      nbPanel.innerHTML = "<h3>OSPF Neighbor State</h3>" + '<div id="nb-pairs" style="color:#78909c;font-size:13px">確認中...</div>' + '<div class="nb-insight" id="nb-insight"></div>';
      row.appendChild(nbPanel);
      window._nbPolling = false;
      window._nbPollTimer = setInterval(function() {
        if (document.body.classList.contains("is-xray-deep")) return;
        if (!window._nbPolling) _pollNeighborStatus(qid);
      }, 5e3);
      _pollNeighborStatus(qid);
    }
  }
  var topoSection = document.getElementById("topology-section") || document.querySelector(".topology");
  if (topoSection) {
    var topoRow = document.createElement("div");
    topoRow.className = "topo-link-row";
    topoRow.id = "topo-link-row";
    topoRow.style.order = topoSection.style.order || "1";
    topoSection.parentNode.insertBefore(topoRow, topoSection);
    topoRow.appendChild(topoSection);
    topoSection.style.order = "0";
    var _cfShutdown = config.check_flow && config.check_flow.shutdown_link || null;
    var _shutdownBtnHtml = "";
    if (_cfShutdown && _cfShutdown.label) {
      _shutdownBtnHtml = '<button class="shutdown-btn" id="shutdown-btn" onclick="_triShutdownDirect(\'' + qid + "')\">" + _cfShutdown.label + "</button>";
    }
    var linkCard = document.createElement("div");
    linkCard.className = "link-status";
    linkCard.id = "link-status";
    linkCard.innerHTML = "<h3>リンク状態</h3>" + '<div class="link-row"><span class="link-name">r1 ── r3 (直通)</span><span class="link-indicator unknown" id="link-r1-r3">確認中...</span></div>' + '<div class="link-row"><span class="link-name">r1 ── r2</span><span class="link-indicator unknown" id="link-r1-r2">確認中...</span></div>' + '<div class="link-row"><span class="link-name">r2 ── r3</span><span class="link-indicator unknown" id="link-r2-r3">確認中...</span></div>' + '<div class="link-row"><span class="link-name">r1: ping ' + pingDst + '</span><span class="link-indicator unknown" id="ping-status">確認中...</span><span class="link-ping-rtt" id="ping-rtt"></span></div>' + '<div class="ping-dots" id="ping-dots"></div>' + (_shutdownBtnHtml ? '<div class="link-controls">' + _shutdownBtnHtml + "</div>" : "");
    topoRow.appendChild(linkCard);
    var dotsEl = document.getElementById("ping-dots");
    for (var i = 0; i < 50; i++) {
      var dot = document.createElement("div");
      dot.className = "ping-dot";
      dotsEl.appendChild(dot);
    }
    window._pingIdx = 0;
    window._pingDots = dotsEl.querySelectorAll(".ping-dot");
    window._pingPolling = false;
    window._linkPolling = false;
    window._pingPollTimer = setInterval(function() {
      if (_xrayDeepDeconflict()) return;
      if (!window._pingPolling) _pollPing(pingSrc, pingDst);
    }, 2e3);
    _pollPing(pingSrc, pingDst);
    {
      window._linkPollTimer = setInterval(function() {
        if (document.body.classList.contains("is-xray-deep")) return;
        if (!window._linkPolling) _pollLinkStatus(qid);
      }, 5e3);
      _pollLinkStatus(qid);
    }
  }
  var _cfSteps = config.check_flow && Array.isArray(config.check_flow.steps) ? config.check_flow.steps : [];
  if (_cfSteps.length > 0 && mode !== "destroy" && !document.getElementById("check-progress")) {
    var dimmer = document.createElement("div");
    dimmer.className = "check-dimmer";
    dimmer.id = "check-dimmer";
    document.body.appendChild(dimmer);
    var bar = document.createElement("div");
    bar.className = "check-progress";
    bar.id = "check-progress";
    var _stepsHtml = _cfSteps.map(function(s, i) {
      var _lbl = s && s.label || "Step " + (i + 1);
      return '<span class="check-step" id="chk-s' + (i + 1) + '" data-step-idx="' + i + '">' + _lbl + "</span>";
    }).join("");
    bar.innerHTML = _stepsHtml + '<span class="check-phase-msg" id="chk-msg"></span>';
    document.body.appendChild(bar);
  }
  window._triSortMain = function() {
    var m = document.querySelector(".main");
    if (!m) return;
    var orderMap = mode === "capture" ? {
      "panels-row": 5,
      "capture-panel": 5,
      "hint-section": 10,
      "topo-link-row": 20,
      "topology-section": 20,
      "ttyd-card": 25,
      problem: 30,
      "result-panel": 60,
      explanation: 70,
      "next-question": 80
    } : {
      problem: 10,
      "topo-link-row": 20,
      "topology-section": 20,
      "ttyd-card": 25,
      "hint-section": 30,
      "panels-row": 40,
      "capture-panel": 40,
      "result-panel": 60,
      explanation: 70,
      "next-question": 80
    };
    Array.from(m.children).forEach(function(el) {
      var key = el.id || el.className.split(" ")[0];
      var o = orderMap[key] || 90;
      el.style.order = String(o);
    });
    var kids = Array.from(m.children);
    kids.sort(function(a, b) {
      return parseInt(a.style.order) - parseInt(b.style.order);
    });
    kids.forEach(function(el) {
      m.appendChild(el);
    });
  };
  window._triSortMain();
  if (_cfSteps.length > 0 && mode !== "destroy") {
    window._origCheckAnswer = window.checkAnswer;
    window.checkAnswer = function() {
      _triCheckAnswer(qid, config);
    };
  }
}

function _xrayRenderLinkStatus(d, qid) {
  if (!d.success) return;
  var _cfg = window._scenarioConfig || {};
  var _sd = _cfg.check_flow && _cfg.check_flow.shutdown_link || null;
  var links = d.links || {};
  window._xrayLiveLinks = links;
  var map = {
    r1_r3: "link-r1-r3",
    r1_r2: "link-r1-r2",
    r2_r3: "link-r2-r3"
  };
  for (var key in map) {
    var el = document.getElementById(map[key]);
    if (!el) continue;
    var info = links[key] || {};
    var up = info.if_status === "up";
    el.className = "link-indicator " + (up ? "up" : "down");
    el.textContent = (up ? "🟢" : "🔴") + " " + (up ? "UP" : "DOWN");
  }
  var sdBtn = document.getElementById("shutdown-btn");
  if (sdBtn && _sd && _sd.down_key) {
    var target = links[_sd.down_key] || {};
    var targetDown = target.if_status === "down";
    if (targetDown) {
      if (_sd.label_restore) sdBtn.textContent = _sd.label_restore;
      sdBtn.className = "shutdown-btn restore";
    } else {
      if (_sd.label) sdBtn.textContent = _sd.label;
      sdBtn.className = "shutdown-btn";
    }
    sdBtn._targetDown = targetDown;
  }
  if (window._xrayTriLinkMap && typeof xraySetSvgLine === "function" && !document.body.classList.contains("is-xray-mode") && !document.body.classList.contains("is-replaying")) {
    for (var _lk in map) {
      if (!links[_lk]) continue;
      var _lid = window._xrayTriLinkMap[_lk];
      if (!_lid) continue;
      xraySetSvgLine(_lid, links[_lk].if_status === "up" ? "up" : "if-down");
    }
  }
}