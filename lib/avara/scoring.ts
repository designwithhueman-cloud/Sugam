// Avara scoring policy 1.0. Pure and deterministic: the same per-rule records in any order give the same result.
//
// Category first. For each category: score = 100 × (weight of passed eligible rules) ÷ (weight of evaluated eligible rules), where
//   eligible   = the rule was admitted for scoring in the scan's own rule snapshot (src/rules/_admissions.json: verified passage, failing and clean
//                fixture), and is not observation-only (zero weight or a summary);
//   evaluated  = the rule ran on this page with a measured, full-scope result: observed_pass or observed_failure. Each rule counts once; its
//                result already merges every tested width, and a confirmed failure at any width is a failure. Partial (measurable part only),
//                skipped, not-applicable, inconclusive, AI-only, needs-a-person and summary outcomes are left out of both sides.
// A category gets a number only when it meets the coverage profile (every required rule ran or was decided not applicable) and at least one
// eligible rule was evaluated. Otherwise it is "Insufficient coverage" with the reason. Differentiation carries no weight: "Observation only".
//
// Then the overall: the weighted mean of the unrounded scores of the categories that got a number, with the manifest weights normalized over
// those categories only. It says how many categories contributed. Rounding happens once, for display.
import { CATALOG, CATEGORIES, type CatCode } from './catalog.ts';

export const SCORING_POLICY = { version: 'avara-score-1.0', formula: '100 × passed eligible weight ÷ evaluated eligible weight, per category; overall = category weights normalized over contributing categories' } as const;

/** Versioned list of the checks that must have run, per category, before that category may be scored. Defined before the scan runs. */
export type CoverageProfile = { version: string; required: Partial<Record<CatCode, string[]>>; inapplicable?: Partial<Record<CatCode, string>> };
/** The part of a per-rule record (src/engines/rule-engine/RuleCoverage.ts) that scoring reads. */
export type ScoreInput = { ruleId: string; category: string; weight: number; execution: string; reason: string | null; outcome: string; method: string; scope: string; scoreEligible: boolean; observationOnly: boolean };

export type CategoryStatus = 'scored' | 'insufficient' | 'observation' | 'not_applicable';
export type CategoryResult = {
  category: CatCode; status: CategoryStatus; assessed: boolean;
  score: number | null;      // rounded, for display; null unless scored
  raw: number | null;        // unrounded; the overall uses this
  weight: number;            // the category's manifest weight
  eligibleRules: number;     // admitted rules in this category (scan snapshot)
  scoredRules: number;       // eligible rules evaluated on this page (the number shown as "scored rules")
  passedRules: number; failedRules: number;
  passedWeight: number; evaluatedWeight: number;
  rules: { ruleId: string; weight: number; result: 'pass' | 'fail' }[];
  excluded: { ruleId: string; why: string }[];   // eligible rules left out, with why
  missing: string[];          // required rules that did not run
  note: string;               // the reason (always present when score is null)
};
export type ScoreResult = {
  policy: string; coverageProfile: string; categories: CategoryResult[];
  overall: number | null; overallRaw: number | null; contributing: number; scorable: number;
  overallWithheld: string | null; headline: string | null;
};

const CAT_OF_LABEL = new Map(Object.entries(CATEGORIES).map(([k, v]) => [v.label, k as CatCode]));
const catOf = (c: string): CatCode | undefined => (c in CATEGORIES ? (c as CatCode) : CAT_OF_LABEL.get(c));
const label = (c: CatCode) => CATEGORIES[c].label;

function whyExcluded(r: ScoreInput): string | null {
  if (r.execution === 'not_applicable') return 'not applicable to this page';
  if (r.execution !== 'ran') return r.reason ? `did not run (${r.reason.replace(/_/g, ' ')})` : 'did not run';
  if (r.method === 'ai_assisted') return 'AI-only result';
  if (r.method === 'human') return 'needs a person';
  if (r.method === 'rollup' || r.scope === 'summary') return 'summary of other rules';
  if (r.outcome === 'needs_human_review') return 'needs a person to confirm';
  if (r.outcome === 'inconclusive') return 'inconclusive';
  if (r.scope !== 'full') return 'partial: only the measurable part was checked';
  if (r.outcome !== 'observed_pass' && r.outcome !== 'observed_failure') return `no decided result (${r.outcome})`;
  return null;
}

