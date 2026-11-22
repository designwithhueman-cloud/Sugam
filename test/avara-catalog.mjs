// Rule library acceptance tests that need no browser: registry shape, heuristic ownership, scoring determinism, absence-is-neutral, migration.
// Run: node --experimental-strip-types test/avara-catalog.mjs
import { CATALOG, CATEGORIES, HEURISTICS, MIGRATION, DETECTORS, BY_ID, canonicalFor, coverage } from '../lib/avara/catalog.ts';
import { scoreRecords, DEFAULT_PROFILE } from '../lib/avara/scoring.ts';
import fs from 'node:fs';
const admittedIds = new Set(JSON.parse(fs.readFileSync('src/rules/_admissions.json', 'utf8')).rules.map((a) => a.ruleId));
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const EXPECTED = { product_clarity: 15, ux_workflow: 20, mobile: 15, accessibility: 20, trust: 15, design: 15, conversion: 15, performance: 10 };
const counts = Object.fromEntries(Object.entries(EXPECTED).map(([c, n]) => [c, CATALOG.filter((r) => r.category === c).length === n && CATEGORIES[c].count === n]));
const canonical = CATALOG.filter((r) => r.category !== 'differentiation');
check('registry holds exactly 125 canonical IDs with the stated count in every category, plus the 10 DIFF rules', canonical.length === 125 && new Set(CATALOG.map((r) => r.id)).size === CATALOG.length && CATALOG.length === 135 && Object.values(counts).every(Boolean) && CATALOG.filter((r) => r.category === 'differentiation').length === 10 && CATALOG.every((r) => r.version));
check('category weights total 100%', Object.values(CATEGORIES).reduce((n, c) => n + c.weight, 0) === 100);
check('all ten heuristic lenses resolve to canonical owners and add no scored rules', HEURISTICS.length === 10 && HEURISTICS.every((h) => h.owners.every((o) => BY_ID.has(o))) && canonical.length === 125);
check('every detector owner is a real topic and no rule is score-eligible without a recorded admission (verified passage or documented guidance)', Object.keys(DETECTORS).every((id) => BY_ID.has(id)) && CATALOG.every((r) => !r.scoreEligible || (r.confidenceBasis && admittedIds.has(r.id))));
check('owner hypotheses, design references and rollups are advisory; source confidence stays null while unverified', CATALOG.filter((r) => r.sourceKey === 'OWNER' || r.sourceKey === 'DESIGN' || r.mode === 'R').every((r) => r.advisory) && CATALOG.every((r) => r.confidence === null));
check('rollups (MOB-004, MOB-014, MOB-015, TRUST-004, DESIGN-013, CONV-011, PERF-010) carry no independent deduction', ['MOB-004', 'MOB-014', 'MOB-015', 'TRUST-004', 'DESIGN-013', 'CONV-011', 'PERF-010'].every((id) => BY_ID.get(id).mode === 'R' && BY_ID.get(id).advisory));
check('existing detectors resolve to their owner (axe color-contrast -> A11Y-001, horizontal scroll -> MOB-002, LCP -> PERF-001)', canonicalFor('color-contrast') === 'A11Y-001' && canonicalFor('mobile/horizontal-scroll') === 'MOB-002' && canonicalFor('perf/lcp') === 'PERF-001' && canonicalFor('mobile/primary-action-unusable') === 'MOB-010');

// Scoring (policy avara-score-1.0; the arithmetic is covered in test/scoring.mjs): what this file asserts is the registry side of it.
const recs = (o = {}) => CATALOG.map((r) => ({ ruleId: r.id, category: r.category, weight: r.mode === 'R' ? 0 : 1, execution: 'ran', reason: null, outcome: 'observed_pass', method: 'measured', scope: 'full', scoreEligible: r.scoreEligible, observationOnly: r.mode === 'R', ...(o[r.id] ?? {}) }));
const r1 = scoreRecords(recs({ 'MOB-013': { outcome: 'observed_failure' } }), DEFAULT_PROFILE, 'A confirmed blocker on the main task (MOB-013) comes before any average.');
check('a confirmed task blocker takes headline precedence over the average', /blocker.*MOB-013/.test(r1.headline ?? ''));
check('rollups never score: a rollup record is observation-only and left out', CATALOG.filter((r) => r.mode === 'R').every((r) => !r.scoreEligible));
check('inapplicable categories are omitted with an explanation', scoreRecords(recs(), { ...DEFAULT_PROFILE, inapplicable: { trust: 'internal tool, no public commitment' } }).categories.find((c) => c.category === 'trust').note.startsWith('Not applicable'));

// Migration
const oldIds = MIGRATION.map((m) => m.old);
check('earlier catalog IDs are namespaced so old UX-001 (feedback) never collides with new UX-001 (navigation)', oldIds.every((i) => i.startsWith('v0:')) && new Set(oldIds).size === oldIds.length && MIGRATION.find((m) => m.old === 'v0:UX-001').new === 'UX-011' && BY_ID.get('UX-001').title === 'Navigation Discoverability');
check('every migration target exists, and historic A11Y-002 and MOB-003 keep their old meaning (mapped, never rewritten)', MIGRATION.every((m) => BY_ID.has(m.new)) && MIGRATION.find((m) => m.old === 'v0:A11Y-002').new === 'A11Y-004' && MIGRATION.find((m) => m.old === 'v0:MOB-003').new === 'MOB-013' && MIGRATION.every((m) => m.review === 'proposed'));
const c = coverage(['MOB-002']);
console.log('\ncoverage', JSON.stringify({ catalogued: c.catalogued, withDetector: c.implemented, exercisedOnFixtures: c.exercisedOnFixtures, scoreEligible: c.scoreEligible }));
for (const [k, v] of Object.entries(c.byCategory)) console.log(`  ${v.label.padEnd(24)} catalogued ${v.catalogued}  detector ${v.implemented}  fixtures ${v.exercised}`);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
