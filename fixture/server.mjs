// Controlled fixture site with known accessibility defects, for testing Sugam.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const SITE = path.join(path.dirname(new URL(import.meta.url).pathname), 'site');
const T = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/redirect-internal') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
  if (u.pathname === '/avara/slow.js') { setTimeout(() => { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end('window.__slow = 1;'); }, Number(u.searchParams.get('ms') || 3000)); return; }
  if (u.pathname === '/detectors/slow-font.woff2') { return setTimeout(() => fs.readFile(path.join(SITE, 'detectors', 'font.woff2'), (e, d) => { res.writeHead(200, { 'content-type': 'font/woff2' }); res.end(d); }), 900); }
  if (u.pathname.startsWith('/detectors/missing/')) { res.writeHead(404, { 'content-type': T['.html'] }); return res.end('<h1>Not found</h1>'); }
  const file = path.join(SITE, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
  if (!file.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(200, { 'content-type': T['.html'] }); return res.end('<!doctype html><html lang="en"><title>Page</title><h1>Placeholder</h1></html>'); } res.writeHead(200, { 'content-type': T[path.extname(file)] || 'application/octet-stream' }); res.end(d); });
}).listen(Number(process.env.FIXTURE_PORT || 4200), '::', () => console.log('fixture on http://127.0.0.1:' + (process.env.FIXTURE_PORT || 4200)));