/** `headline` is set by the caller when a confirmed finding blocks the main task: it is shown before any average. */
export function scoreRecords(records: ScoreInput[], profile: CoverageProfile, headline: string | null = null): ScoreResult {
  const byCat = new Map<CatCode, ScoreInput[]>();
  for (const r of [...records].sort((a, b) => a.ruleId.localeCompare(b.ruleId, 'en', { numeric: true }))) {
    const c = catOf(r.category); if (!c) continue;
    if (!byCat.has(c)) byCat.set(c, []);
    if (!byCat.get(c)!.some((x) => x.ruleId === r.ruleId)) byCat.get(c)!.push(r);   // each rule once
  }
  const cats: CategoryResult[] = (Object.keys(CATEGORIES) as CatCode[]).map((category) => {
    const rs = byCat.get(category) ?? []; const weight = CATEGORIES[category].weight;
    const empty = { category, weight, assessed: false, score: null, raw: null, scoredRules: 0, passedRules: 0, failedRules: 0, passedWeight: 0, evaluatedWeight: 0, rules: [], excluded: [], missing: [] as string[] };
    const eligible = rs.filter((r) => r.scoreEligible && !r.observationOnly && r.weight > 0);
    if (weight === 0) return { ...empty, status: 'observation', eligibleRules: 0, note: 'Observation only: this category carries no weight in the page score.' };
    const inapplicable = profile.inapplicable?.[category];
    if (inapplicable) return { ...empty, status: 'not_applicable', eligibleRules: eligible.length, note: `Not applicable: ${inapplicable}` };
    const ranOrNa = new Set(rs.filter((r) => r.execution === 'ran' || r.execution === 'not_applicable').map((r) => r.ruleId));
    const missing = (profile.required[category] ?? []).filter((id) => !ranOrNa.has(id));
    const excluded: CategoryResult['excluded'] = []; const scored: CategoryResult['rules'] = [];
    for (const r of eligible) { const why = whyExcluded(r); if (why) excluded.push({ ruleId: r.ruleId, why }); else scored.push({ ruleId: r.ruleId, weight: r.weight, result: r.outcome === 'observed_failure' ? 'fail' : 'pass' }); }
    const passedWeight = scored.filter((x) => x.result === 'pass').reduce((n, x) => n + x.weight, 0);
    const evaluatedWeight = scored.reduce((n, x) => n + x.weight, 0);
    const base = { ...empty, eligibleRules: eligible.length, scoredRules: scored.length, passedRules: scored.filter((x) => x.result === 'pass').length, failedRules: scored.filter((x) => x.result === 'fail').length, passedWeight, evaluatedWeight, rules: scored, excluded, missing };
    if (!eligible.length) return { ...base, status: 'insufficient', note: 'Insufficient coverage: no rule in this category has been admitted for scoring yet.' };
    if (missing.length) {
      const reasons = [...new Set(rs.filter((r) => missing.includes(r.ruleId)).map((r) => (r.reason ?? 'unknown').replace(/_/g, ' ')))];
      return { ...base, status: 'insufficient', note: `Insufficient coverage: ${missing.length} required check${missing.length === 1 ? '' : 's'} did not run (${reasons.join(', ')}).` };
    }
    if (!evaluatedWeight) return { ...base, status: 'insufficient', note: `Insufficient coverage: none of the ${eligible.length} admitted rules could be decided on this page (${[...new Set(excluded.map((x) => x.why))].join('; ')}).` };
    const raw = (100 * passedWeight) / evaluatedWeight;
    return { ...base, status: 'scored', assessed: true, raw, score: Math.round(raw), note: `${scored.length} scored rule${scored.length === 1 ? '' : 's'}: ${passedWeight} of ${evaluatedWeight} eligible weight passed.` };
  });
  const scorable = cats.filter((c) => c.status !== 'observation' && c.status !== 'not_applicable');
  const contributing = scorable.filter((c) => c.status === 'scored');
  const w = contributing.reduce((n, c) => n + c.weight, 0);
  const overallRaw = w ? contributing.reduce((n, c) => n + (c.raw as number) * c.weight, 0) / w : null;
  const withheld = overallRaw == null ? (scorable.every((c) => !c.eligibleRules) ? 'No rule has been admitted for scoring yet, so nothing is scored.' : 'Insufficient coverage: no category met its coverage requirement on this page.') : null;
  return { policy: SCORING_POLICY.version, coverageProfile: profile.version, categories: cats, overall: overallRaw == null ? null : Math.round(overallRaw), overallRaw, contributing: contributing.length, scorable: scorable.length, overallWithheld: withheld, headline };
}

/** Coverage profile v0.1: every measurable or heuristic topic is required for its category (not-applicable counts as covered: the check ran). */
export const DEFAULT_PROFILE: CoverageProfile = {
  version: 'avara-coverage-0.1',
  required: Object.fromEntries((Object.keys(CATEGORIES) as CatCode[]).filter((c) => CATEGORIES[c].weight > 0).map((c) => [c, CATALOG.filter((r) => r.category === c && (r.mode === 'M' || r.mode === 'H')).map((r) => r.id)])),
};
export { label as categoryLabel };
