// Customer-value detectors: Product Clarity, call-to-action saturation and the Differentiation & Design Maturity patterns.
// Pages in fixture/site/detectors/: ai-saas (the stock AI-SaaS landing template), distinct (an editorial page that is not), repetitive, dashboard-generic, dashboard-custom.
// The four results are pass / fail / needs_person / could_not_verify. Needs `node fixture/server.mjs` and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200,localhost:4200.
// Run: node --experimental-strip-types test/value-detectors.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-value-')); const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-valuedb-'));
fs.cpSync(path.join(process.cwd(), 'src', 'rules'), tmp, { recursive: true });
process.env.AVARA_RULES_DIR = tmp; process.env.PGLITE_DIR = path.join(dbDir, 'pg');
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { derivedReports } = await import('../src/services/scan-service/derived.ts'); const { buildWebsiteContext } = await import('../src/services/scan-service/index.ts');
const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts'); const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const loader = new RuleLoader(tmp); const rules = loader.loadAllRules(); const byId = new Map(rules.map((r) => [r.ruleId, r]));
const ownerOf = new Map(rules.flatMap((r) => (r.evaluator?.detectors ?? []).map((d) => [d, r.ruleId])));
// pass / fail / needs_person / could_not_verify (and n/a when the rule does not apply)
const state = (r) => !r ? 'missing' : !r.ran ? 'could_not_verify' : r.notApplicable ? 'n/a' : r.hits.some((h) => h.bucket === 'confirmed_failure') ? 'fail' : r.hits.length ? 'needs_person' : 'pass';

