// The paid AI review, offline: the registry of criteria, grading, grounding checks, ratings in code, and its separation from the automated
// score. The "model" here is a stub that returns fixed graded verdicts (SIMULATED). Run: node --experimental-strip-types test/ai-review.mjs
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200,localhost:4200'; process.env.AVARA_PERF = 'off'; process.env.AVARA_LAUNCH = 'off';
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts'); const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts');
const { rate, priority } = await import('../lib/avara/ai-review.ts'); const { scoreRecords, DEFAULT_PROFILE } = await import('../lib/avara/scoring.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const L = ruleLoader(); const rules = L.loadAllRules(); const ai = rules.filter((r) => r.evaluator?.type === 'llm');

// ---- registry ----
check('55 AI-reviewed criteria cover all nine categories', ai.length === 55 && new Set(ai.map((r) => r.category)).size === 9, `${ai.length}`);
check('every criterion stores its source URL, section, applicability, evidence requirements, exceptions and tests', ai.every((r) => r.criterion?.sourceUrl?.startsWith('https://') && r.criterion.section && typeof r.criterion.sectionVerified === 'boolean' && r.criterion.applicability && r.criterion.evidence?.length && r.criterion.exceptions?.length && r.criterion.tests?.length));
check('sections read from the source are marked verified; the ones that could not be read say so', L.getRuleById('UX-005').criterion.sectionVerified === true && /Visibility of System Status/.test(L.getRuleById('UX-005').criterion.section) && L.getRuleById('DESIGN-002').criterion.sectionVerified === false);
check('Stanford, NN/g, ONS and WCAG sources are named for Trust, UX and Product Clarity, Conversion and Accessibility', /credibility\.stanford\.edu/.test(L.getRuleById('TRUST-013').criterion.sourceUrl) && /nngroup\.com/.test(L.getRuleById('PC-016').criterion.sourceUrl) && /ons\.gov\.uk/.test(L.getRuleById('CONV-016').criterion.sourceUrl) && /WCAG22/.test(L.getRuleById('A11Y-021').criterion.sourceUrl));
check('page type is part of the criterion: a portfolio is judged as a portfolio', /portfolio/.test(L.getRuleById('PC-016').criterion.exceptions.join(' ')) && /portfolio/.test(L.getRuleById('PC-016').evaluationPrompt));

// ---- grading and grounding, through the real engine ----
const ctx = { url: 'https://example.test/', goal: null, screenshots: [{ viewport: 'desktop', mime: 'image/jpeg', data: Buffer.from('') }], pageContent: 'Welcome to the future of work. Trusted by 10,000 teams. Learn more', metadata: {}, accessibility: {}, performance: {}, mobile: {}, detectors: {} };
const verdicts = {
  'PC-016': { grade: 'unmet', grounding: { kind: 'quote', quote: 'Welcome to the future of work' }, recommendation: 'Say what you offer.' },
  'PC-017': { grade: 'partly_met', grounding: { kind: 'quote', quote: 'Not on this page at all' }, recommendation: 'x' },
  'DIFF-012': { grade: 'met', grounding: { kind: 'region', region: { viewport: 'desktop', x: 0, y: 0, width: 1200, height: 300 } } },
  'DIFF-011': { grade: 'met', grounding: { kind: 'region', region: { viewport: 'desktop', x: 900, y: 0, width: 900, height: 300 } } },
  'TRUST-013': { grade: 'unmet', grounding: { kind: 'quote', quote: 'Trusted by 10,000 teams' }, recommendation: 'Cite the source.' },
  'CONV-016': { grade: 'partly_met', grounding: { kind: 'measurement', measurement: 'learn more' }, recommendation: 'Rename it.' },
};
const calls = []; const stub = { model: 'stub (simulated)', async evaluate(i) { calls.push(i); return i.rules.map((r) => ({ ruleId: r.ruleId, result: 'inconclusive', observation: `Simulated ${r.ruleId}.`, evidence: [], confidence: 0.6, ...(verdicts[r.ruleId] ?? { grade: 'insufficient_evidence' }) })); } };
const rv = await new RuleEngine(L, stub).review(ctx);
const item = (id) => rv.aiReview.categories.flatMap((c) => c.items).find((i) => i.ruleId === id);
check('a grounded quote keeps its grade (PC-016 unmet, TRUST-013 unmet)', item('PC-016').grade === 'unmet' && item('TRUST-013').grade === 'unmet');
check('a quote that is not on the page becomes insufficient evidence, and its quote and advice are dropped', item('PC-017').grade === 'insufficient_evidence' && item('PC-017').grounding === null && item('PC-017').recommendation === '');
check('a screenshot region inside the shown screenshot counts; one outside it does not', item('DIFF-012').grade === 'met' && item('DIFF-011').grade === 'insufficient_evidence');
check('a measurement must appear in the context', item('CONV-016').grade === 'partly_met');
const pc = rv.aiReview.categories.find((c) => c.category === 'Product Clarity'), diff = rv.aiReview.categories.find((c) => c.category === 'Differentiation & Design Maturity');
check('ratings in code: met 1, partly 0.5, unmet 0, insufficient evidence excluded', rate(['met', 'partly_met', 'unmet', 'insufficient_evidence']) === 50 && pc.rating === 0 && diff.rating === 100 && rate(['insufficient_evidence']) === null, `PC ${pc.rating}, Differentiation ${diff.rating}`);
check('the review covers all nine categories and counts add up', rv.aiReview.categories.length === 9 && rv.aiReview.categories.every((c) => c.decided + c.insufficient === c.items.length));
check('actionable items come first: unmet, then partly met, then by weight', JSON.stringify([{ grade: 'met', weight: 10, ruleId: 'a' }, { grade: 'partly_met', weight: 3, ruleId: 'b' }, { grade: 'unmet', weight: 1, ruleId: 'c' }].sort(priority).map((x) => x.ruleId)) === '["c","b","a"]');
check('a model alone never confirms a failure: unmet and partly met are “needs a person”', ['PC-016', 'TRUST-013'].every((id) => rv.categories.flatMap((c) => c.findings).find((f) => f.ruleId === id)?.result === 'needs_human_review'));
check('the criterion’s applicability and exceptions travel with its prompt', calls.flatMap((c) => c.rules).find((r) => r.ruleId === 'PC-016')?.evaluationPrompt.includes('Applies to:') === true);
const off = await new RuleEngine(L, null).review(ctx);
check('the AI review never changes the automated score', JSON.stringify(scoreRecords(rv.executions, DEFAULT_PROFILE).categories.map((c) => c.raw)) === JSON.stringify(scoreRecords(off.executions, DEFAULT_PROFILE).categories.map((c) => c.raw)) && off.aiReview === undefined);

// ---- a working download is not a broken action (scanner) ----
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const out = await scanUrl('http://127.0.0.1:4200/review/portfolio.html', 'wcag22aa', () => {}, { goal: null, perfRuns: 1 });
const av = analyzeAvara(out, analyze(out));
check('a “Download CV” link that downloads is not reported as an action with no response', !av.findings.some((f) => /no-response|first-field/.test(f.rule.id)) && out.viewports.every((v) => !v.avara?.workflow || v.avara.workflow.outcome === 'not_activated'), out.viewports.map((v) => v.avara?.workflow?.outcome).join(','));

const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
