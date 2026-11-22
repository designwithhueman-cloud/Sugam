// Detector tests: the 25 new detectors (and the rules they feed) against pass and fail pages, plus the rule-engine result on both pages.
// Needs `node fixture/server.mjs` and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200,localhost:4200.  Run: node --experimental-strip-types test/detectors.mjs
import fs from 'node:fs';
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { derivedReports } = await import('../src/services/scan-service/derived.ts'); const { buildWebsiteContext } = await import('../src/services/scan-service/index.ts');
const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts'); const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const loader = new RuleLoader(); const rules = loader.loadAllRules(); const manifest = loader.manifest;
const ownerOf = new Map(rules.flatMap((r) => (r.evaluator?.detectors ?? []).map((d) => [d, r.ruleId])));
const base = process.env.FIX || 'http://127.0.0.1:4200/detectors/';
const state = (r) => !r ? 'missing' : !r.ran ? 'not-run' : r.notApplicable ? 'n/a' : r.hits.some((h) => h.bucket === 'confirmed_failure') ? 'fail' : r.hits.length ? 'review' : 'pass';

// ---- 1. wiring ----
const derivedIds = Object.keys(derivedReports({ viewports: [], perf: null, analyzers: {} }));
check('77 rules now name a detector, and every detector id belongs to exactly one rule', rules.filter((r) => r.evaluator?.detectors?.length).length >= 77 && rules.flatMap((r) => r.evaluator?.detectors ?? []).length === ownerOf.size);
check('every derived detector is named by a rule, and the fixed list of 59 derived detectors is complete (58 before diff/hero-match)', derivedIds.length === 59 && derivedIds.every((d) => ownerOf.has(d)), derivedIds.filter((d) => !ownerOf.has(d)).join(','));

// ---- 2. a detector with nothing to read says "did not run", never "pass" ----
const empty = derivedReports({ viewports: [], perf: null, analyzers: {} });
check('with no measurements every detector reports "did not run"', derivedIds.every((d) => state(empty[d]) === 'not-run'), derivedIds.filter((d) => state(empty[d]) !== 'not-run').join(','));

// ---- 3. real pages ----
const run = async (p, o = {}) => { const out = await scanUrl(base + p, 'wcag22aa', undefined, { goal: o.goal ?? null, perf: !!o.perf, perfRuns: 1 }); return { out, d: derivedReports(out) }; };
const good = await run('good.html', { goal: 'Start free' }); const bad = await run('bad.html', { goal: 'Get access' });
const want = {   // detector -> [on the clean page, on the broken page]
  'ux/primary-task-visible': ['pass', 'fail'], 'conv/cta-visible': ['pass', 'pass'], 'mobile/content-scaling': ['pass', 'fail'], 'mobile/layout-integrity': ['pass', 'review'], 'mobile/orientation': ['pass', 'fail'],
  'mobile/typography': ['pass', 'review'], 'mobile/form-usability': ['pass', 'review'], 'mobile/image-responsiveness': ['pass', 'fail'], 'trust/privacy-link': ['pass', 'fail'], 'trust/terms-link': ['pass', 'fail'],
  'trust/contact-route': ['pass', 'review'], 'trust/review-route': ['pass', 'review'], 'trust/support-route': ['pass', 'review'], 'conv/trial-visibility': ['pass', 'review'], 'conv/cta-consistency': ['n/a', 'review'],
  'conv/field-count': ['pass', 'review'], 'ux/scannability': ['pass', 'review'], 'design/typography-hierarchy': ['pass', 'fail'], 'design/cta-emphasis': ['pass', 'fail'], 'design/component-consistency': ['pass', 'review'],
};
const proven = new Set();
for (const [id, [g, b]] of Object.entries(want)) {
  const sg = state(good.d[id]), sb = state(bad.d[id]);
  check(`${id} (${ownerOf.get(id)}): clean page ${g}, broken page ${b}`, sg === g && sb === b, `got ${sg} / ${sb}${sb !== 'pass' && bad.d[id].hits[0] ? '  ' + bad.d[id].hits[0].title : ''}`);
  if (sg === g && sb === b && b !== 'pass') proven.add(id);
}
check('a failing detector carries evidence (selectors, values or links) for every hit', Object.values(bad.d).flatMap((r) => r.hits).filter((h) => h.bucket === 'confirmed_failure').every((h) => h.evidence.length > 0 || /missing|no viewport/i.test(h.title)));

