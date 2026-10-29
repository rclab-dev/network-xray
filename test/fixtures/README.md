# test/fixtures

Saved router output for the offline self-tests. No router, no containerlab, no network needed.

## Layout

```
test/fixtures/<vendor>-<lab>/
  <node>/<command>.txt      # one file per command, exactly as the router printed it
  state_<node>.json         # the state the collector must build from those files
```

- `<vendor>` is the `name` of the collector's row in `VENDORS` (`clab-xray-collect.js`): `iosxe`, `srlinux`, `frr`.
  A new vendor (for example `eos`) adds its row there and its own `test/fixtures/eos-<lab>/`.
- `<lab>` is the example lab the output came from (`q15` = iBGP next-hop-self).
- `<command>.txt`: the command with spaces as `_` (`show ip ospf neighbor` -> `show_ip_ospf_neighbor.txt`).
- Only output we captured ourselves from our own labs. Do not add output copied from other projects.

## Run

```
node clab-iosxe-collect.js --self-test
```