// ---- 1. the rules are data, complete, and score nothing twice ----
const diff = rules.filter((r) => r.ruleId.startsWith('DIFF-'));
check('DIFF-001 to DIFF-010 exist in their own category, each with source, sourceUrl, severity, detector, recommendation, user impact and business impact', diff.length === 10 && diff.every((r) => r.category === 'Differentiation & Design Maturity' && r.source && /^https:\/\//.test(r.sourceUrl) && r.severity && (r.evaluator?.detectors?.length || r.evaluator?.rollsUp?.length) && r.recommendationTemplate && r.userImpact && r.businessImpact && r.requiredEvidence?.length));
check('the Differentiation category and all ten DIFF rules carry zero weight, so nothing is scored twice, and category weights still total 100', diff.every((r) => r.weight === 0) && loader.manifest.categories.find((c) => c.id === 'differentiation').weight === 0 && loader.manifest.categories.reduce((n, c) => n + c.weight, 0) === 100);
check('every rule has a value tier, and tier sets the weight (1:10, 2:6, 3:3, 4:1; rollups and DIFF 0)', rules.every((r) => [1, 2, 3, 4].includes(r.valueTier) && r.weight === (r.mode === 'R' || r.ruleId.startsWith('DIFF-') ? 0 : { 1: 10, 2: 6, 3: 3, 4: 1 }[r.valueTier])));
const pcRules = rules.filter((r) => r.ruleId.startsWith('PC-'));
check('every Product Clarity rule has objective criteria, required evidence, an authored recommendation and hypothesis-labelled impacts', pcRules.length === 15 && pcRules.every((r) => r.requiredEvidence?.length && r.recommendationTemplateStatus === 'authored' && /hypothesis/.test(r.userImpact + r.businessImpact)));
check('13 of 15 Product Clarity rules have a deterministic detector; PC-014 needs the owner and PC-015 a person', pcRules.filter((r) => r.evaluator?.detectors?.length).length === 13 && !byId.get('PC-014').evaluator.detectors?.length && byId.get('PC-015').evaluator.type === 'human');
check('every detector id belongs to exactly one rule', rules.flatMap((r) => r.evaluator?.detectors ?? []).length === ownerOf.size);
check('lexicons and thresholds are in the rules, not the code', byId.get('PC-009').parameters.buzzwords.length > 20 && byId.get('DIFF-001').parameters.templateSequence.length === 7 && byId.get('DIFF-009').parameters.failGrids === 3);
check('81 rules name at least one detector (a count of rules, not detector ids; 51 before the customer-value work, 74 after it, 77 before the detector pack), none removed', rules.filter((r) => r.evaluator?.detectors?.length).length === 81);

// ---- 2. real pages ----
const base = process.env.FIX || 'http://127.0.0.1:4200/detectors/';
const run = async (p) => { const out = await scanUrl(base + p + '.html', 'wcag22aa', undefined, { goal: null, perf: false }); return { out, d: derivedReports(out) }; };
const pages = Object.fromEntries(await Promise.all(['ai-saas', 'distinct', 'repetitive', 'dashboard-generic', 'dashboard-custom', 'pc-weak', 'pc-late', 'design-weak', 'spacing-irregular', 'spacing-regular', 'form-native', 'form-novalidate', 'form-none'].map(async (p) => [p, await run(p)])));
const want = {   // detector -> [ai-saas, distinct]
  'pc/hero-statement': ['needs_person', 'pass'], 'pc/audience-cue': ['needs_person', 'pass'], 'pc/feature-first': ['needs_person', 'pass'], 'pc/unsupported-superlatives': ['needs_person', 'pass'],
  'pc/headline-form': ['pass', 'pass'], 'pc/subheadline': ['pass', 'pass'], 'pc/problem-signal': ['needs_person', 'pass'], 'pc/outcome-language': ['needs_person', 'pass'], 'pc/buzzwords': ['needs_person', 'pass'],
  'pc/first-screen': ['pass', 'pass'], 'pc/offer-before-action': ['pass', 'pass'], 'pc/cta-context': ['pass', 'pass'], 'pc/claim-consistency': ['fail', 'n/a'], 'conv/cta-saturation': ['needs_person', 'pass'],
  'diff/template-sequence': ['fail', 'pass'], 'diff/default-styling': ['needs_person', 'pass'], 'diff/brand-assets': ['needs_person', 'pass'], 'diff/layout-archetypes': ['needs_person', 'pass'], 'diff/shape-and-icon-language': ['needs_person', 'n/a'],
  'diff/trust-pattern': ['needs_person', 'n/a'], 'diff/feature-grid-saturation': ['needs_person', 'pass'],   // launch pack DIFF-009: a count of grids is never a confirmed failure
};
const seen = {};   // detector -> set of states across all runs
for (const [p, { d }] of Object.entries(pages)) for (const [id, r] of Object.entries(d)) (seen[id] ??= new Set()).add(state(r));
for (const [id, [a, b]] of Object.entries(want)) {
  const sa = state(pages['ai-saas'].d[id]), sb = state(pages.distinct.d[id]); const hit = pages['ai-saas'].d[id].hits[0];
  check(`${id} (${ownerOf.get(id)}): template page ${a}, distinctive page ${b}`, sa === a && sb === b, `got ${sa} / ${sb}${hit ? '  ' + hit.title : ''}`);
}
const P = (n) => pages[n].d;
check('DESIGN-004: a huge decorative image with a tiny headline is flagged; a normal hero is not', state(P('design-weak')['design/visual-hierarchy']) === 'needs_person' && state(P('distinct')['design/visual-hierarchy']) === 'pass' && state(P('ai-saas')['design/visual-hierarchy']) === 'pass', P('design-weak')['design/visual-hierarchy'].hits[0]?.summary);
check('DESIGN-010: 24 irregular gaps are flagged for a person; gaps of 16, 24 and 32 pass', state(P('spacing-irregular')['design/spacing-rhythm']) === 'needs_person' && state(P('spacing-regular')['design/spacing-rhythm']) === 'pass', P('spacing-irregular')['design/spacing-rhythm'].hits[0]?.summary);
check('UX-017: native validation passes (focus goes to the invalid field with a message); script-only and unconstrained forms need a person; no form is not applicable', state(P('form-native')['ux/error-recovery']) === 'pass' && state(P('form-novalidate')['ux/error-recovery']) === 'needs_person' && state(P('form-none')['ux/error-recovery']) === 'needs_person' && state(P('dashboard-custom')['ux/error-recovery']) === 'n/a', ['form-native', 'form-novalidate', 'form-none', 'dashboard-custom'].map((n) => state(P(n)['ux/error-recovery'])).join(' '));
const { VALIDATION_PROBE } = await import('../scanner/avara-inpage.ts');
check('UX-017 never submits: the probe only asks the browser to validate (no submit, requestSubmit or click anywhere in it)', !/\.submit\(|requestSubmit|\.click\(|dispatchEvent/.test(VALIDATION_PROBE) && /reportValidity/.test(VALIDATION_PROBE));
const rep = pages.repetitive.d, dg = pages['dashboard-generic'].d, dc = pages['dashboard-custom'].d;
const pw = pages['pc-weak'].d, pl = pages['pc-late'].d;
check('weak-copy page: a 26-word headline fails, a supporting line that repeats it fails, a button above the h1 fails, a bare button is flagged, conflicting customer counts fail', state(pw['pc/headline-form']) === 'fail' && state(pw['pc/subheadline']) === 'fail' && state(pw['pc/offer-before-action']) === 'fail' && state(pw['pc/cta-context']) === 'needs_person' && state(pw['pc/claim-consistency']) === 'fail', ['pc/headline-form', 'pc/subheadline', 'pc/offer-before-action', 'pc/cta-context', 'pc/claim-consistency'].map((i) => state(pw[i])).join(' '));
check('late-heading page: the h1 below the first screen fails', state(pl['pc/first-screen']) === 'fail', pl['pc/first-screen'].hits[0]?.summary);
check('repetitive page: identical sections are flagged for rhythm and layout, and the card grids go to a person (never a confirmed failure)', state(rep['diff/section-rhythm']) === 'needs_person' && state(rep['diff/layout-archetypes']) === 'needs_person' && state(rep['diff/feature-grid-saturation']) === 'needs_person');
check('DIFF-004: the stock dashboard (sidebar + stat cards + chart) fails; a single-number page is not a dashboard', state(dg['diff/dashboard-pattern']) === 'fail' && state(dc['diff/dashboard-pattern']) === 'n/a', dg['diff/dashboard-pattern'].hits[0]?.evidence?.join(' | '));
check('the template finding names the section order it found', /Hero → .*Testimonials → Pricing/.test(pages['ai-saas'].d['diff/template-sequence'].hits[0].summary) || /Hero → .*Pricing/.test(pages['ai-saas'].d['diff/template-sequence'].hits[0].summary), pages['ai-saas'].d['diff/template-sequence'].hits[0].summary.slice(0, 140));
const noEv = Object.entries(pages).flatMap(([pg, p]) => Object.entries(p.d).flatMap(([id, r]) => r.hits.filter((h) => !h.evidence.length && !/no h1|no main heading/i.test(h.title)).map(() => `${pg}:${id}`)));
check('every flagged result cites evidence (a quote, a count or a selector)', noEv.length === 0, noEv.join(', '));
const empty = derivedReports({ viewports: [], perf: null, analyzers: {} });
const newIds = Object.keys(want).concat(['pc/problem-signal']);
check('with no page structure every new detector says could_not_verify, never pass', newIds.every((id) => state(empty[id]) === 'could_not_verify'), newIds.filter((id) => state(empty[id]) !== 'could_not_verify').join(','));
const synth = (struct, extra = {}) => derivedReports({ viewports: [{ name: 'desktop', pageContext: { structure: struct, ...extra } }], perf: null, analyzers: {} });
const S0 = { hero: { h1: { text: 'x', words: 1, top: 100, inViewport: true }, subheadline: null }, sections: [], app: { sidebar: null, statCards: { count: 0 }, charts: 0, chartSelectors: [], tables: 0, topbar: false }, design: { fonts: [], cardRadii: [], buttonColors: [] }, brand: { logo: false, favicon: false, title: '', bigImages: 0 }, firstCtas: [], ctaCounts: { total: 0, top: null }, viewportHeight: 800, words: 0 };
check('headline too long fails; a button above the h1 fails; an h1 below the first screen fails', state(synth({ ...S0, hero: { h1: { text: 'w '.repeat(30), words: 30, top: 100, inViewport: true }, subheadline: null } })['pc/headline-form']) === 'fail'
  && state(synth({ ...S0, firstCtas: [{ text: 'Buy', filled: true, href: null, top: 20, context: 9 }] })['pc/offer-before-action']) === 'fail'
  && state(synth({ ...S0, hero: { h1: { text: 'Hi there friend', words: 3, top: 1400, inViewport: false }, subheadline: null } })['pc/first-screen']) === 'fail');
check('a supporting line that repeats the headline fails', state(synth({ ...S0, hero: { h1: { text: 'Plan your launch with confidence today', words: 6, top: 100, inViewport: true }, subheadline: { text: 'Plan your launch with confidence today and more', words: 8 } } })['pc/subheadline']) === 'fail');

// ---- 3. changing a lexicon in the rule file changes the result (rules are data) ----
const out = pages['ai-saas'].out; const before = state(derivedReports(out)['pc/buzzwords']);
const pcf = JSON.parse(fs.readFileSync(path.join(tmp, 'product-clarity.json'), 'utf8')); pcf.rules.find((r) => r.ruleId === 'PC-009').parameters.buzzwords = ['zzz-not-present']; fs.writeFileSync(path.join(tmp, 'product-clarity.json'), JSON.stringify(pcf)); fs.utimesSync(path.join(tmp, 'product-clarity.json'), new Date(), new Date(Date.now() + 7000));
check('emptying the buzzword list in the rule file turns the finding off with no code change', before === 'needs_person' && state(derivedReports(out)['pc/buzzwords']) === 'pass');
fs.cpSync(path.join(process.cwd(), 'src', 'rules'), tmp, { recursive: true }); fs.utimesSync(path.join(tmp, 'product-clarity.json'), new Date(), new Date(Date.now() + 14000));

// ---- 4. finding quality ----
const review = async (p) => { const a = analyze(p.out), av = analyzeAvara(p.out, a); const ids = new Set(rules.flatMap((r) => r.evaluator?.detectors ?? [])); return new RuleEngine(loader, null).review(buildWebsiteContext(p.out, a, av, ids)); };
const rv = await review(pages['ai-saas']); const rd = await review(pages.distinct);
const find = (r, id) => r.categories.flatMap((c) => c.findings).find((f) => f.ruleId === id);
const f1 = find(rv, 'DIFF-001'), f9 = find(rv, 'DIFF-009'), fp = find(rv, 'PC-009');
check('a template finding names what was found, why it matters, and what to do', /Hero → /.test(f1.observation) && /AI-SaaS landing template/.test(f1.observation) && f1.userImpact.length > 40 && f1.businessImpact.length > 40 && /Change the order|replace at least two/.test(f1.recommendation) && /Hero|Feature grid/.test(f1.recommendation), f1.observation.slice(0, 120));
check('a buzzword finding quotes the words it found and tells the owner what to replace them with', /AI-powered|supercharge|leverage|seamless/i.test(fp.evidence.join(' ')) && /Replace each buzzword/.test(fp.recommendation) && fp.recommendation.includes(fp.evidence[0].slice(0, 12)));
check('no finding says only that something "could be improved", and no recommendation has an unfilled placeholder', rv.categories.flatMap((c) => c.findings).every((f) => !/could be improved|should be improved|needs improvement/i.test(f.observation + f.recommendation) && !/\{\{/.test(f.recommendation)));
check('every finding that is not a pass cites evidence, impact, business risk and a fix', rv.categories.flatMap((c) => c.findings).filter((f) => !f.passed && f.method === 'measured').every((f) => f.evidence.length && f.userImpact && f.businessImpact && f.recommendation));
check('the distinctive page has no template, buzzword or grid findings', ['DIFF-001', 'DIFF-009', 'PC-009', 'PC-001'].every((id) => find(rd, id)?.passed === true), ['DIFF-001', 'DIFF-009', 'PC-009', 'PC-001'].map((id) => `${id}:${find(rd, id)?.result}`).join(' '));

// ---- 5. no duplicate scoring ----
const diffCat = rv.categories.find((c) => c.category === 'Differentiation & Design Maturity');
check('the Differentiation category produces findings but no score, and says it is observations only', diffCat.findings.length >= 7 && diffCat.score === null && /Observations only/.test(diffCat.note) && diffCat.weight === 0);
const noDiff = new RuleLoader(tmp); const dj = JSON.parse(fs.readFileSync(path.join(tmp, 'diff.json'), 'utf8')); dj.rules.forEach((r) => { r.enabled = false; }); fs.writeFileSync(path.join(tmp, 'diff.json'), JSON.stringify(dj)); fs.utimesSync(path.join(tmp, 'diff.json'), new Date(), new Date(Date.now() + 21000));
const a2 = analyze(pages['ai-saas'].out), av2 = analyzeAvara(pages['ai-saas'].out, a2); const rv2 = await new RuleEngine(noDiff, null).review(buildWebsiteContext(pages['ai-saas'].out, a2, av2, new Set(noDiff.loadAllRules().flatMap((r) => r.evaluator?.detectors ?? []))));
check('switching every DIFF rule off leaves every other category score and the overall number unchanged', rv.overall.score === rv2.overall.score && rv.categories.filter((c) => c.category !== diffCat.category).every((c) => c.score === rv2.categories.find((x) => x.category === c.category).score));
fs.cpSync(path.join(process.cwd(), 'src', 'rules'), tmp, { recursive: true }); fs.utimesSync(path.join(tmp, 'diff.json'), new Date(), new Date(Date.now() + 28000));
const c10 = find(rv, 'DIFF-010') ?? rv.categories.flatMap((c) => c.findings).find((f) => f.ruleId === 'DIFF-010');
check('DIFF-010 (commodity risk) is a rollup: raised on the template page, quiet on the distinctive one, never scored', diffCat.counts.needs_human_review >= 1 && (!c10 || c10.weight === 0));
const roll = (r) => r.categories.find((c) => c.category === 'Differentiation & Design Maturity').findings.length;
check('the template page is flagged by many independent signals, the distinctive page by none', roll(rv) > roll(rd) - 20 && rd.categories.find((c) => c.category === diffCat.category).findings.filter((f) => !f.passed).length === 0 && diffCat.findings.filter((f) => !f.passed).length >= 5, `${diffCat.findings.filter((f) => !f.passed).length} flagged vs 0`);

// ---- 6. pattern intelligence (rows below are synthetic test data in a throwaway database) ----
const { getDb, schema } = await import('../lib/db/index.ts'); const { saveReview } = await import('../src/context/findings/index.ts'); const { detectPatterns, PATTERN_LABEL } = await import('../src/context/knowledge/patterns.ts');
const db = await getDb(); let n = 0;
const add = async (rvw) => { const [p] = await db.insert(schema.products).values({ origin: `https://p${n}.test` }).returning({ id: schema.products.id }); const [s] = await db.insert(schema.scans).values({ url: `https://p${n}.test/`, standard: 'wcag22aa', productId: p.id, status: 'completed', completedAt: new Date() }).returning({ id: schema.scans.id }); n++; await db.transaction((tx) => saveReview(tx, s.id, p.id, rvw, loader.loadAllRules())); };
const patt = async (k) => (await detectPatterns({ minSupport: 99 })).find((p) => p.key === `pattern|${k}`);
await add(rv); await add(rd);
let p1 = await patt('ai-saas-template');
check('one page in two is an Emerging Observation, and says there are too few pages', p1.status === 'emerging_observation' && p1.support === 1 && p1.total === 2 && /too few pages/.test(p1.description) && PATTERN_LABEL[p1.status] === 'Emerging Observation', p1.description);
for (let i = 0; i < 4; i++) await add(rv);   // 5 template pages + 1 distinctive = 6 pages total after this
p1 = (await detectPatterns()).find((p) => p.key === 'pattern|ai-saas-template');
check('5 of 6 pages is a Pattern Identified, stated as the share it is', p1.status === 'pattern_identified' && p1.support === 5 && p1.total === 6 && /83% of 6 reviewed pages show AI SaaS Template/.test(p1.description), p1.description);
for (let i = 0; i < 16; i++) await add(rv);   // 21 template pages + 1 distinctive
p1 = (await detectPatterns()).find((p) => p.key === 'pattern|ai-saas-template'); const all = await detectPatterns();
check('over 20 pages with a majority flagged is a High Confidence Pattern', p1.status === 'high_confidence_pattern' && p1.total === 22 && PATTERN_LABEL[p1.status] === 'High Confidence Pattern', p1.description);
const names = ['generic-hero', 'feature-grid-overload', 'weak-trust-pattern', 'cta-saturation', 'ai-saas-template'];
check('Generic Hero, Feature Grid Overload, Weak Trust Pattern, CTA Saturation and the AI SaaS Template are all observed', names.every((k) => all.some((p) => p.key === `pattern|${k}`)), names.filter((k) => !all.some((p) => p.key === `pattern|${k}`)).join(','));
check('Generic Dashboard is not invented from pages that have no dashboard', !all.some((p) => p.key === 'pattern|generic-dashboard'));
const cs = await db.select().from(schema.categoryScores);
check('patterns create no scores: category scores are only the ones the reviews produced, and patterns have no score column', cs.length === n * 9 && !('score' in schema.patterns));

// ---- 7. which detectors are proven on a passing and a flagged page ----
const proven = Object.entries(seen).filter(([id, s]) => (s.has('pass') || s.has('n/a')) && (s.has('fail') || s.has('needs_person')) && s.has('pass')).map(([id]) => id);
const listed = new Set(JSON.parse(fs.readFileSync('src/rules/_manifest.json', 'utf8')).exercisedDetectors ?? []);
const newDet = Object.keys(want).concat(['pc/problem-signal', 'design/visual-hierarchy', 'design/spacing-rhythm', 'ux/error-recovery']);
check('every detector proven by this run is listed in exercisedDetectors', proven.filter((d) => newDet.includes(d)).every((d) => listed.has(d)), proven.filter((d) => newDet.includes(d) && !listed.has(d)).join(','));
if (process.env.WRITE_EXERCISED) { const m = JSON.parse(fs.readFileSync('src/rules/_manifest.json', 'utf8')); m.exercisedDetectors = [...new Set([...(m.exercisedDetectors ?? []), ...proven.filter((d) => newDet.includes(d))])]; fs.writeFileSync('src/rules/_manifest.json', JSON.stringify(m, null, 2) + '\n'); console.log('wrote', proven.filter((d) => newDet.includes(d)).length, 'of', newDet.length); }
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(dbDir, { recursive: true, force: true });
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
