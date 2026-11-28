// Why checks did not run: every skipped rule keeps the reason saved with it, an implemented detector that was skipped is never filed under
// "AI unavailable", and each reason maps to what would let the rule run (or "reason unavailable"). No browser or server needed.
// Run: node --experimental-strip-types test/not-run-reasons.mjs
const { CategoryEvaluator } = await import('../src/engines/rule-engine/RuleEvaluator.ts');
const { REASONS } = await import('../src/engines/rule-engine/RuleCoverage.ts');
const { reasonLabel, remedyFor, REMEDY } = await import('../lib/coverage-copy.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
class Probe extends CategoryEvaluator { category = 'x'; name = 'x'; slice() { return {}; } }
const base = { category: 'x', title: 't', severity: 'medium', weight: 1, evaluationPrompt: 'p', scoreEligible: false };
const ctx = (detectors) => ({ url: '', goal: null, screenshots: [], pageContent: '', metadata: {}, lighthouseResults: null, axeResults: null, detectors });
delete process.env.AVARA_AI;
const { outcomes } = await new Probe().evaluate(ctx({ d1: { ran: false, hits: [], note: 'The in-page capture did not complete.' }, d2: { ran: true, hits: [] } }), [
  { ...base, ruleId: 'HYB-1', evaluator: { type: 'llm', detectors: ['d1'] } },     // hybrid, its detector skipped
  { ...base, ruleId: 'HYB-2', evaluator: { type: 'llm', detectors: ['d2'] } },     // hybrid, its detector ran clean
  { ...base, ruleId: 'AI-1', evaluator: { type: 'llm' } },                          // judgement only
  { ...base, ruleId: 'DET-1', evaluator: { type: 'detector', detectors: ['d1'] } }, // detector only, skipped
], null);
const o = (id) => outcomes.find((x) => x.ruleId === id);
check('hybrid rule whose detector was skipped keeps the detector reason (missing input), not "AI unavailable"', o('HYB-1').result === 'not_run' && o('HYB-1').skip === 'missing_input' && /capture did not complete/.test(o('HYB-1').observation), `${o('HYB-1').skip}: ${o('HYB-1').observation}`);
check('hybrid rule whose detector ran keeps the measured answer with AI off', o('HYB-2').result === 'observed_pass');
check('judgement-only rule with AI off is "AI unavailable", and says why', o('AI-1').skip === 'ai_unavailable' && /AVARA_AI/.test(o('AI-1').observation));
check('detector-only rule that was skipped is missing input, never AI unavailable', o('DET-1').skip === 'missing_input');
check('only judgement-only rules can be filed as AI unavailable', outcomes.filter((x) => x.skip === 'ai_unavailable').every((x) => x.ruleId === 'AI-1'));
const live = REASONS.filter((r) => r !== 'unknown_historical' && r !== 'not_applicable');
check('every skip reason has a plain label and says what would let the rule run', live.every((r) => reasonLabel(r) && REMEDY[r]), live.filter((r) => !REMEDY[r]).join(','));
check('a missing or historical reason reads "reason unavailable"', reasonLabel(null) === 'reason unavailable' && reasonLabel('unknown_historical') === 'reason unavailable' && /^Reason unavailable/.test(remedyFor(null)));
// A model that gives no answer (rate limit, overload) leaves the rule not run with its own reason, listed with the others, never "inconclusive".
const quiet = { model: 'stub', async evaluate(i) { return i.rules.map((r) => ({ ruleId: r.ruleId, result: 'inconclusive', observation: 'Not decided: the Gemini free-tier rate limit was reached. This says nothing about the page.', evidence: [], confidence: 0, undecided: true })); } };
const rl = await new Probe().evaluate(ctx({}), [{ ...base, ruleId: 'AI-2', evaluator: { type: 'llm' } }], quiet);
check('rate-limited model: the rule is not run with reason ai_no_answer and the provider message', rl.outcomes[0].result === 'not_run' && rl.outcomes[0].skip === 'ai_no_answer' && /rate limit/.test(rl.outcomes[0].observation) && rl.judged === 0, rl.outcomes[0].observation);
const rl2 = await new Probe().evaluate(ctx({ d2: { ran: true, hits: [] } }), [{ ...base, ruleId: 'HYB-3', evaluator: { type: 'llm', detectors: ['d2'] } }], quiet);
check('rate-limited model on a hybrid rule whose detector passed: the measured pass stands, with a note', rl2.outcomes[0].result === 'observed_pass' && /judgement part did not run/.test(rl2.outcomes[0].observation), rl2.outcomes[0].observation);
check('ai_no_answer reads "AI gave no answer" and says to rescan later or raise the quota', reasonLabel('ai_no_answer') === 'AI gave no answer' && /Rescan later/.test(remedyFor('ai_no_answer')));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
