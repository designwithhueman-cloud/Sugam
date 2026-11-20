// Rule library acceptance tests that need no browser: registry shape, heuristic ownership, scoring determinism, absence-is-neutral, migration.
// Run: node --experimental-strip-types test/avara-catalog.mjs
import { CATALOG, CATEGORIES, HEURISTICS, MIGRATION, DETECTORS, BY_ID, canonicalFor, coverage } from '../lib/avara/catalog.ts';
import { scoreGroups, DEFAULT_PROFILE } from '../lib/avara/scoring.ts';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const EXPECTED = { product_clarity: 15, ux_workflow: 20, mobile: 15, accessibility: 20, trust: 15, design: 15, conversion: 15, performance: 10 };
const counts = Object.fromEntries(Object.entries(EXPECTED).map(([c, n]) => [c, CATALOG.filter((r) => r.category === c).length === n && CATEGORIES[c].count === n]));
const canonical = CATALOG.filter((r) => r.category !== 'differentiation');
check('registry holds exactly 125 canonical IDs with the stated count in every category, plus the 10 DIFF rules', canonical.length === 125 && new Set(CATALOG.map((r) => r.id)).size === CATALOG.length && CATALOG.length === 135 && Object.values(counts).every(Boolean) && CATALOG.filter((r) => r.category === 'differentiation').length === 10 && CATALOG.every((r) => r.version));
check('category weights total 100%', Object.values(CATEGORIES).reduce((n, c) => n + c.weight, 0) === 100);
check('all ten heuristic lenses resolve to canonical owners and add no scored rules', HEURISTICS.length === 10 && HEURISTICS.every((h) => h.owners.every((o) => BY_ID.has(o))) && canonical.length === 125);
check('every detector owner is a real topic and no draft rule is score-eligible without a verified passage', Object.keys(DETECTORS).every((id) => BY_ID.has(id)) && CATALOG.every((r) => !r.scoreEligible || (r.sourceSection && r.confidenceBasis)));
check('owner hypotheses, design references and rollups are advisory; source confidence stays null while unverified', CATALOG.filter((r) => r.sourceKey === 'OWNER' || r.sourceKey === 'DESIGN' || r.mode === 'R').every((r) => r.advisory) && CATALOG.every((r) => r.confidence === null));
check('rollups (MOB-004, MOB-014, MOB-015, TRUST-004, DESIGN-013, CONV-011, PERF-010) carry no independent deduction', ['MOB-004', 'MOB-014', 'MOB-015', 'TRUST-004', 'DESIGN-013', 'CONV-011', 'PERF-010'].every((id) => BY_ID.get(id).mode === 'R' && BY_ID.get(id).advisory));
check('existing detectors resolve to their owner (axe color-contrast -> A11Y-001, horizontal scroll -> MOB-002, LCP -> PERF-001)', canonicalFor('color-contrast') === 'A11Y-001' && canonicalFor('mobile/horizontal-scroll') === 'MOB-002' && canonicalFor('perf/lcp') === 'PERF-001' && canonicalFor('mobile/primary-action-unusable') === 'MOB-010');

