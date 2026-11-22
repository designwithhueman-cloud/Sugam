// Scoring policy avara-score-1.0 (lib/avara/scoring.ts) on per-rule records: the category formula, what is excluded, the coverage requirement,
// the overall from unrounded category scores normalized over contributing categories, and the statuses. Pure; no browser or server.
// Run: node --experimental-strip-types test/scoring.mjs
const { scoreRecords, DEFAULT_PROFILE, SCORING_POLICY } = await import('../lib/avara/scoring.ts');
const { CATALOG, CATEGORIES } = await import('../lib/avara/catalog.ts');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const W = new Map(ruleLoader().loadAllRules({ includeDisabled: true }).map((r) => [r.ruleId, r.weight]));
const ADMITTED = ['A11Y-001', 'A11Y-002', 'A11Y-003', 'A11Y-005', 'A11Y-006', 'A11Y-009', 'A11Y-011', 'A11Y-012', 'A11Y-015', 'A11Y-020'];
// Every catalog rule ran and passed with a measured, full result unless a test changes it.
const recs = (o = {}, eligible = ADMITTED) => CATALOG.map((r) => ({ ruleId: r.id, category: r.category, weight: W.get(r.id) ?? 0, execution: 'ran', reason: null, outcome: 'observed_pass', method: 'measured', scope: 'full',
  scoreEligible: eligible.includes(r.id), observationOnly: (W.get(r.id) ?? 0) === 0 || r.mode === 'R', ...(o[r.id] ?? {}) }));
const cat = (s, c) => s.categories.find((x) => x.category === c);
const fail = { outcome: 'observed_failure' };

check('policy is versioned', SCORING_POLICY.version === 'avara-score-1.0');
check('the production library admits exactly the ten verified Accessibility rules', JSON.stringify(ruleLoader().loadAllRules().filter((r) => r.scoreEligible).map((r) => r.ruleId)) === JSON.stringify(ADMITTED));

// Worked example: A11Y-001 Color Contrast (weight 10) fails; the other nine admitted rules pass. Admitted weight 10+6+10+10+6+6+10+6+6+6 = 76.
const ex = scoreRecords(recs({ 'A11Y-001': fail }), DEFAULT_PROFILE); const a = cat(ex, 'accessibility');
check('worked example: Accessibility = 100 × 66 ÷ 76 = 86.84, shown as 87, from 10 scored rules', a.status === 'scored' && a.evaluatedWeight === 76 && a.passedWeight === 66 && Math.abs(a.raw - 6600 / 76) < 1e-9 && a.score === 87 && a.scoredRules === 10 && a.failedRules === 1, `${a.passedWeight}/${a.evaluatedWeight} = ${a.raw?.toFixed(2)}`);
check('…the overall uses the unrounded category score and says one category contributed', ex.overallRaw === a.raw && ex.overall === 87 && ex.contributing === 1 && ex.scorable === 8, `${ex.overallRaw?.toFixed(2)} from ${ex.contributing} of ${ex.scorable}`);
check('…categories with no admitted rule are "Insufficient coverage" with the reason', ['product_clarity', 'ux_workflow', 'mobile', 'trust', 'design', 'conversion', 'performance'].every((c) => cat(ex, c).status === 'insufficient' && cat(ex, c).score === null && /no rule in this category has been admitted/.test(cat(ex, c).note)));
check('…Differentiation is "Observation only", outside the score', cat(ex, 'differentiation').status === 'observation' && cat(ex, 'differentiation').score === null && /Observation only/.test(cat(ex, 'differentiation').note));

// Overall from two categories, normalized over contributing weights, from unrounded scores.
const twoElig = [...ADMITTED, 'PERF-001', 'PERF-002'];
const two = scoreRecords(recs({ 'A11Y-001': fail, 'PERF-002': fail }, twoElig), DEFAULT_PROFILE); const p = cat(two, 'performance');
const expect = (cat(two, 'accessibility').raw * CATEGORIES.accessibility.weight + p.raw * CATEGORIES.performance.weight) / (CATEGORIES.accessibility.weight + CATEGORIES.performance.weight);
check('two contributing categories: weights normalized over Accessibility (10) and Performance (15) only', Math.abs(two.overallRaw - expect) < 1e-9 && two.contributing === 2 && p.raw === 50, `${two.overallRaw.toFixed(3)} (Perf ${p.raw})`);
check('…rounding happens once: the overall is round(weighted unrounded mean), not a mean of rounded scores', two.overall === Math.round(expect));

