// Avara Rule Library v1: the 125 canonical review topics. The rules are DATA in src/rules/*.json, read at runtime by the rule engine's RuleLoader; this
// module is an adapter that gives the rest of the app the shape it uses (ownership, detectors, coverage), plus things that are not rules: the ten
// heuristic lenses and the map from the earlier catalog. Nothing is score-eligible until an exact passage supports the reading and the check is validated.
// "Catalogued", "implemented", "exercised on fixtures" and "executed on this URL" are reported separately and never merged.
import { ruleLoader } from '../../src/engines/rule-engine/RuleLoader.ts';
import type { Rule } from '../../src/engines/rule-engine/RuleTypes.ts';

export type CatCode = string;     // a category id from the manifest, e.g. "mobile"; new categories need no code change
export type Mode = 'M' | 'H' | 'U' | 'R';   // measurable/mixed, heuristic, user/owner/AT session, rollup (zero independent deduction)
export type ImplStatus = 'catalogued' | 'partial' | 'implemented';
export type SrcType = Rule['sourceType'];
export type Source = { key: string; name: string; sourceType: string; url: string | null };

const loader = ruleLoader(); const manifest = loader.manifest;
export const CATEGORIES: Record<CatCode, { code: string; label: string; weight: number; count: number }> = Object.fromEntries(manifest.categories.map((c) => [c.id, { code: c.code, label: c.label, weight: c.weight, count: loader.loadCategoryRules(c.label, { includeDisabled: true }).length }]));
export const SOURCES: Record<string, Source> = (manifest as unknown as { sources: Record<string, Source> }).sources;
const idOfLabel = new Map(manifest.categories.map((c) => [c.label, c.id]));

export type CatalogRule = {
  id: string; version: string; category: CatCode; title: string; mode: Mode; sourceKey: string; source: string; sourceType: SrcType; sourceUrl: string | null;
  sourceSection: string | null; confidence: number | null; confidenceBasis: string | null; evaluationBoundary: string; advisory: boolean;
  implementation: ImplStatus; detectors: string[]; scoreEligible: boolean; exercisedOnFixtures: boolean; needsHuman: boolean;
};
const EXERCISED_DETECTORS = new Set(manifest.exercisedDetectors ?? []);
const detectorsOf = (r: Rule) => (r.evaluator && 'detectors' in r.evaluator ? r.evaluator.detectors ?? [] : []);
export const CATALOG: CatalogRule[] = loader.loadAllRules({ includeDisabled: true }).map((r) => {
  const det = detectorsOf(r); const mode = (r.mode ?? 'H') as Mode;
  return {
    id: r.ruleId, version: r.version ?? '1', category: idOfLabel.get(r.category) ?? r.category, title: r.title, mode, sourceKey: (r as unknown as { sourceKey?: string }).sourceKey ?? '', source: r.source, sourceType: r.sourceType, sourceUrl: r.sourceUrl || null,
    sourceSection: r.sourceSection ?? null, confidence: r.confidence ?? null, confidenceBasis: r.confidenceBasis ?? null, evaluationBoundary: r.description, advisory: !!r.advisory,
    implementation: det.length ? 'partial' : 'catalogued', detectors: det, scoreEligible: !!r.scoreEligible, exercisedOnFixtures: det.some((d) => EXERCISED_DETECTORS.has(d)), needsHuman: mode === 'U' || mode === 'H',
  };
});
/** Detector rule id -> the topics that name it (derived from the JSON, so adding a detector to a rule needs no code). */
export const DETECTORS: Record<string, string[]> = Object.fromEntries(CATALOG.filter((r) => r.detectors.length).map((r) => [r.id, r.detectors]));
export const BY_ID = new Map(CATALOG.map((r) => [r.id, r]));
const OWNER_OF = new Map(Object.entries(DETECTORS).flatMap(([id, ds]) => ds.map((d) => [d, id] as const)));
/** The canonical topic that owns a detector rule id (axe rule, sugam/* check or Avara rule), if any. mobile/primary-action-unusable is owned by MOB-010 (evidence for MOB-001). */
export const canonicalFor = (detectorId: string): string | null => (detectorId === 'mobile/primary-action-unusable' ? 'MOB-010' : OWNER_OF.get(detectorId) ?? null);

