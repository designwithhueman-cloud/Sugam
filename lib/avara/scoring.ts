// Avara scoring policy 2.0. Pure and deterministic: the same per-rule records in any order give the same result, on every plan.
//
// What counts: admitted checks only (src/rules/_admissions.json: a measurable condition, a published standard or documented Avara guidance,
// saved evidence, and a failing and a clean fixture). A check's result is what its detectors measured, never an AI opinion: a hybrid rule
// counts by its measured part, which is the same with AI on or off, so Free and Paid get the same scores. Skipped, not-applicable,
// inconclusive and needs-a-person results count on neither side. Each rule counts once; its result already merges every tested width, and a
// confirmed failure at any width is a failure.
//
// Category: 100 × (weight of passed admitted checks) ÷ (weight of decided admitted checks), for all nine categories (Differentiation
// included). A category is scored only when every admitted check in it ran or was decided not applicable, and at least one was decided;
// otherwise it is "Couldn't score" with the reason. Page score: the simple average of the unrounded scores of the scored categories, shown
// with how many of the nine were scored. Rounding happens once, for display.
import { CATEGORIES, type CatCode } from './catalog.ts';

export const SCORING_POLICY = { version: 'avara-score-2.0', formula: '100 × passed ÷ decided admitted-check weight per category (measured results only); page = simple average of scored categories' } as const;

/** Versioned list of the checks that must have run, per category, before that category may be scored. Defined before the scan runs. */
export type CoverageProfile = { version: string; required: Partial<Record<CatCode, string[]>>; inapplicable?: Partial<Record<CatCode, string>> };
/** The part of a per-rule record (src/engines/rule-engine/RuleCoverage.ts) that scoring reads. */
export type ScoreInput = { ruleId: string; category: string; weight: number; execution: string; reason: string | null; outcome: string; method: string; scope: string; scoreEligible: boolean; observationOnly: boolean; measured?: string | null };

/** 'insufficient' is shown as "Couldn't score". 'observation' is no longer produced (Differentiation is scored); kept for stored views. */
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
  const m = r.measured ?? null;
  if (m === 'observed_pass' || m === 'observed_failure') return null;
  if (m === 'not_applicable') return 'its measured check does not apply to this page';
  if (m === 'needs_human_review') return 'needs a person to confirm';
  if (m === 'inconclusive') return 'inconclusive';
  if (r.method === 'ai_assisted') return 'AI opinion only: no measured result';
  if (r.method === 'human') return 'needs a person';
  if (r.method === 'rollup' || r.scope === 'summary') return 'summary of other rules';
  return `no measured result (${r.outcome})`;
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
    const inapplicable = profile.inapplicable?.[category];
    if (inapplicable) return { ...empty, status: 'not_applicable', eligibleRules: eligible.length, note: `Not applicable: ${inapplicable}` };
    const ranOrNa = new Set(rs.filter((r) => r.execution === 'ran' || r.execution === 'not_applicable').map((r) => r.ruleId));
    // Coverage: every admitted check in this category ran or was decided not applicable.
    const missing = eligible.map((r) => r.ruleId).filter((id) => !ranOrNa.has(id));
    const excluded: CategoryResult['excluded'] = []; const scored: CategoryResult['rules'] = [];
    for (const r of eligible) { const why = whyExcluded(r); if (why) excluded.push({ ruleId: r.ruleId, why }); else scored.push({ ruleId: r.ruleId, weight: r.weight, result: r.measured === 'observed_failure' ? 'fail' : 'pass' }); }
    const passedWeight = scored.filter((x) => x.result === 'pass').reduce((n, x) => n + x.weight, 0);
    const evaluatedWeight = scored.reduce((n, x) => n + x.weight, 0);
    const base = { ...empty, eligibleRules: eligible.length, scoredRules: scored.length, passedRules: scored.filter((x) => x.result === 'pass').length, failedRules: scored.filter((x) => x.result === 'fail').length, passedWeight, evaluatedWeight, rules: scored, excluded, missing };
    if (!eligible.length) return { ...base, status: 'insufficient', note: "Couldn't score: no check in this category has been admitted for scoring yet." };
    if (missing.length) {
      const reasons = [...new Set(rs.filter((r) => missing.includes(r.ruleId)).map((r) => (r.reason ?? 'unknown').replace(/_/g, ' ')))];
      return { ...base, status: 'insufficient', note: `Couldn't score: ${missing.length} admitted check${missing.length === 1 ? '' : 's'} did not run (${reasons.join(', ')}).` };
    }
    if (!evaluatedWeight) return { ...base, status: 'insufficient', note: `Couldn't score: none of the ${eligible.length} admitted checks could be decided on this page (${[...new Set(excluded.map((x) => x.why))].join('; ')}).` };
    const raw = (100 * passedWeight) / evaluatedWeight;
    return { ...base, status: 'scored', assessed: true, raw, score: Math.round(raw), note: `${scored.length} scored check${scored.length === 1 ? '' : 's'}: ${passedWeight} of ${evaluatedWeight} weight passed.` };
  });
  const scorable = cats.filter((c) => c.status !== 'not_applicable');
  const contributing = scorable.filter((c) => c.status === 'scored');
  // Simple average: every scored category counts equally.
  const overallRaw = contributing.length ? contributing.reduce((n, c) => n + (c.raw as number), 0) / contributing.length : null;
  const withheld = overallRaw == null ? (scorable.every((c) => !c.eligibleRules) ? "Couldn't score: no check has been admitted for scoring yet." : "Couldn't score: no category had enough measured evidence on this page.") : null;
  return { policy: SCORING_POLICY.version, coverageProfile: profile.version, categories: cats, overall: overallRaw == null ? null : Math.round(overallRaw), overallRaw, contributing: contributing.length, scorable: scorable.length, overallWithheld: withheld, headline };
}

/** Coverage profile 0.2: a category's admitted checks must all run (or be decided not applicable). AI rules are never required: a Free scan
 *  (no AI) and a Paid scan of the same page get the same scores. */
export const DEFAULT_PROFILE: CoverageProfile = { version: 'avara-coverage-0.2', required: {} };
export { label as categoryLabel };
