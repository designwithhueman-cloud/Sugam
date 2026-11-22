// Detector Pack v3: placeholder-only field (A11Y-003), generic linked error (UX-017, H9 lens) and movement under reduced motion (A11Y-016), plus the
// v2 tab-missing-target reconciliation (A11Y-015). Every one is advisory: needs_review, never a confirmed failure, and no rule becomes score-eligible.
// Pages: fixture/site/detectors/v3-flags.html (all present) and v3-clean.html (a look-alike that must stay clear).
// Needs `node fixture/server.mjs`. Run: ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 node --experimental-strip-types test/detector-pack-v3.mjs
process.env.ALLOW_PRIVATE_HOSTS ||= '127.0.0.1:4200';
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts');
const { detectorReports } = await import('../src/services/scan-service/index.ts'); const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { MOTION } = await import('../scanner/inpage.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const rules = new RuleLoader().loadAllRules(); const byId = new Map(rules.map((r) => [r.ruleId, r]));
const base = process.env.FIX || 'http://127.0.0.1:4200/detectors/';
const ids = ['sugam/placeholder-only-label', 'ux/generic-error-message', 'sugam/reduced-motion', 'sugam/aria-tablist'];
const run = async (p) => { const out = await scanUrl(base + p + '.html', 'wcag22aa', undefined, { goal: null, perf: false }); return { out, rep: detectorReports(out, analyze(out), null, ids) }; };
const flags = await run('v3-flags'), clean = await run('v3-clean');
const want = { 'sugam/placeholder-only-label': 'A11Y-003', 'ux/generic-error-message': 'UX-017', 'sugam/reduced-motion': 'A11Y-016', 'sugam/aria-tablist': 'A11Y-015' };
for (const [id, rule] of Object.entries(want)) {
  const f = flags.rep[id], c = clean.rep[id];
  check(`${id} (${rule}): advisory on the flawed page, clear on the look-alike`, f?.ran && f.hits.length >= 1 && f.hits.every((h) => h.bucket === 'needs_review') && c?.ran && !c.hits.length, f?.hits.map((h) => h.title).join(' / '));
  // Eligibility comes only from a recorded admission (src/rules/_admissions.json, test/score-admission.mjs), never from adding a detector.
  const admitted = JSON.parse((await import('node:fs')).readFileSync('src/rules/_admissions.json', 'utf8')).rules.some((a) => a.ruleId === rule);
  check(`${rule} names ${id}, and is score-eligible only through its recorded admission`, byId.get(rule).evaluator.detectors.includes(id) && byId.get(rule).scoreEligible === admitted);
}
check('an empty aria-label does not count as a label', /placeholder/i.test(JSON.stringify(flags.rep['sugam/placeholder-only-label'].hits)));
check('the generic error quotes the page message, not a typed value', JSON.stringify(flags.rep['ux/generic-error-message'].hits).includes('Invalid input.'));
const mv = flags.out.viewports.find((v) => v.name === 'desktop').motion;
check('motion evidence names the moving property; a fade is counted as still', mv.running.some((m) => m.changed?.includes('transform')) && clean.out.viewports.find((v) => v.name === 'desktop').motion.still >= 1);
check('the motion sample only reads (no click, submit or navigation)', !/\.click\(|\.submit\(|location\.(href|hash)\s*=|dispatchEvent/.test(MOTION));
// Skip reasons: with the in-page capture missing, each check says it did not run instead of passing.
const strip = structuredClone({ ...flags.out, viewports: flags.out.viewports.map((v) => ({ ...v, screenshot: null, viewportShot: null, heuristics: { ...v.heuristics, extra: undefined }, motion: null })) });
const off = detectorReports(strip, analyze(strip), null, ids);
check('missing capture: placeholder, error and motion report not run with a reason', ['sugam/placeholder-only-label', 'ux/generic-error-message', 'sugam/reduced-motion'].every((id) => off[id].ran === false && off[id].note), ['sugam/placeholder-only-label', 'ux/generic-error-message', 'sugam/reduced-motion'].map((id) => off[id].note).join(' | '));
const none = structuredClone({ ...flags.out, viewports: flags.out.viewports.map((v) => ({ ...v, screenshot: null, viewportShot: null, heuristics: { ...v.heuristics, extra: v.heuristics.extra && { ...v.heuristics.extra, invalidMessages: [] } } })) });
const na = detectorReports(none, analyze(none), null, ['ux/generic-error-message'])['ux/generic-error-message'];
check('no invalid field shown: the error check is not applicable with a reason, never a pass', !na.hits.length && /never submits/.test(na.notApplicable || ''), na.notApplicable);
// UX-017 outcome text: a clean page with a clear linked message says what was inspected; a page with no visible error says there was nothing to
// inspect. Both are distinct from each other and from the generic "found nothing" line.
const { CategoryEvaluator } = await import('../src/engines/rule-engine/RuleEvaluator.ts');
class Probe extends CategoryEvaluator { category = 'x'; name = 'x'; slice() { return {}; } judge(r, ctx) { return this.byDetectors(r, r.evaluator.detectors, ctx); } }
const ev = new Probe(); const ux = byId.get('UX-017'); const ctxOf = (o) => ({ url: '', goal: null, screenshots: [], pageContent: '', metadata: {}, lighthouseResults: null, axeResults: null, detectors: detectorReports(o, analyze(o), null, ux.evaluator.detectors) });
const clear = ev.judge(ux, ctxOf(clean.out)), empty = ev.judge(ux, ctxOf(none));
check('generic-error detector: a clean run carries what it inspected', /1 visible linked error message was inspected/.test(clean.rep['ux/generic-error-message'].passNote || ''), clean.rep['ux/generic-error-message'].passNote);
check('UX-017 with a clear message: the outcome says the message was inspected', /visible linked error message was inspected/.test(clear.observation) && !/No visible error to inspect/.test(clear.observation), `${clear.result}: ${clear.observation}`);
check('UX-017 with no visible error: the outcome says there was nothing to inspect, not that a message was clear', /No visible error to inspect/.test(empty.observation) && !/was inspected and/.test(empty.observation), `${empty.result}: ${empty.observation}`);
// Fail plus review: the advisory line survives next to a confirmed failure (A11Y-015 tabs beside an invalid ARIA reference).
const fake = { ...byId.get('A11Y-015'), evaluator: { type: 'detector', detectors: ['a', 'b'] } };
const mix = ev.judge(fake, { ...ctxOf(clean.out), detectors: { a: { ran: true, hits: [{ bucket: 'confirmed_failure', title: 't', summary: 'Broken reference.', evidence: ['e1'] }] }, b: { ran: true, hits: [{ bucket: 'needs_review', title: 't', summary: 'Tabs do not follow the pattern.', evidence: ['e2'] }] } } });
check('a confirmed failure keeps the advisory beside it, in the observation and the evidence', mix.result === 'observed_failure' && /Also needs review: Tabs do not follow/.test(mix.observation) && mix.evidence.some((e) => /Also needs review/.test(e)), mix.observation);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
