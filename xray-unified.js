/*
 * xray-unified.js — 統一 X-Ray エンジン(可変角) S1 seed
 * [worker1 · skin Phase2 · 2026-07-16] 事業主 de-risk PASS 後の最初の実コード。
 *
 * ★ADDITIVE 厳守: 既存 xray-core.js `xrayRenderDeepEngine` / NodePanel `xray-node-panel.js` を
 *   1byte も触らない完全独立の新経路。既存描画は退行ゼロ(構造的担保)。
 * ★S1 スコープ = radial base (xrayRadialGeometry) + tunnelMode:'concentric'。
 *   他軸(cylinder 実描画 / full panel / glyph 球の cinema 版)は S2/S3。ここでは軸キーを受けるが
 *   S1 で意味のある差 = tunnelMode(single⇄concentric) + engineShape(circle⇄cylinderヒント) + arrowMode。
 *
 * データモデル(per-LINK 複数プロト層・§3 schema):
 *   node = { target, links:[ {iface, peer, protocols:[{proto,up}], selected} ], positions:{name:{x,y}} }
 *   単一proto(旧 <peer>_proto)からの後方互換導出は fromLegacyState() が担う。
 * 軸(taste・RESERVED は worker7 確定待ち):
 *   { engineShape:'circle'|'cylinder', processGlyph:'none'|'ball', arrowMode:'mono'|'proto',
 *     tunnelMode:'single'|'concentric', panelContent:'none'|'full', protocolOrder:'bgp-top'|'ospf-top' }
 */