export const HEURISTICS: { lens: string; name: string; question: string; owners: string[] }[] = [
  { lens: 'H1', name: 'System status', question: 'Can the visitor tell what just happened, what is pending, and whether the task finished?', owners: ['UX-011', 'UX-019'] },
  { lens: 'H2', name: 'Familiar language and real-world concepts', question: 'Do the terms, ordering and grouping make sense for this audience?', owners: ['PC-009', 'UX-009'] },
  { lens: 'H3', name: 'User control and freedom', question: 'Can the visitor dismiss, go back or revise a choice safely?', owners: ['UX-014', 'A11Y-015'] },
  { lens: 'H4', name: 'Consistency and standards', question: 'Do equivalent labels and controls behave consistently?', owners: ['DESIGN-008', 'CONV-003'] },
  { lens: 'H5', name: 'Error prevention', question: 'Are likely mistakes prevented before a consequential commitment?', owners: ['UX-016', 'A11Y-017'] },
  { lens: 'H6', name: 'Recognition over recall', question: 'Does the visitor have the information and choices needed at this step?', owners: ['UX-008', 'UX-018'] },
  { lens: 'H7', name: 'Flexibility and efficiency', question: 'Can a repeat visitor avoid unnecessary work?', owners: ['UX-003', 'UX-013'] },
  { lens: 'H8', name: 'Minimal and relevant presentation', question: 'Is competing information making the primary decision harder?', owners: ['UX-006', 'DESIGN-004', 'CONV-004'] },
  { lens: 'H9', name: 'Error recognition and recovery', question: 'Can the visitor identify and correct the specific problem?', owners: ['UX-017', 'A11Y-010'] },
  { lens: 'H10', name: 'Help and documentation', question: 'Can the visitor find useful help at the point of need?', owners: ['UX-015', 'TRUST-014'] },
];

// Earlier catalog -> this one. Old IDs are namespaced by registry version, so the old UX-001 (interaction feedback) never collides with the new UX-001
// (navigation discoverability). Historic reports, scores and detector IDs are immutable and keep their old meaning; this table is only used to link them.
export type Relation = 'same' | 'narrower' | 'split' | 'evidence_only';
export type Mapping = { old: string; new: string; relation: Relation; subcheck: string; review: 'proposed' | 'confirmed' };
const M = (old: string, nw: string, relation: Relation, subcheck: string): Mapping => ({ old: `v0:${old}`, new: nw, relation, subcheck, review: 'proposed' });
export const MIGRATION: Mapping[] = [
  M('CLR-001', 'PC-001', 'same', 'value proposition'), M('CLR-002', 'PC-012', 'same', 'call-to-action context'), M('CLR-003', 'UX-010', 'same', 'scannable headings'),
  M('UX-001', 'UX-011', 'narrower', 'action feedback'), M('UX-002', 'UX-011', 'narrower', 'waiting'), M('UX-003', 'UX-011', 'narrower', 'selection'), M('UX-004', 'PC-009', 'same', 'jargon'), M('UX-005', 'UX-014', 'narrower', 'sequence'),
  M('UX-006', 'A11Y-015', 'narrower', 'modal exit'), M('UX-007', 'UX-014', 'narrower', 'revision'), M('UX-008', 'CONV-003', 'split', 'CTA labels (other controls: DESIGN-008)'), M('UX-009', 'UX-014', 'narrower', 'expected outcome'), M('UX-010', 'UX-016', 'narrower', 'format constraints'),
  M('UX-011', 'UX-016', 'narrower', 'costly action'), M('UX-012', 'UX-008', 'narrower', 'choice recall'), M('UX-013', 'UX-008', 'narrower', 'persistent instruction'), M('UX-014', 'UX-003', 'narrower', 'repeat efficiency'), M('UX-015', 'DESIGN-004', 'same', 'hierarchy'),
  M('UX-016', 'A11Y-010', 'narrower', 'identified error'), M('UX-017', 'UX-017', 'same', 'recovery'), M('UX-018', 'TRUST-014', 'split', 'support (empty-state context: UX-015)'), M('UX-019', 'A11Y-015', 'narrower', 'focus entry'), M('UX-020', 'A11Y-015', 'narrower', 'focus return'),
  M('MOB-001', 'MOB-002', 'same', 'horizontal scroll'), M('MOB-002', 'MOB-003', 'same', 'touch target'), M('MOB-003', 'MOB-013', 'narrower', 'sticky interference'),
  M('A11Y-001', 'A11Y-001', 'same', 'contrast'), M('A11Y-002', 'A11Y-004', 'narrower', 'keyboard'), M('A11Y-003', 'A11Y-005', 'same', 'focus visible'), M('A11Y-004', 'A11Y-003', 'split', 'form controls (links: A11Y-009; other widgets: A11Y-015)'),
  M('A11Y-005', 'A11Y-003', 'split', 'visible label in name (SC 2.5.3), type-specific owners'), M('A11Y-006', 'A11Y-010', 'narrower', 'error identification'),
  M('TRU-001', 'TRUST-011', 'narrower', 'provider identity'), M('TRU-002', 'TRUST-001', 'same', 'contact'), M('TRU-003', 'TRUST-013', 'narrower', 'proof over claims'),
  M('DES-001', 'DESIGN-004', 'same', 'visual hierarchy'), M('DES-002', 'UX-010', 'narrower', 'scannability'), M('DES-003', 'MOB-006', 'narrower', 'text spacing subcheck (also on desktop; attach accessibility evidence)'),
  M('CON-001', 'CONV-006', 'narrower', 'required/optional markings'), M('CON-002', 'CONV-006', 'narrower', 'field necessity'), M('CON-003', 'CONV-005', 'same', 'form friction'),
  M('PERF-001', 'PERF-001', 'same', 'LCP'), M('PERF-002', 'PERF-002', 'same', 'CLS'), M('PERF-003', 'PERF-003', 'same', 'INP'),
];

