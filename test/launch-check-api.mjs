// Launch check through the app: ownership proof, passive vs active checks, before/after comparison, access rules and the page itself.
// Needs an app server on a copy of the database, started with:
//   PGLITE_DIR=<copy of a closed snapshot> ALLOW_PRIVATE_HOSTS=127.0.0.1:4331 LC_TEST_SUPABASE_BASE=http://127.0.0.1:4331 AVARA_AI=off next start -p 3302
// Run: node test/launch-check-api.mjs http://127.0.0.1:3302      (takes about two minutes: the app limits a project to one run every 20 seconds)
import { chromium } from 'playwright'; import fs from 'node:fs';
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4331';
const { createLeakyApp, STRIPE, SERVICE, OPEN_ROW } = await import('../fixture/apps/leaky-app.mjs');
const base = process.argv[2] || 'http://127.0.0.1:3302'; const FIX = 'http://127.0.0.1:4331/';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fx = createLeakyApp({ leaky: true }); await new Promise((r) => fx.listen(4331, '127.0.0.1', r));

const b = await chromium.launch({ channel: 'chrome' });
async function signIn(file) { const t = fs.readFileSync(file, 'utf8'); const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', t.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', t.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await p.waitForURL('**/app**', { timeout: 30000 }); return { ctx, page: p, rq: ctx.request }; }
const call = async (rq, method, path, data, origin = base) => { const r = await rq.fetch(base + path, { method, headers: { origin, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { /* not json */ } return { status: r.status(), body, text }; };
const byId = (run, id) => run.results.find((x) => x.id === id);

const agency = await signIn('.data/test-account.txt'), site = await signIn('.data/test-site.txt'), anon = await b.newContext().then((c) => c.request);
// a project whose live address is the fixture
const slug = new URL(agency.page.url()).pathname.split('/')[2];
await agency.page.goto(`${base}/app/${slug}/projects`);
await agency.page.fill('#p-name', 'Launch check fixture ' + Date.now()); await agency.page.fill('#p-live', FIX);
const cname = agency.page.locator('#p-cname'); if (await cname.count() && await cname.isVisible()) await cname.fill('Fixture client');
await agency.page.getByRole('button', { name: 'Add project' }).click(); await agency.page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30000 });
const P = agency.page.url().match(/projects\/([0-9a-f-]{36})/)[1]; const API = `/api/projects/${P}/launch-check`;
check('created a project whose live address is the fixture', !!P, P);

// ---- access ----
check('signed out: 401', (await call(anon, 'GET', API)).status === 401 && (await call(anon, 'POST', API)).status === 401);
check('a member of another workspace gets 404, not 403', (await call(site.rq, 'GET', API)).status === 404 && (await call(site.rq, 'POST', API, {})).status === 404 && (await call(site.rq, 'POST', API + '/ownership', {})).status === 404);
check('a cross-origin POST is refused (403)', (await call(agency.rq, 'POST', API, {}, 'https://evil.test')).status === 403 && (await call(agency.rq, 'POST', API + '/ownership', {}, 'https://evil.test')).status === 403);

// ---- before ownership: passive only ----
const g0 = await call(agency.rq, 'GET', API);
check('before proof: not verified, a token and tag are offered, no runs yet', g0.body?.verified === false && /^avara-verify-/.test(g0.body?.token ?? '') && g0.body?.tag?.includes(g0.body.token) && g0.body?.runs?.length === 0);
const r1 = await call(agency.rq, 'POST', API, {}); const run1 = r1.body?.run;
check('run 1 (unverified): secrets flagged, the three extra checks are not run', r1.status === 200 && byId(run1, 'SEC-011').status === 'flag' && ['SEC-012', 'SEC-013', 'SEC-014'].every((i) => byId(run1, i).status === 'unverified') && run1.active === false);
check('run 1: verdict says don’t launch', r1.body?.verdict?.level === 'stop');
check('no whole secret or database row value appears anywhere in the response', ![STRIPE, SERVICE, OPEN_ROW.email, 'FIXTURE_ROW_VALUE'].some((s) => r1.text.includes(s)));
check('an immediate second run is refused (429)', (await call(agency.rq, 'POST', API, {})).status === 429);
const own0 = await call(agency.rq, 'POST', API + '/ownership', {});
check('ownership is not accepted before the line is on the site', own0.status === 200 && own0.body?.verified === false && /did not find/i.test(own0.body?.message ?? ''));
fx.state.token = 'avara-verify-someone-elses-token';
check('the wrong token does not verify', (await call(agency.rq, 'POST', API + '/ownership', {})).body?.verified === false);

// ---- prove ownership, then every check runs ----
fx.state.token = g0.body.token;
const own1 = await call(agency.rq, 'POST', API + '/ownership', {});
check('the right line on the site verifies ownership', own1.body?.verified === true && own1.body?.method === 'meta');
check('GET now says verified', (await call(agency.rq, 'GET', API)).body?.verified === true);
await sleep(21000);
const r2 = await call(agency.rq, 'POST', API, {}); const run2 = r2.body?.run;
check('run 2 (verified): all four checks flagged', r2.status === 200 && run2.active === true && run2.results.every((x) => x.status === 'flag'), run2?.results.map((x) => `${x.id}:${x.status}`).join(' '));
const ch2 = Object.fromEntries((r2.body?.changes ?? []).map((c) => [c.id, c.outcome]));
check('run 2 vs run 1: the secrets are still open, the three extra checks are “newly found” (not “newly broken”)', ch2['SEC-011'] === 'still_open' && ['SEC-012', 'SEC-013', 'SEC-014'].every((i) => ch2[i] === 'newly_found'), JSON.stringify(ch2));
check('run 2: no secret, file content or row value in the response', ![STRIPE, SERVICE, OPEN_ROW.email, 'FIXTURE_ROW_VALUE', 'postgres://'].some((s) => r2.text.includes(s)));

// ---- the page, with real problems ----
const pg = agency.page; await pg.goto(`${base}/app/${slug}/projects/${P}/launch-check`);
check('the page shows the verdict and four result cards', (await pg.locator('[data-testid=verdict]').getAttribute('data-level')) === 'stop' && (await pg.locator('[data-testid=result]').count()) === 4);
check('a flagged card carries a plain message for the AI builder', /Tell your AI builder/.test(await pg.locator('[data-testid=result][data-status=flag]').first().innerText()));
await pg.setViewportSize({ width: 390, height: 800 }); await pg.reload();
check('phone width: no sideways scroll', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await pg.setViewportSize({ width: 1280, height: 800 });

// ---- the owner fixes everything: the next check says so ----
Object.assign(fx.state, { secrets: false, files: false, maps: false, table: false });
await sleep(21000);
const r3 = await call(agency.rq, 'POST', API, {}); const ch3 = Object.fromEntries((r3.body?.changes ?? []).map((c) => [c.id, c.outcome]));
check('after the fix: all four are “fixed” and the verdict is no longer a stop', Object.values(ch3).length === 4 && Object.values(ch3).every((o) => o === 'fixed') && r3.body?.verdict?.level === 'ok', JSON.stringify(ch3));

// ---- the fix breaks something else: that is reported as newly broken ----
fx.state.files = true;
await sleep(21000);
const r4 = await call(agency.rq, 'POST', API, {}); const ch4 = Object.fromEntries((r4.body?.changes ?? []).map((c) => [c.id, c.outcome]));
check('a new mistake is reported as “new”, and everything else stays unchanged', ch4['SEC-012'] === 'new' && !Object.entries(ch4).some(([id, o]) => id !== 'SEC-012' && o !== undefined), JSON.stringify(ch4));
check('history is kept: GET lists the runs, newest first', (await call(agency.rq, 'GET', API)).body?.runs?.length >= 4);

await b.close(); fx.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
