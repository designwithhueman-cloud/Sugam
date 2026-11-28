// Compare preview with published, through the real UI: one approved journey version, run on two controlled fixture origins (published and preview), with only the
// origin changed. The booking calendar is missing only on the preview (same URL, HTTP 200); then every other pairing, including blocked and unreachable runs.
// Run: node test/env-compare-ui.mjs   (needs a build and .data/test-snapshot; about 5 minutes)
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from 'playwright';
const { createJourneySite } = await import('../fixture/apps/journey-site.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const SITE = 4354, SITEB = 4355, WORKER = 18099, APP = 3395, TOKEN = 'journey-ui-token-' + Math.random().toString(36).slice(2, 12), ALLOW = `127.0.0.1:${SITE},127.0.0.1:${SITEB},127.0.0.1:4356`;
const site = createJourneySite({ mode: 'ok' }); await new Promise((r) => site.listen(SITE, '127.0.0.1', r));
const preview = createJourneySite({ mode: 'ok' }); const listenB = () => new Promise((r) => preview.listen(SITEB, '127.0.0.1', r)); await listenB();
const procs = []; const stopAll = () => { for (const p of procs) try { p.kill(); } catch { /* gone */ } site.close(); try { preview.close(); } catch { /* closed */ } }; process.on('exit', stopAll);
const up = async (url, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).status < 500) return true; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); } return false; };
const snap = JSON.parse(fs.readFileSync('.data/test-snapshot.json', 'utf8')); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-ui-')); const db = path.join(dir, 'db'); fs.cpSync('.data/test-snapshot', db, { recursive: true });
// the project's live address is the booking site (the database is opened here, then closed, before the app starts)
const set = spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', `import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; const d = await getDb(); await d.update(schema.projects).set({ liveUrl: 'http://127.0.0.1:${SITE}/', stagingUrl: 'http://127.0.0.1:${SITEB}/' }).where(eq(schema.projects.id, '${snap.projects.agency}')); process.exit(0);`], { env: { ...process.env, PGLITE_DIR: db }, encoding: 'utf8' });
check('(setup) the project’s live address is the published site and its staging address is the preview site', set.status === 0, set.stderr?.slice(0, 200));
procs.push(spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(WORKER), WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW }, stdio: 'ignore' }));
procs.push(spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], { env: { ...process.env, PGLITE_DIR: db, WORKER_URL: `http://127.0.0.1:${WORKER}`, WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off', FLOW_RUNS_PER_WINDOW: '60', FLOW_COMPARISONS_PER_WINDOW: '60' }, stdio: 'ignore' }));
check('the worker and the app started', (await up(`http://127.0.0.1:${WORKER}/health`)) && (await up(`http://127.0.0.1:${APP}/login`)));

const base = `http://127.0.0.1:${APP}`; const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const browser = await chromium.launch({ channel: 'chrome' }); const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
await p.goto(`${base}/login`); await p.fill('input[type=email]', creds.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').press('Enter'); await p.waitForURL(/\/app/, { timeout: 30000 });
const pid = snap.projects.agency; await p.goto(`${base}/app/${snap.slugs.agency}/projects/${pid}/flows`);
const api = async (method, url, data) => { const r = await p.request.fetch(base + url, { method, headers: { origin: base, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const flowsNow = async () => (await api('GET', `/api/projects/${pid}/flows`)).body;
const runRow = async (row) => { await row.getByRole('button', { name: 'Run', exact: true }).click(); await row.getByRole('button', { name: 'Running…' }).waitFor({ timeout: 10000 }).catch(() => {}); await row.getByRole('button', { name: 'Run', exact: true }).waitFor({ timeout: 150000 }); const r = row.locator('[data-testid=flow-result]'); await r.waitFor({ timeout: 20000 }); const cmp = row.locator('[data-testid=flow-compare]');
  return { text: (await r.innerText()).replace(/\s+/g, ' '), compare: (await cmp.count()) ? await cmp.getAttribute('data-result') : null, steps: await r.locator('li').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' '))) }; };


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the approved journey: discovered on the published address, saved through the UI (success includes the booking calendar)
await p.getByRole('button', { name: 'Find journeys' }).click(); await p.locator('[data-testid=discovery]').waitFor({ timeout: 120000 });
const booking = p.locator('[data-testid=journey][data-purpose=booking]'); await booking.getByLabel('Name', { exact: false }).fill('Visitor books a call');
await booking.getByRole('button', { name: 'Save as flow' }).click(); await p.getByText('Saved.').waitFor({ timeout: 20000 });
const flow = (await flowsNow()).flows.find((f) => f.name === 'Visitor books a call'); const id = flow.id; const before = JSON.stringify(flow.definition);
check('(setup) the saved flow starts on the published address and expects the booking calendar', flow.definition.startUrl.startsWith(`http://127.0.0.1:${SITE}/`) && flow.definition.steps.at(-1).expect.some((e) => e.selector === '#booking-calendar'));
const compareNow = async (a, b) => { site.state.mode = a; preview.state.mode = b; const r = await api('POST', `/api/flows/${id}/comparisons`); if (r.status !== 202) throw new Error(`comparison not started: ${r.status} ${JSON.stringify(r.body)}`);
  for (let i = 0; i < 200; i++) { const c = (await api('GET', `/api/flows/${id}/comparisons`)).body.comparisons[0]; if (c?.id === r.body.id && c.status === 'done') return c; await sleep(1000); } throw new Error('comparison did not finish'); };

// 1. both healthy
const c1 = await compareNow('ok', 'ok'); check('both healthy → Passed on both', c1.verdict === 'passed_both' && c1.published.status === 'passed' && c1.preview.status === 'passed' && c1.version === 1, c1.verdict);
check('…the preview run really went to the preview origin and the published run to the published one', c1.preview.result.steps.at(-1).urlAfter.startsWith(`http://127.0.0.1:${SITEB}/`) && c1.published.result.steps.at(-1).urlAfter.startsWith(`http://127.0.0.1:${SITE}/`));

// 2. the booking calendar is missing only on preview: same URL, HTTP 200, through the UI
site.state.mode = 'ok'; preview.state.mode = 'broken-calendar';
const live = await fetch(`http://127.0.0.1:${SITEB}/book/calendar`); const lhtml = await live.text();
check('(setup) on the preview, /book/calendar still answers HTTP 200 and still has its heading, but the calendar is missing; on the published site it is there', live.status === 200 && lhtml.includes('Pick a time') && !lhtml.includes('booking-calendar') && (await (await fetch(`http://127.0.0.1:${SITE}/book/calendar`)).text()).includes('booking-calendar'));
await p.reload(); const row = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first();
await row.getByRole('button', { name: 'Compare preview with published' }).click(); const card = row.locator('[data-testid=env-compare][data-verdict=preview_regression]'); await card.waitFor({ timeout: 180000 });
const pub = card.locator('[data-testid=env-published]'), prev = card.locator('[data-testid=env-preview]'); const ptxt = (await prev.innerText()).replace(/\s+/g, ' ');
check('through the UI: “Preview regression”, published passed and preview failed', /Preview regression/.test(await card.innerText()) && (await pub.getAttribute('data-status')) === 'passed' && (await prev.getAttribute('data-status')) === 'failed');
check('…the environment, the failed step and expected versus observed are shown on the preview side', /Preview/.test(ptxt) && new RegExp(`127\\.0\\.0\\.1:${SITEB}`).test(ptxt) && /step-2-/.test(ptxt) && /Expected: The booking calendar appears\. Observed: not visible or absent\./.test(ptxt), ptxt.slice(0, 500));
check('…the published side shows its steps passing, with no failure', !/Expected:/.test(await pub.innerText()) && /Passed/.test(await pub.innerText()));
check('…the first click passed on the preview too, so the break is located at the calendar step, not earlier', /step-1-\S+ \(click\) Passed/.test(ptxt));

// 3. the rest of the table
const c3 = await compareNow('broken-calendar', 'broken-calendar'); check('both missing the calendar → Existing failure on both', c3.verdict === 'existing_failure_both', c3.verdict);
const c4 = await compareNow('broken-calendar', 'broken-link'); check('different failures → both failures shown, no regression verdict', c4.verdict === 'failed_differently' && c4.detail.published.failure !== c4.detail.preview.failure && /booking-calendar/.test(c4.detail.published.failure), JSON.stringify([c4.detail.published.failure, c4.detail.preview.failure]).slice(0, 300));
const c5 = await compareNow('broken-calendar', 'ok'); check('published fails, preview passes → Passing on preview, and production recovery needs a later production run', c5.verdict === 'passing_on_preview' && /later production run/.test(c5.detail.detail) && !/fixed|recovered/i.test(c5.detail.headline), c5.verdict);
const c6 = await compareNow('ok', 'blocked-link'); check('preview blocked by a safety rule → Comparison inconclusive; the published pass is preserved and shown; no regression is claimed', c6.verdict === 'inconclusive' && c6.published.status === 'passed' && /safety rule/.test(c6.detail.preview.inconclusive) && c6.detail.published.inconclusive === null, JSON.stringify(c6.detail.preview.inconclusive));
site.state.mode = 'ok'; preview.state.mode = 'ok'; await new Promise((r) => preview.close(() => r())); const c7 = await (async () => { const r = await api('POST', `/api/flows/${id}/comparisons`); for (let i = 0; i < 200; i++) { const c = (await api('GET', `/api/flows/${id}/comparisons`)).body.comparisons[0]; if (c?.id === r.body.id && c.status === 'done') return c; await sleep(1000); } })();
check('preview server unreachable → Comparison inconclusive (the start page could not be opened); the published pass is preserved', c7.verdict === 'inconclusive' && /start page could not be opened/.test(c7.detail.preview.inconclusive) && c7.published.status === 'passed', c7.verdict + ' ' + c7.detail.preview.inconclusive);
await listenB();
await p.reload(); const row2 = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); await row2.getByRole('button', { name: 'Last result' }).click(); await row2.locator('[data-testid=env-compare][data-verdict=inconclusive]').waitFor({ timeout: 30000 });
const itxt = (await row2.locator('[data-testid=env-compare]').innerText()).replace(/\s+/g, ' '); check('through the UI: inconclusive is explicit (“Comparison inconclusive”, “Not usable as evidence”) and the published result is still shown', /Comparison inconclusive/.test(itxt) && /Not usable as evidence: The start page could not be opened/.test(itxt) && /Published.*Passed/.test(itxt));

// 4. paired results stay out of the rerun history, and the approved version is untouched
const hist = (await api('GET', `/api/flows/${id}/runs`)).body.runs; const now = (await flowsNow()).flows.find((f) => f.id === id);
check('none of the comparison runs appear in the flow’s own run history, and the approved version and definition are unchanged', hist.length === 0 && now.version === 1 && JSON.stringify(now.definition) === before, `${hist.length} runs`);
check('the comparison list records the version each pair ran', (await api('GET', `/api/flows/${id}/comparisons`)).body.comparisons.every((c) => c.version === 1 && c.published && c.preview));

// 5. refusals
const other = await api('POST', `/api/projects/${pid}/flows`, { name: 'Elsewhere', startUrl: 'http://127.0.0.1:4356/', steps: [{ id: 's1', action: 'click', selector: '#a', expect: [] }] });
const refused = other.status === 201 ? await api('POST', `/api/flows/${other.body.id}/comparisons`) : null; check('a flow that starts on neither the live nor the preview address is refused', other.status === 201 && refused.status === 400 && refused.body.error === 'not_on_either', JSON.stringify(refused?.body));
check('another origin is refused (403)', (await p.request.fetch(`${base}/api/flows/${id}/comparisons`, { method: 'POST', headers: { origin: 'http://evil.test', 'content-type': 'application/json' } })).status() === 403);
await browser.close(); const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); stopAll(); process.exit(failed ? 1 : 0);
