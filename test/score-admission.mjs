// Score admission: a rule moves a score only when src/rules/_admissions.json records the exact source passage it enforces and a failing and a
// clean fixture, and this test proves both through the real scanner and rule engine (AI off). The clean page contains every construct the rules
// inspect (an image, a form, a list, a table, inline links, buttons), so a pass is never "nothing to check".
// Also: the loader refuses scoreEligible without an admission, an edited rule invalidates its admission, and one real scan gives a genuine score.
// Needs `node fixture/server.mjs`. Run: node --experimental-strip-types test/score-admission.mjs   (VERIFY_SOURCES=1 also re-fetches WCAG 2.2)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200,localhost:4200'; process.env.AVARA_PERF = 'off'; process.env.AVARA_LAUNCH = 'off';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { buildWebsiteContext } = await import('../src/services/scan-service/index.ts');
const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts'); const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { definitionHash } = await import('../src/engines/rule-engine/RuleCoverage.ts');
const { scoreRecords, DEFAULT_PROFILE } = await import('../lib/avara/scoring.ts');
const L = new RuleLoader(); const rules = L.loadAllRules(); const ids = new Set(rules.flatMap((r) => r.evaluator?.detectors ?? []));
const adm = JSON.parse(fs.readFileSync('src/rules/_admissions.json', 'utf8'));
const eligible = rules.filter((r) => r.scoreEligible).map((r) => r.ruleId);

// ---- the record ----
check('the loader reports no admission problem', !L.issues.some((i) => /admission/.test(i)), L.issues.join(' | '));
check('every score-eligible rule has an admission, and every admission is in use', JSON.stringify(eligible) === JSON.stringify(adm.rules.map((a) => a.ruleId)), eligible.join(','));
for (const a of adm.rules) {
  const r = L.getRuleById(a.ruleId);
  check(`${a.ruleId}: admission pins the verified rule text (definition hash ${a.definitionHash})`, definitionHash(r) === a.definitionHash && r.version === a.version && r.sourceStatus === 'passage-verified');
  check(`${a.ruleId}: names ${a.passages.map((p) => 'SC ' + p.sc).join(', ')} with the exact passage and its anchor`, a.passages.every((p) => p.text.length > 40 && /^https:\/\/www\.w3\.org\/TR\/WCAG22\/#[a-z-]+$/.test(p.url)) && r.sourceSection === a.passages.map((p) => 'SC ' + p.sc).join(', '));
}
if (process.env.VERIFY_SOURCES === '1') {
  const html = await (await fetch(adm.source.url)).text();
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/ ([;,.:])/g, '$1');
  for (const a of adm.rules) for (const p of a.passages) check(`${a.ruleId} SC ${p.sc}: the passage matches the published WCAG 2.2 text`, plain.includes(p.text), p.text.slice(0, 60));
}
// The loader refuses scoreEligible without an admission (a copy of the rules with one admission removed).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-rules-'));
for (const f of fs.readdirSync('src/rules')) fs.copyFileSync(path.join('src/rules', f), path.join(tmp, f));
fs.writeFileSync(path.join(tmp, '_admissions.json'), JSON.stringify({ ...adm, rules: adm.rules.filter((a) => a.ruleId !== 'A11Y-001') }));
const L2 = new RuleLoader(tmp);
check('scoreEligible in a rule file without a recorded admission is ignored and reported', L2.getRuleById('A11Y-001').scoreEligible === false && L2.issues.some((i) => /A11Y-001: scoreEligible without a recorded admission/.test(i)));
fs.rmSync(tmp, { recursive: true, force: true });

// ---- failing and clean fixtures, through the real scanner and engine ----
const review = async (p) => { const out = await scanUrl('http://127.0.0.1:4200/' + p, 'wcag22aa', () => {}, { goal: null, perfRuns: 1 }); const a = analyze(out), av = analyzeAvara(out, a); return new RuleEngine(L, null).review(buildWebsiteContext(out, a, av, ids)); };
const resultOf = (rv, id) => rv.categories.flatMap((c) => c.findings).find((f) => f.ruleId === id);
const clean = await review('admission/clean.html');
for (const id of eligible) { const f = resultOf(clean, id); check(`${id} clean: observed pass (measured)`, f?.result === 'observed_pass' && f.method === 'measured', f ? `${f.result}/${f.method}` : 'no outcome'); }
let cleanRecords = clean.executions;
for (const a of adm.rules) {
  const rv = await review(a.tests.fail.replace('fixture/site/', ''));
  const f = resultOf(rv, a.ruleId);
  const others = eligible.filter((id) => id !== a.ruleId && resultOf(rv, id)?.result !== 'observed_pass');
  check(`${a.ruleId} fail: observed failure (measured), and every other admitted rule still passes`, f?.result === 'observed_failure' && f.method === 'measured' && !others.length, `${f?.result}/${f?.method}${others.length ? ` others: ${others}` : ''} · ${f?.observation?.slice(0, 80) ?? ''}`);
  if (a.ruleId === 'A11Y-001') {
    // One real scan, scored end to end: the worked example.
    const s = scoreRecords(rv.executions, DEFAULT_PROFILE); const acc = s.categories.find((c) => c.category === 'accessibility');
    check('real scan of A11Y-001-fail: Accessibility 100 × 66 ÷ 76 = 87, the only contributing category', acc.status === 'scored' && acc.passedWeight === 66 && acc.evaluatedWeight === 76 && acc.score === 87 && s.overall === 87 && s.contributing === 1, `${acc.passedWeight}/${acc.evaluatedWeight} → ${acc.raw?.toFixed(2)}; overall ${s.overall} from ${s.contributing} of ${s.scorable}`);
    check('…and Performance, with Lighthouse off, is not scored (no admitted rule) and says why', s.categories.find((c) => c.category === 'performance').status === 'insufficient');
  }
}
const cs = scoreRecords(cleanRecords, DEFAULT_PROFILE);
check('real scan of the clean page: Accessibility 100, every one of the 19 required checks ran or was not applicable', cs.categories.find((c) => c.category === 'accessibility').score === 100 && cs.categories.find((c) => c.category === 'accessibility').missing.length === 0);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
