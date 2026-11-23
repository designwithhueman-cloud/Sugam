// The paid AI review, per category. Pure: the same graded criteria always give the same ratings.
//   Each criterion is graded by the model as met, partly met, unmet or insufficient evidence, and grounded in an exact quote, a screenshot
//   region or a browser measurement. Grounding is checked in code (RuleEvaluator): a point that cannot be traced is insufficient evidence.
//   Rating = 100 × (met × 1 + partly met × 0.5 + unmet × 0) ÷ criteria decided. Insufficient evidence is excluded from both sides.
// The AI review never changes the automated score, which comes from built-in checks only and is the same on every plan.
import type { AiGrade, AiGrounding, RuleOutcome, Rule } from '../../src/engines/rule-engine/RuleTypes.ts';

export const POINTS: Record<Exclude<AiGrade, 'insufficient_evidence'>, number> = { met: 1, partly_met: 0.5, unmet: 0 };
export type AiItem = { ruleId: string; title: string; grade: AiGrade; observation: string; recommendation: string; grounding: AiGrounding | null; sourceUrl: string; section: string; weight: number };
export type AiCategory = { category: string; rating: number | null; decided: number; met: number; partly: number; unmet: number; insufficient: number; items: AiItem[] };
export type AiReview = { model: string; categories: AiCategory[] };

export function rate(grades: AiGrade[]): number | null {
  const decided = grades.filter((g) => g !== 'insufficient_evidence') as Exclude<AiGrade, 'insufficient_evidence'>[];
  return decided.length ? Math.round((100 * decided.reduce((n, g) => n + POINTS[g], 0)) / decided.length) : null;
}

/** Actionable items first: unmet before partly met, then by the criterion's weight. */
export const priority = (a: AiItem, b: AiItem) => ({ unmet: 0, partly_met: 1, met: 2, insufficient_evidence: 3 }[a.grade] - { unmet: 0, partly_met: 1, met: 2, insufficient_evidence: 3 }[b.grade]) || b.weight - a.weight || a.ruleId.localeCompare(b.ruleId);

export function buildAiReview(model: string, categories: string[], rules: Rule[], outcomes: Map<string, RuleOutcome>): AiReview | undefined {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  const cats = categories.map((category): AiCategory => {
    const items = [...outcomes.values()].filter((o) => o.ai && byId.get(o.ruleId)?.category === category).map((o): AiItem => {
      const r = byId.get(o.ruleId)!; const c = (r as Rule & { criterion?: { sourceUrl?: string; section?: string } }).criterion;
      return { ruleId: o.ruleId, title: r.title, grade: o.ai!.grade, observation: o.ai!.observation, recommendation: o.ai!.recommendation, grounding: o.ai!.grounding, sourceUrl: c?.sourceUrl ?? r.sourceUrl ?? '', section: c?.section ?? '', weight: r.weight };
    }).sort(priority);
    const n = (g: AiGrade) => items.filter((i) => i.grade === g).length;
    return { category, rating: rate(items.map((i) => i.grade)), decided: items.length - n('insufficient_evidence'), met: n('met'), partly: n('partly_met'), unmet: n('unmet'), insufficient: n('insufficient_evidence'), items };
  });
  return cats.some((c) => c.items.length) ? { model, categories: cats } : undefined;
}
