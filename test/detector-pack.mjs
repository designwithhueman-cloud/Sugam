// Detector pack integration: generic main action (CONV-001), unfinished proof (TRUST-005), broken same-page link (A11Y-019). Each is advisory, never a confirmed failure.
// Pages: fixture/site/detectors/pack-flags.html (all three present) and pack-clean.html (none). Needs `node fixture/server.mjs` and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200.
// Run: node --experimental-strip-types test/detector-pack.mjs
const { scanUrl } = await import('../scanner/scanner.ts'); const { derivedReports } = await import('../src/services/scan-service/derived.ts');
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const ADMITTED = new Set(JSON.parse((await import('node:fs')).readFileSync('src/rules/_admissions.json', 'utf8')).rules.map((a) => a.ruleId));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const rules = new RuleLoader().loadAllRules(); const byId = new Map(rules.map((r) => [r.ruleId, r]));
const base = process.env.FIX || 'http://127.0.0.1:4200/detectors/';
const run = async (p) => derivedReports(await scanUrl(base + p + '.html', 'wcag22aa', undefined, { goal: null, perf: false }));
const flags = await run('pack-flags'), clean = await run('pack-clean');
const want = { 'conv/generic-primary-action': 'CONV-001', 'trust/unfinished-proof': 'TRUST-005', 'nav/fragment-target': 'A11Y-019' };
for (const [id, rule] of Object.entries(want)) {
  const f = flags[id], c = clean[id];
  check(`${id} (${rule}): flagged on the flawed page, clear on the clean page`, f?.ran && f.hits.length === 1 && f.hits[0].bucket === 'needs_review' && c?.ran && !c.hits.length, f?.hits[0]?.title);
  // Eligibility comes only from a recorded admission (src/rules/_admissions.json, proven by test/score-admission.mjs), never from adding a detector.
  check(`${rule}: the rule names the detector, and is score-eligible only through its recorded admission`, byId.get(rule).evaluator.detectors.includes(id) && byId.get(rule).scoreEligible === ADMITTED.has(rule));
}
check('the fragment finding names only the missing link; #pricing and #top are fine', /#faq/.test(JSON.stringify(flags['nav/fragment-target'].hits)) && !/#pricing|#top/.test(JSON.stringify(flags['nav/fragment-target'].hits)));
check('the placeholder finding quotes a short excerpt only', flags['trust/unfinished-proof'].hits[0].evidence.every((e) => String(e).length <= 120));
const { FRAGMENT_PROBE } = await import('../scanner/avara-inpage.ts');
check('the fragment probe only reads the page (no click, submit or navigation)', !/\.click\(|\.submit\(|location\.(href|hash)\s*=|dispatchEvent/.test(FRAGMENT_PROBE));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
