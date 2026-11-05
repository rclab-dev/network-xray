[English](../windows-wsl2.md)

# Windows (WSL2) で動かす

network-xray は Linux で動きます。Windows では **WSL2** の Linux ディストリビューションの中で動かします。下のコマンドは
すべて Linux のシェル (例: Ubuntu) で打ちます。PowerShell や `cmd` ではありません。画面は Windows のブラウザで開きます。

**(未確認)** の印の所は、コードとほかの文書から書いた物で、Windows のマシンでは試していません。

## 要る物 (WSL2 の中)

Linux と同じです ([Quick start](../../README.md#quick-start-run-a-lab-in-containerlab)):

1. **WSL2 と Linux のディストリビューション** (例: Ubuntu)。PowerShell で `wsl --install` の後、ディストリビューションを開きます。
   `wsl -l -v` で、バージョン 1 ではなく **2** で動いているかを確かめます。**(未確認)**
2. **Docker**。次のどちらか:
   - ディストリビューションの中に入れた Docker Engine
   - Windows の Docker Desktop を WSL2 のバックエンドで使い、自分のディストリビューションで **WSL integration** を有効にする
     (Settings → Resources → WSL integration)。**(未確認)**

   `docker ps` が Linux のシェルで `sudo` なしで動く必要があります ([Docker のソケット](#docker-のソケットの権限) を参照)。
3. ディストリビューションの中の **containerlab**: <https://containerlab.dev/install/>。
   無いと `xray.sh` は `containerlab not found - https://containerlab.dev/install/` で止まります。
4. ディストリビューションの中の **Node.js 18 以降** (`node --version`)。Windows に入れた Node.js は使いません。
   `node` が Linux の `PATH` に無いと、`xray.sh` は `node.js not found (needed to collect router state)` で止まります。
5. ラボそのものが動くだけのメモリを WSL2 の VM に: FRR の例題のラボは小さく、Cisco IOL のノードはもっと要ります
   (Codespaces の設定は 8 GB のマシンを求めます)。WSL2 では測っていません。

## Linux のファイルシステムに clone する

```bash
cd ~
git clone https://github.com/rclab-dev/network-xray.git
cd network-xray
```

Linux の `git` で、`/mnt/c/...` ではなく Linux のホーム (`~`) に clone します。`xray.sh` は bash のスクリプトで、改行が LF で
実行の許可が要ります。Git for Windows で clone すると CRLF になることがあり
(`/usr/bin/env: 'bash\r': No such file or directory`)、Windows のドライブでは実行の許可や、`xray.sh` が作る
`problem.json` のリンクが残らないことがあります。**(未確認)**

## 動かす

**やり方 A: `xray.sh`** (例題のラボを作り、読み、ポート 8080 で画面を出す):

```bash
./xray.sh examples/q21-bgp-lp/q21.clab.yml
```

`==> open  http://<this machine>:8080/` が出るのを待ちます。`xray.sh` は containerlab を `sudo` で動かします。rootless の時は
`SUDO= ./xray.sh ...` (`xray.sh` の頭を参照)。

**やり方 B: コンテナ** (もう動いているラボ用・ポート 8600 で画面を出す):

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(pwd)":/lab:ro -p 127.0.0.1:8600:8600 ghcr.io/rclab-dev/network-xray:1 --topo /lab/<lab>.clab.yml
```

トポロジのファイルのあるフォルダで動かします。コンテナには Docker のソケット (ホストの root と同じ) を渡すので、
ラボのマシンだけで使ってください。[Security notes](../../README.md#security-notes) を参照。

## Windows から画面を開く

Windows のブラウザで **http://localhost:8080/** (やり方 A) か **http://localhost:8600/** (やり方 B) を開きます。
WSL2 は既定で Linux 側の `localhost` のポートを Windows に転送します (`localhostForwarding`。
`%UserProfile%\.wslconfig` で切っていなければ有効)。**(未確認)**

- やり方 A では、`xray.sh` は既定ですべてのアドレス (`0.0.0.0`) で待ち受けるので、Windows がポートを転送すると、
  ネットワークのほかのマシンからも届くことがあります。このマシンだけにするには: `./xray.sh --bind 127.0.0.1 <lab.clab.yml>`。
  WSL2 の中の `--bind 127.0.0.1` が Windows のブラウザから届くかは、WSL のネットワークのモードによります。**(未確認)**
- やり方 B では、Docker Desktop は `-p 127.0.0.1:8600:8600` を Windows の `localhost` に出します。ディストリビューションの中の
  Docker Engine では、上の WSL2 の `localhost` の転送を通ります。**(未確認)**

## よくある問題

### ポートがもう使われている

`port 8080 is already in use (another graph is running there?).` Windows 側で使われているポート (ほかのプログラムや、
2 つ目の WSL のディストリビューション) でも止まることがあります。**(未確認)** 別のポートを使います:
`./xray.sh <lab.clab.yml> 8081` の後、`http://localhost:8081/` を開きます。[ポートがもう使われている](troubleshooting.md#port-already-in-use) を参照。

### Docker のソケットの権限

`xray.sh` は何かをデプロイする前に Docker を確かめ、
`cannot reach Docker: permission denied on /var/run/docker.sock - stopped, nothing was deployed.` で止まります。
`xray.sh` と collector は `docker` を自分のユーザで動かします。ディストリビューションの中の Docker Engine なら、自分のユーザを
`docker` グループに入れ、新しいシェルを開きます (または PowerShell で `wsl --shutdown` の後、ディストリビューションを開き直す):

```bash
sudo usermod -aG docker "$USER"
```

Docker Desktop なら、代わりにそのディストリビューションの WSL integration を有効にします。**(未確認)**
[Docker のソケットの権限](troubleshooting.md#docker-socket-permission) を参照。

### コンテナのノードには入れ子の仮想化は要らない

network-xray が読むルータはコンテナです: FRR (`frrouting/frr`)、Nokia SR Linux (`nokia_srlinux`)、Cisco IOL (`cisco_iol`)。
WSL2 の中で普通のコンテナとして動き、入れ子の仮想化 / KVM は要りません。KVM が要るのは VM の containerlab の kind
(例: `cisco_c8000v`、`cisco_csr1000v`) だけで、network-xray はそれらを読みません (描くだけ)。Cisco IOL に KVM が要らないことは、
containerlab の `cisco_iol` の kind の説明によります。**(ここでは未確認)**

### Cisco IOL のノードが "not ready yet" のまま

IOL のノードは SSH で読みます。collector は containerlab のラベルで各ノードのコンテナを見つけ、`docker inspect` が返す
管理の IP に繋ぐので、Linux 側からラボの管理のネットワークに届く必要があります。ディストリビューションの中の Docker Engine なら
Linux と同じです。Docker Desktop ではコンテナが Docker Desktop の VM の中で動くので、ディストリビューションから管理の
ネットワークに届かないことがあります。**(未確認)**
FRR と SR Linux は `docker exec` で読むので、影響を受けません。
