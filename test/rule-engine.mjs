// Rule engine tests: rules are data, loaded at runtime, evaluated per category, scored, stored. No browser and no network.
// Run: node --experimental-strip-types test/rule-engine.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-rules-')); const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-db-'));
process.env.PGLITE_DIR = path.join(dbDir, 'pg');
const { RuleLoader, validateRule } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts');
const { scoreCategory, scoreOverall } = await import('../src/engines/rule-engine/RuleScorer.ts');
const { SYSTEM_PROMPT, BATCH } = await import('../src/engines/rule-engine/RuleEvaluator.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const src = path.join(process.cwd(), 'src', 'rules'); const cp = () => { fs.rmSync(tmp, { recursive: true, force: true }); fs.cpSync(src, tmp, { recursive: true }); };
const readJ = (f) => JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')); const writeJ = (f, d) => fs.writeFileSync(path.join(tmp, f), JSON.stringify(d, null, 1));
const ctxOf = (o = {}) => ({ url: 'https://example.test/', goal: 'Join the waitlist', screenshots: [], pageContent: 'Acme helps founders ship. Join the waitlist. Contact: hello@acme.test', metadata: { title: 'Acme', headings: [{ level: 1, text: 'Ship faster' }], ctas: [{ text: 'Join the waitlist' }], contact: { emailInText: 'hello@acme.test' } }, lighthouseResults: null, axeResults: { violations: [] }, detectors: {}, ...o });

// ---- loading ----
cp(); const L = new RuleLoader(tmp);
const all = L.loadAllRules();
check('loads 135 rules (125 canonical + 10 DIFF) from the JSON files, in 9 categories, with no problems', all.length === 135 && L.manifest.categories.length === 9 && L.issues.length === 0 && L.manifest.categories.reduce((n, c) => n + c.weight, 0) === 100);
check('loadCategoryRules and getRuleById read the same data', L.loadCategoryRules('Trust & Credibility').length === 15 && L.getRuleById('TRUST-001').title === 'Contact Information Visibility' && L.getRuleById('NOPE-1') === undefined);
check('every rule has the schema fields', all.every((r) => ['ruleId', 'category', 'title', 'description', 'source', 'sourceType', 'sourceUrl', 'severity', 'weight', 'evaluationPrompt', 'recommendationTemplate', 'enabled'].every((k) => r[k] !== undefined)));
// ---- validation ----
const d = readJ('trust.json'); d.rules.push({ ruleId: 'BAD-1', category: 'Trust & Credibility', title: '', weight: 500, severity: 'urgent', enabled: 'yes' }, { ...d.rules[0] }); writeJ('trust.json', d);
const L2 = new RuleLoader(tmp);
check('bad rules are reported and skipped; duplicates are rejected; the rest still load', L2.loadAllRules().length === 135 && L2.issues.some((i) => /BAD-1/.test(i)) && L2.issues.some((i) => /duplicate ruleId/.test(i)));
check('validateRule names what is wrong', validateRule({ ruleId: 'X' }, new Set(['A'])).errors.length >= 8);
// ---- hot reload and growth ----
cp(); const L3 = new RuleLoader(tmp); const before = L3.getRuleById('TRUST-001').title;
const t = readJ('trust.json'); t.rules[0].title = 'Contact Visibility (edited)'; writeJ('trust.json', t);
await new Promise((r) => setTimeout(r, 15)); fs.utimesSync(path.join(tmp, 'trust.json'), new Date(), new Date(Date.now() + 5000));
check('hot reload: editing the JSON changes the rule on the next call, with no restart', before !== L3.getRuleById('TRUST-001').title && L3.getRuleById('TRUST-001').title.includes('edited'));
const extra = { schemaVersion: 1, category: 'Trust & Credibility', rules: Array.from({ length: 1000 }, (_, i) => ({ ...readJ('trust.json').rules[1], ruleId: `TRUST-X${i}`, title: `Extra trust rule ${i}`, mode: 'H', evaluator: { type: 'llm' }, evaluationPrompt: `Check extra item ${i}.`, weight: 3 })) };
writeJ('trust-extra.json', extra); const t0 = Date.now();
check('1,000 more rules are added by dropping one JSON file in; nothing else changes', L3.loadAllRules().length === 1135 && L3.loadCategoryRules('Trust & Credibility').length === 1015, `${Date.now() - t0} ms`);
const dis = readJ('trust-extra.json'); dis.rules.forEach((r, i) => { r.enabled = i < 10; }); writeJ('trust-extra.json', dis); fs.utimesSync(path.join(tmp, 'trust-extra.json'), new Date(), new Date(Date.now() + 9000));
check('"enabled": false removes a rule from the run', L3.loadAllRules().length === 145);

// ---- evaluation: rules reach the model as data, per category, in batches ----
cp(); const L4 = new RuleLoader(tmp); const calls = []; const interprets = [];
const stub = (verdict) => ({ model: 'stub-model', async evaluate(i) { calls.push(i); return i.rules.map((r) => verdict(r, i)); }, async interpret(i) { interprets.push(i); return i.failures.map((f) => ({ ruleId: f.ruleId, userImpact: 'u', businessImpact: 'b' })); } });
let rev = await new RuleEngine(L4, stub((r) => ({ ruleId: r.ruleId, result: 'pass', observation: 'ok', evidence: ['Join the waitlist'], confidence: 0.95 }))).review(ctxOf());
const cats = new Set(calls.map((c) => c.rules.map((r) => L4.getRuleById(r.ruleId).category)).map((a) => [...new Set(a)].join('|')));
check('each model call carries rules from ONE category only', [...cats].every((c) => !c.includes('|')) && calls.length > 0, `${calls.length} calls`);
check('the model is handed each rule\'s own evaluationPrompt from the JSON, and the system prompt names no rule', calls.every((c) => c.rules.every((r) => r.evaluationPrompt === L4.getRuleById(r.ruleId).evaluationPrompt)) && !L4.loadAllRules().some((r) => SYSTEM_PROMPT.includes(r.title)));
check('the Accessibility and Performance evaluators ask the model nothing: measurements answer first', !calls.some((c) => c.rules.some((r) => ['Accessibility', 'Performance'].includes(L4.getRuleById(r.ruleId).category))));
check('AI-assisted passes carry capped confidence', rev.categories.flatMap((c) => c.findings).filter((f) => f.method === 'ai_assisted').every((f) => f.confidence <= 0.7));
// editing the JSON changes what the model is asked
const pc = readJ('product-clarity.json'); pc.rules.find((r) => r.ruleId === 'PC-014').evaluationPrompt = 'CUSTOM PROMPT FROM JSON'; writeJ('product-clarity.json', pc); fs.utimesSync(path.join(tmp, 'product-clarity.json'), new Date(), new Date(Date.now() + 20000));
calls.length = 0; await new RuleEngine(L4, stub((r) => ({ ruleId: r.ruleId, result: 'pass', observation: 'ok', evidence: [], confidence: 0.5 }))).review(ctxOf());
check('changing a rule\'s prompt in JSON changes the next review, with no code change', calls.some((c) => c.rules.some((r) => r.evaluationPrompt === 'CUSTOM PROMPT FROM JSON')));
// evidence must exist in the page
cp(); const L5 = new RuleLoader(tmp);
rev = await new RuleEngine(L5, stub((r) => ({ ruleId: r.ruleId, result: 'fail', observation: 'bad', evidence: ['words that are not on the page'], confidence: 0.99 }))).review(ctxOf());
const pcRes = rev.categories.find((c) => c.category === 'Product Clarity');
check('a failure whose quoted evidence is not in the page is downgraded to inconclusive', pcRes.counts.inconclusive > 0 && pcRes.counts.observed_failure === 0 && pcRes.counts.needs_human_review === 0);
rev = await new RuleEngine(L5, stub((r) => ({ ruleId: r.ruleId, result: 'fail', observation: 'vague', evidence: ['Ship faster'], confidence: 0.99 }))).review(ctxOf());
const pc2 = rev.categories.find((c) => c.category === 'Product Clarity');
check('a model alone never confirms a failure: a quoted AI failure becomes "needs a person", advisory, never scored as a failure', pc2.counts.needs_human_review > 0 && pc2.counts.observed_failure === 0 && pc2.findings.every((f) => f.advisory) && pc2.score === null);
// no model configured
rev = await new RuleEngine(L5, null).review(ctxOf());
const pc3 = rev.categories.find((c) => c.category === 'Product Clarity');
check('without a model, judgement rules are "not run" (said so), never guessed', pc3.counts.not_run === 15 && pc3.score === null && /No AI model/.test(rev.ai.reason ?? '') && rev.ai.used === false);
// ---- detectors first ----
const hit = (bucket, summary) => ({ ran: true, hits: [{ bucket, title: 't', summary, evidence: ['#book  <button>'] }] });
rev = await new RuleEngine(L5, null).review(ctxOf({ detectors: { 'color-contrast': hit('confirmed_failure', 'Text is too faint on 3 elements.'), 'mobile/sticky-ui-interference': hit('confirmed_failure', 'A fixed banner covers the button.'), 'perf/lcp': { ran: true, hits: [] }, 'perf/cls': { ran: false, hits: [] } } }));
const a11y = rev.categories.find((c) => c.category === 'Accessibility'); const mob = rev.categories.find((c) => c.category === 'Mobile Responsiveness'); const perf = rev.categories.find((c) => c.category === 'Performance');
check('Accessibility reads measurements: a failing detector gives an observed failure with its evidence', a11y.findings.find((f) => f.ruleId === 'A11Y-001').result === 'observed_failure' && a11y.findings.find((f) => f.ruleId === 'A11Y-001').evidence.length === 1);
check('Mobile: a detector hit becomes a failure on its owner rule', mob.findings.find((f) => f.ruleId === 'MOB-013')?.result === 'observed_failure');
check('Performance: a passing measurement passes; a measurement that did not run is "not run", not a pass', perf.findings.find((f) => f.ruleId === 'PERF-001')?.passed === true && !perf.findings.some((f) => f.ruleId === 'PERF-002') && perf.counts.not_run >= 2 && perf.findings.every((f) => f.ruleId !== 'PERF-003'));
// ---- findings schema + determinism ----
const f = a11y.findings.find((x) => x.ruleId === 'A11Y-001'); const again = await new RuleEngine(L5, null).review(ctxOf({ detectors: { 'color-contrast': hit('confirmed_failure', 'Text is too faint on 3 elements.') } }));
check('a finding has the required fields and a deterministic id', ['findingId', 'ruleId', 'category', 'title', 'severity', 'score', 'passed', 'confidence', 'evidence', 'businessImpact', 'userImpact', 'recommendation'].every((k) => f[k] !== undefined) && typeof f.confidence === 'number' && f.findingId === again.categories.find((c) => c.category === 'Accessibility').findings.find((x) => x.ruleId === 'A11Y-001').findingId);
check('the recommendation is the rule\'s own template; impact text is labelled a hypothesis where inferred', /Fix "Color Contrast"/.test(f.recommendation) && /legal exposure that Avara does not assess|cannot convert/.test(f.businessImpact));
check('a failing accessibility measurement is explained by the model only when one is configured', interprets.length === 0);
const withAi = await new RuleEngine(L5, stub(() => ({ result: 'inconclusive', observation: '', evidence: [], confidence: 0.1 }))).review(ctxOf({ detectors: { 'color-contrast': hit('confirmed_failure', 'faint') } }));
check('with a model, only the failing measurement is sent to be explained', interprets.at(-1)?.failures.length === 1 && withAi.categories.find((c) => c.category === 'Accessibility').findings.find((x) => x.ruleId === 'A11Y-001').userImpact === 'u');
// ---- scoring ----
const R = (id, w, sev = 'medium') => ({ ruleId: id, weight: w, severity: sev, mode: 'M', evaluator: { type: 'detector' }, scoreEligible: false });
const O = (id, result, method = 'measured') => ({ ruleId: id, result, method, observation: '', evidence: [], confidence: 1 });
const sc = scoreCategory('X', 10, [R('a', 6), R('b', 4), R('c', 10)], [O('a', 'observed_pass'), O('b', 'observed_failure'), O('c', 'not_run')], [], { countAiAssisted: true, severityBoost: {} });
check('category score = weight of passes / weight decided; undecided rules do not count either way; coverage is stated', sc.score === 60 && sc.coverage.pct === 50 && sc.scoreStatus === 'provisional');
const scAi = scoreCategory('X', 10, [R('a', 6), R('b', 4)], [O('a', 'observed_pass', 'ai_assisted'), O('b', 'observed_failure')], [], { countAiAssisted: false, severityBoost: {} });
check('a category can exclude AI-assisted results from its score', scAi.score === 0);
const ov = scoreOverall([{ ...sc, category: 'X', weight: 15, score: 80 }, { ...sc, category: 'Y', weight: 10, score: 50 }, { ...sc, category: 'Z', weight: 15, score: null }], { categories: [{ weight: 15 }, { weight: 10 }, { weight: 15 }] });
check('overall = weighted by category weight over the scored categories, and is provisional while anything is missing', ov.score === 68 && ov.status === 'provisional' && /Not scored: Z/.test(ov.note), JSON.stringify(ov.score));
check('the real review reports provisional status, coverage and category weights summing to 100', rev.overall.status === 'provisional' && rev.categories.reduce((n, c) => n + c.weight, 0) === 100);
// ---- scale: 1,125 rules, batched ----
cp(); writeJ('trust-extra.json', { schemaVersion: 1, category: 'Trust & Credibility', rules: Array.from({ length: 1000 }, (_, i) => ({ ...readJ('trust.json').rules[1], ruleId: `TRUST-X${i}`, title: `Extra ${i}`, mode: 'H', evaluator: { type: 'llm' }, evaluationPrompt: `Check ${i}.`, weight: 3 })) });
const L6 = new RuleLoader(tmp); calls.length = 0; const ts = Date.now();
rev = await new RuleEngine(L6, stub((r) => ({ ruleId: r.ruleId, result: 'pass', observation: 'ok', evidence: [], confidence: 0.5 }))).review(ctxOf());
const trustCalls = calls.filter((c) => c.rules[0].ruleId.startsWith('TRUST')).length;
check('1,135 rules run through the same engine; the model is called in batches of the configured size, never one huge prompt', rev.categories.find((c) => c.category === 'Trust & Credibility').findings.length >= 1000 && calls.every((c) => c.rules.length <= BATCH) && trustCalls === Math.ceil(L6.loadCategoryRules('Trust & Credibility').filter((r) => r.evaluator?.type === 'llm').length / BATCH), `${calls.length} calls (${trustCalls} for Trust), ${Date.now() - ts} ms`);

// ---- storage + patterns (throwaway database; the rows below are synthetic test data) ----
const { getDb, schema } = await import('../lib/db/index.ts'); const { saveReview } = await import('../src/context/findings/index.ts'); const { recordKnowledge } = await import('../src/context/knowledge/index.ts'); const { detectPatterns } = await import('../src/context/knowledge/patterns.ts');
cp(); const L7 = new RuleLoader(tmp); const db = await getDb();
const mkScan = async (n, convFail, clarityFail) => {
  const [p] = await db.insert(schema.products).values({ origin: `https://site${n}.test` }).returning({ id: schema.products.id });
  const [s] = await db.insert(schema.scans).values({ url: `https://site${n}.test/`, standard: 'wcag22aa', productId: p.id, status: 'completed', completedAt: new Date() }).returning({ id: schema.scans.id });
  const det = { 'mobile/sticky-ui-interference': hit('confirmed_failure', 'banner') };
  const r = await new RuleEngine(L7, stub((rule) => ({ ruleId: rule.ruleId, result: rule.ruleId === 'PC-014' && clarityFail ? 'fail' : 'pass', observation: 'x', evidence: rule.ruleId === 'PC-014' ? ['Ship faster'] : [], confidence: 0.5 }))).review(ctxOf({ detectors: convFail ? det : {} }));
  r.categories.find((c) => c.category === 'Mobile Responsiveness').score = 40;     // synthetic: force a low Mobile score
  await db.transaction(async (tx) => { await saveReview(tx, s.id, p.id, r, L7.loadAllRules()); await recordKnowledge(tx, s.id, p.id, `https://site${n}.test/`, r); });
  return s.id;
};
const ids = []; for (let i = 0; i < 6; i++) ids.push(await mkScan(i, true, i < 5));
const stored = await db.select().from(schema.categoryScores); const sr = await db.select().from(schema.scanResults); const rf = await db.select().from(schema.ruleFindings); const ev = await db.select().from(schema.ruleEvidence); const kn = await db.select().from(schema.knowledge); const rl = await db.select().from(schema.rulesTable);
check('a review is stored: category scores, overall result, findings, evidence, knowledge and a snapshot of the rules used', stored.length === 6 * 9 && sr.length === 6 && rf.length > 100 && ev.length > 0 && kn.length > 0 && rl.length > 30 && rl.length < 136, `${rf.length} findings, ${ev.length} evidence, ${kn.length} knowledge, ${rl.length} rule snapshots`);
const pats = await detectPatterns({ low: 60, minSupport: 5 });
const p1 = pats.find((p) => p.lowCategory === 'Mobile Responsiveness' && p.ruleId === 'PC-014');
check('pattern detection states only what the stored scans show: 5 of 6 low-Mobile sites also had PC-014 flagged (83%), Pattern Identified', !!p1 && p1.support === 5 && p1.total === 6 && Math.round(p1.rate * 100) === 83 && p1.status === 'pattern_identified' && /83% of 6 reviewed sites/.test(p1.description), p1?.description);
const few = await detectPatterns({ low: 60, minSupport: 10 });
check('with too few sites the same pattern is stored as emerging, and says so', few.find((p) => p.key === p1.key).status === 'emerging_observation' && /too few sites/.test(few.find((p) => p.key === p1.key).description));
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(dbDir, { recursive: true, force: true });
// A hybrid rule whose detector ran and passed, then judged by the model: the record keeps the detector as evidence beside the model (the
// detector run is not lost from "executed checks" when AI also contributes).
{
  const { RuleLoader: RL } = await import('../src/engines/rule-engine/RuleLoader.ts');
  const hy = await new RuleEngine(new RL(), stub((r) => ({ ruleId: r.ruleId, result: 'pass', observation: 'ok', evidence: [], confidence: 0.5 }))).review(ctxOf({ detectors: { 'trust/privacy-link': { ran: true, hits: [], passNote: 'Privacy link opens.' } } }));
  const rec = hy.executions.find((x) => x.ruleId === 'TRUST-002');
  check('hybrid rule decided by AI keeps its detector evidence: TRUST-002 records trust/privacy-link and the model', rec.method === 'ai_assisted' && rec.evidence.includes('trust/privacy-link') && rec.evidence.includes('model'), JSON.stringify(rec.evidence));
  const off = await new RuleEngine(new RL(), null).review(ctxOf({ detectors: { 'trust/privacy-link': { ran: true, hits: [], passNote: 'Privacy link opens.' } } }));
  check('…and with AI off the same measurement decides it alone', off.executions.find((x) => x.ruleId === 'TRUST-002').method === 'measured');
}
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
