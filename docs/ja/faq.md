[English](../faq.md)

# network-xray FAQ (よくある質問)

network-xray を初めて見るネットワークエンジニア向けの短い答えです。どの答えにも、詳しく書いてある
[README](../../README.md) の場所を付けています (README の該当部分は英語です)。

## 何を読むのか

### network-xray は実際に何をするのですか?

動いている containerlab か netlab のラボのルータから今の状態 (ネイバー・経路・BGP テーブル) を読み、
ブラウザに描きます。ラボ全体のトポロジの画面と、1 台のルータの中を見る「DeepDive」の画面があります。主に答えるのは
「ルータがなぜその経路を選んだか」です。Best-Path Decision のパネルが BGP の候補を並べ、勝った経路が勝ったわけを
示します。[When to use](../../README.md#when-to-use) と [See it](../../README.md#see-it) を参照してください。

### どのルータを読めますか?

FRR・Nokia SR Linux (containerlab の kind `nokia_srlinux`)・Cisco IOS-XE IOL (containerlab の kind `cisco_iol`) です。
collector はノードごとの containerlab の `kind` で読み方を選ぶので、1 つのラボに 3 つを混ぜられます。試した版は
[When to use](../../README.md#when-to-use) の **Tested with** にあります。

### どうやって読むのですか?

FRR は `docker exec <node> vtysh -c 'show … json'`、SR Linux は `sr_cli 'info from state … | as json'`、
Cisco IOL は SSH で文字の `show` コマンドを使って読みます。コマンドの一覧は
[When to use](../../README.md#when-to-use) と [Cisco IOS-XE (IOL)](../../README.md#cisco-ios-xe-iol) にあります。ルータに入れる
エージェントは無く、SNMP・gNMI・ストリーミングテレメトリも使いません。

### ルータの設定を変えることはありますか?

ありません。collector が打つのは `show` コマンド (FRR・IOL) と `info from state` (SR Linux) だけで、設定モードには
入りません。IOL では SSH のセッションで `terminal length 0` と `terminal width 0` も打ちますが、そのセッションの間だけの設定です。変えるのは FRR そのものだけで、設定ではありません: `./xray.sh` とリリースの
`run.sh` は、deploy の直後に FRR が上がらなかったルータで FRR を立て直します。絵に出る変化は、すべて自分でラボに加えた変化から来ます。

### Best-Path の勝者は network-xray が計算したものですか?

違います。勝者は必ず、ルータ自身が best と印を付けた経路 (FRR の `bestpath`) です。パネルは候補を
Weight・Local Preference・AS path・origin・MED で比べてわけを説明し、それで決まらない時は FRR 自身の
`selectionReason` を出します。Cisco IOL では、`show ip bgp` に出る列からわけを割り出します。
[See it](../../README.md#see-it) と [Query from a script or an AI assistant](../../README.md#query-from-a-script-or-an-ai-assistant) を参照してください。

## ほかのツールとの違い

### トポロジを描くツール (containerlab graph・NeXt UI・TopoViewer) とどう違いますか?

トポロジを描くツールは、何が何に配線されているかを示します。network-xray はその画面の上に乗るもので、リンクを
その上で動くプロトコルのセッションで色分けし、ルータをクリックするとルーティングテーブル・BGP テーブル・実際に入った
経路を見せます。トポロジ自体には `containerlab graph --template` を使っています。
[containerlab graph template](../../README.md#containerlab-graph-template) を参照してください。

### Batfish のような設定を解析するツールとどう違いますか?

Batfish は設定を読んで、ネットワークがどう動くかをモデルで求めます (多くは deploy の前)。network-xray は、もう動いている
ルータの今の状態 (`show` の出力) を読み、実際にどう動いたかを描きます。入力も、答える問いも違います。
[When to use](../../README.md#when-to-use) を参照してください。

### SuzieQ のような状態を集めるツールとどう違いますか?

SuzieQ は多くの機器の状態を継続的に集め、表として問い合わせられるようにします。network-xray はラボの各ルータの
最新の状態だけを持ち、1 台のルータの判断を描きます。履歴は残しません。
[When to use](../../README.md#when-to-use) を参照してください。

### シミュレータですか? 監視ツールですか?

どちらでもありません。経路を計算したりプロトコルを動かしたりはせず、ルータが報告する状態を描くだけです。本番の監視に使う
ためのものでもありません。[Scope & maintenance](../../README.md#scope--maintenance) を参照してください。

## どのくらい追いつくか

### ルータをどのくらいの間隔で読み直しますか?

`xray.sh` と `clab-xray-collect.js --watch` は既定で 1 秒ごとに読みます。`docker run` / netlab のコンテナは
2 秒ごとです (`--interval N` で変えられます)。Cisco IOL のノードは 10 秒ごとです。1 回読むごとに SSH のログインと
いくつもの `show` コマンドがあるためです (`NX_IOS_INTERVAL` で変えられます)。
[FAQ / Troubleshooting](../../README.md#faq--troubleshooting) と [Cisco IOS-XE (IOL)](../../README.md#cisco-ios-xe-iol) を参照してください。

### ラボでの変化に、画面はどのくらいで追いつきますか?

`xray.sh`・コンテナ・netlab のツールが使う画面 (`xray-graph-nextui.html`) は毎秒新しい状態を確かめ
(静的な `xray-graph.html` は 3 秒ごと)、変わった時だけ描き直すので、変化は数秒のうちに出ます。
ただしプロトコル自体の収束が先です。OSPF の隣接や BGP のセッションが上がる・落ちるには、それぞれの時間がかかります。
[Quick start](../../README.md#quick-start-run-a-lab-in-containerlab) を参照してください。

### ルータが応えなくなったら?

止まったルータは、わけと一緒に灰色で描きます。応えなくなったルータは最後の状態を古いという印付きで残し、
10 秒ほど後にまた問い合わせます。その間もほかの部分は更新され続けます。
[netlab tool](../../README.md#netlab-tool) の節を参照してください。

## 限界

### 読まないベンダー (Arista cEOS・Juniper・Linux のホストなど) はどうなりますか?

ノードはトポロジに灰色で描かれ、DeepDive には network-xray が読むルータではないと出ます。ほかのルータは
いつもどおり読みます。ほかの Cisco IOS-XE の kind (`cisco_c8000v`・`cisco_csr1000v`・`cisco_cat9kv`) もまだ読みません。
[When to use](../../README.md#when-to-use) と [Cisco IOS-XE (IOL)](../../README.md#cisco-ios-xe-iol) を参照してください。

### VRF には対応していますか?

FRR では対応しています。VRF ごとのルーティングテーブルと BGP テーブルを読み、VRF のボタンで 1 つずつ切り替えます
(管理の VRF `mgmt` には、BGP か OSPF が動いていない限りボタンを付けません)。SR Linux では `default` の network-instance だけを読みます。Cisco IOL では
VRF を読みません。VRF のあるラボでは、間違った絵の代わりに警告を出します。
[When to use](../../README.md#when-to-use) と [Cisco IOS-XE (IOL)](../../README.md#cisco-ios-xe-iol) を参照してください。

### IPv6 は読みますか?

FRR では、`router ospf6` のあるルータで OSPFv3 のネイバー・インターフェース・IPv6 のルーティングテーブルを読みます。
IPv6 の BGP テーブルは読みません。[When to use](../../README.md#when-to-use) を参照してください。

### 解析できない出力があったら?

Cisco IOL では、パーサーが分からない行を `parse_warnings` に記録し、画面にその数を出します。推測はしません。
ルータは応えているのに画面が空のままの時は、[経路が出ない](troubleshooting.md#routes-do-not-show) の手順で
ルータを直接確かめられます。

## セキュリティ

### 画面にログインはありますか?

ありません。そのポートに届く人なら誰でもラボの状態を見られます。`xray.sh` と `containerlab graph … -s 0.0.0.0:8080` は
すべてのインターフェースで待ち受けるので、マシンは信頼できるネットワークに置くか、このマシンだけに絞ります: `./xray.sh --bind 127.0.0.1 <lab>`
(`containerlab graph` なら `-s 127.0.0.1:8080`)。
[Security notes](../../README.md#security-notes) を参照してください。

### コンテナに Docker のソケットが要るのはなぜですか?

`docker run` / netlab のコンテナは FRR と SR Linux を `docker exec` で読むので、
`/var/run/docker.sock` を渡します。このソケットを使える人はホストの上で何でも root で動かせるので、ラボ用の
マシンでだけ動かしてください。[Security notes](../../README.md#security-notes) を参照してください。

### 画面を自分のマシンだけに絞るには?

`docker run` では、ポートを `-p 127.0.0.1:8600:8600` で公開します (README のコマンドは既にそうなっています)。`-p 8600:8600`
にすると、ほかのマシンからも開けます。`containerlab graph` では `-s 127.0.0.1:8080` を使います。
[Security notes](../../README.md#security-notes) を参照してください。

### パスワードはどこかに保存されますか?

Cisco IOL では、SSH のパスワードは `NX_IOS_PASSWORD` (既定は `admin`) から取り、askpass のファイルで渡し、
画面にも state にも出しません。SSH のホスト鍵は確かめないので、ラボの管理ネットワークだけで使ってください。
netlab のツールでは、ラボが動いている間 `network-xray.json` にパスワードを含むラボの値が入っており、`netlab down` で
消えます。[Security notes](../../README.md#security-notes) と [netlab tool](../../README.md#netlab-tool) の節を参照してください。

## 試してみる

### 何も入れずに試せますか?

試せます。[録画した Best-Path Decision のデモ](https://rclab-dev.github.io/network-xray/demo/index-bgp-lp.html) は、
実際の FRR のラボをブラウザで再生します。貼り付け用のページ (`frr-paste.html`・`bgp-paste.html`・`srl-paste.html`) は
自分の `show` の出力を描き、すべてブラウザの中で動きます。何もアップロードしません。
[See it](../../README.md#see-it) と [Bring your own network](../../README.md#bring-your-own-network) を参照してください。

### 手元に何も入れずに、本物のラボを変えてみられますか?

GitHub Codespaces で試せます。README のボタンで 3 台の FRR のラボが立ち上がり、2〜3 分ほどでポート 8600 の画面が
開きます。GitHub のログインが要り、自分の Codespaces の枠を使います (終わったら codespace を消してください)。動かせるのは
FRR のようなコンテナのノードだけです。
[ライブ (live) ラボ — GitHub Codespaces](../../README.md#-ライブ-live-ラボ--github-codespaces) を参照してください。

### 保存した出力から、オフラインで使えますか?

使えます。`clab-collect.js --fixtures <dir>` と `frr-collect.js --from-dir <dir>` は、保存した FRR の
`show … json` のファイル (`fixtures/` に例があります) から state を作ります。`scripts/xray-query.js` は保存した state から
質問に答え、ルータには接続しません。
[containerlab graph template](../../README.md#containerlab-graph-template) と
[Query from a script or an AI assistant](../../README.md#query-from-a-script-or-an-ai-assistant) を参照してください。

### 自分のラボで動かすには何が要りますか?

コンテナのイメージ (`docker run … ghcr.io/rclab-dev/network-xray:1 --topo /lab/<lab>.clab.yml`)、netlab のツール、
またはこのリポジトリのクローンと Node.js 18 以降・Docker・containerlab (Linux か WSL2) のどれかです。
[Quick start](../../README.md#quick-start-run-a-lab-in-containerlab) と [netlab tool](../../README.md#netlab-tool) の節を参照してください。

## プロジェクト

### ライセンスは?

MIT です (copyright RouteCrushLab)。NeXt UI の graph (`xray-graph-nextui.html`・`xray.sh`・コンテナ・netlab のツールの既定の画面)
には、EPL-1.0 の NeXt UI Toolkit が同梱されています。明示して選んだ `xray-graph.html` は MIT だけです。[License](../../README.md#license) と
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) を参照してください。

### コードで貢献できますか?

プルリクエストは受け付けていません。メンテナは 1 人で、著作権者も 1 人に保っています。issue は読みますが、
対応の SLA はありません。ライセンスの範囲での fork は歓迎です。[Scope & maintenance](../../README.md#scope--maintenance) を参照してください。

### 絵がおかしい。どう報告すればいいですか?

"Something is wrong or missing in the picture" のテンプレートで issue を開き、ルータの生の出力
(`show … json`) を付けてください。fixture として使えます。読まないルータの OS や版については、"A router OS or
version it does not read" のテンプレートを使います。`network-xray.json` は付けないでください。ラボのパスワードが入っています。
[FAQ / Troubleshooting](../../README.md#faq--troubleshooting) を参照してください。
