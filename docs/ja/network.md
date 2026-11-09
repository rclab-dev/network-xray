[English](../network.md)

# network-xray が通信する先

rclab-dev/network-xray には、テレメトリも、アクセス解析も、アカウントもありません。自分で確かめられる様に、通信する先をここに全部
並べます。`node scripts/check-no-external.js` は、頁やスクリプトがほかの機械へ届く「よくある書き方」(script / style の
タグ・`fetch`・WebSocket・Worker・`curl`・解析のタグ …) を探し、下に無い物があれば失敗する lint です。ソースの文字を
読む物で、よくある形を見つける物です (証明ではありません)。

## ブラウザの頁

- 頁が読み込む物は、あなたが起こした graph のサーバ (`./xray.sh`・コンテナ・`containerlab graph`) からだけです: 頁・
  スクリプト・スタイル・フォント・`xray-states.js`。CDN・Web フォント・アクセス解析はありません。
- **例外 1 つ (押した時だけ):** RouteCrushLab の問題 (RCL のリンクのある `problem.json`) を解いた後に出る **Preview**
  のボタンは、`https://routecrushlab.com/static/pip/` の短い動画を再生します。ボタンを押すまでは何も取りに行きません。

## ルータを読む (collector)

- ラボのコンテナへの `docker exec` (FRR の `vtysh`・SR Linux の `sr_cli`) と、Cisco IOL へのラボの管理網での SSH。
  どれもあなたの機械の中です。collector が送るのは読むだけの命令です: `show` (FRR・IOL) と `info from state` (SR Linux)。
  コンテナは OSPF か BGP かを決めるため、始めと 30 秒ごとに設定も読みます (`show running-config` / `info from running`)。
- `./xray.sh` とリリースの `run.sh` は、ラボを作った直後に FRR が上がらなかったルータで FRR を立て直します
  (`watchfrr.sh restart all`・最大 3 回)。設定は変えません。

## ラボを起こす (`xray.sh`・containerlab・netlab)

- ルータの image が手元に無ければ、containerlab (や netlab) がその registry から取ってきます。これは containerlab /
  Docker のいつもの動きで、network-xray が足す通信ではありません。
- `./xray.sh` とコンテナは、案内のリンク (containerlab・Docker・Node.js の入れ方の頁) を表示します。表示するだけで、
  開きません。
- containerlab 自身の版の確かめ (GitHub に最新の版を聞く) は切っています: `./xray.sh` とコンテナは、その変数を自分で
  決めていなければ `CLAB_VERSION_CHECK=disable` で containerlab を動かします。

## image を作る / 取る

- `docker pull ghcr.io/rclab-dev/network-xray` は GitHub の registry から image を取ります。
- `docker build` は土台の image (`node`・digest で固定) と、足す Alpine のパッケージ (`apk add`: bash・docker-cli・openssh-client …
  を Alpine のパッケージの置き場から) と、固定した版の containerlab 1 つを GitHub から取り、SHA-256 で確かめます。

## あなたが押すリンク

- README・頁・`problem.json` には普通のリンク (GitHub・routecrushlab.com・RFC …) があります。押した時だけ開きます。
- routecrushlab.com へのリンク (README の物と、DeepDive の「Powered by RCL」) には、ここから来た訪問をサイトが数えられる様に
  `ref=` / `utm_` が付いています。付いているのはそれだけで、押すまで何も送りません。

## MCP サーバ

- `scripts/xray-mcp.js` は stdio でクライアントと話し、あなたの機械の `xray-states.js` と `problem.json` を読みます。
  網には出ません。
