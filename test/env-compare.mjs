// Pure checks for comparing one flow version on two environments: moving a flow to another origin, and what two results mean together.
// Run: node --experimental-strip-types test/env-compare.mjs
const { retarget, compareEnvironments, failureKey, inconclusiveReason } = await import('../packages/flow-engine/environments.ts');
let pass = 0, fail = 0; const ok = (c, m, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', m, x); } };
const A = (type, extra, passed, observed = 'x') => ({ assertion: { type, ...extra }, passed, observed });
const st = (stepId, status, o = {}) => ({ stepId, action: 'click', status, ms: 5, urlAfter: null, error: null, assertions: [], screenshot: null, ...o });
const run = (status, steps, o = {}) => ({ flowId: 'f', status, startedAt: 'x', ms: 1, steps, consoleErrors: [], failedRequests: [], attempts: 1, flaky: false, ...o });
const start = () => st('start', 'passed', { action: 'goto' });
const PASS = () => run('passed', [start(), st('s1', 'passed'), st('s2', 'passed', { assertions: [A('visible', { selector: '#cal' }, true, 'visible')] })]);
const CAL = (sel = '#cal') => run('failed', [start(), st('s1', 'passed'), st('s2', 'failed', { error: 'Expected visible was not true: not visible or absent', assertions: [A('visible', { selector: sel }, false, 'not visible or absent')] })]);
const side = (r, o = {}) => ({ status: r.status, run: r, error: null, ...o });
const V = (p, v) => compareEnvironments(side(p), side(v));

// origin swap
{ const flow = { id: 'f', name: 'n', startUrl: 'https://www.example.com/book?x=1', steps: [{ id: 'a', action: 'click', selector: '#a', expect: [] }, { id: 'g', action: 'goto', url: 'https://www.example.com/pricing', expect: [] }, { id: 'h', action: 'goto', url: 'https://other.example.org/x', expect: [] }] };
  const r = retarget(flow, 'https://www.example.com', 'https://preview.example.com'); ok(r.startUrl === 'https://preview.example.com/book?x=1' && r.steps[1].url === 'https://preview.example.com/pricing', 'start address and goto steps move to the other origin, path and query kept');
  ok(r.steps[0].selector === '#a' && r.steps[2].url === 'https://other.example.org/x' && flow.startUrl === 'https://www.example.com/book?x=1', 'selectors, expectations and addresses on other sites are untouched, and the original is not modified'); }

// the five verdicts
ok(V(PASS(), PASS()).verdict === 'passed_both' && V(PASS(), PASS()).headline === 'Passed on both', 'both pass → Passed on both');
{ const c = V(PASS(), CAL()); ok(c.verdict === 'preview_regression' && c.headline === 'Preview regression', 'published passes, preview calendar missing → Preview regression'); ok(c.preview.failedStep === 's2' && /#cal/.test(c.preview.failure) && /not visible or absent/.test(c.preview.failure) && c.published.failure === null, 'the preview side names the failed step and the expected and observed'); }
ok(V(CAL(), CAL()).verdict === 'existing_failure_both' && V(CAL(), CAL()).headline === 'Existing failure on both', 'both fail on the same assertion → Existing failure on both');
{ const c = V(CAL('#cal'), CAL('#other')); ok(c.verdict === 'failed_differently' && c.published.failure !== c.preview.failure && /#cal/.test(c.published.failure) && /#other/.test(c.preview.failure), 'both fail on different assertions → both failures shown, no shared verdict'); }
{ const other = run('failed', [start(), st('s1', 'failed', { error: 'The page answered 404.' })]); ok(V(CAL(), other).verdict === 'failed_differently', 'a failure at a different step is a different failure'); }
{ const c = V(CAL(), PASS()); ok(c.verdict === 'passing_on_preview' && c.headline === 'Passing on preview' && /later production run/.test(c.detail), 'published fails, preview passes → Passing on preview, and recovery needs a later production run'); ok(!/fixed|recovered/i.test(c.headline), '…never worded as fixed or recovered'); }

// inconclusive: either side, with the other preserved
{ const blocked = run('blocked', [start(), st('s1', 'passed'), st('s2', 'blocked', { error: 'Blocked by policy (destructive_text): “Buy now” looks like an action that changes, spends or sends something.' })]);
  const c = V(PASS(), blocked); ok(c.verdict === 'inconclusive' && c.headline === 'Comparison inconclusive' && /Avara verified 1 step, then stopped before ‘Buy now’/.test(c.preview.inconclusive) && c.published.inconclusive === null && c.published.status === 'passed', 'preview blocked → inconclusive, with the safety reason, and the published result preserved');
  const d = V(blocked, PASS()); ok(d.verdict === 'inconclusive' && d.published.inconclusive && !d.preview.inconclusive && d.preview.status === 'passed', 'published blocked → inconclusive, preview preserved');
  ok(V(blocked, blocked).verdict === 'inconclusive' && V(blocked, blocked).published.inconclusive && V(blocked, blocked).preview.inconclusive, 'both blocked → inconclusive, both reasons shown'); }
{ const down = run('failed', [st('start', 'failed', { action: 'goto', error: 'net::ERR_CONNECTION_REFUSED' })]); const c = V(PASS(), down); ok(c.verdict === 'inconclusive' && /start page could not be opened/.test(c.preview.inconclusive), 'a start page that cannot be opened is inconclusive, never a regression'); ok(V(PASS(), down).verdict !== 'preview_regression', '…explicitly not a regression'); }
{ const c = compareEnvironments(side(PASS()), { status: 'error', run: null, error: 'The worker is busy. Try again shortly.' }); ok(c.verdict === 'inconclusive' && /The worker is busy/.test(c.preview.inconclusive) && c.published.status === 'passed', 'a run that errored is inconclusive and says why; the other side stays'); }
{ const flaky = { ...PASS(), flaky: true }; ok(V(flaky, CAL()).verdict === 'inconclusive' && /different answers/.test(V(flaky, CAL()).published.inconclusive), 'an unreliable run (different answers when repeated) is inconclusive'); }
{ const c = compareEnvironments({ status: 'missing', run: null, error: null }, side(PASS())); ok(c.verdict === 'inconclusive', 'a run that did not happen is inconclusive'); }
ok(failureKey(PASS()) === null && failureKey(CAL()) === failureKey(CAL()) && failureKey(CAL()) !== failureKey(CAL('#z')) && inconclusiveReason(side(PASS())) === null, 'failure keys: none for a pass, equal for equal failures, different for different ones');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
