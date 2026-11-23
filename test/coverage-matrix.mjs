// The coverage matrix is generated from the runtime registry and must be current; every mapped rule, detector and source must resolve.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs';
let bad = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); if (!ok) bad++; };
const r = spawnSync('node', ['--experimental-strip-types', 'scripts/coverage-matrix.ts', '--check'], { encoding: 'utf8' });
check('the matrix resolves every rule, detector and source, and is up to date', r.status === 0, (r.stderr || '').split('\n').filter((l) => !/Warning|trace-warnings/.test(l)).join(' ').slice(0, 300));
const m = JSON.parse(fs.readFileSync('docs/coverage/coverage-matrix.json', 'utf8'));
check('totals come from the registry (145 rules, 9 categories, 42 score-eligible: the admitted checks)', m.registry.rules === 145 && m.registry.categories === 9 && m.registry.scoreEligible === 42);
check('fixture and real-site results are reported separately, and no real-site precision is claimed', m.rows.every((x) => 'fixture' in x && /not run/.test(x.realSite)));
check('only admitted checks are score-eligible, and the AEO and security tracks add no scored rule', m.rows.filter((x) => x.scoreEligible).every((x) => /^[A-Z0-9]+-\d{3}$/.test(x.rule ?? '')) && !m.rows.some((x) => x.scoreEligible && /^(AEO|SEC)/.test(x.rule ?? '')));
const s = JSON.parse(fs.readFileSync('docs/coverage/sources.json', 'utf8')).sources;
check('every source is pinned to a 12-character commit with a licence recorded; AGPL and CC BY-SA sources are reference-only', s.every((x) => /^[0-9a-f]{12}$/.test(x.sha) && x.license) && s.filter((x) => /AGPL|CC BY-SA/.test(x.license)).every((x) => /reference only/.test(x.use)));
process.exit(bad ? 1 : 0);
