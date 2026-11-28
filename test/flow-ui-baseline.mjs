// Replay baseline through the real UI: a saved public flow goes passed → newly failed → passed as the site is broken and then fixed, and the Flows
// page says so in plain words each time. Starts its own pieces on separate ports: a small public site with a switch (4210), the browser worker as a plain
// process (the same server.ts the Docker image runs; no container, so no isolation limits apply), and the app on a copy of the seeded database.
// Run: node test/flow-ui-baseline.mjs   (needs a build and .data/test-snapshot; run `npm run test:all` once to create it)
import { spawn } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from 'playwright';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const SITE = 4210, WORKER = 18096, APP = 3392, TOKEN = 'flow-ui-token-' + Math.random().toString(36).slice(2, 12);
let broken = false, blockedAct = false, executed = 0;
const pages = { '/': () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme</title></head><body><main><h1>Acme</h1><a id="go" href="${broken ? '/missing' : '/signup'}">Get started</a></main></body></html>`,
  '/signup': () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign up</title></head><body><main><h1 id="signup-title">Create your account</h1><button id="act" type="button" onclick="document.getElementById('msg').textContent='Thanks';fetch('/executed',{method:'POST'})">${blockedAct ? 'Buy now' : 'Learn more'}</button><p id="msg"></p></main></body></html>` };