(function (root) {
  'use strict';

  var PRESETS = {
    cinema: { engineShape: 'rect',     processGlyph: 'outside', arrowMode: 'proto', tunnelMode: 'concentric', panelContent: 'full', protocolOrder: 'bgp-top' },
    // ★light も tunnelMode:'concentric'(2026-07-16 事業主 (b)確定): 同居 truth(同心2層)は簡素モードでも
    //   常時保持。collapse するのは richness(cylinder/glow/太さ/label/glyph)のみ=「同居は truth であって
    //   richness でない」。'single' は 1プロト/link を1色に畳む別 taste(既定 preset では使わない)。
    light:  { engineShape: 'circle',   processGlyph: 'none', arrowMode: 'mono',  tunnelMode: 'concentric', panelContent: 'none', protocolOrder: 'bgp-top' }
  };
  function resolveAxes(a) {
    var base = (a && a.preset && PRESETS[a.preset]) ? PRESETS[a.preset] : PRESETS.cinema;
    var out = {}; Object.keys(base).forEach(function (k) { out[k] = (a && a[k] != null) ? a[k] : base[k]; });
    return out;
  }

  // ── geometry ───────────────────────────────────────────────────────────
  // 各リンクを peer 方向の実角度(atan2)で放射。positions 無い peer は fan で spread。
  function xrayRadialGeometry(node, opt) {
    opt = opt || {};
    var pos = node.positions || {}, self = pos[node.target] || null;
    var realang = opt.realAngle !== false;
    var links = (node.links || []).map(function (lk) { return { iface: lk.iface, peer: lk.peer, link: lk }; });
    var miss = [];
    links.forEach(function (L) {
      var pp = pos[L.peer];
      if (realang && self && pp) L.angle = Math.atan2(pp.y - self.y, pp.x - self.x); // screen coords (y down)=graph dir
      else { L.angle = null; miss.push(L); }
    });
    miss.forEach(function (L, i) { L.angle = -Math.PI / 2 + (i + 1) * (Math.PI / (miss.length + 1)); });
    // legacy-pin: 実リンク数で一般化(退行ゼロ・opt.legacyPin)。1本(edge ノード)=右 0°(phantom 左を作らない)/
    //   2本(中継ノード)=旧 L/R(180°/0°)。3+ は radial(pin せず)。
    if (opt.legacyPin) {
      if (links.length === 1) links[0].angle = 0;
      else if (links.length === 2) { links[0].angle = Math.PI; links[1].angle = 0; }
    }
    return links;
  }

  // ── per-link protocol 層 ──
  // ★トンネルの層順(outer→inner)= DATA 真実 = protocols[] の配列順(DATA-CONTRACT §4.7)。
  //   ここでは並べ替えない(依存 up→down は collector/データ側が保証)。`protocolOrder`(taste)は
  //   トンネルに効かせず、プロセス球スタックの視覚反転のみ(worker7 SKIN-CONTRACT v2 2026-07-16 確定)。
  function linkLayers(link) {
    return (link.protocols || []).filter(function (p) { return p.up; }); // 配列順 = outer→inner
  }
  function protoCol(p) { return p === 'bgp' ? 'var(--xto-bgp,#a855f7)' : p === 'static' ? 'var(--xto-static,#ffb347)' : 'var(--xto-ospf,#39ff14)'; }

  // ── render ─────────────────────────────────────────────────────────────
  function xrayRenderUnified(node, axes) {
    var ax = resolveAxes(axes);
    // ★richness(太さ/glow/label/大器)は engineShape 等の richness 軸のみが駆動。tunnelMode:'concentric' は
    //   同居 truth を担う(データ)ゆえ richness に含めない=light でも concentric-thin が出る((b)確定)。
    // ★rich(cinema 視覚)= 器形が rect(=緑角丸四角・cinema)。light=circle(白円・簡素)。tunnelMode とは独立。
    var rich = ax.engineShape === 'rect';
    var shape = ax.engineShape === 'rect' ? 'rect' : 'circle';
    // ★immersive frame(RCL live 潜入=ノードが canvas をほぼ占有・リンクは短い stub)。既定 off=showcase byte 不変。
    var imm = axes && axes.immersive;
    var W = 460, H = 340, CX = W / 2, CY = H / 2;
    var R = imm ? 224 : 140, HW = imm ? 160 : 66, HH = imm ? 115 : 46, RER = imm ? 82 : 32;
    var links = xrayRadialGeometry(node, axes || {});
    function pt(a, r) { return [CX + Math.cos(a) * r, CY + Math.sin(a) * r]; }
    function bodyEdge(a) {   // ノード本体の縁(リンク終端 = rect 境界 or 円周)
      if (shape === 'rect') { var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? HW / Math.abs(dx) : 1e9, dy ? HH / Math.abs(dy) : 1e9); return [CX + dx * t, CY + dy * t]; }
      return pt(a, RER);
    }
    function ln(p, q, col, w, glow) {
      return '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) +
        '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (glow ? ' style="filter:drop-shadow(0 0 4px ' + col + ')"' : '') + '/>';
    }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" class="xu-fig">';

    // ★z-order(2026-07-17 事業主): ① links を先(背面)→ ② ノード本体(前面)→ ③凡例/矢印/ラベル(face 上)。
    //   = トンネル/リンクがノード face を覆わない(ノード本体が最後に上書き)。

    // ── ① links(背面): ★シアン物理(中心・最細)+ プロト層(外側)+ DOWN=赤点線(2026-07-17 事業主 spec 是正) ──
    //   同心層(外→内)= BGP紫(最外・太)→ OSPF緑 → シアン物理(中心・最細・最上)。array順(outer→inner §4.7)に沿う。
    //   物理シアン = `--xto-link`(スキン色)/ 物理 DOWN = `--xto-linkDown`(赤・新スキン色)。
    links.forEach(function (L) {
      var a = L.angle, r0 = bodyEdge(a), ex = pt(a, R), layers = linkLayers(L.link), linkUp = L.link.up !== false, markerCol;
      // ★パイプ断面: 各層を link に perpendicular で ±offset した平行線にして層間に gap(2026-07-17 事業主 spec)。
      //   中心=cyan物理(1本)→ gap → OSPF(±off の2本)→ gap → BGP(±off の2本・最外)。inner→outer 対称リング。
      var perp = [-Math.sin(a), Math.cos(a)];
      function offLn(off, col, w, glow) { return ln([r0[0] + perp[0] * off, r0[1] + perp[1] * off], [ex[0] + perp[0] * off, ex[1] + perp[1] * off], col, w, glow); }
      var lw = rich ? 2 : 1.8, gap = rich ? 4 : 3;                       // ★線を細く / gap は link↔proto群 の間のみ
      if (!linkUp) {
        s += '<line x1="' + r0[0].toFixed(1) + '" y1="' + r0[1].toFixed(1) + '" x2="' + ex[0].toFixed(1) + '" y2="' + ex[1].toFixed(1) + '" stroke="var(--xto-linkDown,#ff4d4d)" stroke-width="' + (rich ? 3.5 : 2.5) + '" stroke-dasharray="6 5" stroke-linecap="round"/>';
        markerCol = 'var(--xto-linkDown,#ff4d4d)';
      } else {
        s += offLn(0, 'var(--xto-link,#00e5ff)', lw, false);            // cyan 物理 = 中心1本
        var ringLayers = (ax.tunnelMode === 'concentric') ? layers.slice().reverse() : (layers[0] ? [layers[0]] : []);  // 内→外(OSPF→BGP)
        ringLayers.forEach(function (p, i) {
          var off = (lw + gap) + i * lw;                                 // OSPF=cyanと gap / BGP=OSPFに隣接(gap 無)
          s += offLn(+off, protoCol(p.proto), lw, rich);
          s += offLn(-off, protoCol(p.proto), lw, rich);
        });
        markerCol = 'var(--xto-link,#00e5ff)';   // ★IF マーカー = 物理リンク色(UP=シアン)(2026-07-17 事業主)
      }
      if (ax.panelContent === 'full') {
        var lp = pt(a, R + 6), anc = Math.cos(a) < -0.35 ? 'end' : (Math.cos(a) > 0.35 ? 'start' : 'middle');
        s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" fill="var(--xto-accent,#7fb2c2)" font-size="12" font-family="monospace" text-anchor="' + anc + '">' + L.iface + (L.peer ? ' — ' + L.peer : '') + (linkUp ? '' : ' ↓') + '</text>';
      }
    });

    // ── ② ノード本体(前面・links の後に描画=トンネルが face を覆わない)。rect=緑角丸四角 / circle=白円 ──
    if (shape === 'rect') s += '<rect x="' + (CX - HW) + '" y="' + (CY - HH) + '" width="' + (HW * 2) + '" height="' + (HH * 2) + '" rx="14" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-ok,#39ff14)" stroke-width="2"/>';
    else s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + RER + '" fill="var(--xto-bg,#0d1620)" stroke="var(--xto-fg,#e6f2f5)" stroke-width="2"/>';
    if (shape === 'rect' && rich) {   // faint 内部シリンダ(現状5 の薄い円柱・装飾)
      var cw = HW * 0.4, cyT = CY - HH * 0.44, cyB = CY + HH * 0.44;
      s += '<ellipse cx="' + CX + '" cy="' + cyT.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + (cw * 0.34).toFixed(1) + '" fill="none" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.26"/>';
      s += '<line x1="' + (CX - cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX - cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.2"/>';
      s += '<line x1="' + (CX + cw).toFixed(1) + '" y1="' + cyT.toFixed(1) + '" x2="' + (CX + cw).toFixed(1) + '" y2="' + cyB.toFixed(1) + '" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.2"/>';
      s += '<ellipse cx="' + CX + '" cy="' + cyB.toFixed(1) + '" rx="' + cw.toFixed(1) + '" ry="' + (cw * 0.34).toFixed(1) + '" fill="none" stroke="var(--xto-fg,#e6f2f5)" stroke-width="1" opacity="0.18"/>';
    }

    // ── ③ immersive: リンクを内部円柱(routing engine 核)へ接続(2026-07-17 事業主・潜入=リンクが核に刺さる) ──
    //   cyan connector(body縁→円柱縁)+ 接続 orb。body の後(前面)ゆえ body に覆われず見える。imm 限定=showcase 不変。
    if (imm && shape === 'rect' && rich) {
      var ccw = HW * 0.4, chh = HH * 0.44;
      var cylEdge = function (a) { var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(dx ? ccw / Math.abs(dx) : 1e9, dy ? chh / Math.abs(dy) : 1e9); return [CX + dx * t, CY + dy * t]; };
      links.forEach(function (L) {
        if (L.link.up === false) return;
        var ca = L.angle, be = bodyEdge(ca), ce = cylEdge(ca);
        s += ln(ce, be, 'var(--xto-link,#00e5ff)', rich ? 2 : 1.8, false);
        s += '<circle cx="' + ce[0].toFixed(1) + '" cy="' + ce[1].toFixed(1) + '" r="3.5" fill="var(--xto-link,#00e5ff)"/>';
      });
    }

    // ── ②b IF マーカー(縁の小四角)= body の後(前面・edge の port として見える)。色=物理リンク色 ──
    links.forEach(function (L) {
      var m = bodyEdge(L.angle), mc = L.link.up !== false ? 'var(--xto-link,#00e5ff)' : 'var(--xto-linkDown,#ff4d4d)';
      s += '<rect x="' + (m[0] - 4).toFixed(1) + '" y="' + (m[1] - 4).toFixed(1) + '" width="8" height="8" fill="var(--xto-bg,#0d1620)" stroke="' + mc + '" stroke-width="1.5"/>';
    });

    // ── ③ processGlyph = ●+色文字プロセス凡例。'none'|'inside'|'outside'(placement を1軸に折込) ──
    // ★大ボール廃止(2026-07-16 事業主・phallic 回避)。established=フル色 / not-established=pale。
    //   ★inside=body 左上内側縦スタック / outside=body 上辺の外の横並び(radial 矢印の放射経路と重複回避
    //   =2026-07-16 事業主 refinement)。protocolOrder = 凡例順序のみ(トンネル層順=DATA §4.7 不干渉)。
    if (ax.processGlyph === 'inside' || ax.processGlyph === 'outside') {
      var order = [], rank = { bgp: 2, ospf: 1, static: 0 }, upset = {};
      (node.links || []).forEach(function (lk) { (lk.protocols || []).forEach(function (p) { if (order.indexOf(p.proto) < 0) order.push(p.proto); if (p.up) upset[p.proto] = 1; }); });
      order.sort(function (a, b) { return (rank[b] || 0) - (rank[a] || 0); });
      if (ax.protocolOrder === 'ospf-top') order.reverse();
      var topY = (shape === 'rect' ? CY - HH : CY - RER), leftX = (shape === 'rect' ? CX - HW : CX - RER);
      if (ax.processGlyph === 'inside') {
        order.forEach(function (p, i) {
          var up = !!upset[p], col = up ? protoCol(p) : 'var(--xto-pale,#8aa0ab)', ly = topY + 15 + i * 14, lx = leftX + 9;
          s += '<circle cx="' + lx.toFixed(1) + '" cy="' + (ly - 3).toFixed(1) + '" r="4" fill="' + col + '"' + (up ? '' : ' opacity="0.6"') + '/>';
          s += '<text x="' + (lx + 8).toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + col + '" font-size="10.5" font-family="monospace"' + (up ? '' : ' opacity="0.7"') + '>' + p.toUpperCase() + '</text>';
        });
      } else { // outside: ★リンクの無い最大角度ギャップ(空セクタ)に凡例を置く = 矢印もビームも非交差(動的・
        //   トポロジ非依存)。3+ピア放射でもリンクの隙間に自動で逃げる(2026-07-17 事業主・リンク非交差要件)。
        var angs = links.map(function (L) { return L.angle; }).sort(function (a, b) { return a - b; });
        var gapMid = -Math.PI / 2, gapSize = -1;                    // 既定=上(リンク0本時)
        for (var gi = 0; gi < angs.length; gi++) {
          var a1 = angs[gi], a2 = (gi + 1 < angs.length) ? angs[gi + 1] : angs[0] + 2 * Math.PI, g = a2 - a1;
          if (g > gapSize) { gapSize = g; gapMid = a1 + g / 2; }
        }
        if (gapMid > Math.PI) gapMid -= 2 * Math.PI;
        var lr = (shape === 'rect' ? Math.max(HW, HH) : RER) + 26, anc = pt(gapMid, lr), totalH = order.length * 14;
        order.forEach(function (p, i) {
          var up = !!upset[p], col = up ? protoCol(p) : 'var(--xto-pale,#8aa0ab)', ly = anc[1] - totalH / 2 + 10 + i * 14, lx = anc[0] - 14;
          s += '<circle cx="' + lx.toFixed(1) + '" cy="' + (ly - 3).toFixed(1) + '" r="4" fill="' + col + '"' + (up ? '' : ' opacity="0.6"') + '/>';
          s += '<text x="' + (lx + 8).toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="' + col + '" font-size="10.5" font-family="monospace"' + (up ? '' : ' opacity="0.7"') + '>' + p.toUpperCase() + '</text>';
        });
      }
    }

    // ── ④ forwarding 矢印(body 内→選択 out-iface の body 縁。radial=抜ける側) ──
    // ★forwarding ゲート(2026-07-17 事業主): route 未解決(初期/DROP)時は矢印/ping を出さない
    //   (opt.forwarding===false)。既定(未指定)=true=従来通り。hello は adjacency ゆえ別(OSPF up で出す)。
    var fwd = !(axes && axes.forwarding === false);
    var selL = links.filter(function (L) { return L.link.selected; })[0] || links[0];
    if (selL && fwd) {
      // ★矢印は縁の IF マーカー(8px)手前で止める(重複回避・2026-07-17 事業主)
      var oa = selL.angle, _e = bodyEdge(oa), ti = [_e[0] - Math.cos(oa) * 9, _e[1] - Math.sin(oa) * 9], hs = 9;
      var from = pt(oa, (shape === 'rect' ? Math.min(HW, HH) : RER) * 0.2);
      var acol = ax.arrowMode === 'proto' ? protoCol((linkLayers(selL.link)[0] || {}).proto) : 'var(--xto-ok,#39ff14)';
      s += ln(from, ti, acol, 3.5, false);
      s += '<polygon fill="' + acol + '" points="' + ti[0].toFixed(1) + ',' + ti[1].toFixed(1) + ' ' +
        (ti[0] - Math.cos(oa - 0.5) * hs).toFixed(1) + ',' + (ti[1] - Math.sin(oa - 0.5) * hs).toFixed(1) + ' ' +
        (ti[0] - Math.cos(oa + 0.5) * hs).toFixed(1) + ',' + (ti[1] - Math.sin(oa + 0.5) * hs).toFixed(1) + '"/>';
    }

    // ── S4 プロト: orb アニメ角度化(実証)。orb を選択リンクの実角度パスに沿わせる(SVG animateMotion)。 ──
    //   ★S3 表現は LOCK ゆえ additive(axes.animDemo フラグ時のみ)。ping=中心→out(forwarding・cyan)/
    //   hello=OSPF up リンクを双方向(緑・adjacency)。技術実証=animateMotion path が任意角度で動く。
    // ★S4 本実装: animMode 軸(none|on)+ animSpeed(既定1)。表現は LOCK(ping/hello 不変)・toggle/param 化のみ。
    //   energy/beam は S5(既存 DeepDive 移行)で同 animateMotion 機構により parity 追加(その時 screenshot)。
    var spd = (axes && +axes.animSpeed) || 1;
    if (axes && axes.animMode === 'on') {
      // ping orb: 選択リンクを body 内→peer 方向(forwarding)。★fwd(route 解決)時のみ。
      if (selL && fwd) {
        var pa = selL.angle, pp0 = pt(pa, (shape === 'rect' ? Math.min(HW, HH) : RER) * 0.2), pp1 = pt(pa, R - 6);
        s += '<circle r="' + (rich ? 4 : 3) + '" fill="var(--xto-link,#00e5ff)" style="filter:drop-shadow(0 0 5px var(--xto-link,#00e5ff))">' +
          '<animateMotion dur="' + (1.5 / spd).toFixed(2) + 's" repeatCount="indefinite" path="M ' + pp0[0].toFixed(1) + ' ' + pp0[1].toFixed(1) + ' L ' + pp1[0].toFixed(1) + ' ' + pp1[1].toFixed(1) + '"/></circle>';
      }
      // hello orb: OSPF up の各リンクを ★オレンジ(idle=hello/keepalive 機構色。緑=確立トンネルと意味分離)
      //   + 2レーン(perp ±offset): 上レーン(+off)=送信 body→peer / 下レーン(−off)=受信 peer→body。
      //   ＝現行 DeepDive の「リンク上下で送受信」を可変角で実現(トンネルの perp offset 機構を流用)。
      links.forEach(function (L) {
        if (L.link.up === false) return;
        if (!(L.link.protocols || []).some(function (p) { return p.proto === 'ospf' && p.up; })) return;
        // ★hello レーン = link(cyan中心)↔OSPFトンネル(緑・±6)の "隙間"(±~3)に置く(2026-07-17 事業主・意味論):
        //   トンネル(緑)は hello をやり取りした "結果" であって orb の走るレーンではない → 機構(hello)と
        //   結果(tunnel)を別チャンネルに分離。将来 hello有×tunnel無 / tunnel有×hello無 で因果・失敗を可視化。
        var ha = L.angle, perp = [-Math.sin(ha), Math.cos(ha)], off = rich ? 3 : 2.5, hc = 'var(--xto-idle,#ff8c00)';
        var hb = bodyEdge(ha), he = pt(ha, R - 6);
        function o2(p, d) { return [p[0] + perp[0] * d, p[1] + perp[1] * d]; }
        var sb = o2(hb, off), se = o2(he, off), rb = o2(he, -off), rE = o2(hb, -off);   // 送信=+off / 受信=−off
        var hd = (1.8 / spd);   // 送受信を半周期ずらす(begin=hd/2)= リンク上で送受信が交互に見える
        s += '<circle r="2.6" fill="' + hc + '" opacity="0.9"><animateMotion dur="' + hd.toFixed(2) + 's" repeatCount="indefinite" path="M ' + sb[0].toFixed(1) + ' ' + sb[1].toFixed(1) + ' L ' + se[0].toFixed(1) + ' ' + se[1].toFixed(1) + '"/></circle>';
        s += '<circle r="2.6" fill="' + hc + '" opacity="0.9"><animateMotion dur="' + hd.toFixed(2) + 's" begin="' + (hd / 2).toFixed(2) + 's" repeatCount="indefinite" path="M ' + rb[0].toFixed(1) + ' ' + rb[1].toFixed(1) + ' L ' + rE[0].toFixed(1) + ' ' + rE[1].toFixed(1) + '"/></circle>';
      });
    }

    // ── ⑤ node ラベル(body 下辺・小) ──
    s += '<text x="' + CX + '" y="' + (CY + (shape === 'rect' ? HH : RER) - 6).toFixed(1) + '" fill="var(--xto-muted,#5f7d8a)" font-size="9" font-family="monospace" text-anchor="middle">' + node.target + '</text>';
    s += '</svg>';
    return s;
  }

  // ── 後方互換: 旧 clab-collect state(<peer>_proto 単一)→ per-link node ──
  function fromLegacyState(state) {
    var ifs = state.interfaces || {}, links = [];
    Object.keys(ifs).forEach(function (ifn) {
      if (ifn === 'lo') return;
      var peer = ''; Object.keys(state).forEach(function (k) { var m = /^(.+)_iface$/.exec(k); if (m && state[k] === ifn) peer = m[1]; });
      var proto = (peer && state[peer + '_proto']) || state.protocol || 'ospf';
      var up = peer && state[peer + '_has_full'] != null ? !!state[peer + '_has_full'] : true;
      links.push({ iface: ifn, peer: peer, protocols: [{ proto: proto === 'bgp' ? 'bgp' : 'ospf', up: up }] });
    });
    return { target: state.target_node, links: links, positions: state._positions || {} };
  }

  function render(container, node, axes) { if (container) container.innerHTML = xrayRenderUnified(node, axes); }

  root.XrayUnified = {
    render: render, renderSvg: xrayRenderUnified, geometry: xrayRadialGeometry,
    fromLegacyState: fromLegacyState, PRESETS: PRESETS
  };
})(typeof window !== 'undefined' ? window : this);
