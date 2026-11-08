// demo-offline.test.js — the recorded demos under demo/ must not need the network. This reads every page under
// demo/, the local CSS it loads (url() / @import, followed) and the local scripts it loads, and checks the references
// written in them: none may be a remote URL or a missing local file. Hyperlinks the user clicks (<a>/<area> href) are
// allowed. It does not run the pages: a URL a script builds at run time (e.g. from a variable) is not seen.
// nx-offline-20261105
// Run: node --test        (from the repo root; Node >= 18, no dependencies)
'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DEMO = path.join(ROOT, 'demo');

function walk(dir, ext) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, ext));
    else if (path.extname(e.name) === ext) out.push(p);
  });
  return out.sort();
}

// Attributes that make the browser fetch something, per tag ('*' = any tag).
var LOAD_ATTRS = {
  script: ['src'], link: ['href'], img: ['src', 'srcset'], iframe: ['src'], frame: ['src'],
  source: ['src', 'srcset'], video: ['src', 'poster'], audio: ['src'], track: ['src'],
  embed: ['src'], object: ['data'], input: ['src'], image: ['href', 'xlink:href'],
  use: ['href', 'xlink:href'], base: ['href'], '*': ['background']
};
// Hyperlinks: only followed when the user clicks them.
var LINK_TAGS = { a: 1, area: 1 };

function attrs(tagText) {
  var re = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, m, out = {};
  while ((m = re.exec(tagText))) {
    var v = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4];
    out[m[1].toLowerCase()] = v.replace(/&amp;/g, '&');
  }
  return out;
}

// Classify one URL: 'inline' (data:/blob:/fragment/empty), 'remote', 'dynamic' (built in script,
// e.g. contains a quote or '+'), or 'local'.
function classify(u) {
  u = u.trim();
  if (!u || u[0] === '#' || /^(data|blob|about|javascript):/i.test(u)) return 'inline';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.slice(0, 2) === '//' || u[0] === '\\') return 'remote';
  if (/['"+]/.test(u)) return 'dynamic';
  if (u[0] === '/') return 'remote';   // root-absolute: depends on the host, not a repo-relative path
  return 'local';
}

function cssUrls(css) {
  var out = [], m, re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = re.exec(css))) {
    var v = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : m[5];
    out.push(v);
  }
  return out;
}