// ---- 4. Lighthouse-backed detectors ----
const pg = await run('perf-good.html', { perf: true }); const pb = await run('perf-bad.html', { perf: true });
const pwant = { 'perf/image-optimization': ['pass', 'fail'], 'perf/font-optimization': ['pass', 'fail'], 'perf/javascript-efficiency': ['pass', 'fail'], 'perf/css-efficiency': ['pass', 'review'], 'perf/render-blocking': ['pass', 'fail'], 'perf/third-party': ['pass', 'fail'] };
for (const [id, [g, b]] of Object.entries(pwant)) { const sg = state(pg.d[id]), sb = state(pb.d[id]); check(`${id} (${ownerOf.get(id)}): light page ${g}, heavy page ${b}`, sg === g && sb === b, `got ${sg} / ${sb}`); if (sg === g && sb === b) proven.add(id); }
const failedPerf = await scanUrl(base + 'perf-good.html', 'wcag22aa', undefined, { goal: null, perf: false }).then((o) => derivedReports(o));
check('with performance skipped, the Lighthouse detectors say "did not run" (not pass)', Object.keys(pwant).every((id) => state(failedPerf[id]) === 'not-run'));

// ---- 5. synthetic: failure paths a page rarely shows ----
const mk = (o) => ({ viewports: [], perf: null, analyzers: {}, ...o });
const act = (text, level, extra = {}) => ({ avara: { candidates: [{ candidate: { text, selector: '#a', how: 'goal' }, measurement: { belowFirstScreen: false, box: { x: 0, y: 100, width: 100, height: 40 }, visibleRatio: 1, width: 100, height: 40, ...extra }, classification: { level, reasons: ['is covered by #banner.'], causes: [] } }], workflow: null } });
const covered = derivedReports(mk({ viewports: [{ name: 'desktop', ...act('Book', 'unusable', { visibleRatio: 0.2 }) }] }));
check('CONV-002 detector: a covered or clipped main action on desktop fails', state(covered['conv/cta-visible']) === 'fail' && covered['conv/cta-visible'].hits[0].evidence[0].includes('#a'));
const noAction = derivedReports(mk({ viewports: [{ name: 'desktop', avara: { candidates: [], workflow: null } }] }));
check('no main action found: UX-002 and CONV-002 ask a person rather than pass or fail', state(noAction['ux/primary-task-visible']) === 'review' && state(noAction['conv/cta-visible']) === 'review');
const ctx = (pc) => mk({ viewports: [{ name: 'desktop', pageContext: pc }] });
check('privacy link present but not checked is "review", not pass', state(derivedReports(ctx({ personalDataForms: 1, legalLinks: { privacy: [{ text: 'Privacy', href: 'https://x.test/p' }], terms: [] } }))['trust/privacy-link']) === 'review');
check('no personal-data form: privacy does not apply (not a pass)', state(derivedReports(ctx({ personalDataForms: 0, legalLinks: { privacy: [], terms: [] } }))['trust/privacy-link']) === 'n/a');
check('a broken link (404) fails, a redirect to a working page passes', state(derivedReports(ctx({ personalDataForms: 1, legalLinks: { privacy: [{ text: 'P', href: 'https://x.test/p' }], terms: [] }, linkChecks: { 'https://x.test/p': 404 } }))['trust/privacy-link']) === 'fail' && state(derivedReports(ctx({ personalDataForms: 1, legalLinks: { privacy: [{ text: 'P', href: 'https://x.test/p' }], terms: [] }, linkChecks: { 'https://x.test/p': 200 } }))['trust/privacy-link']) === 'pass');
check('absence of reviews, trial or testimonials is neutral (n/a), never a failure', state(derivedReports(ctx({ reviewClaims: [], trialMentions: [], legalLinks: { privacy: [], terms: [] } }))['trust/review-route']) === 'n/a' && state(derivedReports(ctx({ trialMentions: [] }))['conv/trial-visibility']) === 'n/a');
const perfSyn = (audits) => derivedReports(mk({ perf: { audits, runs: [], median: {}, range: {}, conditions: {}, diagnostics: {}, field: {} } }));
check('Lighthouse thresholds: 40 KB of image savings passes, 80 KB fails; 250 ms of third-party time fails', state(perfSyn({ 'image-delivery-insight': { score: 0.5, wastedBytes: 40960, wastedMs: 0, items: [] } })['perf/image-optimization']) === 'pass' && state(perfSyn({ 'image-delivery-insight': { score: 0, wastedBytes: 81920, wastedMs: 0, items: [{ url: 'a.jpg', wastedBytes: 81920 }] } })['perf/image-optimization']) === 'fail' && state(perfSyn({ 'third-parties-insight': { score: 1, wastedBytes: 0, wastedMs: 0, items: [{ url: 'x', entity: 'x', mainThreadMs: 260 }] } })['perf/third-party']) === 'fail');