const hits404 = []; const site = http.createServer((req, res) => { if (req.method === 'POST' && new URL(req.url, 'http://x').pathname === '/executed') { executed++; res.writeHead(204); res.end(); return; } const f = pages[new URL(req.url, 'http://x').pathname]; if (!f) { hits404.push(new URL(req.url, 'http://x').pathname); res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>Not found</h1>'); return; } res.writeHead(200, { 'content-type': 'text/html' }); res.end(f()); });
await new Promise((r) => site.listen(SITE, '127.0.0.1', r));
const procs = []; const stopAll = () => { for (const p of procs) try { p.kill(); } catch { /* gone */ } site.close(); };
process.on('exit', stopAll);
const up = async (url, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).status < 500) return true; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); } return false; };
const snap = JSON.parse(fs.readFileSync('.data/test-snapshot.json', 'utf8')); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-ui-')); fs.cpSync('.data/test-snapshot', path.join(dir, 'db'), { recursive: true });
const ALLOW = `127.0.0.1:${SITE}`;
procs.push(spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(WORKER), WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW }, stdio: 'ignore' }));
procs.push(spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], { env: { ...process.env, PGLITE_DIR: path.join(dir, 'db'), WORKER_URL: `http://127.0.0.1:${WORKER}`, WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off' }, stdio: 'ignore' }));
check('the worker and the app started', (await up(`http://127.0.0.1:${WORKER}/health`)) && (await up(`http://127.0.0.1:${APP}/login`)));

const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const browser = await chromium.launch({ channel: 'chrome' }); const p = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
await p.goto(`http://127.0.0.1:${APP}/login`); await p.fill('input[type=email]', creds.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').press('Enter'); await p.waitForURL(/\/app/, { timeout: 30000 });
const slug = snap.slugs.agency; await p.goto(`http://127.0.0.1:${APP}/app/${slug}/projects/${snap.projects.agency}/flows`);
const flow = { name: 'Visitor reaches sign-up', startUrl: `http://127.0.0.1:${SITE}/`, steps: [{ id: 'click-get-started', action: 'click', selector: '#go', expect: [{ type: 'url_contains', value: '/signup' }, { type: 'visible', selector: '#signup-title' }] }] };
await p.fill('#flow-json', JSON.stringify(flow, null, 2)); await p.getByRole('button', { name: 'Save flow' }).click(); await p.getByText('Saved.').waitFor({ timeout: 20000 });
const row = p.locator('[data-testid=flow-row]', { hasText: 'Visitor reaches sign-up' });
const runRow = async (row) => { await row.getByRole('button', { name: 'Run', exact: true }).click(); await row.getByRole('button', { name: 'Running…' }).waitFor({ timeout: 10000 }).catch(() => {}); await row.getByRole('button', { name: 'Run', exact: true }).waitFor({ timeout: 150000 }); const r = row.locator('[data-testid=flow-result]'); await r.waitFor({ timeout: 20000 });
  const cmp = row.locator('[data-testid=flow-compare]'), unv = row.locator('[data-testid=flow-unverified]');
  return { text: (await r.innerText()).replace(/\s+/g, ' '), compare: (await cmp.count()) ? await cmp.getAttribute('data-result') : null, compareText: (await cmp.count()) ? (await cmp.innerText()).replace(/\s+/g, ' ') : null, unverified: (await unv.count()) ? (await unv.innerText()).replace(/\s+/g, ' ') : null, badge: (await row.locator('span').filter({ hasText: /^(Passed|Failed|Could not verify|Skipped for safety)$/ }).first().innerText().catch(() => '')) }; };
const runOnce = () => runRow(row);

const flowId = (await (await p.request.get(`http://127.0.0.1:${APP}/api/projects/${snap.projects.agency}/flows`)).json()).flows.find((f) => f.name === flow.name).id;
const lastRun = async () => (await (await p.request.get(`http://127.0.0.1:${APP}/api/flows/${flowId}/runs`)).json()).runs[0]?.result;
const r1 = await runOnce(); console.log('  run 1 →', r1.text.slice(0, 200));
{ const r = await lastRun(); console.log('  paths the site answered 404 during run 1:', JSON.stringify(hits404)); console.log('  run 1 console errors:', JSON.stringify(r?.consoleErrors), ' failed requests:', JSON.stringify(r?.failedRequests)); globalThis.run1 = r; }
check('run 1 (site working): the page says the flow passed', /pass/i.test(r1.text) && !/fail/i.test(r1.text.split('click-get-started')[0]), r1.badge);
broken = true;
const r2 = await runOnce(); console.log('  run 2 →', r2.text.slice(0, 300), '| compare:', r2.compare, r2.compareText?.replace(/\s+/g, ' ').slice(0, 200));
check('run 2 (link now broken): the page says the flow failed at the sign-up step', /fail/i.test(r2.text) && /click-get-started/.test(r2.text));
check('…and compares it with run 1 as a regression ("worked last time, broken now")', r2.compare === 'regressed', `compare=${r2.compare}`);
broken = false;
const r3 = await runOnce(); console.log('  run 3 →', r3.text.slice(0, 200), '| compare:', r3.compare, r3.compareText?.replace(/\s+/g, ' ').slice(0, 200));
check('run 3 (link fixed): the page says the flow passes again', /pass/i.test(r3.text));
check('…and compares it with the failed run as fixed', r3.compare === 'fixed', `compare=${r3.compare}`);

// ---- a safety rule stops a flow that used to run (same saved flow, the site's button changes from allowed to blocked) ----
const saveFlow = async (f) => { await p.fill('#flow-json', JSON.stringify(f, null, 2)); await p.getByRole('button', { name: 'Save flow' }).click(); await p.getByText('Saved.').waitFor({ timeout: 20000 }); };
const flowB = { name: 'Visitor reaches sign-up then learns more', startUrl: `http://127.0.0.1:${SITE}/`, steps: [{ id: 'click-get-started', action: 'click', selector: '#go', expect: [{ type: 'url_contains', value: '/signup' }] }, { id: 'learn-more', action: 'click', selector: '#act', expect: [{ type: 'text_contains', text: 'Thanks' }] }] };
await saveFlow(flowB); const rowB = p.locator('[data-testid=flow-row]', { hasText: flowB.name });
const b1 = await runRow(rowB); console.log('  B run 1 →', b1.text.slice(0, 160)); check('flow B, button allowed: passes, and the button was pressed once', /pass/i.test(b1.badge) && executed === 1, `executed=${executed}`);
blockedAct = true;
const b2 = await runRow(rowB); console.log('  B run 2 →', b2.text.slice(0, 260), '| compare:', b2.compare, '|', b2.unverified);
check('the button now reads “Buy now”: the run shows “Could not verify” (stored status stays blocked), not Failed', /could not verify/i.test(b2.badge) && !/\bFailed\b/.test(b2.text.replace(/Technical detail.*/, '')), b2.badge);
check('…with the exact sentence: verified 1 step, stopped before ‘Buy now’ because of a safety rule, outcome unknown', b2.unverified?.includes('Avara verified 1 step, then stopped before ‘Buy now’ because of a safety rule. The flow outcome is unknown.'), b2.unverified);
check('…the action was never executed (the site saw no second press)', executed === 1, `executed=${executed}`);
check('…the earlier step stays verified (Passed) and the blocked step is labeled “Skipped for safety”', /click-get-started \(click\) Passed/.test(b2.text) && /learn-more \(click\) Skipped for safety/.test(b2.text));
check('…no regression and no recovery is reported: the comparison says could not verify and is not the red or green result', b2.compare === 'could_not_verify' && !/worked last time|Fix this first|passes now|fixed/i.test(b2.compareText ?? ''), `compare=${b2.compare}`);
check('…later steps, if any, would read “Not checked”, and the box says what to do (by hand, or on a copy of the site)', /Could not verify this flow/.test(b2.unverified ?? ''));
blockedAct = false;
const b3 = await runRow(rowB); console.log('  B run 3 →', b3.text.slice(0, 160), '| compare:', b3.compare);
check('the button is allowed again: the flow passes and is reported as verified now (not “fixed”)', /pass/i.test(b3.badge) && b3.compare === 'now_verified' && executed === 2, `compare=${b3.compare} executed=${executed}`);
// first-ever run, blocked at the very first step: zero steps passed
blockedAct = true; const before = executed;
const flowC = { name: 'Buys straight away', startUrl: `http://127.0.0.1:${SITE}/signup`, steps: [{ id: 'press-it', action: 'click', selector: '#act', expect: [{ type: 'text_contains', text: 'Thanks' }] }] };
await saveFlow(flowC); const rowC = p.locator('[data-testid=flow-row]', { hasText: flowC.name }); const c1 = await runRow(rowC); console.log('  C run 1 →', c1.text.slice(0, 200), '|', c1.unverified);
check('a first-ever run that is blocked at its first step: “Could not verify”, nothing verified, and the action was never executed', /could not verify/i.test(c1.badge) && c1.unverified?.includes('Nothing was verified') && c1.unverified?.includes('‘Buy now’') && executed === before, c1.unverified);
check('…there is no earlier run, so no comparison is shown, and the step is “Skipped for safety”', c1.compare === null && /press-it \(click\) Skipped for safety/.test(c1.text));
blockedAct = false;
await p.screenshot({ path: path.join(dir, 'flows-final.png') }); console.log('  screenshot:', path.join(dir, 'flows-final.png'));
await browser.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); stopAll(); process.exit(failed ? 1 : 0);
