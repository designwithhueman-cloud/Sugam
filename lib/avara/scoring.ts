// Avara scoring policy (PROVISIONAL, pilot before using any number in a launch claim). Pure and deterministic: the same groups in any order give
// the same result. Only independently confirmed, score-eligible repair groups deduct. Advisory and unsupported findings, heuristics and rollups never do.
// An overall number is withheld when an applicable category has incomplete required coverage, or nothing was assessed.
import { CATALOG, CATEGORIES, type CatCode } from './catalog.ts';

export const SCORING_POLICY = { version: 'avara-score-0.1-provisional', deductions: { critical: 40, major: 15, minor: 5 } as const };
export type Sev = keyof typeof SCORING_POLICY.deductions;
/** One repair group, after ownership has been decided: one primary owner, evidence from other categories linked, not scored again. */
export type ScoredGroup = { groupId: string; ownerRuleId: string; category: CatCode; severity: Sev; confirmed: boolean; scoreEligible: boolean; advisory: boolean; blocksMainTask: boolean };
/** Versioned list of the checks that must have run, per category, before that category counts as covered. Defined before the scan runs. */
export type CoverageProfile = { version: string; required: Partial<Record<CatCode, string[]>>; inapplicable?: Partial<Record<CatCode, string>> };

export type CategoryResult = { category: CatCode; assessed: boolean; score: number | null; deductions: { groupId: string; ownerRuleId: string; points: number }[]; missing: string[]; note: string };
export type ScoreResult = {
  policy: string; coverageProfile: string; categories: CategoryResult[]; overall: number | null; overallWithheld: string | null;
  headline: string | null; advisory: { groupId: string; ownerRuleId: string; reason: string }[];
};

export function scoreGroups(groups: ScoredGroup[], executed: Set<string>, profile: CoverageProfile): ScoreResult {
  const sorted = [...groups].sort((a, b) => (a.ownerRuleId + a.groupId).localeCompare(b.ownerRuleId + b.groupId));
  const seen = new Set<string>(); const advisory: ScoreResult['advisory'] = [];
  const cats: CategoryResult[] = (Object.keys(CATEGORIES) as CatCode[]).map((category) => {
    const inapplicable = profile.inapplicable?.[category] ?? (CATEGORIES[category].weight === 0 ? 'observations only: this category carries no weight' : undefined);
    if (inapplicable) return { category, assessed: false, score: null, deductions: [], missing: [], note: `Not applicable: ${inapplicable}` };
    const missing = (profile.required[category] ?? []).filter((r) => !executed.has(r));
    const deductions: CategoryResult['deductions'] = [];
    for (const g of sorted.filter((x) => x.category === category)) {
      if (seen.has(g.groupId)) continue; seen.add(g.groupId);          // a group is deducted once, by its single owner
      if (!g.confirmed || !g.scoreEligible || g.advisory) { advisory.push({ groupId: g.groupId, ownerRuleId: g.ownerRuleId, reason: !g.confirmed ? 'not independently confirmed' : g.advisory ? 'advisory' : 'its rule is not score-eligible yet' }); continue; }
      deductions.push({ groupId: g.groupId, ownerRuleId: g.ownerRuleId, points: SCORING_POLICY.deductions[g.severity] });
    }
    const score = Math.max(0, 100 - deductions.reduce((n, d) => n + d.points, 0));
    return { category, assessed: missing.length === 0, score: missing.length === 0 ? score : null, deductions, missing, note: missing.length ? `Required checks did not run: ${missing.join(', ')}` : 'Covered' };
  });
  const applicable = cats.filter((c) => !profile.inapplicable?.[c.category] && CATEGORIES[c.category].weight > 0);
  const incomplete = applicable.filter((c) => !c.assessed);
  const assessed = applicable.filter((c) => c.assessed);
  const den = assessed.reduce((n, c) => n + CATEGORIES[c.category].weight, 0);
  const withheld = !assessed.length || den === 0 ? 'No category has the required coverage yet.' : incomplete.length ? `${incomplete.map((c) => CATEGORIES[c.category].label).join(', ')} ${incomplete.length === 1 ? 'has' : 'have'} incomplete required coverage.` : null;
  const overall = withheld ? null : Math.round(assessed.reduce((n, c) => n + (c.score as number) * CATEGORIES[c.category].weight, 0) / den);
  const blocker = sorted.find((g) => g.confirmed && g.blocksMainTask);
  return { policy: SCORING_POLICY.version, coverageProfile: profile.version, categories: cats, overall, overallWithheld: withheld, advisory, headline: blocker ? `A confirmed blocker on the main task (${blocker.ownerRuleId}) comes before any average.` : null };
}

/** Coverage profile v0.1: every measurable or heuristic topic is mandatory for its category. Most are not implemented yet, so no overall number is published. */
export const DEFAULT_PROFILE: CoverageProfile = {
  version: 'avara-coverage-0.1',
  required: Object.fromEntries((Object.keys(CATEGORIES) as CatCode[]).filter((c) => CATEGORIES[c].weight > 0).map((c) => [c, CATALOG.filter((r) => r.category === c && (r.mode === 'M' || r.mode === 'H')).map((r) => r.id)])),
};