/** How much of the library each level covers. These four numbers are different things and are never added together. */
export function coverage(executed: Iterable<string> = []) {
  const ran = new Set(executed);
  return {
    catalogued: CATALOG.length, implemented: CATALOG.filter((r) => r.implementation !== 'catalogued').length, fullyImplemented: CATALOG.filter((r) => r.implementation === 'implemented').length,
    exercisedOnFixtures: CATALOG.filter((r) => r.exercisedOnFixtures).length, executedOnUrl: CATALOG.filter((r) => ran.has(r.id)).length, scoreEligible: CATALOG.filter((r) => r.scoreEligible).length,
    byCategory: Object.fromEntries(Object.entries(CATEGORIES).map(([c, v]) => { const rs = CATALOG.filter((r) => r.category === c); return [c, { label: v.label, weight: v.weight, catalogued: rs.length, implemented: rs.filter((r) => r.implementation !== 'catalogued').length, exercised: rs.filter((r) => r.exercisedOnFixtures).length, executed: rs.filter((r) => ran.has(r.id)).length }]; })),
  };
}

/** Which topics had a detector that ran in a scan, from how each analyzer fared. The accessibility run (axe and sugam/* checks) counts when the scan completed. */
export function executedTopics(analyzers: Record<string, { status: string }> | null | undefined): string[] {
  const ok = (k: string) => analyzers?.[k]?.status === 'ok';
  const groups: [string, boolean][] = [['mobile/', ok('mobile')], ['workflow/', ok('workflow')], ['perf/', ok('performance')], ['accessibility/', ok('mobile')]];
  const ran = (d: string) => { const g = groups.find(([pre]) => d.startsWith(pre)); return g ? g[1] : true; };
  return CATALOG.filter((r) => r.detectors.some(ran)).map((r) => r.id);
}

/** Topics that are evidence for a primary owner's repair, shown with it and never scored again. From each rule's "related" field. */
export const RELATED: Record<string, string[]> = Object.fromEntries(loader.loadAllRules({ includeDisabled: true }).filter((r) => r.related?.length).map((r) => [r.ruleId, r.related as string[]]));
/** Heuristic lenses each topic is read through. A lens adds observations to a finding; it never adds a deduction. From each rule's "lenses" field. */
export const LENSES: Record<string, string[]> = Object.fromEntries(loader.loadAllRules({ includeDisabled: true }).filter((r) => r.lenses?.length).map((r) => [r.ruleId, r.lenses as string[]]));