// ---- 6. what the rule engine now decides, with no AI configured ----
const review = async (p) => { const a = analyze(p.out), av = analyzeAvara(p.out, a); const ids = new Set(rules.flatMap((r) => r.evaluator?.detectors ?? [])); return new RuleEngine(loader, null).review(buildWebsiteContext(p.out, a, av, ids)); };
const rg = await review(good), rb = await review(bad), rp = await review(pb);
const outcomes = (rv) => rv.categories.flatMap((c) => c.findings.map((f) => [f.ruleId, f.result]));
const decided = (rv) => new Set(rv.categories.flatMap((c) => c.findings).map((f) => f.ruleId));
const counts = (rv) => rv.categories.reduce((n, c) => { for (const [k, v] of Object.entries(c.counts)) n[k] = (n[k] ?? 0) + v; return n; }, {});
const cb = counts(rb), cg = counts(rg);
const built = rules.filter((r) => r.evaluator?.detectors?.length).map((r) => r.ruleId);
const reached = built.filter((id) => decided(rb).has(id) || decided(rg).has(id) || decided(rp).has(id));
check('of the rules that name a detector, nearly all return a measured result on these pages (the rest are "not applicable")', reached.length >= built.length - 10, `${reached.length} of ${built.length} decided; not reached: ${built.filter((i) => !reached.includes(i)).join(', ')}`);
console.log('   broken page :', JSON.stringify(cb)); console.log('   clean page  :', JSON.stringify(cg));
check('the broken page produces measured failures in at least 5 categories, each with evidence', rb.categories.filter((c) => c.findings.some((f) => !f.passed && f.method === 'measured' && f.evidence.length)).length >= 5, rb.categories.filter((c) => c.findings.some((f) => !f.passed && f.method === 'measured')).map((c) => c.category.split(' ')[0]).join(', '));
check('a category with a measured failure scores below 100, and the clean page scores at least as high in every category both could score', rb.categories.filter((c) => c.findings.some((f) => f.result === 'observed_failure')).every((c) => c.score < 100) && rg.categories.filter((c) => c.score != null && rb.categories.find((x) => x.category === c.category).score != null).every((c) => c.score >= rb.categories.find((x) => x.category === c.category).score));
check('without a model, judgement rules that no detector can decide stay "not run" (said so), never guessed', cb.not_run >= 40 && rb.categories.find((c) => c.category === 'Differentiation & Design Maturity').score === null);

// ---- 7. record which detectors are proven on both a passing and a failing page ----
const listed = new Set(manifest.exercisedDetectors ?? []);
check('every detector proven by this run is listed in exercisedDetectors', [...proven].every((d) => listed.has(d)), [...proven].filter((d) => !listed.has(d)).join(','));
if (process.env.WRITE_EXERCISED) { const m = JSON.parse(fs.readFileSync('src/rules/_manifest.json', 'utf8')); m.exercisedDetectors = [...new Set([...(m.exercisedDetectors ?? []), ...proven])]; fs.writeFileSync('src/rules/_manifest.json', JSON.stringify(m, null, 2) + '\n'); console.log('wrote', proven.size); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
