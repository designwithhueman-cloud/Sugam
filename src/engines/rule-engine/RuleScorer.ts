// Scores categories and the product. Pure functions of rules + outcomes, so the same evidence always gives the same number.
// Category score = 100 x (weight of passed rules) / (weight of decided rules). Rules that were not run, are unimplemented, need a person, are
// inconclusive or not applicable do NOT count either way; coverage says how much of the category's weight was actually decided. Category
// weights come from the manifest (they total 100). Scores are provisional until every rule in a category is score-eligible.
import type { CategoryResult, Coverage, Finding, Manifest, Rule, RuleOutcome, RuleResult, ReviewResult } from './RuleTypes.ts';

export type ScorerOptions = { countAiAssisted: boolean; severityBoost: Partial<Record<Rule['severity'], number>> };
const RESULTS: RuleResult[] = ['observed_pass', 'observed_failure', 'needs_human_review', 'inconclusive', 'not_applicable', 'not_run', 'unimplemented'];

export function scoreCategory(label: string, weight: number, rules: Rule[], outcomes: RuleOutcome[], findings: Finding[], opts: ScorerOptions): CategoryResult {
  const by = new Map(outcomes.map((o) => [o.ruleId, o]));
  const counts = Object.fromEntries(RESULTS.map((r) => [r, 0])) as Record<RuleResult, number>;
  let pass = 0, decided = 0, weightTotal = 0, weightDecided = 0, measured = 0, ai = 0, decidedRules = 0;
  const scorable = rules.filter((r) => r.weight > 0 && r.evaluator?.type !== 'rollup' && r.mode !== 'R');
  for (const r of scorable) weightTotal += r.weight;
  for (const o of outcomes) counts[o.result]++;
  for (const r of scorable) {
    const o = by.get(r.ruleId); if (!o) continue;
    if (o.result !== 'observed_pass' && o.result !== 'observed_failure') continue;
    if (o.method === 'ai_assisted' && !opts.countAiAssisted) continue;
    const w = r.weight * (opts.severityBoost[r.severity] ?? 1);
    decided += w; weightDecided += r.weight; decidedRules++;
    if (o.result === 'observed_pass') pass += w;
    if (o.method === 'ai_assisted') ai++; else measured++;
  }
  const coverage: Coverage = { rules: scorable.length, decided: decidedRules, weightDecided, weightTotal, pct: weightTotal ? Math.round((100 * weightDecided) / weightTotal) : 0 };
  const eligible = scorable.length > 0 && scorable.every((r) => r.scoreEligible);
  const score = decided > 0 ? Math.round((100 * pass) / decided) : null;
  return {
    category: label, score, findings, scoreStatus: eligible && coverage.pct === 100 ? 'final' : 'provisional', coverage, counts, basis: { measured, aiAssisted: ai }, weight,
    note: scorable.length === 0 ? 'Observations only: no rule in this category carries weight, so it is not scored.' : score == null ? 'Nothing in this category could be decided yet.' : `Provisional: ${coverage.pct}% of this category's rule weight was decided${ai ? `, ${ai} by AI-assisted judgement` : ''}.`,
  };
}

/** Product score: the category scores weighted by the manifest, over the categories that could be scored. Never presented as final while anything is provisional. */
export function scoreOverall(cats: CategoryResult[], manifest: Manifest): ReviewResult['overall'] {
  const scored = cats.filter((c) => c.score != null);
  const wAll = manifest.categories.reduce((n, c) => n + c.weight, 0); const w = scored.reduce((n, c) => n + c.weight, 0);
  const total = scored.length ? Math.round(scored.reduce((n, c) => n + (c.score as number) * c.weight, 0) / w) : null;
  const final = scored.length === manifest.categories.length && scored.every((c) => c.scoreStatus === 'final');
  const missing = cats.filter((c) => c.score == null).map((c) => c.category);
  const cov = Math.round(cats.reduce((n, c) => n + c.weight * (c.coverage.pct / 100), 0) * 100 / (wAll || 1));
  return {
    score: total, status: final ? 'final' : 'provisional', assessedCategories: scored.length, totalCategories: manifest.categories.length, weightAssessed: w, coveragePct: cov,
    note: total == null ? 'No category could be scored yet.' : `Provisional: ${scored.length} of ${manifest.categories.length} categories scored, about ${cov}% of all rule weight decided${missing.length ? `. Not scored: ${missing.join(', ')}` : ''}.`,
  };
}
