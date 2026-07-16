# X-Ray Core — Skin Contract / スキン契約

> **EN** — `xray-core.js` separates **what it means** (the data contract + the two promises:
> *Overview = an x-ray of the topology*, *DeepDive = inside the router*) from **how it looks**
> (shapes, colors, stacking order). The meaning is fixed (see `DATA-CONTRACT.md`); the look is a
> **skin** — a small plain object you can pick, edit, export, and share. This document is the
> frozen shape of that skin object and the rules the engine follows when it applies one.
>
> **JA** — `xray-core.js` は **意味**(データ契約 + 2つの約束: *Overview=トポロジの透視* /
> *DeepDive=ルータの中*)と **見た目**(形・色・上下順)を分離します。意味は不変
> (`DATA-CONTRACT.md`)、見た目は **スキン** = 選べて・編集でき・export/import で共有できる小さな
> プレーンオブジェクトです。本書はそのスキンオブジェクトの**凍結された形**と、engine が適用時に
> 従う規則を定めます。

- **Status**: Phase 1 frozen (2026-07-14). Keys are frozen; some are *reserved* (declared now,
  interpreted in Phase 2 — see §4). / Phase 1 凍結。キーは凍結済、一部は*予約*(今宣言・Phase 2 で解釈)。
- **Authority**: schema keys = worker7 (this doc). Engine interpretation = worker1 (`xray-core.js`).
  Wording = worker4. / スキーマキー=worker7(本書)/ engine 解釈=worker1 / 文言=worker4。
- **Related**: `DATA-CONTRACT.md`(意味・不変)/ `事業化/xray_表現層スキン化_設計メモ.md`(設計権威)。

---

## 1. The skin object / スキンオブジェクト

```json
{
  "id": "signature",
  "colors": {
    "ospf":   "#39ff14",
    "bgp":    "#a855f7",
    "static": "#888888",
    "link":   "#00e5ff",
    "idle":   "#ff8c00",
    "down":   "#555555"
  },
  "protocolOrder": "bgp-top",

  "engineShape":  "cylinder",
  "processGlyph": "double-circle",
  "rules": {}
}
```

- **EN** — A skin is a single flat object. Phase 1 uses only `colors` and `protocolOrder`
  (§2 + §3). `engineShape`, `processGlyph`, `rules` are **reserved** (§4): declared and frozen
  now so hook points never churn, but the engine does **not** read them in Phase 1.
- **JA** — スキンは1つのフラットなオブジェクト。Phase 1 が使うのは `colors` と `protocolOrder`
  のみ(§2+§3)。`engineShape` / `processGlyph` / `rules` は**予約**(§4)= 今凍結しフック点を
  固定するが、Phase 1 では engine は読まない。

---

## 2. `colors` — the six color keys / 6つの色キー (Phase 1 active)

| key | default | meaning / 意味 |
|---|---|---|
| `ospf`   | `#39ff14` | OSPF: Full process ball, OSPF tunnel layer, OSPF-adopted forwarding arrow / OSPF プロセス(Full)・OSPF トンネル層・採用時の矢印 |
| `bgp`    | `#a855f7` | BGP: Established process ball, BGP tunnel layer, BGP-adopted forwarding arrow / BGP プロセス(Established)・BGP トンネル層・採用時の矢印 |
| `static` | `#888888` | static / other adopted route: forwarding arrow (gray) / static 等の採用経路の矢印(灰) |
| `link`   | `#00e5ff` | physical link / junction orb / forwarding-link center (constant, state-independent) / 物理リンク・接合部 orb・転送リンク中心(状態非連動で固定) |
| `idle`   | `#ff8c00` | forming: OSPF not-Full, BGP up-but-not-established / forming: OSPF not-Full・BGP 確立前 |
| `down`   | `#555555` | stopped: process ball frame when the process is down / 停止: プロセス停止時のボール枠 |

- **EN** — These map 1:1 onto the engine's currently-hardcoded colors. In Phase 1 the engine
  moves them into CSS variables (`--xto-ospf` … `--xto-down`) driven from `skin.colors`.
- **JA** — engine の現行ハードコード色に 1:1 対応。Phase 1 で engine はこれらを CSS 変数
  (`--xto-ospf` … `--xto-down`)化し `skin.colors` から流し込む。
- Color values are `#rrggbb` hex. The UI validates on import (§6); the engine trusts them.
  / 色は `#rrggbb`。UI が import 時に検査(§6)、engine は信頼して使う。

---

## 3. `protocolOrder` — process stacking order / プロセス上下順 (key frozen in Phase 1; UI + engine = Phase 2)

