// Milestone 1 acceptance: the hard-coded flow passes on Fixture A 10 times in a row, and fails at the expected step on Fixture B 10 times in a row.
// Run: node --experimental-strip-types test/milestone1.mjs
import fs from 'node:fs'; import path from 'node:path';
const PA = 4311, PB = 4312; process.env.ALLOW_PRIVATE_HOSTS = `127.0.0.1:${PA},127.0.0.1:${PB}`;   // set before the URL guard is loaded
const { createApp, ALL_DEFECTS } = await import('../fixture/apps/customer-app.mjs');
const { customerFlow, EXPECTED_BROKEN_STEP } = await import('../fixture/flows/customer-create.mjs');
const { runFlow } = await import('../packages/flow-engine/index.ts');
const { Flow } = await import('../packages/contracts/index.ts');
const flowFor = (base) => Flow.parse(customerFlow(base));   // same parsing a saved flow gets
const OUT = process.env.SHOTS_DIR ?? path.resolve('.data/flow-runs/milestone1'); fs.rmSync(OUT, { recursive: true, force: true });

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const listen = (s, port) => new Promise((r) => s.listen(port, '127.0.0.1', r));
const A = createApp({ name: 'a' }), B = createApp({ name: 'b', defects: ALL_DEFECTS }); await listen(A, PA); await listen(B, PB);
const reset = (port) => fetch(`http://127.0.0.1:${port}/__reset`, { method: 'POST' });
const run = async (port, dir) => { await reset(port); return runFlow(flowFor(`http://127.0.0.1:${port}`), { testLogin: true, screenshotDir: dir }); };

const a = []; for (let i = 1; i <= 10; i++) a.push(await run(PA, path.join(OUT, `A-${i}`)));
ok(a.every((r) => r.status === 'passed'), `A passes 10/10 (got ${a.map((r) => r.status).join(',')})`);
ok(a.every((r) => r.steps.length === 12 && r.steps.every((s) => s.status === 'passed')), 'A: every step passed');
ok(a.every((r) => r.consoleErrors.length === 0 && r.failedRequests.length === 0), 'A: no console errors or failed requests');
ok(a.every((r) => r.steps.every((s) => s.screenshot && fs.existsSync(path.join(OUT, `A-${a.indexOf(r) + 1}`, s.screenshot)))), 'A: every step has a screenshot on disk');

const b = []; for (let i = 1; i <= 10; i++) b.push(await run(PB, path.join(OUT, `B-${i}`)));
const firstBad = (r) => r.steps.find((s) => s.status !== 'passed')?.stepId;
ok(b.every((r) => r.status === 'failed'), `B fails 10/10 (got ${b.map((r) => r.status).join(',')})`);
ok(b.every((r) => firstBad(r) === EXPECTED_BROKEN_STEP), `B fails at ${EXPECTED_BROKEN_STEP} every time (got ${b.map(firstBad).join(',')})`);
ok(b.every((r) => r.steps.find((s) => s.stepId === 'confirm_saved')?.status === 'passed'), 'B: the fake success toast is seen before the failure');
ok(b.every((r) => r.steps.slice(r.steps.findIndex((s) => s.stepId === EXPECTED_BROKEN_STEP) + 1).every((s) => s.status === 'skipped')), 'B: later steps are skipped');
ok(b.every((r) => r.failedRequests.some((f) => f.status === 500 && /api\/customers/.test(f.url))), 'B: the 500 on the save request is recorded');
ok(b.every((r) => r.consoleErrors.some((e) => /analytics/.test(e))), 'B: the console error is recorded');
ok(b.every((r) => r.steps.every((s) => s.ms >= 0)) && b.every((r) => r.ms > 0), 'B: timings recorded');

// the fixture-only allowance cannot be used on a real site
await runFlow({ ...flowFor('http://example.com'), startUrl: 'http://example.com/login' }, { testLogin: true }).then(() => ok(false, 'testLogin refused off this computer'), (e) => ok(/only for fixture/.test(e.message), 'testLogin refused off this computer'));
// and without it the safety rules still stop the login
await reset(PA); const guarded = await runFlow(flowFor(`http://127.0.0.1:${PA}`));
ok(guarded.status === 'blocked' && guarded.steps.find((s) => s.status === 'blocked')?.stepId === 'fill_password', 'without testLogin the password step is blocked');

A.close(); B.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
