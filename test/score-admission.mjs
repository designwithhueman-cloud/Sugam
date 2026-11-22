// Score admission: a check moves a score only when src/rules/_admissions.json records its basis (a verified standard passage, or documented
// Avara guidance with a measurable pass/fail condition) and a failing and a clean fixture, and this test proves both through the real scanner
// and rule engine with AI off. The result that counts is the measured one: it must be identical with a (stubbed) AI on, so Free and Paid
// get the same scores. Also: the loader refuses scoreEligible without an admission, and an edited rule invalidates its admission.
// Needs `node fixture/server.mjs`. Run: node --experimental-strip-types test/score-admission.mjs   (VERIFY_SOURCES=1 also re-fetches WCAG 2.2)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200,localhost:4200'; process.env.AVARA_LAUNCH = 'off';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { runReview } = await import('../src/services/scan-service/index.ts');
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { definitionHash } = await import('../src/engines/rule-engine/RuleCoverage.ts');
const { scoreRecords, DEFAULT_PROFILE } = await import('../lib/avara/scoring.ts');
const L = new RuleLoader();
const adm = JSON.parse(fs.readFileSync('src/rules/_admissions.json', 'utf8'));
const eligible = L.loadAllRules().filter((r) => r.scoreEligible).map((r) => r.ruleId);

// ---- the record ----
check('the loader reports no admission problem', !L.issues.some((i) => /admission/.test(i)), L.issues.join(' | '));
check('every score-eligible rule has an admission, and every admission is in use', JSON.stringify([...eligible].sort()) === JSON.stringify(adm.rules.map((a) => a.ruleId).sort()), `${eligible.length} eligible`);
check('every category has at least one admitted check (all nine can be scored)', new Set(adm.rules.map((a) => a.ruleId.split('-')[0])).size === 9);
for (const a of adm.rules) {
  const r = L.getRuleById(a.ruleId);
  const basis = a.kind === 'standard' ? a.passages.length > 0 && a.passages.every((p) => p.text.length > 40 && /^https:\/\/www\.w3\.org\/TR\/WCAG22\/#[a-z-]+$/.test(p.url)) && r.sourceStatus === 'passage-verified'
    : a.kind === 'avara-guidance' && a.guidance.condition.pass.length > 10 && a.guidance.condition.fail.length > 5 && !!a.guidance.documentedIn;
  check(`${a.ruleId}: ${a.kind}, measurable condition recorded, definition pinned`, basis && definitionHash(r) === a.definitionHash && r.version === a.version && !!r.evaluator && 'detectors' in r.evaluator && r.evaluator.detectors.length > 0);
}
if (process.env.VERIFY_SOURCES === '1') {
  const html = await (await fetch(adm.source.url)).text();
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/ ([;,.:])/g, '$1');
  for (const a of adm.rules.filter((x) => x.kind === 'standard')) for (const p of a.passages) check(`${a.ruleId} SC ${p.sc}: the passage matches the published WCAG 2.2 text`, plain.includes(p.text), p.text.slice(0, 60));
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-rules-'));
for (const f of fs.readdirSync('src/rules')) fs.copyFileSync(path.join('src/rules', f), path.join(tmp, f));
fs.writeFileSync(path.join(tmp, '_admissions.json'), JSON.stringify({ ...adm, rules: adm.rules.filter((a) => a.ruleId !== 'A11Y-001') }));
const L2 = new RuleLoader(tmp);
check('scoreEligible in a rule file without a recorded admission is ignored and reported', L2.getRuleById('A11Y-001').scoreEligible === false && L2.issues.some((i) => /A11Y-001: scoreEligible without a recorded admission/.test(i)));
fs.rmSync(tmp, { recursive: true, force: true });

// ---- failing and clean fixtures, through the real scanner and engine (each page scanned once) ----
const stub = { model: 'stub (simulated AI: no model called)', async evaluate(i) { return i.rules.map((r) => ({ ruleId: r.ruleId, result: 'pass', observation: 'Simulated.', evidence: [], confidence: 0.5 })); } };
const cache = new Map();
const review = async (file) => {
  if (cache.has(file)) return cache.get(file);
  const p = file.replace('fixture/site/', ''); const out = await scanUrl('http://127.0.0.1:4200/' + p, 'wcag22aa', () => {}, { goal: null, perfRuns: 1, perf: /perf-/.test(p) });
  const a = analyze(out), av = analyzeAvara(out, a);
  const off = (await runReview(out, a, av, { llm: null })).review, on = (await runReview(out, a, av, { llm: stub })).review;
  const v = { off, on, rec: (rv, id) => rv.executions.find((x) => x.ruleId === id), finding: (id) => off.categories.flatMap((c) => c.findings).find((f) => f.ruleId === id) };
  cache.set(file, v); return v;
};
for (const a of adm.rules) {
  const f = await review(a.tests.fail), c = await review(a.tests.clean);
  const rf = f.rec(f.off, a.ruleId), rc = c.rec(c.off, a.ruleId);
  check(`${a.ruleId} fail (${a.tests.fail.split('site/')[1]}): measured failure with saved evidence`, rf?.measured === 'observed_failure' && (f.finding(a.ruleId)?.evidence.length ?? 0) > 0, `${rf?.measured}; ${f.finding(a.ruleId)?.evidence[0]?.slice(0, 70) ?? ''}`);
  check(`${a.ruleId} clean (${a.tests.clean.split('site/')[1]}): measured pass`, rc?.measured === 'observed_pass', String(rc?.measured));
  check(`${a.ruleId}: the measured result is the same with AI on (plan-independent)`, f.rec(f.on, a.ruleId)?.measured === rf?.measured && c.rec(c.on, a.ruleId)?.measured === rc?.measured);
}
// One page scored end to end: the same score with AI off and with AI (stub) on.
const g = await review('fixture/site/detectors/bad.html');
const so = scoreRecords(g.off.executions, DEFAULT_PROFILE), sn = scoreRecords(g.on.executions, DEFAULT_PROFILE);
check('detectors/bad.html: page score and every category score are identical with AI off and on', so.overallRaw === sn.overallRaw && JSON.stringify(so.categories.map((c) => c.raw)) === JSON.stringify(sn.categories.map((c) => c.raw)), `${so.overall} (${so.contributing} of ${so.scorable} scored)`);
console.log('  categories:', so.categories.map((c) => `${c.category}=${c.score ?? '—'}`).join(' '));

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