| value | order (top → bottom) / 上下順 |
|---|---|
| `bgp-top` (default) | **BGP top / OSPF bottom** — dependency stack (下から 物理→IGP→BGP・外部=外側=上) |
| `ospf-top` | OSPF top / BGP bottom (the alternative stack order) |

- **EN** — Only affects routers where OSPF and BGP are **co-located on one node** (border
  routers). Single-protocol nodes (the majority) show one ball → the flag is a no-op there, so
  the regression surface is narrow (co-located Qs only).
- **JA** — OSPF と BGP が**同一ノードに同居**するルータ(境界)でのみ効く。単一プロトコルの
  ノード(大多数)は片方しか出ず no-op → 退行面は狭い(同居 Q のみ)。
- **Dependency stack / 依存スタック** — BGP depends on reachability to its peer &amp; next-hop
  (via IGP, or a connected route for a directly-attached eBGP peer); OSPF adjacency depends on
  the physical link. Hence bottom → top = physical → IGP → BGP (external / EGP = outermost = top).
  / BGP は peer と next-hop への到達性に依存(IGP 経由、直結 eBGP は connected 経路)、OSPF 隣接は
  物理リンクに依存 → 下から 物理 → IGP → BGP(外部/EGP = 最外 = 上)。この境界同居ケースで積層が成立する。
- **Note — a new stack, not a flip / 反転ではなく新規スタック** (engine-verified, worker1) —
  the pre-skin engine rendered each DeepDive for a **single** protocol (scalar `protocol` = `ospf`
  \| `bgp`; the two process balls were never shown together — there is no prior two-ball order in
  the engine). The signature skin's `bgp-top` introduces **co-located dual-ball stacking as new
  default behavior** for routers running both (proto-confirmed, memo Part 1-1); `ospf-top` selects
  the inverse. Because there was no prior two-ball order, `protocolOrder` governs a newly-introduced
  representation, not a flip of an existing layout. Single-protocol nodes keep their one ball = no-op.
  / 旧 engine は各 DeepDive を**単一**プロトコルで描画(スカラ `protocol`=`ospf`|`bgp`・2つのプロセス
  ボールが同時に出ることは無かった＝engine に旧来2ボール順は存在しない)。署名スキンの `bgp-top` は
  両プロトコル同居ルータでの**同居デュアルボール縦積みを新既定挙動として新規導入**(proto 準拠・設計
  メモ Part 1-1)、`ospf-top` は逆順。旧来順が無いため `protocolOrder` は既存レイアウトの反転ではなく
  新規表現の順序制御。単一プロトコルのノードは1ボール=no-op。
- **Phase scope / フェーズ範囲** (owner decision 2026-07-14) — **Phase 1 ships the color axis only.**
  The `protocolOrder` **key is frozen now** (so skins carry it and the engine hook point is stable),
  but its **UI toggle and engine activation are Phase 2**, together with co-located dual-ball rendering.
  Rationale (worker1 feasibility): the color axis is data-independent and screenshot-gateable
  immediately, whereas order needs the engine to know a DeepDive target runs *both* OSPF and BGP
  (today `protocol` is a single scalar; the proto faked co-location with a hand-built config) —
  a per-Q config / state extension that belongs in Phase 2. In Phase 1 the value is fixed at the
  default `bgp-top`.
  / **Phase 1 は色軸のみを出す**(事業主決定 2026-07-14)。`protocolOrder` **キーは今凍結**(スキンが
  保持し engine フック点も安定)だが、**UI トグルと engine 有効化は Phase 2**(同居デュアルボール描画と
  セット)。理由(worker1 feasibility): 色軸は data 非依存で即 screenshot gate 可、順序は engine が
  DeepDive target の OSPF+BGP 両稼働を知る必要(現行 `protocol` は単一スカラ・proto は手組み config で
  同居を fake)= per-Q config/state 拡張ゆえ Phase 2。Phase 1 では値は既定 `bgp-top` 固定。

---

## 4. Reserved keys (Phase 2) / 予約キー

