// "Preview is ready" webhook (M2a trigger), end to end on two controlled fixture origins: a bearer-authenticated POST produces a visible verdict with no click,
// a repeated delivery reuses the same comparison, the five-flow cap lists what was skipped, and work accepted before a crash is finished by the next process.
// Run: node test/deploy-trigger.mjs   (needs a build and .data/test-snapshot; about 6 minutes)
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { chromium } from 'playwright';
const { createJourneySite } = await import('../fixture/apps/journey-site.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const SITE = 4357, SITEB = 4358, WORKER = 18100, APP = 3396, APP2 = 3397, TOKEN = 'deploy-ui-token-' + Math.random().toString(36).slice(2, 12), ALLOW = `127.0.0.1:${SITE},127.0.0.1:${SITEB},127.0.0.1:4359`;
const site = createJourneySite({ mode: 'ok' }); await new Promise((r) => site.listen(SITE, '127.0.0.1', r));
const preview = createJourneySite({ mode: 'ok' }); const listenB = () => new Promise((r) => preview.listen(SITEB, '127.0.0.1', r)); await listenB();
const procs = []; const stopAll = () => { for (const p of procs) try { p.kill(); } catch { /* gone */ } site.close(); try { preview.close(); } catch { /* closed */ } }; process.on('exit', stopAll);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (url, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).status < 500) return true; } catch { /* wait */ } await sleep(500); } return false; };
const until = async (fn, ms = 240000, step = 1500) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } };
const snap = JSON.parse(fs.readFileSync('.data/test-snapshot.json', 'utf8')); const pid = snap.projects.agency; const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const email = creds.match(/Email: (\S+)/)[1];
const copyDb = (tag) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), `deploy-${tag}-`)); const db = path.join(dir, 'db'); fs.cpSync('.data/test-snapshot', db, { recursive: true }); return db; };
const lib = (db, code) => spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', code], { env: { ...process.env, PGLITE_DIR: db, ALLOW_PRIVATE_HOSTS: ALLOW }, encoding: 'utf8', timeout: 120000 });
const FLOW = (name) => ({ name, startUrl: `http://127.0.0.1:${SITE}/`, steps: [{ id: 'open-booking', action: 'click', selector: 'a[href="/book"]', expect: [{ type: 'url_contains', value: '/book' }] }, { id: 'pick-time', action: 'click', selector: 'a[href="/book/calendar"]', expect: [{ type: 'visible', selector: '#booking-calendar' }] }] });
const setAddresses = (db) => lib(db, `import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; const d = await getDb(); await d.update(schema.projects).set({ liveUrl: 'http://127.0.0.1:${SITE}/', stagingUrl: 'http://127.0.0.1:${SITEB}/' }).where(eq(schema.projects.id, '${pid}')); process.exit(0);`);
const startApp = (port, db) => procs.push(spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env: { ...process.env, PGLITE_DIR: db, WORKER_URL: `http://127.0.0.1:${WORKER}`, WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off', FLOW_RUNS_PER_WINDOW: '100', FLOW_COMPARISONS_PER_WINDOW: '100', DEPLOY_BUSY_WAIT_MS: '2000' }, stdio: 'ignore' })) && procs[procs.length - 1];
const login = async (browser, base) => { const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage(); await p.goto(`${base}/login`); await p.fill('input[type=email]', email); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').press('Enter'); await p.waitForURL(/\/app/, { timeout: 30000 }); return p; };
const apiFor = (p, base) => async (method, url, data) => { const r = await p.request.fetch(base + url, { method, headers: { origin: base, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); return { status: r.status(), body: await r.json().catch(() => null) }; };

procs.push(spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(WORKER), WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW }, stdio: 'ignore' }));
check('the worker started', await up(`http://127.0.0.1:${WORKER}/health`));

// ================= phase A: the webhook, through the real app =================
const dbA = copyDb('a'); const s1 = setAddresses(dbA); check('(setup) live address = published fixture, staging address = preview fixture', s1.status === 0, s1.stderr?.slice(0, 200));
const appA = startApp(APP, dbA); const A = `http://127.0.0.1:${APP}`; check('the app started', await up(`${A}/login`));
const browser = await chromium.launch({ channel: 'chrome' }); const p = await login(browser, A); const api = apiFor(p, A);
const flowRes = await api('POST', `/api/projects/${pid}/flows`, FLOW('Visitor books a call')); const flowId = flowRes.body?.id; check('(setup) one saved flow: open booking, pick a time, the calendar is visible', flowRes.status === 201 && flowId, JSON.stringify(flowRes.body));
await p.goto(`${A}/app/${snap.slugs.agency}/projects/${pid}/flows`);

// token: who may create it
const anon = await fetch(`${A}/api/projects/${pid}/deploy-token`, { method: 'POST' }); check('creating the token needs a signed-in session (401 without one)', anon.status === 401, String(anon.status));
const cross = await p.request.fetch(`${A}/api/projects/${pid}/deploy-token`, { method: 'POST', headers: { origin: 'http://evil.test' } }); check('…and a request from another origin is refused (403)', cross.status() === 403);
const t1 = await api('POST', `/api/projects/${pid}/deploy-token`); check('a workspace owner gets a token, shown once', t1.status === 201 && /^avd_[\w-]{20,}$/.test(t1.body?.token ?? ''));
const t2 = await api('POST', `/api/projects/${pid}/deploy-token`); const TOK = t2.body.token; check('rotating gives a different token and the old one stops working', TOK !== t1.body.token);
const hook = (body, o = {}) => fetch(`${A}/api/projects/${o.project ?? pid}/deployments`, { method: 'POST', headers: { 'content-type': 'application/json', ...(o.token === null ? {} : { authorization: `Bearer ${o.token ?? TOK}` }), ...(o.headers ?? {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const ok = (id) => ({ deploymentId: id, previewUrl: `http://127.0.0.1:${SITEB}/` });
const countDeps = async () => (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments.length;
const oldTok = await hook(ok('rej-old'), { token: t1.body.token }); check('the rotated-out token is refused (401)', oldTok.status === 401);

// refusals leave nothing behind
const before = await countDeps(); const big = JSON.stringify({ ...ok('big'), pad: 'x'.repeat(5000) });
const rej = [await hook(ok('rej-1'), { token: null }), await hook(ok('rej-2'), { token: 'avd_wrong' }), await hook(ok('rej-3'), { project: crypto.randomUUID() }), await hook({ deploymentId: 'rej-4', previewUrl: 'http://127.0.0.1:4359/' }), await hook(big), await hook({ deploymentId: 'bad id!', previewUrl: ok('x').previewUrl }), await hook('not json')];
check('refused: no token, wrong token, another project, a preview address that is not the project’s staging address, an oversized body, a bad id, bad JSON', rej.map((r) => r.status).join() === '401,401,401,400,413,400,400', rej.map((r) => r.status).join());
check('…and none of them wrote a deployment or a comparison', (await countDeps()) === before);

// 1. healthy deployment → verdict on the page, with no click
const open = (id) => p.locator(`[data-testid=deployment][data-deployment=${id}]`);
const h1 = await hook(ok('rel-100')); check('a signed event is accepted with 202 and one pending comparison id', h1.status === 202 && h1.body.duplicate === false && h1.body.comparisons.length === 1 && h1.body.skipped.length === 0, JSON.stringify(h1.body));
await open('rel-100').locator('[data-testid=env-compare][data-verdict=passed_both]').waitFor({ timeout: 120000 });
check('healthy preview: “Passed on both” appears on the flows page with no click, labelled “Triggered by deployment rel-100”', /Passed on both/.test(await open('rel-100').innerText()) && /Triggered by deployment rel-100/.test(await open('rel-100').innerText()));

// 2. the calendar is missing only on the preview (same URL, HTTP 200)
preview.state.mode = 'broken-calendar'; const h2 = await hook(ok('rel-101'));
await open('rel-101').locator('[data-testid=env-compare][data-verdict=preview_regression]').waitFor({ timeout: 120000 });
const t = (await open('rel-101').innerText()).replace(/\s+/g, ' ');
check('broken preview: “Preview regression” with the failed step and expected versus observed, no click', h2.status === 202 && /Preview regression/.test(t) && /Expected: The booking calendar appears\. Observed: not visible or absent\./.test(t) && /Triggered by deployment rel-101/.test(t), t.slice(0, 300));
check('…the label says the staging address is fixed and may have changed since the deployment was reported', /fixed staging address, so it may have changed/.test(t));
preview.state.mode = 'ok';

// 3. duplicate deliveries, four at once
const hits0 = preview.hits.filter((x) => x === '/').length; const dup = await Promise.all([1, 2, 3, 4].map(() => hook(ok('rel-102'))));
const idsOf = (r) => r.body.comparisons.map((c) => c.id).join();
check('four concurrent deliveries of one deployment all answer 202 with the same comparison id', dup.every((r) => r.status === 202) && new Set(dup.map(idsOf)).size === 1 && dup[0].body.comparisons.length === 1, dup.map(idsOf).join(' | '));
check('…exactly one of them is the first; the rest are marked duplicate', dup.filter((r) => r.body.duplicate === false).length === 1 && dup.filter((r) => r.body.duplicate === true).length === 3);
await until(async () => (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments.find((d) => d.deploymentId === 'rel-102')?.comparisons.every((c) => c.status === 'done'));
const list = (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments; const d102 = list.filter((d) => d.deploymentId === 'rel-102');
check('…one event row, one comparison, one run on the preview (no extra comparison was created)', d102.length === 1 && d102[0].comparisons.length === 1 && d102[0].comparisons[0].id === dup[0].body.comparisons[0].id && preview.hits.filter((x) => x === '/').length - hits0 === 1, `${preview.hits.filter((x) => x === '/').length - hits0} preview runs`);
const again = await hook(ok('rel-102')); check('a late redelivery after it finished is still 202, the same id, duplicate', again.status === 202 && again.body.duplicate === true && idsOf(again) === idsOf(dup[0]));
check('a new deployment id makes a new comparison', (await hook(ok('rel-103'))).body.comparisons[0].id !== idsOf(dup[0]));
await until(async () => (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments.every((d) => d.comparisons.every((c) => c.status === 'done')));

// 4. the five-flow cap
const extra = []; for (let i = 1; i <= 6; i++) { const r = await api('POST', `/api/projects/${pid}/flows`, FLOW(`Extra flow ${i}`)); extra.push(r.body.id); }
const h4 = await hook(ok('rel-200')); const names = (await api('GET', `/api/projects/${pid}/flows`)).body.flows.slice().reverse().map((f) => f.name);
check('with seven flows, one deployment compares five and records two skips', h4.status === 202 && h4.body.comparisons.length === 5 && h4.body.skipped.length === 2 && h4.body.skipped.every((x) => x.reason === 'over_limit'), JSON.stringify(h4.body.skipped));
check('…the oldest five are compared and the last two are the ones skipped', JSON.stringify(h4.body.comparisons.map((c) => c.name)) === JSON.stringify(names.slice(0, 5)) && JSON.stringify(h4.body.skipped.map((x) => x.name)) === JSON.stringify(names.slice(5)), JSON.stringify([h4.body.comparisons.map((c) => c.name), h4.body.skipped.map((x) => x.name)]));
await p.reload(); await open('rel-200').waitFor({ timeout: 30000 }); const sk = await open('rel-200').locator('[data-testid=deploy-skipped] li').allInnerTexts();
check('the page names the skipped flows and says why, with no click', sk.length === 2 && sk.every((x) => /at most 5 flows/.test(x)) && sk[0].includes(names[5]) && sk[1].includes(names[6]), JSON.stringify(sk));
const done4 = await until(async () => { const d = (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments.find((x) => x.deploymentId === 'rel-200'); return d?.comparisons.length === 5 && d.comparisons.every((c) => c.status === 'done') ? d : null; }, 420000);
check('…all five finished, in order, each “Passed on both”', done4 && done4.comparisons.every((c) => c.verdict === 'passed_both'), JSON.stringify(done4?.comparisons.map((c) => c.verdict)));
const skippedId = (await api('GET', `/api/projects/${pid}/flows`)).body.flows.find((f) => f.name === names[6]).id;
const man = await api('POST', `/api/flows/${skippedId}/comparisons`); check('the manual “Compare preview with published” still works for a skipped flow, with its own limits unchanged', man.status === 202, JSON.stringify(man.body));
await until(async () => (await api('GET', `/api/flows/${skippedId}/comparisons`)).body.comparisons[0]?.status === 'done', 120000);
for (const id of extra) await api('DELETE', `/api/flows/${id}`);

// 5. preview server down: inconclusive, published preserved
await new Promise((r) => preview.close(() => r())); const h5 = await hook(ok('rel-300'));
const c5 = await until(async () => { const d = (await api('GET', `/api/projects/${pid}/deployments`)).body.deployments.find((x) => x.deploymentId === 'rel-300'); return d?.comparisons[0]?.status === 'done' ? d.comparisons[0] : null; }, 180000);
check('preview server stopped: “Comparison inconclusive” (not a regression) and the published pass is kept', h5.status === 202 && c5?.verdict === 'inconclusive' && c5.published.status === 'passed' && /start page could not be opened/.test(c5.detail.preview.inconclusive), c5?.verdict);
await listenB();

// ================= phase B: inspect the stored token, then a process that died after accepting =================
await browser.close(); appA.kill(); await sleep(2000);
const hashCheck = lib(dbA, `import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; import crypto from 'node:crypto'; const d = await getDb(); const [r] = await d.select({ h: schema.projects.deployTokenHash }).from(schema.projects).where(eq(schema.projects.id, '${pid}')); console.log(JSON.stringify({ h: r.h, want: crypto.createHash('sha256').update(${JSON.stringify(TOK)}).digest('hex') })); process.exit(0);`);
const hc = JSON.parse(hashCheck.stdout.trim().split('\n').pop() || '{}'); const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const plain = walk(dbA).some((f) => { try { const b = fs.readFileSync(f); return b.includes(TOK) || b.includes(t1.body.token); } catch { return false; } });
check('the database stores only the SHA-256 of the current token, and the token itself is nowhere in it', hc.h && hc.h === hc.want && !plain, hashCheck.stderr?.slice(0, 200));

const dbB = copyDb('b'); setAddresses(dbB);
const prep = lib(dbB, `import { getDb, schema } from './lib/db/index.ts'; import { eq, and, sql } from 'drizzle-orm'; import { createFlow } from './lib/flows/service.ts'; import { rotateDeployToken, acceptDeployment } from './lib/flows/deployments.ts';
const d = await getDb(); const [u] = await d.select().from(schema.users).where(eq(schema.users.email, ${JSON.stringify(email)}));
const f = await createFlow('${pid}', u.id, ${JSON.stringify(FLOW('Visitor books a call'))}); const token = await rotateDeployToken('${pid}');
const conc = await Promise.all([1, 2, 3, 4, 5].map(() => acceptDeployment('${pid}', 'conc-1')));
const c1 = await acceptDeployment('${pid}', 'crash-1'); const c2 = await acceptDeployment('${pid}', 'crash-2');
await d.update(schema.flowComparisons).set({ status: 'running', claimedBy: 'a-process-that-died', claimedAt: new Date(Date.now() - 3600e3) }).where(eq(schema.flowComparisons.id, c2.comparisons[0].id));
await d.update(schema.memberships).set({ role: 'member' }).where(eq(schema.memberships.userId, u.id));
const ev = await d.select().from(schema.deploymentEvents); const cmp = await d.select().from(schema.flowComparisons);
console.log(JSON.stringify({ ok: f.ok, token, conc: conc.map((c) => ({ dup: c.duplicate, ids: c.comparisons.map((x) => x.id) })), c1: c1.comparisons[0].id, c2: c2.comparisons[0].id, events: ev.map((e) => e.deploymentId).sort(), cmpStatuses: cmp.map((c) => c.status) })); process.exit(0);`);
const pr = JSON.parse(prep.stdout.trim().split('\n').pop() || '{}');
check('(setup) five concurrent acceptances of one deployment return one comparison id and a single event; then the process “crashes” right after accepting crash-1 and crash-2', pr.ok && new Set(pr.conc.map((c) => c.ids.join())).size === 1 && pr.conc.filter((c) => !c.dup).length === 1 && pr.events.join() === 'conc-1,crash-1,crash-2' && pr.cmpStatuses.every((s) => s === 'pending' || s === 'running'), prep.stderr?.slice(0, 300) + JSON.stringify(pr).slice(0, 300));
check('(setup) nothing has run: every accepted comparison is still waiting, and crash-2 is stuck “running” under a dead process', pr.cmpStatuses.filter((s) => s === 'running').length === 1 && pr.cmpStatuses.filter((s) => s === 'pending').length === 2);

const appB = startApp(APP2, dbB); const B = `http://127.0.0.1:${APP2}`; check('a new app process started on that database', await up(`${B}/login`));
const br2 = await chromium.launch({ channel: 'chrome' }); const p2 = await login(br2, B); const api2 = apiFor(p2, B);
const resumed = await until(async () => { const l = (await api2('GET', `/api/projects/${pid}/deployments`)).body.deployments; return ['crash-1', 'crash-2', 'conc-1'].every((id) => l.find((d) => d.deploymentId === id)?.comparisons.every((c) => c.status === 'done')) ? l : null; }, 300000);
check('with no request at all, the new process finished all three accepted deployments (including the one left running by the dead process)', resumed && ['crash-1', 'crash-2', 'conc-1'].every((id) => resumed.find((d) => d.deploymentId === id).comparisons.length === 1 && resumed.find((d) => d.deploymentId === id).comparisons[0].verdict === 'passed_both'), JSON.stringify(resumed?.map((d) => [d.deploymentId, d.comparisons.map((c) => c.verdict)])));
const redo = await fetch(`${B}/api/projects/${pid}/deployments`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${pr.token}` }, body: JSON.stringify({ deploymentId: 'crash-1', previewUrl: `http://127.0.0.1:${SITEB}/` }) }); const rb = await redo.json();
check('redelivering crash-1 after the restart returns 202 with the same comparison id and creates nothing', redo.status === 202 && rb.duplicate === true && rb.comparisons[0].id === pr.c1 && (await api2('GET', `/api/projects/${pid}/deployments`)).body.deployments.length === 3);
const runs = (await api2('GET', `/api/flows/${resumed[0].comparisons[0].flowId}/runs`)).body.runs; check('the deployment runs are kept out of the flow’s own run history', runs.length === 0, `${runs.length} runs`);
const memberToken = await api2('POST', `/api/projects/${pid}/deploy-token`); check('a project member who is not an owner or admin cannot create or rotate the token (403)', memberToken.status === 403, JSON.stringify(memberToken.body));
await p2.goto(`${B}/app/${snap.slugs.agency}/projects/${pid}/flows`); await p2.locator('[data-testid=deployment][data-deployment=crash-2] [data-testid=env-compare][data-verdict=passed_both]').waitFor({ timeout: 60000 });
check('…and the resumed result is on the page without a click', true);
await br2.close(); appB.kill(); const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); stopAll(); process.exit(failed ? 1 : 0);