// Each rule once, and what is left out of both sides.
const dup = scoreRecords([...recs({ 'A11Y-001': fail }), { ...recs()[0], ruleId: 'A11Y-001', outcome: 'observed_pass' }], DEFAULT_PROFILE);
check('each rule counts once (a second record for the same rule is ignored)', cat(dup, 'accessibility').evaluatedWeight === 76 && cat(dup, 'accessibility').failedRules === 1);
const ex2 = { 'A11Y-002': { scope: 'measurable_part' }, 'A11Y-003': { outcome: 'inconclusive' }, 'A11Y-005': { method: 'ai_assisted' }, 'A11Y-006': { outcome: 'needs_human_review' }, 'A11Y-009': { execution: 'not_applicable', outcome: 'not_applicable' }, 'A11Y-011': { method: 'rollup', scope: 'summary' } };
const exc = cat(scoreRecords(recs(ex2), DEFAULT_PROFILE), 'accessibility');
check('partial, inconclusive, AI-only, needs-a-person, not-applicable and summary results are excluded from both sides', exc.scoredRules === 4 && exc.evaluatedWeight === 10 + 6 + 6 + 6 && exc.excluded.length === 6, exc.excluded.map((x) => `${x.ruleId}: ${x.why}`).join('; '));
check('…not applicable still counts as covered, so the category is scored', exc.status === 'scored' && exc.score === 100);

// Coverage requirement (avara-coverage-0.1: every M/H rule of the category ran or was decided not applicable).
const skip = cat(scoreRecords(recs({ 'A11Y-013': { execution: 'skipped', reason: 'analyzer_error', outcome: 'not_run' } }), DEFAULT_PROFILE), 'accessibility');
check('one required check skipped: "Insufficient coverage" with the count and the reason, even though admitted rules passed', skip.status === 'insufficient' && skip.score === null && /1 required check did not run \(analyzer error\)/.test(skip.note), skip.note);
const hist = scoreRecords(CATALOG.map((r) => ({ ruleId: r.id, category: r.category, weight: W.get(r.id) ?? 0, execution: 'unknown', reason: 'unknown_historical', outcome: 'unknown', method: 'unknown', scope: 'none', scoreEligible: false, observationOnly: false })), DEFAULT_PROFILE);
check('a historical scan (no saved per-rule records, nothing admitted then) is not rescored: no number, with the reason', hist.overall === null && /No rule has been admitted/.test(hist.overallWithheld));
const allNa = cat(scoreRecords(recs(Object.fromEntries(ADMITTED.map((id) => [id, { execution: 'not_applicable', outcome: 'not_applicable' }]))), DEFAULT_PROFILE), 'accessibility');
check('every admitted rule not applicable: covered, but nothing to score, so "Insufficient coverage" says why', allNa.status === 'insufficient' && /none of the 10 admitted rules could be decided/.test(allNa.note), allNa.note);

// A genuine zero is a number; "not scored" is a status with a reason.
const zero = cat(scoreRecords(recs(Object.fromEntries(ADMITTED.map((id) => [id, fail]))), DEFAULT_PROFILE), 'accessibility');
check('every admitted rule failed: a genuine 0, scored, not null', zero.status === 'scored' && zero.score === 0 && zero.raw === 0);
const none = scoreRecords(recs({}, []), DEFAULT_PROFILE);
check('nothing admitted: no overall, with the reason, and never 100', none.overall === null && none.contributing === 0 && /No rule has been admitted/.test(none.overallWithheld));

// Determinism.
const shuffled = scoreRecords([...recs({ 'A11Y-001': fail })].reverse(), DEFAULT_PROFILE);
check('the same records in any order give the same result', JSON.stringify(shuffled) === JSON.stringify(ex));

const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
