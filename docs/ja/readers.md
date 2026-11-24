# 読み取り部品: ほかの機器やデータを network-xray に読ませる

*[English](../readers.md) | 日本語*

network-xray は、渡された **ルータごとの状態** ([DATA-CONTRACT.md §4](../../DATA-CONTRACT.md#4-state--router-state-snapshot--状態スナップショット) の `state`) を描きます。
頁・DeepDive・`scripts/xray-query.js`・MCP サーバは、その状態がどこから来たかを見ません。**読み取り部品** は、何か
(CLI の出力・gNMI・機器台帳・ほかの道具が解析したデータ) を読んで、その状態を書く小さなプログラムです。

この repository の読み取り部品 (FRR・Nokia SR Linux・Cisco IOS-XE・Cisco Genie の解析済み JSON を読む `genie-to-xray.js`)
は、どれも同じファイルを書きます。自分の読み取り部品を **自分の repository に**、自分のライセンスで作り、network-xray を
そのまま使えます。ここでは pull request を merge しません (コードの作者を 1 人に保つため) が、読み取り部品はこの
repository の変更を必要としません。

## 読み取り部品の作り方

**書く物.** ルータごとの `state_<ルータ名>.json` (状態 = DATA-CONTRACT §4) を並べたフォルダか、全部をまとめた
`xray-states.js` 1 つ:

```js
window.LIVE_STATES = { "r1": { "target_node": "r1", "interfaces": [ ... ], ... }, "r2": { ... } };
```

(`xray-states.json` は同梱の collector が *ほかの道具が読むために* 書く物で、ここでの入力ではありません。)

- **ルータの名前** はトポロジ (`clab.yml` か netlab のトポロジ) のノード名と同じにします (状態が正しい箱に載る様に)。
- **最小限の正しい状態** は `target_node` (ルータ名) と `interfaces` (§4.1)。経路表と経路解決 (§4.2)・OSPF (§4.3)・BGP (§4.4)・
  static (§4.5)・リンク (§4.6) は、読める物だけ足します。**読めない欄は推測で埋めずに省きます**: 無い欄は「読めていない」と表示されます。
- **各欄の出どころ** (FRR と Cisco IOS) は [DATA-CONTRACT.md §6](../../DATA-CONTRACT.md#6-bring-your-own-data--自分のデータで使う) にあります。

**確かめ方.** この repository の clone で 2 つの命令:

```
node scripts/validate-states.js <書いたフォルダ>        # 形 (docs/dev/states-schema.json)・終了コード 0 = 正しい
node scripts/xray-query.js state <書いたフォルダ>        # その状態から network-xray が読む物 (と食い違い)
```

両方が動けば、グラフの頁・DeepDive・MCP の道具がそのフォルダを使えます (MCP の道具と `xray-query.js` には `path` に
フォルダを渡す・グラフの頁は `genie-to-xray.js --out` の出力と同じ使い方 = [README の Cisco pyATS / Genie の節](../../README.md#from-cisco-pyats--genie-output))。

**始めの見本.**

- `genie-to-xray.js` — ほかの道具の解析済み JSON を状態に (機器には接続しない)。
- `clab-srl-collect.js` — 機器の YANG state (`sr_cli … | as json`) を、FRR の読み取り部品と同じ状態に。

**版.** 読み取り部品が壊れる変更の時は `schema` が上がります ([xray-states.json](../../DATA-CONTRACT.md#xray-statesjson-schema-1))。
読み取り部品の README に、試した network-xray の版を書いてください。

**安全.** network-xray は読み取り部品が書いたファイルを読むだけです。機器への入り方 (SSH・Docker のソケット・API の鍵) は、
読み取り部品と、それを動かす人の側のことです。その README に書いてください。

## ほかの人の読み取り部品

各作者が自分の repository で作り、保守している物です。**この project では中身を見直していません — 動かす前にコードを
読んでください。**

| 読み取り部品 | Repository | 読む物 | 埋める欄 | 試した版 |
|---|---|---|---|---|
| *(まだありません)* | | | | |

**載せてほしい時** は「List my reader」の型で issue を開き、repository の URL・読む物・`scripts/validate-states.js` が
通る出力の例を書いてください。一覧は保守する者が更新します。コードはあなたの repository に置いたままです。

network-xray に入っている読み取り部品は [README](../../README.md) (対応するルータ) にあります。
