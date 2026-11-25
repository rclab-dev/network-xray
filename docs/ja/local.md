[English](../local.md)

# 完全にローカルで: クラウド無し、またはネット無し

rclab-dev/network-xray そのものは、どこにも何も送りません (テレメトリも、アクセス解析も、アカウントもありません)。通信する先は
[network.md](network.md) に全部並べています。この頁は、もう半分の話です。ラボについて AI に聞く時、AI に見せたラボのデータと
答えは、その AI が動いている所へ行きます。全部を手元に置くなら、AI も手元で動かします。

## もう手元で済んでいる物

- **頁**は、自分で起こした画面のサーバ (`./xray.sh`・コンテナ・`containerlab graph`) が出し、既定で `127.0.0.1` で待ちます。
  頁の中に、ほかの機械へ届く物はありません。
- **collector** は `docker exec` (FRR / SR Linux) か SSH (Cisco IOS-XE) でルータを読み、手元に `xray-states.js` を書きます。
- **MCP のサーバ** (`scripts/xray-mcp.js`、または `docker run -i … ghcr.io/rclab-dev/network-xray:1 mcp`) は、クライアントと stdio で
  話し、`--path` のフォルダの下の状態のファイルだけを読みます。ネットにはつなぎません。[mcp.md](mcp.md) を見てください。

## データが機械の外に出るのは AI のクライアント

クラウドの AI を使う MCP のクライアントは、道具の答え (ルータの名前・アドレス・経路・network-xray が言う理由) を、会話の
一部としてそのサービスに送ります。送っているのは network-xray ではなくクライアントです (それがモデルと話すやり方だから)。
ラボの中身を外に出したくないなら、手元で動くモデルを使ってください。

## 手元のモデル

確かめた形 (2026 年 11 月): 同じ LAN の機械で [Ollama](https://ollama.com/) が `qwen2.5:14b` を動かし、小さなクライアントの台本が

1. `node scripts/xray-mcp.js --path <ラボのフォルダ>` を stdio で起こし、`initialize` と `tools/list` を呼ぶ
2. その道具を、Ollama の OpenAI 互換の口 (`http://<host>:11434/v1/chat/completions`) に関数の定義として渡す
3. モデルが道具を呼んだら MCP のサーバに送り (`tools/call`)、結果を返す。モデルが答えるまで繰り返す

この流れの中で、ネットの外に出る物はありません。手元の OpenAI 互換 / Ollama のモデルを使えて、stdio のサーバを起こせる
MCP のクライアントなら、同じ形で動くはずです。出来合いのクライアントはまだ試していないので、ここには挙げません。

**小さなモデルの当たり方。** `examples/` の 22 の練習ラボ (壊れた状態だけ・原因と直し方を聞く) で、`qwen2.5:14b` が原因と
直し方を当てたのは、network-xray の道具ありで約 36%、show の形の出力だけを渡した時で約 26% でした。設定の値の違い
(hello / dead のタイマー・area・passive・local preference) は当たりやすく、無い設定や filter (route-map・prefix-list) は
当たりにくい結果でした。大きなモデルの方がずっと当たるので、手元の小さなモデルの答えは、確かめる手がかりとして読んでください。

**絵。** 手元のクライアントの多くは MCP Apps (答えの下の絵・[mcp.md](mcp.md)) を出せません。同じ絵は、ブラウザで `127.0.0.1` の頁を
開けば見られます。

## ネットにつながっていない機械 (air-gapped)

- **コード:** つながる機械で `git clone https://github.com/rclab-dev/network-xray` し、フォルダを持ち込みます。Node.js 18 以上が
  要り、npm からは何も要りません。
- **または像:** `docker pull ghcr.io/rclab-dev/network-xray:1` → `docker save ghcr.io/rclab-dev/network-xray:1 -o network-xray.tar` →
  ファイルを持ち込み → `docker load -i network-xray.tar`。同じ像か、両方の機械で
  `docker image inspect --format '{{.Id}}' ghcr.io/rclab-dev/network-xray:1` を比べてください。
- **リンク:** README・頁・`problem.json` には普通のリンク (GitHub・RFC・DeepDive の「Powered by RCL」) があります。押さなければ何も
  しません。ネットが無ければ、押しても開かないだけです。
- **ラボの像** (FRR・SR Linux …) は、いつもの所から持ってきて、同じ形 (`docker save` / `docker load`) で持ち込みます。
