[English](../troubleshooting.md)

# Troubleshooting (困ったとき)

`xray.sh` と collector (`clab-xray-collect.js`) が見つける問題と、その時にする事をまとめています。
メッセージはツールが出すそのままの英語で載せています。`<...>` は自分の値に読み替えてください。
「network-xray のログ」は、`xray.sh` (または collector) を動かしている端末のことです。`docker run` / netlab のコンテナでは
`docker logs <コンテナ>` です。
Windows では、先に [Windows (WSL2) で動かす](windows-wsl2.md) を見てください。

<!-- nx-trouble-v1110-20261106 -->
**出ている事から探す:**

- 画面が開かない → [画面が開かない](#the-page-does-not-open)
- ルータが灰色 → [Docker のソケットの権限](#docker-socket-permission)・[ルータがまだ起動中 (Cisco IOL)](#routers-still-booting-cisco-iol)・
  [FRR がきちんと立ち上がらない](#frr-did-not-start-cleanly)・[読まない種類の機器](#device-type-that-is-not-read-drawn-only)・
  [ラボを消した後に古い状態が残る](#old-state-after-the-lab-is-destroyed)
- 表が空・リンクに OSPF / BGP の色が付かない → [経路が出ない](#routes-do-not-show)

**全部の項目:**

- [画面が開かない](#the-page-does-not-open)
- [ポートがもう使われている](#port-already-in-use)
- [トポロジのファイルが見つからない](#topology-not-found)
- [ラボの名前が単純な名前ではない](#lab-name-is-not-a-plain-name)
- [containerlab か Node.js が無い](#containerlab-or-nodejs-missing)
- [Windows で clone すると Filename too long と出る](#filename-too-long-when-cloning-windows)
- [Docker のソケットの権限](#docker-socket-permission)
- [ルータがまだ起動中 (Cisco IOL)](#routers-still-booting-cisco-iol)
- [FRR がきちんと立ち上がらない](#frr-did-not-start-cleanly)
- [読まない種類の機器 (描くだけ)](#device-type-that-is-not-read-drawn-only)
- [経路が出ない](#routes-do-not-show)
- [ラボを消した後に古い状態が残る](#old-state-after-the-lab-is-destroyed)
- [止め方と後片付け](#stopping-and-cleaning-up)

<!-- nx-docs-gaps-20261104 -->
<a id="the-page-does-not-open"></a>
## 画面が開かない

**出ること。** ブラウザが繋がらない (接続を拒否された・時間切れ)、またはどのアドレスを開けばよいか分からない。

**開くアドレス。**

- `xray.sh`: 画面の準備ができた時に出すアドレス `==> open  http://<this machine>:8080/` (またはポートを渡した時はそのポート)。
  `--bind` を渡さなければ、すべてのアドレスで待ち受けます。
- `docker run` (README の最初の行): それを動かしているマシンで `http://localhost:8600/`。この行はポートを `127.0.0.1` だけに
  公開するので、別のマシンからは開けません。`-p 8600:8600` にするか、SSH のトンネル
  (`ssh -L 8600:localhost:8600 <ラボのホスト>` の後、自分のマシンで `http://localhost:8600/`) を使います。
- netlab のツール: `netlab up` が出すアドレス `Open http://<host>:8600/` (`multilab` のプラグインでは 8600 + N)。
- 自分で動かした `containerlab graph` (README の「Labs started another way」): `-s` で渡したアドレス。README の例
  `-s 127.0.0.1:8080` なら、そのマシンだけで `http://localhost:8080/` で開きます。

**わけ。** `xray.sh` はラボを作り終えてから画面を始めます (その時に `==> open` の行を出します)。コンテナはラボを最大 2 分
待ってから画面を始めます。それまではポートに何も応えません。
2 分たってもラボが無い時は、コンテナは `no running containers named clab-<lab>-* yet - waiting for the lab` と出して、
そのまま画面を始めます。ラボが上がるまでルータは灰色です。

**する事。** network-xray のログを見ます: `==> open` の行を待つか、その上のエラーを読みます。多くはこのページにあります
(例えば [ポートがもう使われている](#port-already-in-use))。ラボのマシンでは開くのに別のマシンから開かない時は、上の
`127.0.0.1` と、ラボのマシンのファイアウォールでそのポートが通るかを確かめます。

<a id="port-already-in-use"></a>
## ポートがもう使われている

**出る文**

```
port 8080 is already in use (another graph is running there?).
  add a port:  ./xray.sh <lab.clab.yml> 8081   - or stop the other one.
```

**わけ。** `xray.sh` は deploy の前に、graph のポート (既定は 8080) が空いているかを確かめます。使われていると
`containerlab graph` が起動してすぐ止まってしまうので、`xray.sh` は先に止まり、何も deploy しません。

**する事。** 表示されたコマンド (次のポート) を打つか、そのポートを使っている物を止めます。
ポートは 1 から 65535 の数字です。それ以外を渡すと
`port must be a number from 1 to 65535: <value>` と出ます。

<a id="topology-not-found"></a>
## トポロジのファイルが見つからない

**出る文**

```
topology not found: <path>
```

collector を単独で動かした時:

```
!! topology file not found: <path>
   expected a containerlab topology file, e.g.  node clab-xray-collect.js lab.clab.yml <out-dir>
```

ファイルではなくフォルダを渡した時: `!! '<path>' is a directory. Pass a containerlab topology file (.clab.yml), not the lab directory.`

**わけ。** 最初の引数は、実際にある `.clab.yml` ファイルでなければなりません。相対パスは、リポジトリのフォルダではなく、
今いるフォルダから読まれます。

**する事。** パスを確かめます。例: リポジトリのフォルダで `./xray.sh examples/q21-bgp-lp/q21.clab.yml`。

<a id="lab-name-is-not-a-plain-name"></a>
## ラボの名前が単純な名前ではない

**出る文**

```
the lab name in <lab.clab.yml> is not a plain name (letters, digits, _ . -)
```

collector からは: `!! the lab name "<name>" is not a plain name (letters, digits, _ . -): not collecting`。
ファイルに `name:` の行が無い時は: `could not read 'name:' from <lab.clab.yml>`。

**わけ。** ラボの名前はコンテナの名前と Docker のフィルタに入るので、単純な名前だけを受け付けます。
英字か数字で始まり、英字・数字・`_`・`.`・`-` だけでできている必要があります。

**する事。** トポロジのファイルの先頭の `name:` の行を直します。例: `name: my-lab`。
そのラボを古い名前で deploy 済みなら、先に消してください ([止め方と後片付け](#stopping-and-cleaning-up) を参照)。

<a id="containerlab-or-nodejs-missing"></a>
## containerlab か Node.js が無い

**出る文**

```
containerlab not found - https://containerlab.dev/install/
```

```
node.js not found (needed to collect router state)
```

**わけ。** `xray.sh` は何かをする前に、この 2 つのコマンドが `PATH` にあるかを確かめます。

**する事。** containerlab を <https://containerlab.dev/install/> から入れ、Node.js 18 以降を入れます。
入れたのに見つからない時は、同じシェルで `command -v containerlab` と `command -v node` を確かめます。

<a id="filename-too-long-when-cloning-windows"></a>
## Windows で clone すると Filename too long と出る

**見える物**

```
error: unable to create file test/fixtures/...: Filename too long
```

**わけ。** 試験の資料のパスに長い物があり (110 字ほどまで)、Windows は長いパスを許す設定にしないとパス全体を 260 字までに限ります。

**する事。** Windows では、WSL2 の中で Linux の `git` で clone するのが勧める形です ([Windows (WSL2) で動かす](windows-wsl2.md))。
Git for Windows で clone するなら、`git config --global core.longpaths true` を打ってから clone し直すか、短いフォルダ
(例 `C:\src`) に clone します。

<a id="docker-socket-permission"></a>
## Docker のソケットの権限

<!-- nx-docker-check-docs-w2-20261105 -->
**出る文。** `xray.sh` は何かをデプロイする前に Docker を確かめ、止まります:

```
cannot reach Docker: permission denied on /var/run/docker.sock - stopped, nothing was deployed.
  add your user to the docker group: sudo usermod -aG docker "$USER", then log in again (that group is root-equivalent: lab machines only).
```

(ソケットがそもそも無い時は `cannot reach Docker: no Docker socket at <path>` と出ます。Docker を起動します。)
コンテナ (`docker run`) も同じように `cannot talk to Docker: permission denied on <socket> - ...` で止まります。
root で動かす (`--user` を付けない) か、出てくる `--group-add` を付けます。

collector を自分で動かす時は、代わりに Docker 自身のエラーが出ます
(`permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock ...`)。
その後 collector はルータごとに `  r1 COLLECT FAILED: ...` のような行を出し、画面ではルータが灰色になり
`Could not be read (see the network-xray log).` と出ます。
Cisco IOL のノードでは代わりに `  r1 not ready yet (IOL is booting, SSH not up yet) - retrying` が出続けます。
collector には、この場合とルータがまだ起動中の場合を見分けられないためです。

**わけ。** `xray.sh` は `containerlab deploy` を `sudo` で動かしますが、`docker ps` / `docker exec` (と
collector) は自分のユーザで動かします。自分のユーザが Docker のソケットを使える必要があります。

**する事。** 自分のユーザを `docker` グループに入れ、ログインし直します:

```
sudo usermod -aG docker "$USER"
```

`docker` グループに入ることは、このマシンの root になるのとほぼ同じです (Docker のソケットを使える物は
特権コンテナを起動できます)。そのユーザに元々 `sudo` を許しているマシンでだけ行ってください。
`docker ps` で確かめます (`sudo` なしで動く必要があります)。ユーザが `clab_admins` グループにも入っていれば、
containerlab の `sudo` も省けます: `SUDO= ./xray.sh ...`。

<a id="routers-still-booting-cisco-iol"></a>
## ルータがまだ起動中 (Cisco IOL)

**出る文**

```
  r1 not ready yet (IOL is booting, SSH not up yet) - retrying
```

読めるようになるまで、画面ではルータが灰色です。

**わけ。** Cisco IOL のノードは SSH で読みます。IOL の起動には 1 分ほどかかり、SSH が応えるまでは
読む物がありません。collector は読み直しを続け、ルータが応えると `  r1 collect OK again (after N failure(s))` と
出します。IOL のノードは 10 秒ごとに読む (`NX_IOS_INTERVAL=<seconds>` で変えられます) ので、
FRR より少しゆっくり画面が追いつきます。

**する事。** 待ちます。いつまでも上がらない時は、`docker ps -a` でコンテナを、
`ssh admin@clab-<lab>-<node>` (パスワード `admin`) でログインを確かめます。待っても**消えない**メッセージが 2 つあります:

- `!! ssh not found on this machine: install an OpenSSH client (IOS nodes are read over SSH)`: SSH クライアントを入れます。
- `!! SSH login to <host> was denied: set NX_IOS_USER / NX_IOS_PASSWORD (default admin / admin)`: この 2 つの
  変数に、自分のルータのログインを設定します。

<a id="frr-did-not-start-cleanly"></a>
## FRR がきちんと立ち上がらない

**出る文**

```
==> <container>: FRR did not start cleanly, restarting FRR (1/3) ...
```

**わけ。** FRR のルータも起動の後に少し時間がかかることがあります。`xray.sh` はそれを待ち、FRR がきちんと立ち上がらなかった時は
FRR を立て直します。FRR が動くまでは、そのルータは読めません。

**する事。** 待ちます。それでも駄目な時は `xray.sh` が
`==> <container>: FRR is still not running. Try: docker exec <container> /usr/lib/frr/watchfrr.sh restart all` と出すので、そのコマンドを動かします。

<a id="device-type-that-is-not-read-drawn-only"></a>
## 読まない種類の機器 (描くだけ)

**出る文**

```
  h1 cannot be read: not a router network-xray reads (no vtysh / sr_cli) - drawn only
```

画面でそのノードをクリックすると `network-xray does not read inside this device (it reads FRR, SR Linux and Cisco IOS-XE). It is drawn in the topology only.` と出ます。

**わけ。** collector は、ノードの containerlab の `kind` で読み方を選びます: `nokia_srlinux` (SR Linux)、
`cisco_iol` (Cisco IOL)、それ以外はすべて FRR。`vtysh` の無いノード (例えば Alpine のホストや
他のベンダーのイメージ) は読めないので、トポロジには描きますが DeepDive (ルータをクリックすると開く、ルータの中を見る欄) はありません。

**する事。** そのノードがホストなら、何もしなくて大丈夫です。想定どおりの動きで、ほかのルータには影響しません。

<a id="routes-do-not-show"></a>
## 経路が出ない

**出ること。** ルータは読めている (灰色ではない) のに、DeepDive の経路表や BGP の表が空、またはリンクに OSPF / BGP の色が付かない。

OSPF / BGP の色は、ルータの DeepDive のトンネルに付きます。OSPF: ネイバーが立ち上がる途中は橙 (Init = 点線・2-Way = 実線)、
ExStart から先は緑 (ExStart / Exchange / Loading = 点線・Full = 実線)。BGP: Established なら紫・そうでない時は薄い紫。
全体図の線には OSPF / BGP の色は付きません (緑 / 赤になるのは netlab の
`validate:` の試験の時だけ)。

**わけ。** network-xray はルータが報告する物だけを出します。多くは OSPF / BGP がまだ上がっていない (ラボを始めてから 30〜60 秒
かかる) か、ルータに本当にその経路が無い時です。例題のラボでは、それが見つける障害そのものであることがよくあります。

**する事。**

1. 30〜60 秒待ちます。
2. ルータに直接聞きます (FRR):

   ```
   docker exec clab-<lab>-r1 vtysh -c 'show ip route'
   docker exec clab-<lab>-r1 vtysh -c 'show ip bgp summary json'
   docker exec clab-<lab>-r1 vtysh -c 'show ip ospf neighbor json'
   ```

   SR Linux (collector が読むのと同じ物):

   ```
   docker exec clab-<lab>-<node> sr_cli 'info from state network-instance default route-table ipv4-unicast'
   docker exec clab-<lab>-<node> sr_cli 'info from state network-instance default protocols bgp neighbor *'
   docker exec clab-<lab>-<node> sr_cli 'info from state network-instance default protocols ospf instance default area *'
   ```

   Cisco IOL: `ssh admin@clab-<lab>-<node>` (パスワード `admin`) でログインして `show ip route`・`show ip bgp summary`・
   `show ip ospf neighbor`。

   ルータ自身にも経路やネイバーが無ければ、原因はラボの方です。設定を見ます
   (`docker exec -it clab-<lab>-r1 vtysh -c 'show running-config'`)。
3. 読まない物があります: FRR の IPv6 の BGP の表 ([FAQ](faq.md#ipv6-は読みますか)) と、Cisco IOL の VRF
   ([FAQ](faq.md#vrf-には対応していますか))。SR Linux は `default` の network-instance だけを読みます。FRR では、VRF のボタンで
   1 度に 1 つの VRF を見ます。
4. ルータは答えるのに画面が空のままなら、network-xray のログを見て (コンテナでは
   `docker logs <network-xray のコンテナ> 2>&1 | tail -30`: 読むコンテナ `clab-<lab>-*` の名前が出る)、両方を付けて issue を開いてください。

<a id="old-state-after-the-lab-is-destroyed"></a>
## ラボを消した後に古い状態が残る

**出る文。** ルータが灰色になり、collector が次のように出します:

```
  r1 cannot be read: the container is not running (check: docker ps -a)
```

画面には `The container is not running: nothing to read.` と出ます。しばらく応えなくなったルータでは
`  r1 cannot be read: no answer - showing its last good state as stale` と出て、画面では古い状態に
最後に読めた時刻の印が付きます。

**わけ。** collector は毎秒ラボを読み (`--interval` で変えられる・Cisco IOL はもっと間を空ける)、状態が変わった時だけリポジトリのフォルダの `xray-states.js` を書き直します。
collector が動いている間にラボを消した (またはコンテナが止まった) 時は、読む物がもう残っていません。
`xray-states.js` は止めても消えないので、次に動かして書き直されるまで、最後に動かしたラボの状態が残ります。

**する事。**

- 止めるつもりだった時: collector も止めます (`xray.sh` の端末で `Ctrl-C`)。その端末がもう無い時は、
  `pgrep -af clab-xray-collect.js` でこのラボの collector を探し、`kill <its pid>` で止めます (`pkill -f` は使わないでください。ほかのラボの collector も止まります)。
- 止めるつもりが無かった時: `docker ps -a` で止まっているコンテナが分かります。`./xray.sh <lab.clab.yml>` でラボをもう一度 deploy します。
- 古い絵を消したい時は、リポジトリのフォルダの `xray-states.js` を消します (git では管理しておらず、
  次に動かした時にまた書かれます)。
- `xray.sh` が `another xray.sh (pid <pid>) is already running from <folder> - stop it first.` と出して起動しない時は、
  先にそちらを止めます。もう動いていない回が残したロックは、`xray.sh` が自分で消します。

<a id="stopping-and-cleaning-up"></a>
## 止め方と後片付け

**出る文。** `Ctrl-C` の後:

```
stopped. remove the lab with:  sudo containerlab destroy -t <lab.clab.yml> --cleanup
```

**わけ。** `Ctrl-C` は graph と collector を止め、`xray.sh` が作った `problem.json` のリンクを消し、
ロックを消します。ラボは消し**ません**: ルータのコンテナは動いたままです。

**する事。** 表示されたコマンドを打ちます:

```
sudo containerlab destroy -t <lab.clab.yml> --cleanup
```

`--cleanup` はラボの作業フォルダ (トポロジのファイルの隣の `clab-<lab>/`) も消します。
まだ動いているラボは `sudo containerlab inspect --all` で分かります。
