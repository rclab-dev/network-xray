#!/usr/bin/env node
// xray-render.js — one router's 2D picture and tables as ONE static HTML page: no script, no network, no browser needed to
// make it (open it in any browser, attach it to a ticket, put it in a wiki). The page is the single-node panel
// (xray-node-panel.js) drawn with a skin (xray-skin.js), so it looks and reads the same as the page you use.
//
//   node scripts/xray-render.js <state.json|dir> <router> [--skin <id>] [--figure cylinder|box] [--prefix <p>]
//                               [--detail full|summary] [--before <state.json|dir>] [--out <file.html>]
//
//   --skin      a preset skin: signature (default), containerlab, flat-docs, accessible, slate-light (light ground)
//   --figure    the router's picture: cylinder (default) or box
//   --prefix    the route the arrow and the one line show (default: the one the state resolved)
//   --detail    full (default) = picture + tables; summary = picture, the one line and What's wrong only
//   --before    a state kept before a change: the page shows what changed on this router, then before | after
//   --out       write the page to a file (default: standard output)
// Exit 0 written, 2 a usage / input error.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const panel = require('../xray-node-panel.js');
const query = require('./xray-query.js');

const ROOT = path.join(__dirname, '..');
const USAGE = 'usage: xray-render.js <state.json|dir> <router> [--skin <id>] [--figure cylinder|box] [--prefix <p>] [--detail full|summary] [--before <state.json|dir>] [--out <file.html>]';

class RenderError extends Error {}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// the skin's CSS for the panel, made by xray-skin.js itself (the same rule a page gets)
function skinCss(id, figure) {
  const styles = {};
  const el = () => ({ style: { setProperty() {} }, appendChild(n) { if (n.id) styles[n.id] = n; } });
  const document = { readyState: 'complete', head: el(), documentElement: el(), getElementById: (k) => styles[k] || null,
    createElement: () => ({ id: '', textContent: '' }), addEventListener() {} };
  const win = { document, JSON, localStorage: { getItem: () => null, setItem() {} } };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'xray-skin.js'), 'utf8'), win, { filename: 'xray-skin.js' });
  const S = win.XraySkin;
  const skin = S.presetById(id || 'signature');
  if (!skin) throw new RenderError('unknown skin: ' + id + ' (known: ' + S.PRESETS.map((p) => p.id).join(', ') + ')');
  if (figure) skin.panelFigure = figure;
  const s = S.apply(skin);
  return { css: (styles['xnp-skin-vars'] || {}).textContent || '', skin: s };
}

// the one line under the title: the BGP answer when the route is BGP, else where the route goes
function oneLine(states, node, prefix) {
  const st = states[node] || {};
  const row = (st.routing_table || []).filter((r) => r.prefix === prefix)[0];
  if (row && row.protocol === 'bgp') {
    try { const w = query.whyPath(states, node, prefix); if (w && w.summary) return w.summary; } catch (e) { /* not in the BGP table: say the route */ }
  }
  if (!row) return prefix ? node + ' ' + prefix + ': not in the routing table' : '';
  return node + ' ' + row.prefix + ' → ' + (row.out_iface || '?') + (row.next_hop ? ' via ' + row.next_hop : '') + (row.protocol ? ' (' + row.protocol + ')' : '');
}

function changesHtml(before, after, node) {
  const d = query.diff(before, after, node);
  if (d.none) return '<p class="nx-none">No change on ' + esc(node) + '.</p>';
  return '<table class="nx-changes"><thead><tr><th>What</th><th>Item</th><th>Before</th><th>Now</th></tr></thead><tbody>' +
    d.changes.map((c) => '<tr><td>' + esc(String(c.kind).replace(/_/g, ' ')) + '</td><td>' + esc(c.item) + '</td><td>' +
      esc(c.before == null ? '-' : c.before) + '</td><td>' + esc(c.after == null ? '-' : c.after) + '</td></tr>').join('') + '</tbody></table>';
}

