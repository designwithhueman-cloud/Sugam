// Traces the two coverage counts to their units, so neither can drift into a different meaning.
//  - "Rules naming a detector" counts RULES whose evaluator lists at least one detector id.
//  - "Detector ids listed as fixture-proven" counts DETECTOR IDS in src/rules/_manifest.json exercisedDetectors.
// Every listed id must be named by a rule and asserted by id in some test file; the published matrix must use these labels.
// No browser or server needed. Run: node --experimental-strip-types test/detector-trace.mjs
import fs from 'node:fs';
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const loader = new RuleLoader(); const rules = loader.loadAllRules();
const dets = (r) => (r.evaluator && 'detectors' in r.evaluator ? r.evaluator.detectors ?? [] : []);
const named = new Set(rules.flatMap(dets)); const listed = loader.manifest.exercisedDetectors;
const tests = fs.readdirSync('test').filter((f) => f.endsWith('.mjs') && f !== 'detector-trace.mjs').map((f) => fs.readFileSync('test/' + f, 'utf8')).join('\n');
const unnamed = listed.filter((d) => !named.has(d)); const untraced = listed.filter((d) => !tests.includes(`'${d}'`) && !tests.includes(`"${d}"`) && !tests.includes(`${d}:`));
check('every listed fixture-proven id is a detector id some rule names', !unnamed.length, unnamed.join(', '));
check('every listed fixture-proven id is asserted by id in a test file', !untraced.length, untraced.join(', '));
check('the list has no duplicates', new Set(listed).size === listed.length);
const backed = rules.filter((r) => dets(r).length);
const m = JSON.parse(fs.readFileSync('docs/coverage/coverage-matrix.json', 'utf8')).registry;
check('matrix counts rules naming a detector, and splits them by evaluator type', m.rulesNamingDetector === backed.length && m.rulesNamingDetectorByType.detector + m.rulesNamingDetectorByType.llm === backed.length, JSON.stringify(m.rulesNamingDetectorByType));
check('matrix counts listed detector ids against all ids rules name', m.detectorIdsListedProven === listed.length && m.detectorIdsNamed === named.size, `${m.detectorIdsListedProven} of ${m.detectorIdsNamed}`);
const md = fs.readFileSync('docs/coverage/coverage-matrix.md', 'utf8');
check('the published labels say rules vs detector ids', md.includes('| Rules naming at least one detector') && md.includes('| Detector ids listed as fixture-proven') && !md.includes('| Detectors exercised on fixtures |') && !md.includes('| Rules with a detector |'));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
