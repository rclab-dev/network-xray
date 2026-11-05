'use strict';
// Static server for the docker compose bundles (copied to demo/compose-*/server/server.js by gen_compose_bundle.js).
// Serves the page files from /web on port 8080; also reachable under /static/ like `containerlab graph --static-dir`.
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = '/web', PORT = 8080;
var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'
};
var CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
var HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store'
};

function send(res, code, type, body, extra, head) {
  var h = Object.assign({}, HEADERS, { 'Content-Type': type, 'Content-Length': body.length }, extra || {});
  res.writeHead(code, h);
  res.end(head ? undefined : body);
}
function plain(res, code, msg, extra, head) { send(res, code, 'text/plain; charset=utf-8', Buffer.from(msg + '\n'), extra, head); }

// URL path -> file name under root, or null (not a page file)
function resolve(root, url) {
  var p = String(url || '/').split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch (e) { return null; }
  if (p === '/' || p === '') p = '/index.html';
  if (p.indexOf('/static/') === 0) p = p.slice(7);
  if (p.charAt(0) !== '/' || /[\0\\]/.test(p)) return null;
  var parts = p.slice(1).split('/');
  if (parts.some(function (s) { return s === '' || s.charAt(0) === '.'; })) return null;   // no dot files, no ..
  if (!MIME.hasOwnProperty(path.extname(p).toLowerCase())) return null;
  var fp = path.join(root, parts.join(path.sep));
  return fp.indexOf(path.join(root, path.sep)) === 0 ? fp : null;
}

function handler(root) {
  var realRoot = null;
  return function (req, res) {
    var head = req.method === 'HEAD';
    try {
      if (req.method !== 'GET' && !head) { plain(res, 405, 'method not allowed', { Allow: 'GET, HEAD' }); return; }
      if (String(req.url).split('?')[0] === '/favicon.ico') { res.writeHead(204, HEADERS); res.end(); return; }
      var fp = resolve(root, req.url);
      if (!fp) { plain(res, 404, 'not found', null, head); return; }
      fs.realpath(fp, function (e, real) {
        try {
          if (!realRoot) { try { realRoot = fs.realpathSync(root); } catch (er) { realRoot = root; } }
          if (e || real.indexOf(path.join(realRoot, path.sep)) !== 0) { plain(res, 404, 'not found', null, head); return; }
          fs.stat(real, function (e2, st) {
            if (e2 || !st.isFile()) { plain(res, 404, 'not found', null, head); return; }
            fs.readFile(real, function (e3, b) {
              if (e3) { plain(res, 404, 'not found', null, head); return; }
              send(res, 200, MIME[path.extname(fp).toLowerCase()], b, null, head);
            });
          });
        } catch (er) { fail(res, er); }
      });
    } catch (e) { fail(res, e); }
  };
}
function fail(res, e) {
  console.error('graph-server: error ' + ((e && e.code) || 'internal'));
  try { if (!res.headersSent) plain(res, 500, 'internal error'); else res.destroy(); } catch (er) { /* closed */ }
}

module.exports = { handler: handler, resolve: resolve, HEADERS: HEADERS, MIME: MIME };
if (require.main === module) {
  http.createServer(handler(ROOT)).listen(PORT, function () { console.log('graph-server on :' + PORT); });
}
