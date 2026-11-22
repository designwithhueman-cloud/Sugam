// Scoring policy avara-score-2.0 (lib/avara/scoring.ts) on per-rule records: measured results of admitted checks only, every category scored
// (Differentiation included), "Couldn't score" with the reason, and the page score as the simple average of the scored categories. Pure.
// Run: node --experimental-strip-types test/scoring.mjs
const { scoreRecords, DEFAULT_PROFILE, SCORING_POLICY } = await import('../lib/avara/scoring.ts');
const { CATALOG } = await import('../lib/avara/catalog.ts');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const rules = ruleLoader().loadAllRules({ includeDisabled: true }); const W = new Map(rules.map((r) => [r.ruleId, r.weight]));
const ADMITTED = rules.filter((r) => r.scoreEligible).map((r) => r.ruleId);
const A11Y = ADMITTED.filter((id) => id.startsWith('A11Y-'));
// Every catalog rule ran; admitted checks measured a pass unless a test changes it.
const recs = (o = {}, eligible = ADMITTED) => CATALOG.map((r) => ({ ruleId: r.id, category: r.category, weight: W.get(r.id) ?? 0, execution: 'ran', reason: null, outcome: 'observed_pass', method: 'measured', scope: 'full', measured: 'observed_pass',
  scoreEligible: eligible.includes(r.id), observationOnly: (W.get(r.id) ?? 0) === 0 || r.mode === 'R', ...(o[r.id] ?? {}) }));
const cat = (s, c) => s.categories.find((x) => x.category === c);
const fail = { outcome: 'observed_failure', measured: 'observed_failure' };
const wsum = (ids) => ids.reduce((n, id) => n + W.get(id), 0);

check('policy is versioned', SCORING_POLICY.version === 'avara-score-2.0');
check('42 admitted checks, in all nine categories', ADMITTED.length === 42 && new Set(ADMITTED.map((id) => id.split('-')[0])).size === 9, String(ADMITTED.length));

// Worked example: A11Y-001 (weight 10) fails; every other admitted check passes.
const ex = scoreRecords(recs({ 'A11Y-001': fail }), DEFAULT_PROFILE); const a = cat(ex, 'accessibility'); const aw = wsum(A11Y);
check(`worked example: Accessibility = 100 × ${aw - 10} ÷ ${aw}`, a.status === 'scored' && a.evaluatedWeight === aw && a.passedWeight === aw - 10 && Math.abs(a.raw - (100 * (aw - 10)) / aw) < 1e-9 && a.score === Math.round((100 * (aw - 10)) / aw), `${a.passedWeight}/${a.evaluatedWeight} = ${a.raw.toFixed(2)}`);
check('…all nine categories are scored, Differentiation included', ex.contributing === 9 && ex.scorable === 9 && cat(ex, 'differentiation').status === 'scored');
const simple = ex.categories.reduce((n, c) => n + c.raw, 0) / 9;
check('…the page score is the simple average of the nine unrounded category scores', Math.abs(ex.overallRaw - simple) < 1e-9 && ex.overall === Math.round(simple), `${ex.overallRaw.toFixed(3)} → ${ex.overall}`);

// Measured results only: an AI opinion never moves a score.
const ai = cat(scoreRecords(recs({ 'TRUST-002': { method: 'ai_assisted', outcome: 'observed_pass', measured: 'observed_failure' } }), DEFAULT_PROFILE), 'trust');
check('a hybrid check counts by its measured result, even when AI said pass', ai.failedRules === 1 && ai.rules.find((r) => r.ruleId === 'TRUST-002').result === 'fail');
const aiOnly = cat(scoreRecords(recs({ 'TRUST-003': { method: 'ai_assisted', outcome: 'observed_pass', measured: null } }), DEFAULT_PROFILE), 'trust');
check('an AI-only result is left out of both sides, with the reason', aiOnly.excluded.some((x) => x.ruleId === 'TRUST-003' && /AI opinion only/.test(x.why)));
const ex2 = { 'A11Y-002': { measured: 'inconclusive', outcome: 'inconclusive' }, 'A11Y-003': { measured: 'needs_human_review', outcome: 'needs_human_review' }, 'A11Y-005': { execution: 'not_applicable', outcome: 'not_applicable', measured: null } };
const exc = cat(scoreRecords(recs(ex2), DEFAULT_PROFILE), 'accessibility');
check('inconclusive, needs-a-person and not-applicable count on neither side', exc.excluded.length === 3 && exc.scoredRules === A11Y.length - 3 && exc.status === 'scored', exc.excluded.map((x) => `${x.ruleId}: ${x.why}`).join('; '));

// Couldn't score.
const skip = cat(scoreRecords(recs({ 'PERF-001': { execution: 'skipped', reason: 'missing_input', outcome: 'not_run', measured: null } }), DEFAULT_PROFILE), 'performance');
check('an admitted check that did not run: "Couldn\'t score" with the count and the reason', skip.status === 'insufficient' && skip.score === null && /Couldn't score: 1 admitted check did not run \(missing input\)/.test(skip.note), skip.note);
const nonAdmittedSkip = cat(scoreRecords(recs({ 'A11Y-018': { execution: 'skipped', reason: 'needs_person', outcome: 'not_run', measured: null } }), DEFAULT_PROFILE), 'accessibility');
check('a skipped check that is not admitted (person or AI only) does not stop the category from being scored', nonAdmittedSkip.status === 'scored');
const allNa = cat(scoreRecords(recs(Object.fromEntries(A11Y.map((id) => [id, { execution: 'not_applicable', outcome: 'not_applicable', measured: null }]))), DEFAULT_PROFILE), 'accessibility');
check('every admitted check not applicable: "Couldn\'t score" says why', allNa.status === 'insufficient' && /none of the \d+ admitted checks could be decided/.test(allNa.note), allNa.note);
const partial = scoreRecords(recs({ 'PERF-001': { execution: 'skipped', reason: 'missing_input', outcome: 'not_run', measured: null } }), DEFAULT_PROFILE);
check('8 of 9 categories scored: the page score averages those eight and says so', partial.contributing === 8 && partial.scorable === 9 && Math.abs(partial.overallRaw - partial.categories.filter((c) => c.status === 'scored').reduce((n, c) => n + c.raw, 0) / 8) < 1e-9);
const none = scoreRecords(recs({}, []), DEFAULT_PROFILE);
check('nothing admitted: no page score, with the reason, never 100', none.overall === null && none.contributing === 0 && /Couldn't score: no check has been admitted/.test(none.overallWithheld));

// A genuine zero, each rule once, determinism.
const zero = cat(scoreRecords(recs(Object.fromEntries(A11Y.map((id) => [id, fail]))), DEFAULT_PROFILE), 'accessibility');
check('every admitted check failed: a genuine 0, scored, not null', zero.status === 'scored' && zero.score === 0);
const dup = scoreRecords([...recs({ 'A11Y-001': fail }), { ...recs()[0], ruleId: 'A11Y-001', measured: 'observed_pass' }], DEFAULT_PROFILE);
check('each rule counts once', cat(dup, 'accessibility').failedRules === 1 && cat(dup, 'accessibility').evaluatedWeight === aw);
check('the same records in any order give the same result', JSON.stringify(scoreRecords([...recs({ 'A11Y-001': fail })].reverse(), DEFAULT_PROFILE)) === JSON.stringify(ex));

const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
