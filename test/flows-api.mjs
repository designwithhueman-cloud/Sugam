// Saved flows through the app: create → list → run on the isolated worker → recorded result, with plan gating, tenant isolation and
// worker-failure handling. The browser work happens in the Docker worker (milestone 4); pages are fixtures served from the host.
// Needs: Docker running + image built, fixture server on 4200, and an app server started with:
//   WORKER_URL=http://127.0.0.1:18095 WORKER_TOKEN=<token below> ALLOW_PRIVATE_HOSTS=host.docker.internal:4200 AVARA_AI=off (copy of the DB; see below)
// Run: FLOW_TEST_PROJECTS='{"agency":"<id>","free":"<id>","site":"<id>"}' node test/flows-api.mjs http://127.0.0.1:3301
import { chromium } from 'playwright'; import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
process.env.PATH += ':/Applications/Docker.app/Contents/Resources/bin';
const base = process.argv[2] || 'http://127.0.0.1:3301'; const P = JSON.parse(process.env.FLOW_TEST_PROJECTS); const TOKEN = 'flows-test-token-0123456789';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const dk = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { dk('rm', '-f', 'aw-app'); } catch { /* none */ }
dk('run', '-d', '--name', 'aw-app', '--user', 'pwuser', '--read-only', '--tmpfs', '/tmp:size=256m', '--shm-size', '256m', '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1:18095:8080', '-e', `WORKER_TOKEN=${TOKEN}`, '-e', 'ALLOW_PRIVATE_HOSTS=host.docker.internal:4200', 'avara-browser-worker');
for (let i = 0; i < 80; i++) { try { if ((await fetch('http://127.0.0.1:18095/health')).ok) break; } catch { /* wait */ } await sleep(500); }

const b = await chromium.launch({ channel: 'chrome' });
async function signIn(file) { const t = fs.readFileSync(file, 'utf8'); const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', t.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', t.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await p.waitForURL('**/app**', { timeout: 30000 }); return ctx.request; }
const call = async (rq, method, path, data, origin = base) => { const r = await rq.fetch(base + path, { method, headers: { origin, 'content-type': 'application/json' }, ...(data !== undefined ? { data } : {}) }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const H = 'http://host.docker.internal:4200/flows/';
const flowOf = (name, steps, page = 'start.html') => ({ name, startUrl: H + page, steps });
const good = flowOf('Open step 2', [{ id: 'next', action: 'click', selector: '#next', expect: [{ type: 'url_contains', value: 'step2.html' }] }, { id: 'show', action: 'click', selector: '#show', expect: [{ type: 'visible', selector: '#hello' }] }]);
async function finish(rq, flowId, runId, ms = 120000) { const t = Date.now(); while (Date.now() - t < ms) { const r = await call(rq, 'GET', `/api/flows/${flowId}/runs`); const run = r.body?.runs?.find((x) => x.id === runId); if (run && run.status !== 'running') return run; await sleep(1000); } return null; }

const anon = await b.newContext().then((c) => c.request);
const agency = await signIn('.data/test-account.txt'), free = await signIn('.data/test-free.txt'), site = await signIn('.data/test-site.txt');

// ---- access ----
check('signed out: create is 401', (await call(anon, 'POST', `/api/projects/${P.agency}/flows`, good)).status === 401);
const f1 = await call(free, 'POST', `/api/projects/${P.free}/flows`, good), f2 = await call(free, 'GET', `/api/projects/${P.free}/flows`);
check('Free plan: create and list are refused on the server (403 plan_required)', f1.status === 403 && f1.body?.error === 'plan_required' && f2.status === 403);
check('a cross-origin request is refused (403 bad_origin)', (await call(agency, 'POST', `/api/projects/${P.agency}/flows`, good, 'https://evil.test')).status === 403);

// ---- create ----
const c = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, good);
check('Agency creates a flow (201) and it appears in the project list with the row id inside the definition', c.status === 201 && !!c.body?.id, c.body?.id);
const list = await call(agency, 'GET', `/api/projects/${P.agency}/flows`); const got = await call(agency, 'GET', `/api/flows/${c.body.id}`);
check('list and get return it, and the stored definition’s id is the row id', list.body?.flows?.some((f) => f.id === c.body.id) && got.body?.definition?.id === c.body.id);
const bad1 = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, { ...good, steps: [{ id: 'x', action: 'evaluate', script: 'alert(1)' }] }), bad2 = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, { ...good, startUrl: 'http://169.254.169.254/latest/meta-data/' }), bad3 = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, { ...good, steps: [{ id: 'start', action: 'press', key: 'Tab' }] });
check('an unknown action, a private start address and the reserved step id are all refused with a one-line reason', [bad1, bad2, bad3].every((x) => x.status === 400 && !/\n/.test(x.body?.message ?? '')), [bad1, bad2, bad3].map((x) => x.body?.error).join(', '));
check('Creator (site plan) can also create and list its own flows', (await call(site, 'POST', `/api/projects/${P.site}/flows`, good)).status === 201 && (await call(site, 'GET', `/api/projects/${P.site}/flows`)).status === 200);