// states (object), node, opts -> the page
function renderPage(states, node, opts) {
  opts = opts || {};
  const st = states[node];
  if (!st) throw new RenderError('unknown router: ' + node + ' (known: ' + Object.keys(states).sort().join(', ') + ')');
  if (opts.figure && opts.figure !== 'cylinder' && opts.figure !== 'box') throw new RenderError('--figure must be cylinder or box');
  if (opts.detail && opts.detail !== 'full' && opts.detail !== 'summary') throw new RenderError('--detail must be full or summary');
  const sk = skinCss(opts.skin, opts.figure);
  const light = sk.skin.surface === 'light';
  const prefix = opts.prefix || (st.route_resolution && st.route_resolution.matched_prefix) || '';
  const p = { figure: true, figureStyle: sk.skin.panelFigure, prefix: prefix || undefined, tables: opts.detail !== 'summary' };
  const line = oneLine(states, node, prefix);
  let body = '<h1>' + esc(node) + '</h1>' + (line ? '<p class="nx-line">' + esc(line) + '</p>' : '');
  if (opts.before) {
    const b = opts.before[node];
    body += '<h2>What changed on ' + esc(node) + '</h2>' + changesHtml(opts.before, states, node) +
      '<div class="nx-cols"><div><h2>Before</h2>' + (b ? panel.toHtml(b, p) : '<p class="nx-none">' + esc(node) + ' is not in the earlier state.</p>') +
      '</div><div><h2>Now</h2>' + panel.toHtml(st, p) + '</div></div>';
  } else body += panel.toHtml(st, p);
  const page = light ? { bg: '#eef1f5', fg: '#1e2430', dim: '#4f5f7a', line: '#d3d9e2' } : { bg: '#0a1016', fg: '#cfe8ee', dim: '#7f97a6', line: '#1f3a2a' };
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(node) + ' — network-xray</title>\n<style>\n' + panel.cssText() + '\n' + sk.css + '\n' +
    'html,body{margin:0;background:' + page.bg + ';color:' + page.fg + ';font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}' +
    '.nx-page{max-width:980px;margin:0 auto;padding:16px}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:14px 0 6px}' +
    '.nx-line{margin:0 0 12px;font-family:"Cascadia Code",Consolas,Menlo,monospace;font-size:13px}.nx-none{color:' + page.dim + '}' +
    '.nx-cols{display:flex;flex-wrap:wrap;gap:16px}.nx-cols>div{flex:1 1 420px;min-width:0}' +
    '.nx-changes{border-collapse:collapse;font:12px/1.5 "Cascadia Code",Consolas,Menlo,monospace}.nx-changes th,.nx-changes td{text-align:left;padding:2px 12px 2px 0;border-bottom:1px solid ' + page.line + '}' +
    '.nx-foot{margin-top:16px;color:' + page.dim + ';font-size:12px}\n</style></head>\n' +
    '<body><div class="nx-page">' + body + '<p class="nx-foot">network-xray · skin ' + esc(sk.skin.id) + ' · read-only picture of the collected state</p></div></body></html>\n';
}

const OPTIONS = ['--skin', '--figure', '--prefix', '--detail', '--before', '--out'];   // each takes a value: --name value
function parseArgs(argv) {
  const o = { args: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (OPTIONS.indexOf(a) >= 0) { const v = argv[++i]; if (v == null || v === '') throw new RenderError(a + ' needs a value'); o[a.slice(2)] = v; }
    else if (/^--/.test(a)) throw new RenderError('unknown option: ' + a + '\n' + USAGE);
    else o.args.push(a);
  }
  if (o.args.length !== 2) throw new RenderError(USAGE);
  return o;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.indexOf('-h') >= 0 || argv.indexOf('--help') >= 0) { console.log(USAGE); process.exit(0); }
  try {
    const o = parseArgs(argv);
    const html = renderPage(query.loadStates(o.args[0]), o.args[1],
      { skin: o.skin, figure: o.figure, prefix: o.prefix, detail: o.detail, before: o.before ? query.loadStates(o.before) : null });
    if (o.out) fs.writeFileSync(o.out, html); else process.stdout.write(html);
  } catch (e) {
    if (e instanceof RenderError || (e && e.constructor && e.constructor.name === 'QueryError') || (e && e.code === 'ENOENT')) { console.error('xray-render: ' + e.message); process.exit(2); }
    throw e;
  }
}

module.exports = { renderPage, skinCss, parseArgs, RenderError };
