// The detector specification covers every rule, uses only the allowed detector types, and agrees with the rule JSON.
// Run: node --experimental-strip-types test/detector-spec.mjs
import fs from 'node:fs';
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const spec = JSON.parse(fs.readFileSync('src/detectors/detector-specs.json', 'utf8')); const rules = new RuleLoader().loadAllRules({ includeDisabled: true });
const TYPES = new Set(['DOM', 'Playwright', 'Screenshot Analysis', 'Lighthouse', 'Axe', 'AI Judgement', 'Hybrid', 'None (human session)', 'None (rollup)']);
const bySpec = new Map(spec.specs.map((s) => [s.ruleId, s]));
check('every rule has exactly one specification, and there are no extras', spec.specs.length === rules.length && bySpec.size === rules.length && rules.every((r) => bySpec.has(r.ruleId)));
check('detector types come only from the allowed set; Hybrid names its components', spec.specs.every((s) => TYPES.has(s.detectorType)) && spec.specs.filter((s) => s.detectorType === 'Hybrid').every((s) => s.components.length >= 2 && s.components.every((c) => TYPES.has(c))));
check('every spec answers all five questions', spec.specs.every((s) => s.canBeEvaluatedAutomatically && s.detectorType && s.requiredData.length && s.evidence.length && s.outcomes.pass && s.outcomes.fail && s.outcomes.couldNotVerify));
check('human-session and rollup rules are never marked automatic; rollups match the rule JSON', spec.specs.every((s) => (!s.detectorType.startsWith('None') || s.canBeEvaluatedAutomatically === 'no') && (s.detectorType !== 'None (rollup)' || rules.find((r) => r.ruleId === s.ruleId).evaluator.type === 'rollup') && (s.detectorType !== 'None (human session)' || rules.find((r) => r.ruleId === s.ruleId).evaluator.type === 'human')));
check('"implementation" agrees with the rule JSON: built iff the rule names a detector', spec.specs.every((s) => { const r = rules.find((x) => x.ruleId === s.ruleId); const det = r.evaluator?.detectors ?? []; return (s.implementation.status === 'partial') === det.length > 0 && JSON.stringify(s.implementation.detectors) === JSON.stringify(det); }));
check('assisted (AI) rules are capped as advisory; measured rules are not', spec.specs.filter((s) => s.canBeEvaluatedAutomatically === 'assisted').every((s) => /advisory/.test(s.confidenceCeiling)) && spec.specs.filter((s) => s.canBeEvaluatedAutomatically === 'full').every((s) => /high/.test(s.confidenceCeiling)));
check('the performance rules never substitute lab metrics for INP', /never substituted/.test(bySpec.get('PERF-003').outcomes.couldNotVerify));
check('the generated document lists every rule', (() => { const md = fs.readFileSync('docs/Avara-Detector-Specification.md', 'utf8'); return rules.every((r) => md.includes(`**${r.ruleId}**`)); })());
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