Frozen now so the engine's hook points depend on a stable schema; **not read in Phase 1**
(absent/`{}` → the engine's fixed default-skin behavior). / 今凍結して engine フック点を安定
スキーマに依存させる。**Phase 1 では読まない**(欠損/`{}` → engine の固定既定挙動)。

| key | Phase 2 values | Phase 1 behavior |
|---|---|---|
| `engineShape`  | `cylinder`(default) \| `box` | engine ignores; always cylinder / 常に円柱 |
| `processGlyph` | `double-circle`(default) \| `circle` \| `labeled-square` | engine ignores; always double-circle / 常に二重円 |
| `rules`        | object (see below) | engine ignores; baked-in defaults / ベタ焼き既定 |

**Why `rules` is baked in, not a Phase-1 toggle / なぜ `rules` は Phase 1 でトグルにしないか**
— The following are the **encoding of agreed moat semantics**, not taste axes, so they are
"contract"-side and are **not** offered as user settings. They are fixed behavior of the default
skin. 以下は**合意済 moat セマンティクスの符号化**であり taste の可変軸ではない → 「契約」側・
ユーザ設定にしない・既定スキンの固定挙動:

- `arrowFollowsWinner` — forwarding arrow colored by `route_resolution.protocol` (health ≠ winner).
  / 転送矢印は `route_resolution.protocol` で着色(健康状態ではなく採用経路で色が決まる)。
- `processEnlargeOnActive` — process ball enlarges only when established (BGP est / OSPF Full).
  / プロセスボールは確立時のみ拡大(BGP established / OSPF Full)。
- `junctionOrb: link-constant` — junction orb stays `link` color regardless of protocol state.
  / 接合部 orb はプロトコル状態によらず `link` 色で固定。
- `tunnel: concentric` — co-located link = concentric layers (center link → OSPF → BGP outermost).
  / 同居リンクは同心層(中心=link → OSPF → BGP 最外)。
- `helloLanes: bidirectional` — OSPF Hello as a 2-lane send/receive representation.
  / OSPF Hello は送信/受信の2レーン表現。
- `bestPathGate: bgp-only` — Best-Path Decision panel shows only when BGP is the adopted protocol.
  / Best-Path Decision パネルは BGP が採用経路のときのみ表示。

Phase 2 may promote select `rules` to editable — but only after the UGC kill-metric (people
actually make/share skins) justifies the UI + test-matrix cost. / Phase 2 で一部を編集可に昇格し
うるが、UGC kill-metric が UI+test-matrix コストを正当化してから。

---

## 5. Applying a skin — the engine API / 適用 API

```js
xrayCore.setSkin(skinObj);        // GLOBAL default: applies to every view rendered afterward
view.setSkin(skinObj);            // PER-VIEW override (de-risk / preview / one embedded demo)
xrayCore.renderTopology('#topo', config /* config.skin = fallback */, opts);
```

**Engine hook vs. OSS facade / engine 受け口と OSS facade** — the engine (canonical `xray_core.js`)
provides the primitives: a global `xraySetSkin(skin)` (updates the active-skin state + re-applies the
CSS variables) and `config.skin` read at `xrayRenderTopology`. The tidy `xrayCore.setSkin()` /
`view.setSkin()` above are a **1:1 OSS wrapper facade** (gallery side) over those primitives — the
build script does not generate `xrayCore`. RouteCrushLab itself has no `xrayCore` object and uses
`config.skin` + the global directly. / engine(正典 `xray_core.js`)が提供するのは global
`xraySetSkin(skin)`(active-skin 状態更新 + CSS 変数再適用)と `xrayRenderTopology` での `config.skin`
読取。上記 `xrayCore.setSkin()`/`view.setSkin()` はそれに **1:1 で被せる OSS wrapper facade**(gallery
側)で、build script は `xrayCore` を生成しない。RCL 本体は `xrayCore` を持たず `config.skin`＋global
を直接使う。

- **EN** — Three layers, precedence **per-view > global > `config.skin` > engine default**.
  Static gallery demos read the user's chosen skin from storage and call the **global** `setSkin`
  once (one line per page) → all views on the page pick it up. The dedicated editor / preview uses
  **per-view** to preview without disturbing the global choice.
- **JA** — 3層、優先順位 **per-view > global > `config.skin` > engine 既定**。静的 gallery デモは
  保存済スキンを読んで **global** `setSkin` を1回呼ぶ(1ページ1行)→ ページ内全 view に反映。
  専用エディタ/プレビューは **per-view** で global 選択を汚さずプレビュー。

**Engine rules when applying / 適用時の engine 規則**
1. **Never switch on `id`.** The engine interprets `colors` / `protocolOrder` (Phase 2: shapes)
   generically. Adding a preset is **data only** — no engine change. / **`id` で分岐しない。**
   プリセット追加は data のみ・engine 改修不要。
2. **Missing keys → engine defaults.** The engine treats any absent key as its built-in default
   (the signature skin). / 欠損キー→内蔵既定(署名スキン)。
3. **The UI normalizes; the engine trusts.** The engine assumes a complete, valid object (§6). It
   does not sanitize. / UI が正規化・engine は信頼。engine はサニタイズしない。

---

## 6. Export / import — sharing a skin / 共有

- **EN** — A skin travels as this JSON. The **UI owns normalization** on import:
  (i) ignore unknown keys, (ii) fill missing keys from the signature default, (iii) validate
  `colors.*` as `#rrggbb`. The result is always a complete, valid object before it reaches the
  engine. "Save it and hand it to someone" = the minimal UGC unit.
- **JA** — スキンはこの JSON で移動。**正規化は UI 所有**: (i) 未知キー無視 (ii) 欠損キーは署名
  既定で補完 (iii) `colors.*` を `#rrggbb` 検査。engine に渡る前に必ず完全・valid に。
  「保存して人に渡せる」= UGC 最小単位。
- Persistence: the active skin object lives in `localStorage['xray.skin']`. / 永続化: active スキン
  は `localStorage['xray.skin']`。

---

## 7. Bundled presets / 同梱プリセット (data only — worker7 owns)

Default + 2, each a plain skin object (no engine code). / 既定+2、各々プレーンなスキン
オブジェクト(engine コードなし):

1. **`signature`** (default) — cylinder · double-circle · `bgp-top` · green/purple/gray. The
   Part-1 署名スキン.
2. **`flat-docs`** — calm palette for docs/slides/blog embeds. (Phase 1 = colors only; `box`
   shape is Phase 2.) / 資料・スライド・ブログ埋込向けの落ち着いた配色。
3. **`accessible`** — high-contrast / CVD-safe palette, `idle` and `down` also easily
   distinguishable; does not rely on color alone (Phase 2: `labeled-square` shows protocol
   names). / 高コントラスト・色覚配慮、idle/down も識別容易、色だけに頼らない。

**UGC kill-metric**: do people actually make / share skins? If not, Phase 3 (a shared theme
ecosystem) folds. Ship export/import first; do not build a hosted market up front. / UGC
kill-metric = スキンを作る/共有する人が出るか。出なければ Phase 3 を畳む。まず export/import。

---

## 8. Versioning / バージョン

- This is **v1** of the skin schema (Phase 1). Reserved keys (§4) become active in v-next without
  breaking v1 objects (a v1 skin with no `rules` = signature behavior). / スキーマ **v1**(Phase 1)。
  予約キーは v1 オブジェクトを壊さず次版で有効化(rules 無し v1 = 署名挙動)。
- Adding a **color key** or a **`protocolOrder`/reserved-key value** is backward-compatible (older
  skins omit it → default). Removing or renaming a key is a breaking change → new major version.
  / 色キー追加・値追加は後方互換(旧スキンは省略→既定)。キー削除/改名は破壊的変更→メジャー更新。

---

## 9. Namespace bridge — one skin, every surface / ネームスペース橋渡し (2026-07-16)

- **EN** — X-Ray's engine + gallery demos read the `--xto-*` tokens; the SR-Linux node panel /
  topo-explorer (`xray-node-panel.js`) read their own `--xnp-*` "Network Palette" namespace. So a
  single skin drives **both**, the reader (`xray-skin.js`) maps the 6 skin colors onto the `--xnp-*`
  **semantic** tokens too — in addition to `--xto-*` — via `applyXnpVars()`:
  | skin | → `--xnp-*` |
  |---|---|
  | `ospf` | `--xnp-ospf`, `--xnp-ok` |
  | `bgp`  | `--xnp-bgp`, `--xnp-bgp-header` |
  | `link` | `--xnp-phys` |
  | `down` | `--xnp-muted` |
  Structural chrome (`--xnp-bg/fg/border/accent/sel/note/font`) is **not** a skin color and is left
  at the panel's defaults. `--xnp-decider` (best-path amber) and `--xnp-route-fg` are independent
  semantics, **not** mapped (deferred). `static` has no clean `--xnp` equivalent (left as default).
  Any page that includes `xray-skin.js` gets both namespaces skinned — no engine change (all CSS vars).
- **JA** — X-Ray engine + gallery デモは `--xto-*` を、SR-Linux ノードパネル / topo-explorer
  (`xray-node-panel.js`)は独自 `--xnp-*`(Network Palette)を読む。1枚のスキンで**両方**を駆動する
  ため、リーダ(`xray-skin.js`)が `applyXnpVars()` で skin の6色を `--xnp-*` **semantic** にもマップ
  する(`--xto-*` と同時)。構造 chrome は skin 対象外・据置。`--xnp-decider`/`--xnp-route-fg` は独立
  semantic ゆえ非マップ(defer)、`static` は相当なしで据置。`xray-skin.js` を include したページは
  両 namespace が skin 連動(engine 改修なし・全 CSS 変数)。
- **Schema unchanged / スキーマ不変**: this is a reader-side bridge; the skin object is still the six
  `colors` keys (§2). / これは reader 側の橋渡しで、skin オブジェクトは §2 の6色のまま不変。