// Scoring. All checks the profile requires have "run" in these synthetic cases so the arithmetic is visible.
const all = new Set(CATALOG.map((r) => r.id)); const g = (groupId, ownerRuleId, category, severity, o = {}) => ({ groupId, ownerRuleId, category, severity, confirmed: true, scoreEligible: true, advisory: false, blocksMainTask: false, ...o });
const banner = [g('banner', 'MOB-013', 'mobile', 'critical', { blocksMainTask: true })];   // UX-002, MOB-010, CONV-002 are evidence on the same group, not groups
const r1 = scoreGroups(banner, all, DEFAULT_PROFILE);
check('banner fixture: one grouped repair, one category deduction, no heuristic penalty', r1.categories.find((c) => c.category === 'mobile').deductions.length === 1 && r1.categories.find((c) => c.category === 'mobile').score === 60 && r1.categories.filter((c) => c.deductions.length).length === 1, JSON.stringify(r1.categories.find((c) => c.category === 'mobile').deductions));
check('a confirmed task blocker takes headline precedence over the average', /blocker.*MOB-013/.test(r1.headline ?? '') && typeof r1.overall === 'number');
const two = scoreGroups([g('cta-size', 'MOB-003', 'mobile', 'minor'), g('cta-name', 'A11Y-003', 'accessibility', 'major')], all, DEFAULT_PROFILE);
check('two unrelated faults on the same button stay distinct', two.categories.reduce((n, c) => n + c.deductions.length, 0) === 2);
const shuffled = scoreGroups([g('cta-name', 'A11Y-003', 'accessibility', 'major'), g('cta-size', 'MOB-003', 'mobile', 'minor')], all, DEFAULT_PROFILE);
check('replaying the same evidence in any order gives the same score', JSON.stringify(two) === JSON.stringify(shuffled));
const dup = scoreGroups([g('x', 'MOB-013', 'mobile', 'critical'), g('x', 'MOB-013', 'mobile', 'critical')], all, DEFAULT_PROFILE);
check('the same repair group is deducted once', dup.categories.find((c) => c.category === 'mobile').deductions.length === 1);
const empty = scoreGroups([], all, DEFAULT_PROFILE);
check('a page with no testimonials, logos, founders, price or trial gets no deduction from those absences', empty.categories.find((c) => c.category === 'trust').score === 100 && empty.overall === 100);
const adv = scoreGroups([g('p', 'PC-015', 'product_clarity', 'major', { advisory: true }), g('u', 'DESIGN-014', 'design', 'major', { confirmed: false })], all, DEFAULT_PROFILE);
check('five-second comprehension and other unconfirmed or advisory findings stay out of the score and are listed separately', adv.overall === 100 && adv.advisory.length === 2);
const partial = scoreGroups([], new Set(['MOB-002']), DEFAULT_PROFILE);
check('no overall number is published while required coverage is incomplete', partial.overall === null && /incomplete required coverage|No category/.test(partial.overallWithheld ?? ''));
const real = scoreGroups([], new Set(['MOB-002', 'MOB-010', 'PERF-001', 'PERF-002']), DEFAULT_PROFILE);
check('today the default coverage profile withholds the overall number (most topics are catalogued only)', real.overall === null);
check('inapplicable categories are omitted with an explanation', scoreGroups([], all, { ...DEFAULT_PROFILE, inapplicable: { trust: 'internal tool, no public commitment' } }).categories.find((c) => c.category === 'trust').note.startsWith('Not applicable'));

// Migration
const oldIds = MIGRATION.map((m) => m.old);
check('earlier catalog IDs are namespaced so old UX-001 (feedback) never collides with new UX-001 (navigation)', oldIds.every((i) => i.startsWith('v0:')) && new Set(oldIds).size === oldIds.length && MIGRATION.find((m) => m.old === 'v0:UX-001').new === 'UX-011' && BY_ID.get('UX-001').title === 'Navigation Discoverability');
check('every migration target exists, and historic A11Y-002 and MOB-003 keep their old meaning (mapped, never rewritten)', MIGRATION.every((m) => BY_ID.has(m.new)) && MIGRATION.find((m) => m.old === 'v0:A11Y-002').new === 'A11Y-004' && MIGRATION.find((m) => m.old === 'v0:MOB-003').new === 'MOB-013' && MIGRATION.every((m) => m.review === 'proposed'));
const c = coverage(['MOB-002']);
console.log('\ncoverage', JSON.stringify({ catalogued: c.catalogued, withDetector: c.implemented, exercisedOnFixtures: c.exercisedOnFixtures, scoreEligible: c.scoreEligible }));
for (const [k, v] of Object.entries(c.byCategory)) console.log(`  ${v.label.padEnd(24)} catalogued ${v.catalogued}  detector ${v.implemented}  fixtures ${v.exercised}`);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
