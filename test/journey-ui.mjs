// Journey discovery through the real UI, from a homepage address only. On a copy of the seeded database, with the browser worker as a plain process and a
// small booking site that can be broken, fixed and changed. Nobody types a click:
//   Find journeys → the booking journey appears → edit what success means → Save as flow → run (passes) → the calendar disappears (fails at the right step) →
//   it comes back (fixed) → success is edited (version 2) → the site changes and is looked at again: the approved flow is untouched and a change is proposed →
//   the owner approves it (version 3) or keeps the approved flow.
// Run: node test/journey-ui.mjs   (needs a build and .data/test-snapshot; about 3 minutes)
import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from 'playwright';
const { createJourneySite } = await import('../fixture/apps/journey-site.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const SITE = 4352, WORKER = 18097, APP = 3393, TOKEN = 'journey-ui-token-' + Math.random().toString(36).slice(2, 12), ALLOW = `127.0.0.1:${SITE}`;
const site = createJourneySite({ mode: 'ok' }); await new Promise((r) => site.listen(SITE, '127.0.0.1', r));
const procs = []; const stopAll = () => { for (const p of procs) try { p.kill(); } catch { /* gone */ } site.close(); }; process.on('exit', stopAll);
const up = async (url, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(url)).status < 500) return true; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); } return false; };
const snap = JSON.parse(fs.readFileSync('.data/test-snapshot.json', 'utf8')); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-ui-')); const db = path.join(dir, 'db'); fs.cpSync('.data/test-snapshot', db, { recursive: true });
// the project's live address is the booking site (the database is opened here, then closed, before the app starts)
const set = spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', `import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; const d = await getDb(); await d.update(schema.projects).set({ liveUrl: 'http://127.0.0.1:${SITE}/' }).where(eq(schema.projects.id, '${snap.projects.agency}')); process.exit(0);`], { env: { ...process.env, PGLITE_DIR: db }, encoding: 'utf8' });
check('(setup) the project’s address is the booking site', set.status === 0, set.stderr?.slice(0, 200));
procs.push(spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(WORKER), WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW }, stdio: 'ignore' }));
procs.push(spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(APP)], { env: { ...process.env, PGLITE_DIR: db, WORKER_URL: `http://127.0.0.1:${WORKER}`, WORKER_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off' }, stdio: 'ignore' }));
check('the worker and the app started', (await up(`http://127.0.0.1:${WORKER}/health`)) && (await up(`http://127.0.0.1:${APP}/login`)));

const base = `http://127.0.0.1:${APP}`; const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const browser = await chromium.launch({ channel: 'chrome' }); const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
await p.goto(`${base}/login`); await p.fill('input[type=email]', creds.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', creds.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').press('Enter'); await p.waitForURL(/\/app/, { timeout: 30000 });
const pid = snap.projects.agency; await p.goto(`${base}/app/${snap.slugs.agency}/projects/${pid}/flows`);
const api = async (method, url, data) => { const r = await p.request.fetch(base + url, { method, headers: { origin: base, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const flowsNow = async () => (await api('GET', `/api/projects/${pid}/flows`)).body;
const runRow = async (row) => { await row.getByRole('button', { name: 'Run', exact: true }).click(); await row.getByRole('button', { name: 'Running…' }).waitFor({ timeout: 10000 }).catch(() => {}); await row.getByRole('button', { name: 'Run', exact: true }).waitFor({ timeout: 150000 }); const r = row.locator('[data-testid=flow-result]'); await r.waitFor({ timeout: 20000 }); const cmp = row.locator('[data-testid=flow-compare]');
  return { text: (await r.innerText()).replace(/\s+/g, ' '), compare: (await cmp.count()) ? await cmp.getAttribute('data-result') : null, steps: await r.locator('li').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' '))) }; };

// ---- 1. find journeys from the homepage address alone ----
check('the Flows page offers “Find journeys” for the project’s address, and no flow exists yet', await p.getByRole('button', { name: 'Find journeys' }).isVisible() && (await p.locator('[data-testid=flow-row]').count()) === 0);
await p.getByRole('button', { name: 'Find journeys' }).click(); await p.locator('[data-testid=discovery]').waitFor({ timeout: 120000 });
const booking = p.locator('[data-testid=journey][data-purpose=booking]'); const t = (await booking.first().innerText()).replace(/\s+/g, ' ');
check('exactly one booking journey is shown, with its steps in plain words', (await booking.count()) === 1 && /Open the home page/.test(t) && /Click ‘Book a call’/.test(t) && /Click ‘Choose a time’/.test(t) && /Land on \/book\/calendar/.test(t), t.slice(0, 200));
check('its suggested success is the calendar page, in plain words (address, heading, “booking calendar appears”)', /The address contains “\/book\/calendar”/.test(t) && /Pick a time/.test(t) && /The booking calendar appears/.test(t));
check('the footer’s duplicate links and the other pages did not make extra booking journeys; pricing and about were found', (await p.locator('[data-testid=journey][data-purpose=pricing]').count()) === 1 && /About us/.test(await p.locator('[data-testid=discovery]').innerText()));
check('the delete, log-out and file links were never requested by discovery', !site.hits.some((h) => ['/delete', '/logout', '/brochure.pdf'].includes(h)), site.hits.filter((h) => /delete|logout|pdf/.test(h)).join(','));

// ---- 2. the owner edits what success means, and saves ----
await booking.getByLabel('Also, the page says').fill('Mon 10:00'); await booking.getByLabel('Name', { exact: false }).fill('Visitor books a call');
await booking.getByRole('button', { name: 'Save as flow' }).click(); await p.getByText('Saved.').waitFor({ timeout: 20000 });
const row = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }); await row.waitFor({ timeout: 20000 });
const saved = (await flowsNow()).flows.find((f) => f.name === 'Visitor books a call'); const last = saved.definition.steps.at(-1);
check('saved through the UI with no clicks typed: two click steps, the calendar and the owner’s extra text as success, at version 1', saved.version === 1 && saved.definition.steps.length === 2 && saved.definition.steps.every((s) => s.action === 'click') && last.expect.some((e) => e.type === 'visible' && e.selector === '#booking-calendar') && last.expect.some((e) => e.type === 'text_contains' && e.text === 'Mon 10:00'), JSON.stringify(last.expect));
check('the saved journey now shows as saved, and cannot be saved twice', /Saved as “Visitor books a call”/.test(await booking.first().innerText()) && (await api('POST', `/api/discoveries/${(await api('GET', `/api/projects/${pid}/discoveries`)).body.discovery.id}/accept`, { journeyId: 'x' })).status === 404);

// ---- 3. run: passes; the calendar disappears: fails at the right step; it comes back: fixed ----
const r1 = await runRow(row); check('run 1: the discovered flow passes', /^Passed/.test(r1.text), r1.text.slice(0, 120));
site.state.mode = 'broken-calendar'; const r2 = await runRow(row); console.log('  run 2 →', r2.steps.map((x) => x.slice(0, 110)).join(' | '));
const stepStatus = (r, n) => r.steps.find((x) => x.includes(`step-${n}-`)) ?? '';
check('run 2 (the calendar is gone): fails, and at the second click, not the first', /^Failed/.test(r2.text) && /Passed/.test(stepStatus(r2, 1)) && /Failed/.test(stepStatus(r2, 2)), r2.steps.join(' | ').slice(0, 300));
check('…the failure names what was expected (the booking calendar), and the comparison calls it a regression', /#booking-calendar|visible/i.test(stepStatus(r2, 2)) && r2.compare === 'regressed', `compare=${r2.compare}`);
site.state.mode = 'ok'; const r3 = await runRow(row); check('run 3 (the calendar is back): passes and is reported as fixed', /^Passed/.test(r3.text) && r3.compare === 'fixed', `compare=${r3.compare}`);

// ---- 4. editing success creates a version ----
{ const f = (await flowsNow()).flows.find((x) => x.id === saved.id); const steps = f.definition.steps; const v = await api('POST', `/api/flows/${saved.id}/versions`, { success: [...steps.at(-1).expect, { type: 'text_contains', text: 'Tue 14:00' }], note: 'Also expect a Tuesday slot' });
  const list = await api('GET', `/api/flows/${saved.id}/versions`); check('editing the expectation approves version 2 and keeps version 1 in the history', v.status === 201 && v.body.version === 2 && list.body.versions.length === 2 && list.body.versions[1].definition.steps.at(-1).expect.length === steps.at(-1).expect.length && list.body.versions[0].note === 'Also expect a Tuesday slot');
  const bad = await api('POST', `/api/flows/${saved.id}/versions`, { success: [] }); check('an empty success condition is refused', bad.status === 400);
  await p.reload(); check('the Flows page shows version 2', /version 2/.test(await p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first().innerText())); }

// ---- 5. the site changes; rediscovery proposes, and does not edit ----
site.state.mode = 'changed'; const before = JSON.stringify((await flowsNow()).flows.find((f) => f.id === saved.id).definition);
await p.getByRole('button', { name: 'Look again' }).click(); await p.locator('[data-testid=discovery]').waitFor({ timeout: 120000 }); const prop = p.locator('[data-testid=flow-proposal][data-kind=changed]'); await prop.waitFor({ timeout: 30000 });
const after = (await flowsNow()).flows.find((f) => f.id === saved.id);
check('rediscovery found the renamed link and proposes a change, naming what changed', /Schedule a demo/.test(await prop.innerText()) && /Book a call/.test(await prop.innerText()));
check('the approved baseline is unchanged: same definition, still version 2', JSON.stringify(after.definition) === before && after.version === 2);
await p.reload(); check('the proposal is still there after a reload, and says the approved flow keeps running', /keeps running until you accept/.test(await p.locator('[data-testid=flow-proposal]').first().innerText()));
await p.locator('[data-testid=flow-proposal]').first().getByRole('button', { name: /Approve as version 3/ }).click(); await p.getByText('approved as a new version').waitFor({ timeout: 20000 });
const v3 = (await flowsNow()).flows.find((f) => f.id === saved.id); const lastV3 = v3.definition.steps.at(-1);
check('accepting makes version 3: the new path, with the owner’s success conditions kept (calendar, “Mon 10:00”) and the address condition updated', v3.version === 3 && v3.definition.steps[0].selector === 'a[href="/schedule"]' && lastV3.expect.some((e) => e.type === 'visible') && lastV3.expect.some((e) => e.type === 'text_contains' && e.text === 'Mon 10:00') && lastV3.expect.some((e) => e.type === 'url_contains' && e.value === '/schedule/calendar') && !lastV3.expect.some((e) => e.type === 'url_contains' && e.value === '/book/calendar'), JSON.stringify(lastV3.expect));
await p.reload(); const row3 = p.locator('[data-testid=flow-row]', { hasText: 'Visitor books a call' }).first(); const r4 = await runRow(row3); check('version 3 passes on the changed site', /^Passed/.test(r4.text), r4.text.slice(0, 120));
// dismissing keeps the approved flow
site.state.mode = 'ok'; await p.getByRole('button', { name: 'Look again' }).click(); await p.locator('[data-testid=flow-proposal][data-kind=changed]').first().waitFor({ timeout: 120000 });
await p.locator('[data-testid=flow-proposal]').first().getByRole('button', { name: 'Keep the approved flow' }).click(); await p.getByText('The approved flow is unchanged').waitFor({ timeout: 20000 });
const kept = (await flowsNow()); check('“Keep the approved flow” dismisses the proposal and leaves version 3 as it was', kept.flows.find((f) => f.id === saved.id).version === 3 && kept.proposals.length === 0);
await browser.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); stopAll(); process.exit(failed ? 1 : 0);
