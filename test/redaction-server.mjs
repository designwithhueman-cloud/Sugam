// Redaction through the running app: scan a canary page as a paid member, then read everything a person or a client can read or download (the report
// page, the scan and review APIs, diagnostics, the CSV, summary and SARIF exports, and a client share link). No raw canary may appear in any of them.
// Needs an app server started with ALLOW_PRIVATE_HOSTS=127.0.0.1:4342 and the seeded agency account (.data/test-account.txt).
// Run: node test/redaction-server.mjs <baseUrl>
import fs from 'node:fs'; import http from 'node:http';
import { chromium } from 'playwright';
import { makeCanaries, RAW } from './support/canaries.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3390'; const PORT = 4342; const PAGE = `http://127.0.0.1:${PORT}`;
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const C = makeCanaries();
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Canary ${C.stripe}</title><meta name="n" content="${C.openai}"></head><body><main><h1>Canary page</h1><p id="p1">Visible: ${C.stripe}</p>
<img id="img1" src="/pic.png?access_token=${C.param}"><a id="l1" href="/go?api_key=${C.github}&x=${C.aws}">link</a><input id="in1" value="${C.supabaseSecret}" aria-label="k"><button id="b1"></button>
<script>var a="${C.serviceJwt}", b="${C.anonJwt}";</script></main></body></html>`;
const server = http.createServer((req, res) => { if (new URL(req.url, PAGE).pathname.startsWith('/leak')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); } else { res.writeHead(404); res.end('no'); } });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const browser = await chromium.launch({ channel: 'chrome' }); const ctx = await browser.newContext(); const p = await ctx.newPage();
await p.goto(base + '/login'); await p.fill('input[type=email]', creds.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await p.waitForURL(/\/app\/[^/]+/);
const get = async (path) => { const r = await ctx.request.get(base + path); return { status: r.status(), text: await r.text() }; };
const post = async (path, data) => { const r = await ctx.request.post(base + path, { headers: { origin: base, 'content-type': 'application/json' }, data }); return { status: r.status(), text: await r.text() }; };

const created = await post('/api/scans', { url: `${PAGE}/leak/${C.github}?q=${C.stripe}&page=1` }); const id = JSON.parse(created.text).id;
check('a scan of the canary page started', created.status < 300 && /^[0-9a-f-]{36}$/.test(id));
let status = null; for (let i = 0; i < 150; i++) { const s = JSON.parse((await get(`/api/scans/${id}`)).text); status = s; if (s.status === 'completed' || s.status === 'failed') break; await new Promise((r) => setTimeout(r, 2000)); }
check('the scan completed', status?.status === 'completed');
check('the address shown by the API has the secrets removed', !JSON.stringify(status).includes(C.github) && !JSON.stringify(status).includes(C.stripe) && /\/leak\/\[removed\]/.test(status.url ?? ''), status?.url);

const share = JSON.parse((await post(`/api/scans/${id}/share`, {})).text); const token = share.token ?? new URL(share.url ?? 'http://x/share/none', base).pathname.split('/').pop();
const pages = { 'report page': await get(`/scans/${id}`), 'scan API': await get(`/api/scans/${id}`), 'review API': await get(`/api/scans/${id}/review`), 'diagnostics API': await get(`/api/scans/${id}/diagnostics`),
  'CSV export': await get(`/api/scans/${id}/export`), 'summary export': await get(`/api/scans/${id}/export?format=summary`), 'SARIF export': await get(`/api/scans/${id}/export?format=sarif`), 'client share page': await get(`/share/${token}`) };
for (const [name, r] of Object.entries(pages)) { const leaked = RAW(C).filter((v) => r.text.includes(v)); check(`${name}: answered, and no raw canary in it`, r.status === 200 && leaked.length === 0, `HTTP ${r.status}, ${r.text.length} bytes${leaked.length ? ', leaked: ' + leaked.join(' ') : ''}`); }
check('the report and the CSV show the finding’s evidence with the secret hidden (masked, not deleted)', /access_token=\[removed\]/.test(pages['CSV export'].text) && pages['CSV export'].text.includes('#img1') && /sb_secret_••••/.test(pages['CSV export'].text + pages['SARIF export'].text));
check('the CSV and SARIF exports keep the findings and their selectors', /image-alt/.test(pages['CSV export'].text) && /button-name/.test(pages['SARIF export'].text + pages['CSV export'].text));
const shot = await ctx.request.get(`${base}/api/scans/${id}/screenshot/desktop`); check('the desktop screenshot is served', shot.status() === 200 && (await shot.body()).length > 1000);

await browser.close(); server.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
