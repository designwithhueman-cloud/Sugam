// The sixteen Avara Launch Scanner entries (vendor/avara-launch), each mapped to the Avara rule that owns it, with the integration decision.
// The pack's own rule ids are kept as `entry`; `hostRuleId` is the owner in src/rules, confirmed by the underlying probe (the pack's
// A11Y-003 is axe button-name, which Avara files under A11Y-015; its PERF-004 is the lazy LCP image, which PERF-001 owns).
// Every entry is zero-weight and never score-eligible. A launch row is evidence beside a rule, never another rule hit or repair.
export type Decision = 'reused' | 'improved' | 'added' | 'blocked';
export type Entry = {
  entry: string; hostRuleId: string; title: string; decision: Decision;
  /** The Avara detector or repair that already answers this, which keeps ownership. */
  owner: string;
  /** Owner input that would let the check decide (blocked entries), shown with its not-run reason. */
  needs?: 'reference' | 'brand-brief' | 'claim-mapping' | 'section-inventory' | 'page-type' | 'visitor-test';
  note: string;
};

export const LAUNCH_ENTRIES: Entry[] = [
  { entry: 'DIFF-001', hostRuleId: 'DIFF-001', title: 'Template similarity', decision: 'blocked', owner: 'diff/template-sequence', needs: 'reference',
    note: 'Avara’s section-sequence read stays the record. The pack’s comparison needs a documented, comparable reference page; the reference set is empty. Resemblance never establishes AI authorship.' },
  { entry: 'DIFF-002', hostRuleId: 'DIFF-002', title: 'Visual distinctiveness', decision: 'reused', owner: 'diff/default-styling + DIFF-002 hero diagnostic', needs: 'reference',
    note: 'The installed DIFF-002 hero-geometry diagnostic is reused unchanged. A hero comparison runs only against a documented reference at the same viewport.' },
  { entry: 'DIFF-003', hostRuleId: 'DIFF-003', title: 'Brand memorability', decision: 'reused', owner: 'diff/brand-assets', needs: 'visitor-test',
    note: 'Recall cannot be measured from a page: kept as a task for a person (test unaided recall with intended visitors).' },
  { entry: 'DIFF-004', hostRuleId: 'DIFF-004', title: 'Dashboard sameness', decision: 'blocked', owner: 'diff/dashboard-pattern', needs: 'page-type',
    note: 'Needs a confirmed page type and a dashboard reference for the same task. Avara’s dashboard-pattern read stays the record.' },
  { entry: 'DIFF-005', hostRuleId: 'DIFF-005', title: 'Layout originality', decision: 'reused', owner: 'diff/layout-archetypes', needs: 'section-inventory',
    note: 'Avara’s layout-archetype read stays the record. The pack counts layouts only from a complete, recognised section inventory.' },
  { entry: 'DIFF-006', hostRuleId: 'DIFF-006', title: 'Visual system originality', decision: 'blocked', owner: 'diff/shape-and-icon-language', needs: 'reference',
    note: 'Token comparison needs mapped component roles and an approved reference system.' },
  { entry: 'DIFF-007', hostRuleId: 'DIFF-007', title: 'Information hierarchy', decision: 'added', owner: 'diff/section-rhythm',
    note: 'New evidence: the main action’s area against competing actions on the same row, per viewport. Competing actions come from Avara’s main-action probe. Observation or needs-review only.' },
  { entry: 'DIFF-008', hostRuleId: 'DIFF-008', title: 'Trust through design', decision: 'blocked', owner: 'diff/trust-pattern', needs: 'claim-mapping',
    note: 'Needs one claim mapped to its own supporting evidence. Nearby unrelated logos do not count.' },
  { entry: 'DIFF-009', hostRuleId: 'DIFF-009', title: 'Feature grid saturation', decision: 'improved', owner: 'diff/feature-grid-saturation',
    note: 'Avara’s grid detector now reports repeated grids as needs-review, never as a confirmed failure (a grid count is a pattern, not a defect). Pricing, testimonial and FAQ cards stay excluded.' },
  { entry: 'launch/button-name', hostRuleId: 'A11Y-015', title: 'Button accessible name', decision: 'reused', owner: 'axe button-name (A11Y-015)',
    note: 'The pack calls this A11Y-003; Avara files axe button-name under A11Y-015. The same axe run is reused, so no second count.' },
  { entry: 'launch/lcp-image', hostRuleId: 'PERF-001', title: 'Loading of the LCP candidate', decision: 'reused', owner: 'perf/lcp-image-lazy (Lighthouse)',
    note: 'The pack calls this PERF-004. Lighthouse stays the performance record; the in-page candidate is kept as an observation and never compared with Lighthouse timing.' },
  { entry: 'launch/font-role', hostRuleId: 'DESIGN-012', title: 'Heading font against the brand brief', decision: 'blocked', owner: 'DESIGN-012', needs: 'brand-brief',
    note: 'Needs the owner’s approved heading fonts. A declared font family does not prove the font loaded.' },
  { entry: 'launch/voice', hostRuleId: 'PC-009', title: 'Owner-specified vocabulary', decision: 'blocked', owner: 'pc/buzzwords', needs: 'brand-brief',
    note: 'Needs the owner’s phrases to avoid and the page locale. Avara’s general buzzword list stays the record.' },
  { entry: 'launch/recovery', hostRuleId: 'UX-017', title: 'Recovery message wording', decision: 'improved', owner: 'ux/generic-error-message',
    note: 'Avara’s error-message detector now also flags blaming wording (“your fault”, “you failed to”), matched on word boundaries in visible linked errors.' },
  { entry: 'launch/cta', hostRuleId: 'CONV-001', title: 'Goal action wording', decision: 'improved', owner: 'conv/generic-primary-action',
    note: 'Avara’s generic-label list now includes “learn more” and “go here”. Exact label match on the main action only.' },
  { entry: 'launch/action-hit', hostRuleId: 'MOB-013', title: 'Mobile action hit sample', decision: 'improved', owner: 'Avara main-action repair (action:*)',
    note: 'The 3×3 pointer-hit sample at 320px is attached as evidence to the existing main-action repair; it does not add a finding. A visible mobile equivalent counts; a hidden desktop copy cannot establish a block.' },
];

// Launch adapters are keyed by detector id (launch/cta); the DIFF reviews by rule id (their detector id is launch/<method>, e.g. launch/template).
export const entryFor = (row: { ruleId: string; detectorId?: string }) => LAUNCH_ENTRIES.find((e) => e.entry === row.detectorId) ?? LAUNCH_ENTRIES.find((e) => e.entry === row.ruleId);

export const NEEDS_LABEL: Record<NonNullable<Entry['needs']>, string> = {
  reference: 'a documented comparable reference page', 'brand-brief': 'the owner’s brand brief', 'claim-mapping': 'a claim mapped to its evidence',
  'section-inventory': 'a complete section inventory', 'page-type': 'a confirmed page type', 'visitor-test': 'a test with intended visitors',
};
