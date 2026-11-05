# Copies of the same component

Some files live in more than one place:

- The docker compose bundles under `demo/compose-*/` are the output of `scripts/gen_compose_bundle.js`. It copies the
  engine files from the repo root into `web/` (`xray-core.js`, `xray-api.js`, `clab-xray-bridge.js`, `xray-skin.js`,
  `xray-i18n.js`, `skin.html`, `decision-bracket.html`) and the collector scripts into `collector/` (`clab-collect.js`,
  `clab-xray-collect.js`), and `scripts/compose-server.js` into `server/server.js`. The generated files
  (`Dockerfile`, `vtysh.conf`, …) are the same in both bundles.
- `demo/decision-bracket.html` is the GitHub Pages copy of the root `decision-bracket.html`.

Each copy should be identical to its root file. After changing one of the root files, copy it into the bundles
(or regenerate them with `scripts/gen_compose_bundle.js`) in the same commit.

`node scripts/check-copies.js` exits 1 and prints the paths when a copy differs from its root file.
`node scripts/check-copies.js --list` prints every group (with a short hash of each file) and the intended exceptions.
