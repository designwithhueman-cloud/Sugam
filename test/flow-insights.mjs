// Pure checks for settleRun, compareRuns and plainStep. Run: node --experimental-strip-types test/flow-insights.mjs
const { settleRun, compareRuns, plainStep } = await import('../packages/flow-engine/insights.ts');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const st = (stepId, status, extra = {}) => ({ stepId, action: 'click', status, ms: 5, urlAfter: null, error: null, assertions: [], screenshot: null, ...extra });
const run = (status, steps, extra = {}) => ({ flowId: 'f', status, startedAt: 'x', ms: 1000, steps, consoleErrors: [], failedRequests: [], attempts: 1, flaky: false, ...extra });
const PASS = () => run('passed', [st('a', 'passed'), st('b', 'passed')]);
const FAILB = () => run('failed', [st('a', 'passed'), st('b', 'failed', { error: 'Timeout 5000ms exceeded' })]);
const FAILA = () => run('failed', [st('a', 'failed', { error: 'x' }), st('b', 'skipped')]);
const seq = (...rs) => { let i = 0; const f = async () => rs[i++]; f.calls = () => i; return f; };

// settleRun
{ const f = seq(PASS()); const r = await settleRun(f); ok(r.status === 'passed' && r.attempts === 1 && !r.flaky && f.calls() === 1, 'a passing run is not repeated'); }
{ const f = seq(FAILB(), PASS()); const r = await settleRun(f); ok(r.status === 'passed' && r.attempts === 2 && r.flaky && f.calls() === 2, 'fails then passes: reported as passed but flaky'); }
{ const f = seq(FAILB(), FAILB()); const r = await settleRun(f); ok(r.status === 'failed' && r.attempts === 2 && !r.flaky, 'fails twice at the same step: a confirmed failure'); }
{ const f = seq(FAILB(), FAILA()); const r = await settleRun(f); ok(r.status === 'failed' && r.attempts === 2 && r.flaky, 'fails at different steps: failed and flaky'); }
{ const f = seq(run('blocked', [st('a', 'blocked')])); const r = await settleRun(f); ok(r.status === 'blocked' && f.calls() === 1, 'a blocked run is never repeated'); }
{ const f = seq({ ...FAILB(), ms: 40000 }, PASS()); const r = await settleRun(f, { maxMs: 60000 }); ok(r.status === 'failed' && f.calls() === 1, 'a slow failed run is not repeated'); }
{ let n = 0; const f = async () => { n++; if (n === 2) throw new Error('worker down'); return FAILB(); }; await settleRun(f).then(() => ok(false, 'worker error on the repeat surfaces'), (e) => ok(/worker down/.test(e.message), 'worker error on the repeat surfaces')); }

// compareRuns
{ const c = compareRuns(FAILB(), PASS()); ok(c.result === 'fixed' && c.steps.some((s) => s.stepId === 'b' && s.outcome === 'fixed'), 'failed then passed: fixed'); }
{ const c = compareRuns(PASS(), FAILB()); ok(c.result === 'regressed' && c.steps.some((s) => s.stepId === 'b' && s.outcome === 'newly_failing') && /Fix this first/.test(c.summary), 'passed then failed: regressed, flagged as first thing to fix'); }
{ const c = compareRuns(FAILB(), FAILB()); ok(c.result === 'still_failing' && c.steps[0].outcome === 'still_failing' || c.steps.some((s) => s.outcome === 'still_failing'), 'failed twice: still failing'); }
{ const c = compareRuns(FAILB(), run('failed', [st('a', 'failed'), st('b', 'skipped')])); ok(c.steps.some((s) => s.stepId === 'a' && s.outcome === 'newly_failing'), 'a step that passed before and now fails earlier is newly failing'); }
{ const c = compareRuns(PASS(), { ...PASS(), consoleErrors: ['boom'], failedRequests: [{ url: 'http://x/api?a=1', status: 500, reason: 'HTTP error' }] });
  ok(c.result === 'still_passing' && c.newConsoleErrors.length === 1 && c.newFailedRequests.length === 1 && /new errors/.test(c.summary), 'still passing but new errors appeared is called out');
  const same = compareRuns({ ...PASS(), consoleErrors: ['boom'] }, { ...PASS(), consoleErrors: ['boom'] }); ok(same.newConsoleErrors.length === 0 && /nothing new/.test(same.summary), 'an error that was already there is not new'); }
{ const c = compareRuns(FAILB(), { ...PASS(), flaky: true, attempts: 2 }); ok(c.result === 'unreliable', 'a flaky run is never reported as a clean comparison'); }

// plainStep
{ ok(plainStep(st('a', 'passed')) === null && plainStep(st('a', 'skipped')) === null, 'passing and skipped steps have no explanation');
  ok(/Avara did not do this step on purpose: “Save” submits a form/.test(plainStep(st('a', 'blocked', { error: 'Blocked by policy (submit): “Save” submits a form (POST).' }))), 'blocked step explained as deliberate');
  ok(/could not find or use the button or link/.test(plainStep(st('a', 'failed', { error: 'Timeout 5000ms exceeded.' }))), 'a timeout is explained without selector jargon');
  ok(/should have said “Customer saved”/.test(plainStep(st('a', 'failed', { error: 'Expected text contains was not true: ', assertions: [{ passed: false, observed: 'nothing', assertion: { type: 'text_contains', text: 'Customer saved' } }] }))), 'a failed assertion says what should have happened');
  ok(/returned an error \(500\)/.test(plainStep(st('a', 'failed', { action: 'goto', error: 'The page answered 500.' }))), 'an HTTP error is explained');
  ok(plainStep(st('a', 'failed', { error: 'weird' })) === 'This step did not work.', 'unknown errors fall back to a plain sentence'); }

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
