'use strict';
/* docker/netlab-defaults.yml: the netlab tool definition loaded with defaults.sources.extra.
   netlab merges such a file into topology.defaults, so its top-level keys are relative to `defaults`.
   Parsed with a small reader for the YAML subset the file uses (block maps, block lists, plain and folded
   multi-line scalars, comments; a literal | block is refused, not guessed), so no YAML package is needed. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'docker', 'netlab-defaults.yml');
const RAW = fs.readFileSync(FILE, 'utf8');

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { if (i === 0 || /\s/.test(s[i - 1])) q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}
function parseYaml(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    if (/^\s*(#|$)/.test(raw)) continue;
    const indent = raw.match(/^ */)[0].length;
    lines.push({ indent, text: raw.slice(indent), raw });
  }
  let i = 0;
  const KEY = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/;
  function scalar(v) {
    v = stripComment(v).trim();
    if (/^".*"$|^'.*'$/.test(v)) return v.slice(1, -1);
    if (/^-?\d+$/.test(v)) return Number(v);
    if (v === 'true' || v === 'false') return v === 'true';
    return v === '' || v === '~' || v === 'null' ? null : v;
  }
  function multiline(minIndent, folded) {
    const parts = [];
    while (i < lines.length && lines[i].indent >= minIndent) { parts.push(folded ? lines[i].raw.slice(minIndent).trimEnd() : lines[i].text.trim()); i++; }
    return parts.join(' ');
  }
  function block(indent) {
    const first = lines[i];
    if (first.text.startsWith('- ') || first.text === '-') {
      const arr = [];
      while (i < lines.length && lines[i].indent === indent && /^-( |$)/.test(lines[i].text)) {
        const v = lines[i].text.slice(1).trim(); i++;
        if (v === '' && i < lines.length && lines[i].indent > indent) arr.push(block(lines[i].indent));
        else arr.push(scalar(v));
      }
      return arr;
    }
    if (!KEY.test(stripComment(first.text).trim())) return multiline(indent, false);
    const obj = {};
    while (i < lines.length && lines[i].indent === indent) {
      const m = KEY.exec(stripComment(lines[i].text).trim());
      if (!m) throw new Error('cannot read line: ' + lines[i].raw);
      i++;
      const v = (m[2] || '').trim();
      if (Object.prototype.hasOwnProperty.call(obj, m[1])) throw new Error('duplicate key ' + m[1]);
      if (v === '|' || v === '|-') throw new Error('literal (|) scalars are not read by this test reader (it would join the lines): ' + lines[i - 1].raw);
      if (v === '>-' || v === '>') {
        obj[m[1]] = i < lines.length && lines[i].indent > indent ? multiline(lines[i].indent, true) : '';
      } else if (v === '') {
        const next = lines[i];
        /* a block list may sit at the same indentation as its key */
        obj[m[1]] = next && (next.indent > indent || (next.indent === indent && /^-( |$)/.test(next.text))) ? block(next.indent) : null;
      } else obj[m[1]] = scalar(v);
    }
    if (i < lines.length && lines[i].indent > indent) throw new Error('unexpected indentation: ' + lines[i].raw);
    return obj;
  }
  return block(0);
}

const Y = parseYaml(RAW);
const tool = (Y.tools || {}).network_xray;
const asList = (v) => (Array.isArray(v) ? v : [v]);
const PORT = '{ 8600 + defaults.multilab.id if defaults.multilab.id else 8600 }';

test('netlab-defaults.yml: plain YAML (LF, no tabs) with the expected top-level keys', () => {
  assert.ok(!RAW.includes('\r'), 'CRLF line endings');
  assert.ok(!/^\t| \t/m.test(RAW), 'tab in indentation');
  assert.deepStrictEqual(Object.keys(Y).sort(), ['netlab', 'providers', 'tools']);
  assert.ok(!('defaults' in Y), 'keys are already relative to defaults: no top-level "defaults:"');
});

test('the netlab config asks create / up to write network-xray.json (json output, without the defaults)', () => {
  const j = Y.netlab.create.output.json;
  assert.strictEqual(j.output, 'network-xray.json');
  assert.ok(String(j.options).split(':').includes('nodefault'));
  const entry = fs.readFileSync(path.join(ROOT, 'docker', 'entrypoint.sh'), 'utf8');
  assert.match(entry, /--validate "\$\(dirname "\$TOPO"\)\/network-xray\.json"/, 'the container reads the same file name');
});

test('clab provider allows the clab.labels node attribute', () => {
  assert.strictEqual(Y.providers.clab.attributes.node._keys.labels, 'dict');
});

test('tools.network_xray: docker runtime, up / message / down', () => {
  assert.ok(tool, 'tools.network_xray');
  assert.strictEqual(tool.runtime, 'docker');
  const d = tool.docker;
  assert.ok(d && d.up && d.down && d.message, 'docker.up, docker.down and docker.message');
  const up = asList(d.up).join('\n');
  assert.match(up, /^docker run -d --rm\b/);
  /* netlab up runs `docker inspect {name}_{tool}` to check the tool container */
  assert.ok(up.includes('--name "{name}_network_xray"'), 'container name {name}_network_xray');
  assert.ok(up.includes('-v /var/run/docker.sock:/var/run/docker.sock'), 'docker socket mount');
  assert.ok(up.includes('-v "$(pwd)":/lab:ro'), 'lab directory mounted read-only at /lab');
  assert.ok(up.includes('-p ' + PORT + ':8600'), 'port 8600 (+ multilab id)');
  assert.match(up, / ghcr\.io\/rclab-dev\/network-xray(:[0-9][\w.-]*|@sha256:[0-9a-f]{64}) /, 'image');
  assert.match(up, /--topo \/lab\/clab\.yml$/, 'netlab clab provider writes clab.yml');
  assert.ok(d.message.includes('http://{sys.ipurl}:' + PORT + '/'), 'message points at the same port');
  const down = asList(d.down);
  assert.ok(down.includes('rm -f network-xray.json'));
  assert.ok(down.includes("docker kill '{name}_network_xray'"));
});

test('tool commands have balanced { } (netlab format strings)', () => {
  for (const s of [...asList(tool.docker.up), tool.docker.message, ...asList(tool.docker.down)]) {
    let depth = 0;
    for (const c of String(s)) { if (c === '{') depth++; else if (c === '}' && --depth < 0) break; }
    assert.strictEqual(depth, 0, 'unbalanced braces in: ' + s);
  }
});
