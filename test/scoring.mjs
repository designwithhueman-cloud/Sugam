// Strict scoring policy (lib/avara/scoring.ts) on fixture groups: an eligible pass, a genuine zero, a mixed result, and no eligible rules.
// 0 and "Not scored" must never be confused, and a null always carries its reason. Pure; no browser or server.
// Run: node --experimental-strip-types test/scoring.mjs
const { scoreGroups, DEFAULT_PROFILE, SCORING_POLICY } = await import('../lib/avara/scoring.ts');
const { CATALOG } = await import('../lib/avara/catalog.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const all = new Set(CATALOG.map((r) => r.id)); const everyRule = new Set(CATALOG.map((r) => r.id));
const g = (groupId, ownerRuleId, category, severity, o = {}) => ({ groupId, ownerRuleId, category, severity, confirmed: true, scoreEligible: true, advisory: false, blocksMainTask: false, ...o });
const cat = (r, c) => r.categories.find((x) => x.category === c);
const pass = scoreGroups([], all, DEFAULT_PROFILE, everyRule);
check('eligible pass: every required check ran, nothing confirmed, so mobile scores 100 and the overall is published', cat(pass, 'mobile').score === 100 && pass.overall === 100 && pass.overallWithheld === null);
const zero = scoreGroups([g('a', 'MOB-013', 'mobile', 'critical'), g('b', 'MOB-003', 'mobile', 'critical'), g('c', 'MOB-002', 'mobile', 'critical')], all, DEFAULT_PROFILE, everyRule);
check('genuine zero: three confirmed critical groups take mobile to 0, a real number (assessed), not null', cat(zero, 'mobile').score === 0 && cat(zero, 'mobile').assessed === true && cat(zero, 'mobile').deductions.length === 3, JSON.stringify(cat(zero, 'mobile').deductions.map((d) => d.points)));
const mixed = scoreGroups([g('m', 'MOB-003', 'mobile', 'minor'), g('x', 'A11Y-003', 'accessibility', 'major'), g('adv', 'PC-015', 'product_clarity', 'major', { advisory: true }), g('ne', 'DESIGN-014', 'design', 'major', { scoreEligible: false })], all, DEFAULT_PROFILE, everyRule);
check('mixed: eligible confirmed groups deduct (mobile 95, accessibility 85); advisory and non-eligible ones are listed, not deducted', cat(mixed, 'mobile').score === 100 - SCORING_POLICY.deductions.minor && cat(mixed, 'accessibility').score === 100 - SCORING_POLICY.deductions.major && cat(mixed, 'product_clarity').score === 100 && cat(mixed, 'design').score === 100 && mixed.advisory.length === 2, `overall ${mixed.overall}`);
check('mixed: the overall is the category-weighted average of the assessed categories', typeof mixed.overall === 'number' && mixed.overall > 90 && mixed.overall < 100, String(mixed.overall));
const none = scoreGroups([g('a', 'MOB-013', 'mobile', 'critical')], all, DEFAULT_PROFILE, new Set());
check('no eligible rules: every weighted category is "Not scored" with the reason, never 100', none.categories.filter((c) => !c.note.startsWith('Not applicable')).every((c) => c.score === null && !c.assessed && /no rule in this category is score-eligible/.test(c.note)));
check('no eligible rules: the overall is withheld with the reason', none.overall === null && none.overallWithheld === 'No rule is score-eligible yet, so nothing is scored.', none.overallWithheld);
const some = scoreGroups([], all, DEFAULT_PROFILE, new Set(CATALOG.filter((r) => r.category === 'mobile').map((r) => r.id)));
check('partly eligible: mobile is scored, the others say why not, and no overall is published from one category', cat(some, 'mobile').score === 100 && cat(some, 'trust').score === null && some.overall === null && /no score-eligible rule/.test(some.overallWithheld ?? ''), some.overallWithheld);
check('0 and "Not scored" stay distinct: a zero category has no "Not scored" note, a null one always has a reason', cat(zero, 'mobile').note === 'Covered' && none.categories.every((c) => c.score !== null || c.note.length > 10));
const today = scoreGroups([], all, DEFAULT_PROFILE, new Set(CATALOG.filter((r) => r.scoreEligible).map((r) => r.id)));
check('production rules today: none is score-eligible, so the blocker is eligibility and nothing is scored', CATALOG.every((r) => !r.scoreEligible) && today.overall === null && /No rule is score-eligible/.test(today.overallWithheld ?? ''), today.overallWithheld);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