// Script sinks that fetch at run time; the first argument must not be an absolute URL literal.
var SINKS = /(?:(?<![\w$-])(?:fetch|importScripts|import)\s*\(|\bnew\s+(?:WebSocket|EventSource|Worker|SharedWorker)\s*\(|\.sendBeacon\s*\(|\.open\s*\(\s*['"][A-Z]+['"]\s*,)\s*(['"`])([^'"`]*)\1|\.(?:src|href|data|poster)\s*=\s*(['"`])([^'"`]*)\3|setAttribute\(\s*['"](?:src|href|poster|data)['"]\s*,\s*(['"`])([^'"`]*)\5/g;

function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function scriptSinkUrls(js) {
  var out = [], m;
  js = stripComments(js);
  SINKS.lastIndex = 0;
  while ((m = SINKS.exec(js))) out.push(m[2] != null ? m[2] : m[4] != null ? m[4] : m[6]);
  return out;
}

// Check the url() / @import references inside one local CSS file (relative to that file); @import is followed once.
function scanCss(file, root, seen, problems) {
  var ROOT_ = root || ROOT;
  if (seen[file]) return; seen[file] = 1;
  var where = path.relative(ROOT_, file);
  cssUrls(fs.readFileSync(file, 'utf8')).forEach(function (u) {
    var kind = classify(u);
    if (kind === 'inline' || kind === 'dynamic') return;
    if (kind === 'remote') { problems.push(where + ': remote resource ' + u); return; }
    var abs = path.resolve(path.dirname(file), decodeURIComponent(u.split(/[?#]/)[0]));
    if (path.relative(ROOT_, abs).split(path.sep)[0] === '..') { problems.push(where + ': outside the repo ' + u); return; }
    if (!fs.existsSync(abs)) { problems.push(where + ': missing local file ' + u); return; }
    if (/\.css$/i.test(abs)) scanCss(abs, ROOT_, seen, problems);
  });
}

// Scan one HTML page; returns { problems: [...], resources: [...] }.
function scanPage(file, root) {
  var ROOT_ = root || ROOT;
  var html = fs.readFileSync(file, 'utf8');
  var dir = path.dirname(file);
  var problems = [], resources = [];
  function check(where, u, mustExist) {
    var kind = classify(u);
    if (kind === 'inline' || kind === 'dynamic') return;
    if (kind === 'remote') { problems.push(where + ': remote resource ' + u); return; }
    var clean = decodeURIComponent(u.split(/[?#]/)[0]);
    var abs = path.resolve(dir, clean);
    if (path.relative(ROOT_, abs).split(path.sep)[0] === '..') { problems.push(where + ': outside the repo ' + u); return; }
    resources.push(path.relative(ROOT_, abs));
    if (mustExist && !fs.existsSync(abs)) problems.push(where + ': missing local file ' + u);
  }

  // Tags anywhere in the file, including HTML built inside script strings.
  var tagRe = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*)?>/g, m;
  while ((m = tagRe.exec(html))) {
    var tag = m[1].toLowerCase(), a = attrs(m[2] || '');
    var line = html.slice(0, m.index).split('\n').length, where = path.relative(ROOT_, file) + ':' + line;
    if (a.style) cssUrls(a.style).forEach(function (u) { check(where, u, true); });
    if (tag === 'meta' && /refresh/i.test(a['http-equiv'] || '')) {
      var r = /url\s*=\s*(.*)$/i.exec(a.content || '');
      if (r) check(where, r[1], true);
    }
    if (LINK_TAGS[tag]) continue;
    var names = (LOAD_ATTRS[tag] || []).concat(LOAD_ATTRS['*']);
    names.forEach(function (n) {
      if (a[n] == null) return;
      // An attribute value written inside a JS string is checked for scheme only.
      var inScript = /['"]\s*\+|\+\s*['"]/.test(m[0]);
      if (n === 'srcset') a[n].split(',').forEach(function (c) { check(where, c.trim().split(/\s+/)[0], !inScript); });
      else check(where, a[n], !inScript);
    });
  }

  // <style> blocks and inline scripts.
  var blockRe = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((m = blockRe.exec(html))) {
    var where2 = path.relative(ROOT_, file) + ':' + html.slice(0, m.index).split('\n').length;
    if (m[1].toLowerCase() === 'style') cssUrls(m[3]).forEach(function (u) { check(where2, u, true); });
    else {
      cssUrls(m[3]).forEach(function (u) { if (classify(u) === 'remote') check(where2, u, false); });
      scriptSinkUrls(m[3]).forEach(function (u) { check(where2, u, false); });
    }
  }

  // Scripts loaded dynamically by the page's loader: loadSeq('<base>') over FILES = [...].
  var files = /\bFILES\s*=\s*\[([^\]]*)\]/.exec(html);
  if (files) {
    var names2 = (files[1].match(/['"][^'"]+['"]/g) || []).map(function (s) { return s.slice(1, -1); });
    var bases = [], b, baseRe = /\bloadSeq\(\s*['"]([^'"]*)['"]/g;
    while ((b = baseRe.exec(html))) bases.push(b[1]);
    names2.forEach(function (n) {
      var where3 = path.relative(ROOT_, file) + ': loader';
      var hits = bases.filter(function (base) {
        var u = base + n;
        if (classify(u) !== 'local') { check(where3, u, false); return false; }
        return fs.existsSync(path.resolve(dir, u));
      });
      if (!hits.length) problems.push(where3 + ': ' + n + ' not found under any base ' + JSON.stringify(bases));
      else resources.push(path.relative(ROOT_, path.resolve(dir, hits[0] + n)));
    });
  }
  var seenCss = {};
  resources.filter(function (p) { return /\.css$/i.test(p) && fs.existsSync(path.join(ROOT_, p)); })
    .forEach(function (p) { scanCss(path.join(ROOT_, p), ROOT_, seenCss, problems); });
  return { problems: problems, resources: resources };
}

var PAGES = walk(DEMO, '.html');

test('demo/ has pages to check', function () {
  assert.ok(PAGES.length > 0);
});

PAGES.forEach(function (file) {
  test('offline: ' + path.relative(ROOT, file) + ' loads only local repo files', function () {
    var r = scanPage(file);
    // Local scripts the page loads must not fetch remote URLs themselves.
    r.resources.filter(function (p) { return /\.js$/.test(p); }).forEach(function (p) {
      scriptSinkUrls(fs.readFileSync(path.join(ROOT, p), 'utf8')).forEach(function (u) {
        if (classify(u) === 'remote') r.problems.push(p + ': remote resource ' + u);
      });
    });
    assert.deepStrictEqual(r.problems, []);
  });
});

test('the offline check follows local CSS: remote url() / @import and missing files inside it', function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-css-'));
  try {
    fs.mkdirSync(path.join(tmp, 'css'));
    fs.writeFileSync(path.join(tmp, 'css', 'a.css'), '@import "b.css";\n@font-face{src:url("../fonts/none.woff")}\n.x{background:url(ok.png)}\n');
    fs.writeFileSync(path.join(tmp, 'css', 'b.css'), '@import url("https://fonts.example/f.css");\n@import "a.css";\n');
    fs.writeFileSync(path.join(tmp, 'css', 'ok.png'), '');
    var f = path.join(tmp, 'p.html');
    fs.writeFileSync(f, '<link rel="stylesheet" href="css/a.css">\n');
    var p = scanPage(f, tmp).problems.sort();
    assert.deepStrictEqual(p, [
      path.join('css', 'a.css') + ': missing local file ../fonts/none.woff',
      path.join('css', 'b.css') + ': remote resource https://fonts.example/f.css'
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the offline check catches remote and missing resources', function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-selftest-'));
  try {
    var f = path.join(tmp, 'p.html');
    fs.writeFileSync(f, [
      '<link rel="stylesheet" href="https://cdn.example/x.css">',
      '<script src="//cdn.example/x.js"></script>',
      '<img src="missing.png">',
      '<style>@import "http://x.example/a.css"; .a{background:url(/abs.png)}</style>',
      '<script>fetch("https://api.example/x"); s.src = "http://x.example/y.js";</script>',
      '<script>// fetch("https://in.comment/x")\ndocument.getElementById("btn-import").x = 1; window.fetch(\'wss://ws.example/\');</script>',
      '<a href="https://example.com/">ok</a><img src="data:image/png;base64,AA==">'
    ].join('\n'));
    var p = scanPage(f, tmp).problems.map(function (s) { return s.replace(/^.*?: /, ''); });
    assert.deepStrictEqual(p.sort(), [
      'missing local file missing.png',
      'remote resource //cdn.example/x.js',
      'remote resource /abs.png',
      'remote resource http://x.example/a.css',
      'remote resource http://x.example/y.js',
      'remote resource https://api.example/x',
      'remote resource https://cdn.example/x.css',
      'remote resource wss://ws.example/'
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