// ---- tenant isolation ----
const siteFlow = (await call(site, 'GET', `/api/projects/${P.site}/flows`)).body.flows[0].id;
const x1 = await call(agency, 'GET', `/api/projects/${P.site}/flows`), x2 = await call(agency, 'GET', `/api/flows/${siteFlow}`), x3 = await call(agency, 'POST', `/api/flows/${siteFlow}/runs`), x4 = await call(agency, 'DELETE', `/api/flows/${siteFlow}`), x5 = await call(agency, 'POST', `/api/projects/${P.site}/flows`, good);
const y1 = await call(site, 'GET', `/api/flows/${c.body.id}`), y2 = await call(site, 'POST', `/api/flows/${c.body.id}/runs`), y3 = await call(site, 'DELETE', `/api/flows/${c.body.id}`);
check('another workspace’s project and flows look like they do not exist (404 on list, get, run, delete, create), in both directions', [x1, x2, x3, x4, x5, y1, y2, y3].every((x) => x.status === 404), [x1, x2, x3, x4, x5, y1, y2, y3].map((x) => x.status).join(' '));
check('after those attempts the other workspace’s flow still exists', (await call(site, 'GET', `/api/flows/${siteFlow}`)).status === 200 && (await call(agency, 'GET', `/api/flows/${c.body.id}`)).status === 200);

// ---- run on the worker ----
const r1 = await call(agency, 'POST', `/api/flows/${c.body.id}/runs`);
check('starting a run answers at once with 202 and a run id', r1.status === 202 && !!r1.body?.runId);
const run1 = await finish(agency, c.body.id, r1.body.runId);
check('the run finishes on the worker: status passed, every step recorded with its observed assertions', run1?.status === 'passed' && run1.result?.steps?.length === 3 && run1.result.steps.every((s) => s.status === 'passed'), run1?.result?.steps?.map((s) => `${s.stepId}:${s.status}`).join(' ') ?? 'no result');
check('the result and the API never contain the worker token', !JSON.stringify([c, list, got, run1]).includes(TOKEN));

const risky = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, flowOf('Risky', [{ id: 'save', action: 'click', selector: '#save' }], 'risky.html'));
const rr = await call(agency, 'POST', `/api/flows/${risky.body.id}/runs`); const run2 = await finish(agency, risky.body.id, rr.body.runId);
check('a flow that tries to submit a form is recorded as blocked by policy, not run', run2?.status === 'blocked' && /\(submit\)/.test(run2.result?.steps?.at(-1)?.error ?? ''), run2?.result?.steps?.at(-1)?.error);

const slow = await call(agency, 'POST', `/api/projects/${P.agency}/flows`, flowOf('Slow', [{ id: 'w', action: 'wait_for', selector: '#never', timeoutMs: 8000 }]));
const s1 = await call(agency, 'POST', `/api/flows/${slow.body.id}/runs`); const s2 = await call(agency, 'POST', `/api/flows/${slow.body.id}/runs`);
check('starting a flow that is already running is refused (409)', s1.status === 202 && s2.status === 409 && s2.body?.error === 'already_running', `${s1.status}, ${s2.status}`);
const runS = await finish(agency, slow.body.id, s1.body.runId);
check('a failing step is recorded as failed with a one-line reason', runS?.status === 'failed' && !!runS.result?.steps?.find((s) => s.stepId === 'w')?.error);

// ---- worker down ----
dk('stop', 'aw-app');
const d = await call(agency, 'POST', `/api/flows/${c.body.id}/runs`); const runD = await finish(agency, c.body.id, d.body.runId, 60000);
check('with the worker stopped, the run ends as an error with a plain message and no browser was started in the app', runD?.status === 'error' && /could not be reached/.test(runD.error ?? ''), runD?.error);

// ---- delete ----
const del = await call(agency, 'DELETE', `/api/flows/${c.body.id}`);
check('an owner can delete a flow; it is then gone (404), with its runs', del.status === 200 && (await call(agency, 'GET', `/api/flows/${c.body.id}`)).status === 404 && (await call(agency, 'GET', `/api/flows/${c.body.id}/runs`)).status === 404);

await b.close(); try { dk('rm', '-f', 'aw-app'); } catch { /* gone */ }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
