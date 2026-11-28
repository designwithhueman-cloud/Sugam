// M1 closing evidence on the journey-discovery build: three healthy runs of one approved version; a calendar that disappears while its page stays at the
// same address with HTTP 200 (the exact expected-versus-observed assertion); rediscovery while broken leaves the baseline intact; restore and rerun; an in-flight
// run stays on the version it started with; a retried or simultaneous proposal approval makes exactly one version; changing success starts a fresh baseline.
// Run: node test/journey-close.mjs   (needs a build and .data/test-snapshot; about 4 minutes)
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from 'playwright';
const { createJourneySite } = await import('../fixture/apps/journey-site.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const SITE = 4353, WORKER = 18098, APP = 3394, TOKEN = 'journey-ui-token-' + Math.random().toString(36).slice(2, 12), ALLOW = `127.0.0.1:${SITE}`;
const site = createJourneySite({ mode: 'ok' }); await new Promise((r) => site.listen(SITE, '127.0.0.1', r));
const procs = []; const stopAll = () => { for (const p of procs) try { p.kill(); } catch { /* gone */ } site.close(); }; process.on('exit', stopAll);
const up = async (url, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).status < 500) return true; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); } return false; };
const snap = JSON.parse(fs.readFileSync('.data/test-snapshot.json', 'utf8')); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-ui-')); const db = path.join(dir, 'db'); fs.cpSync('.data/test-snapshot', db, { recursive: true });
// the project's live address is the booking site (the database is opened here, then closed, before the app starts)
const set = spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', `import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; const d = await getDb(); await d.update(schema.projects).set({ liveUrl: 'http://127.0.0.1:${SITE}/' }).where(eq(schema.projects.id, '${snap.projects.agency}')); process.exit(0);`], { env: { ...process.env, PGLITE_DIR: db }, encoding: 'utf8' });
check('(setup) the project’s address is the booking site', set.status === 0, set.stderr?.slice(0, 200));
procs.push(spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(WORKER), WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW }, stdio: 'ignore' }));
procs.push(spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], { env: { ...process.env, PGLITE_DIR: db, WORKER_URL: `http://127.0.0.1:${WORKER}`, WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off', FLOW_RUNS_PER_WINDOW: '60' }, stdio: 'ignore' }));
check('the worker and the app started', (await up(`http://127.0.0.1:${WORKER}/health`)) && (await up(`http://127.0.0.1:${APP}/login`)));

const base = `http://127.0.0.1:${APP}`; const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const browser = await chromium.launch({ channel: 'chrome' }); const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
await p.goto(`${base}/login`); await p.fill('input[type=email]', creds.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').press('Enter'); await p.waitForURL(/\/app/, { timeout: 30000 });
const pid = snap.projects.agency; await p.goto(`${base}/app/${snap.slugs.agency}/projects/${pid}/flows`);
const api = async (method, url, data) => { const r = await p.request.fetch(base + url, { method, headers: { origin: base, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const flowsNow = async () => (await api('GET', `/api/projects/${pid}/flows`)).body;
const runRow = async (row) => { await row.getByRole('button', { name: 'Run', exact: true }).click(); await row.getByRole('button', { name: 'Running…' }).waitFor({ timeout: 10000 }).catch(() => {}); await row.getByRole('button', { name: 'Run', exact: true }).waitFor({ timeout: 150000 }); const r = row.locator('[data-testid=flow-result]'); await r.waitFor({ timeout: 20000 }); const cmp = row.locator('[data-testid=flow-compare]');
  return { text: (await r.innerText()).replace(/\s+/g, ' '), compare: (await cmp.count()) ? await cmp.getAttribute('data-result') : null, steps: await r.locator('li').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' '))) }; };

const api2 = api; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runs = async (id) => (await api('GET', `/api/flows/${id}/runs`)).body.runs;
const waitDone = async (id, runId) => { for (let i = 0; i < 120; i++) { const r = (await runs(id)).find((x) => x.id === runId); if (r && r.status !== 'running') return r; await sleep(700); } throw new Error('run did not finish'); };
const start = async (id) => { const r = await api('POST', `/api/flows/${id}/runs`); if (r.status !== 202) throw new Error(`run not started: ${r.status} ${JSON.stringify(r.body)}`); return r.body.runId; };
const runNow = async (id) => waitDone(id, await start(id));
const reloadPanel = () => p.reload();
const latestDisc = async () => (await api('GET', `/api/projects/${pid}/discoveries`)).body.discovery;
const rediscover = async () => { const was = (await latestDisc())?.id; await p.getByRole('button', { name: 'Look again' }).click(); for (let i = 0; i < 160; i++) { const d = await latestDisc(); if (d && d.id !== was && d.status !== 'running') return d; await sleep(700); } throw new Error('rediscovery did not finish'); };
const openLast = async (row) => { await row.getByRole('button', { name: 'Last result' }).click(); await row.locator('[data-testid=flow-result] ol li').first().waitFor({ timeout: 20000 }); };

// setup: discover and save the booking journey (success: address, heading, the calendar, and a slot)
await p.getByRole('button', { name: 'Find journeys' }).click(); await p.locator('[data-testid=discovery]').waitFor({ timeout: 120000 });
const booking = p.locator('[data-testid=journey][data-purpose=booking]'); await booking.getByLabel('Also, the page says').fill('Mon 10:00'); await booking.getByLabel('Name', { exact: false }).fill('Visitor books a call');
await booking.getByRole('button', { name: 'Save as flow' }).click(); await p.getByText('Saved.').waitFor({ timeout: 20000 });
const flow = (await flowsNow()).flows.find((f) => f.name === 'Visitor books a call'); const id = flow.id; const v1def = JSON.stringify(flow.definition);

// ---- 1. three consecutive healthy runs of one approved version ----
const healthy = []; for (let i = 0; i < 3; i++) healthy.push(await runNow(id));
check('three consecutive runs of version 1 all pass, each recorded as version 1', healthy.every((r) => r.status === 'passed' && r.version === 1), healthy.map((r) => `${r.status}/v${r.version}`).join(' '));
{ const list = await runs(id); const ordered = [...list].reverse(); const cmp = (await import('../packages/flow-engine/insights.ts')).compareRuns;
  check('…the second and third are compared with the one before and say “still passing”, with nothing new wrong', cmp(ordered[0].result, ordered[1].result).result === 'still_passing' && cmp(ordered[1].result, ordered[2].result).result === 'still_passing'); }

// ---- 2. the calendar disappears; its page stays at the same address and answers 200 ----
site.state.mode = 'broken-calendar';
const live = await fetch(`http://127.0.0.1:${SITE}/book/calendar`); const html = await live.text();
check('(setup) the calendar page is still at /book/calendar and still answers HTTP 200, but the calendar is not in it', live.status === 200 && !html.includes('booking-calendar') && html.includes('Pick a time'), `${live.status}`);
const bad = await runNow(id); const failedStep = bad.result.steps.find((s) => s.status === 'failed'); const asserts = failedStep?.assertions ?? [];
const cal = asserts.find((a) => a.assertion.type === 'visible');
check('the run fails at the second click (the first still passes)', bad.status === 'failed' && failedStep?.stepId.startsWith('step-2-') && bad.result.steps.find((s) => s.stepId.startsWith('step-1-'))?.status === 'passed');
check('expected versus observed, exactly: the address assertion passed at /book/calendar, the heading assertion passed, and the calendar assertion failed with observed “not visible or absent”', asserts.find((a) => a.assertion.type === 'url_contains')?.passed === true && asserts.find((a) => a.assertion.type === 'url_contains')?.observed.endsWith('/book/calendar') && asserts.find((a) => a.assertion.type === 'text_contains' && a.assertion.text === 'Pick a time')?.passed === true && cal?.passed === false && cal.assertion.selector === '#booking-calendar' && cal.observed === 'not visible or absent', JSON.stringify(cal));
check('…and the step error says the same in one line', failedStep?.error === 'Expected visible was not true: not visible or absent', failedStep?.error);
console.log('  expected:', JSON.stringify(cal?.assertion), '| observed:', cal?.observed, '| step error:', failedStep?.error);
await reloadPanel(); const rowB = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); await openLast(rowB);
{ const txt = (await rowB.innerText()).replace(/\s+/g, ' '); const cmpEl = rowB.locator('[data-testid=flow-compare]'); const res = (await cmpEl.count()) ? await cmpEl.getAttribute('data-result') : null; check('the page shows it in plain words and as a regression', /“#booking-calendar” should have been on the page, but Avara could not see it/.test(txt) && res === 'regressed', `compare=${res} text=${txt.slice(0, 400)}`); }

// ---- 3. rediscover while broken: the baseline stays intact ----
await rediscover(); await sleep(500);
const during = await flowsNow(); const f2 = during.flows.find((f) => f.id === id);
check('rediscovery while the calendar is missing: the approved flow is byte-for-byte the same, still version 1, and the success conditions still include the calendar', JSON.stringify(f2.definition) === v1def && f2.version === 1 && f2.definition.steps.at(-1).expect.some((e) => e.type === 'visible' && e.selector === '#booking-calendar'));
check('…and it proposed no change (the path is the same; only the page content is broken, which is the run’s job to report)', during.proposals.length === 0);
check('…the discovery list does not offer the broken page as a replacement: the journey is still “saved”', /Saved as “Visitor books a call”/.test(await p.locator('[data-testid=journey][data-purpose=booking]').first().innerText()));

// ---- 4. restore and rerun ----
site.state.mode = 'ok'; const back = await runNow(id); check('after the calendar is restored, the same version passes again', back.status === 'passed' && back.version === 1, `${back.status} ${back.error ?? ''}`);
{ const cmp = (await import('../packages/flow-engine/insights.ts')).compareRuns; check('…compared with the failed run, the result is “fixed”', !!back.result && cmp(bad.result, back.result).result === 'fixed'); }

// ---- 5. an in-flight run stays pinned to its version ----
site.state.slowCalendarMs = 4000; const inflightId = await start(id);
await sleep(800); const mid = (await runs(id)).find((x) => x.id === inflightId); check('(setup) the run is still in flight', mid.status === 'running');
const approve = await api('POST', `/api/flows/${id}/versions`, { success: [...f2.definition.steps.at(-1).expect, { type: 'text_contains', text: 'Tue 14:00' }], note: 'Also expect a Tuesday slot' });
check('(setup) version 2 is approved while that run is in flight', approve.status === 201 && approve.body.version === 2);
const done = await waitDone(id, inflightId); site.state.slowCalendarMs = 0;
check('the in-flight run finishes as version 1, and only version 1’s expectations were checked (no “Tue 14:00”)', done.version === 1 && done.status === 'passed' && !done.result.steps.flatMap((x) => x.assertions).some((a) => a.assertion.type === 'text_contains' && a.assertion.text === 'Tue 14:00') && done.result.steps.at(-1).assertions.length === f2.definition.steps.at(-1).expect.length);
const first2 = await runNow(id); check('the next run starts as version 2 and checks the new expectation', first2.version === 2 && first2.status === 'passed' && first2.result.steps.flatMap((x) => x.assertions).some((a) => a.assertion.type === 'text_contains' && a.assertion.text === 'Tue 14:00'));

// ---- 6. changing success starts a fresh comparison baseline ----
await reloadPanel(); const rowC = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); await openLast(rowC);
check('the first run of version 2 has no comparison box: it says it is the first run of version 2 (the version 1 runs are not its baseline)', (await rowC.locator('[data-testid=flow-compare]').count()) === 0 && /first run of version 2/.test(await rowC.locator('[data-testid=flow-first-run]').innerText()));
const strict = await api('POST', `/api/flows/${id}/versions`, { success: [...f2.definition.steps.at(-1).expect, { type: 'text_contains', text: 'Wed 09:00' }], note: 'A slot that does not exist' }); check('(setup) version 3 expects a slot that is not on the page', strict.status === 201 && strict.body.version === 3);
const first3 = await runNow(id); check('its first run fails, and is recorded as version 3', first3.status === 'failed' && first3.version === 3);
await reloadPanel(); const rowD = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); await openLast(rowD);
check('…and it is NOT called a regression: there is no earlier run of version 3, so no comparison, and the page says so', (await rowD.locator('[data-testid=flow-compare]').count()) === 0 && /first run of version 3/.test(await rowD.locator('[data-testid=flow-first-run]').innerText()));
const second3 = await runNow(id); await reloadPanel(); const rowE = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); await openLast(rowE);
check('the second run of version 3 is compared with the first run of version 3 (still failing), not with version 2', second3.status === 'failed' && (await rowE.locator('[data-testid=flow-compare]').getAttribute('data-result')) === 'still_failing');
// back to a passing expectation for the proposal tests
const v4 = await api('POST', `/api/flows/${id}/versions`, { success: f2.definition.steps.at(-1).expect, note: 'Back to the approved expectation' }); check('(setup) version 4 restores the working expectation', v4.status === 201 && v4.body.version === 4);

// ---- 7. approving a proposal: simultaneous and repeated approvals make exactly one version ----
site.state.mode = 'changed'; await rediscover(); const prop = p.locator('[data-testid=flow-proposal][data-kind=changed]').first(); await prop.waitFor({ timeout: 120000 });
const pid1 = (await flowsNow()).proposals.find((x) => x.flowId === id).id; const vBefore = (await flowsNow()).flows.find((f) => f.id === id).version;
const [a1, a2, a3] = await Promise.all([api('POST', `/api/proposals/${pid1}`, { decision: 'accept' }), api('POST', `/api/proposals/${pid1}`, { decision: 'accept' }), api('POST', `/api/proposals/${pid1}`, { decision: 'accept' })]);
const retry = await api('POST', `/api/proposals/${pid1}`, { decision: 'accept' });
const statuses = [a1, a2, a3].map((x) => x.status).sort(); const vers = (await api('GET', `/api/flows/${id}/versions`)).body;
check('three simultaneous approvals: exactly one succeeds, the others are refused, and the flow moves by exactly one version', statuses.filter((s) => s === 200).length === 1 && statuses.filter((s) => s !== 200).length === 2 && vers.current === vBefore + 1, JSON.stringify(statuses));
check('a later retry of the same approval is refused and creates nothing', retry.status !== 200 && (await api('GET', `/api/flows/${id}/versions`)).body.current === vBefore + 1 && vers.versions.length === vBefore + 1, `${retry.status}`);
check('…the proposal is recorded once, as accepted, and no pending proposal remains', (await flowsNow()).proposals.length === 0);
// a proposal made for an older version cannot be applied to a newer one
site.state.mode = 'ok'; await rediscover(); await p.reload(); await p.locator('[data-testid=flow-proposal][data-kind=changed]').first().waitFor({ timeout: 30000 });
const stale = (await flowsNow()).proposals.find((x) => x.flowId === id); const bump = await api('POST', `/api/flows/${id}/versions`, { success: f2.definition.steps.at(-1).expect, note: 'An edit made after the proposal was found' });
const late = await api('POST', `/api/proposals/${stale.id}`, { decision: 'accept' }); check('a proposal found for an older version is refused after the flow moves on, and nothing is created', bump.status === 201 && late.status === 409 && late.body.error === 'stale_proposal' && (await api('GET', `/api/flows/${id}/versions`)).body.current === bump.body.version, `${late.status} ${late.body?.error}`);
await browser.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); stopAll(); process.exit(failed ? 1 : 0);
