// Who can see what. Synthetic local accounts (.data/test-*.txt) and local fixtures only. Every route that serves a scan, its screenshots,
// evidence, exports, diagnostics or share links is called as: the owning Agency Pro member, a member of another workspace (Creator / Startup),
// a free account, and a signed-out visitor. The server response is checked, not just what the UI hides. Also: the URL guard on scan creation.
// Run against a server started with ALLOW_PRIVATE_HOSTS=127.0.0.1:4200: node test/security.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:3100';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const acct = (f) => { const c = fs.readFileSync(f, 'utf8'); return { email: c.match(/Email: (\S+)/)[1], pw: c.match(/Password: (\S+)/)[1], slug: c.match(/Slug: (\S+)/)?.[1] }; };
const b = await chromium.launch();
const signIn = async (a) => { const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', a.email); await p.fill('input[type=password]', a.pw); await p.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await p.waitForURL('**/app**'); return { ctx, p }; };
const agency = await signIn(acct('.data/test-account.txt')), site = await signIn(acct('.data/test-site.txt')), free = await signIn(acct('.data/test-free.txt')); const anon = { ctx: await b.newContext() };
// A completed scan of each workspace, found the way a member finds it.
const scanOf = async (who, slug) => { await who.p.goto(`${base}/app/${slug}`); const proj = await who.p.locator('a[href*="/projects/"]').first().getAttribute('href').catch(() => null);
  if (proj) { await who.p.goto(base + proj + '/scanner'); } else { await who.p.goto(`${base}/app/${slug}/quick-scans`); }
  // The first completed scan on the page: a scan cut off by a server restart stays "running" until it is marked interrupted.
  const ids = await who.p.evaluate(() => [...new Set([...document.body.innerHTML.matchAll(/\/scans\/([0-9a-f-]{36})/g)].map((m) => m[1]))]);
  for (const id of ids) { const r = await who.ctx.request.get(`${base}/api/scans/${id}`); if (r.ok() && (await r.json()).status === 'completed') return id; }
  return ids[0]; };
const A = await scanOf(agency, acct('.data/test-account.txt').slug ?? 'test-agency'); const F = await scanOf(free, acct('.data/test-free.txt').slug ?? 'free-test');
check('found an Agency Pro workspace scan and a free-plan scan to test', !!A && !!F, `${A} / ${F}`);
const get = (who, u) => who.ctx.request.get(base + u, { maxRedirects: 0 }).then((r) => r.status());
const post = (who, u) => who.ctx.request.post(base + u, { headers: { origin: base } }).then((r) => r.status());
const routes = (id) => [`/api/scans/${id}`, `/api/scans/${id}/review`, `/api/scans/${id}/export?format=csv`, `/api/scans/${id}/screenshot/desktop`, `/api/scans/${id}/screenshot/mobile`, `/api/scans/${id}/early-shot`, `/api/scans/${id}/diagnostics`];
for (const [label, who] of [['another workspace (Creator / Startup)', site], ['a free account', free], ['a signed-out visitor', anon]]) {
  const codes = await Promise.all(routes(A).map((u) => get(who, u))); const sh = await post(who, `/api/scans/${A}/share`), rs = await post(who, `/api/scans/${A}/rescan`);
  check(`${label}: every read route for another workspace's scan answers 404 (no 402 that would confirm it exists)`, codes.every((c) => c === 404), codes.join(','));
  check(`${label}: cannot create a share link or start a rescan of it`, sh === 404 && rs === 404, `share ${sh}, rescan ${rs}`);
  const page = await get(who, `/scans/${A}`); check(`${label}: the report page is not served (404, or a redirect to sign in)`, page === 404 || (who === anon && page === 307), `HTTP ${page}`);
}
const own = await Promise.all(routes(A).map((u) => get(agency, u)));
check('the owning Agency Pro member reads its scan, screenshots, export and diagnostics', own[0] === 200 && own[1] === 200 && own[2] === 200 && own[3] === 200 && own[6] === 200, own.join(','));
// Free plan, own scan: the report, but no screenshots, export or share; evidence withheld by the server.
const fr = await Promise.all([get(free, `/api/scans/${F}/screenshot/desktop`), get(free, `/api/scans/${F}/export?format=csv`), post(free, `/api/scans/${F}/share`), get(free, `/api/scans/${F}/early-shot`)]);
check('free plan, own scan: screenshots, export, share and the blocker screenshot all answer 402', fr.every((c) => c === 402), fr.join(','));
const rv = await (await free.ctx.request.get(`${base}/api/scans/${F}/review`)).json();
check('free plan, own scan: the review API withholds evidence and recommendations', rv.locked === true && rv.categories.flatMap((c) => c.findings ?? []).every((f) => !f.evidence?.length && !f.recommendation), `locked ${rv.locked}`);
// Share links: a valid token opens read-only; a made-up one does not; the share screenshot follows the token.
const sres = await agency.ctx.request.post(`${base}/api/scans/${A}/share`, { headers: { origin: base } }); const surl = (await sres.json()).url; const token = surl?.split('/share/')[1];
check('a share link opens the report read-only for anyone with the link', (await anon.ctx.request.get(surl)).status() === 200);
check('a made-up share token is 404, page and screenshot', (await get(anon, '/share/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')) === 404 && (await get(anon, '/api/share/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/screenshot/desktop')) === 404);
check('the shared screenshot is served only through its token', (await get(anon, `/api/share/${token}/screenshot/desktop`)) === 200);
check('a cross-site request cannot create a share link (origin check)', (await agency.ctx.request.post(`${base}/api/scans/${A}/share`, { headers: { origin: 'https://evil.example' } })).status() === 403);
// Revoking: "Stop sharing" on the Shared reports page (newest link first) turns the link and its screenshot into 404 for everyone.
{ const slug = acct('.data/test-account.txt').slug ?? 'test-agency'; await agency.p.goto(`${base}/app/${slug}/shared`); await agency.p.getByRole('button', { name: /^Stop sharing/ }).first().click();
  await agency.p.getByText('Link stopped.').waitFor({ timeout: 10000 }).catch(() => {});
  const after = [(await anon.ctx.request.get(surl, { maxRedirects: 0 })).status(), await get(anon, `/api/share/${token}/screenshot/desktop`)];
  check('a revoked share link and its screenshot answer 404', after.every((c) => c === 404), after.join(','));
  check('the revoked link is listed as Revoked', /Revoked/.test(await (await agency.ctx.request.get(`${base}/app/${slug}/shared`)).text())); }
// URL guard on scan creation (signed in, so the anonymous limit of 5 per 10 minutes does not cut the list short): private, internal and credentialed addresses are refused before anything is queued.
const bad = ['http://localhost/', 'http://10.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://user:pw@example.com/', 'file:///etc/passwd', 'http://127.0.0.1:22/', 'http://internal/'];
const codes = []; for (const url of bad) { const r = await agency.ctx.request.post(base + '/api/scans', { headers: { origin: base, 'content-type': 'application/json' }, data: { url } }); codes.push(r.status()); }
check('private, internal, credentialed and non-web addresses are refused (422)', codes.every((c) => c === 422), codes.join(','));
// Workspaces: another workspace's pages are not served.
const ws = await get(site, `/app/${acct('.data/test-account.txt').slug ?? 'test-agency'}`); check('another workspace’s dashboard is not served to a non-member', ws === 404, `HTTP ${ws}`);
await b.close(); const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
