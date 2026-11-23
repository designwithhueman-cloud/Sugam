// The rule engine. Flow: load rules -> group by category -> run each category's evaluator over only its own rules -> generate findings ->
// resolve rollups -> score each category -> score the product. It names no rule: everything it does is driven by the loaded JSON.
import { RuleLoader, ruleLoader } from './RuleLoader.ts';
import { evaluatorFor } from './evaluators/index.ts';
import { generateFinding } from './FindingGenerator.ts';
import { scoreCategory, scoreOverall } from './RuleScorer.ts';
import { recordsFromOutcomes } from './RuleCoverage.ts';
import { buildAiReview } from '../../../lib/avara/ai-review.ts';
import type { CategoryResult, LlmClient, Rule, RuleOutcome, ReviewResult, WebsiteContext } from './RuleTypes.ts';

export class RuleEngine {
  private loader: RuleLoader; private llm: LlmClient | null;
  constructor(loader: RuleLoader = ruleLoader(), llm: LlmClient | null = null) { this.loader = loader; this.llm = llm; }

  async review(ctx: WebsiteContext): Promise<ReviewResult> {
    const manifest = this.loader.manifest; const rules = this.loader.loadAllRules();
    const issues = this.loader.issues;
    // Categories run independently and in parallel: a failure in one is recorded and never costs the others.
    const ran = await Promise.all(manifest.categories.map(async (c) => {
      const mine = rules.filter((r) => r.category === c.label);
      try { const ev = evaluatorFor(c.label); const res = await ev.evaluate(ctx, mine, this.llm); return { c, mine, ev, ...res, error: null as string | null }; }
      catch (e) { const msg = (e as Error).message.split('\n')[0]; return { c, mine, ev: evaluatorFor(c.label), outcomes: mine.map((x): RuleOutcome => ({ ruleId: x.ruleId, result: 'not_run', method: 'none', observation: `This category could not be evaluated (${msg}).`, evidence: [], confidence: 0, skip: 'analyzer_error' })), judged: 0, aiNote: undefined, error: msg }; }
    }));
    const all = new Map<string, RuleOutcome>(ran.flatMap((r) => r.outcomes.map((o) => [o.ruleId, o] as const)));
    // Rollups: a summary of other rules (possibly in other categories). Zero weight, so they never move a score.
    for (const r of ran) for (const rule of r.mine.filter((x) => x.evaluator?.type === 'rollup' || x.mode === 'R')) {
      const kids = ((rule.evaluator as { rollsUp?: string[] } | undefined)?.rollsUp ?? []).map((id) => all.get(id)).filter(Boolean) as RuleOutcome[];
      // A child counts as flagged when it failed or needs a person. The rollup asks for at least `minFlags` of them (default 1). It has no weight, so it never moves a score.
      const flagged = kids.filter((k) => k.result === 'observed_failure' || k.result === 'needs_human_review'); const need = Number((rule.parameters as { minFlags?: number } | undefined)?.minFlags ?? 1);
      const names = flagged.map((k) => k.ruleId).join(', ');
      // A rollup only summarises. It never passes on its own: with nothing flagged it is inconclusive, and with no inputs it did not run.
      const o: RuleOutcome = { ruleId: rule.ruleId, result: kids.length ? (flagged.length >= need ? 'needs_human_review' : 'inconclusive') : 'not_run', method: 'rollup', skip: kids.length ? undefined : 'rollup_no_inputs', detectorsRan: kids.map((k) => k.ruleId),
        observation: kids.length ? `${flagged.length} of ${kids.length} underlying checks were flagged${names ? ` (${names})` : ''}; ${need} are needed to raise this. It adds no deduction of its own.` : 'None of the underlying checks ran.', evidence: flagged.map((k) => `${k.ruleId}: ${k.observation}`).slice(0, 6), confidence: 0.5 };
      r.outcomes.push(o); all.set(o.ruleId, o);
    }
    const categories: CategoryResult[] = ran.map((r) => {
      const findings = r.outcomes.map((o) => { const rule = r.mine.find((x) => x.ruleId === o.ruleId) as Rule; return rule && rule.evaluator?.type !== 'rollup' ? generateFinding(rule, o, { url: ctx.url }, manifest) : null; }).filter((f): f is NonNullable<typeof f> => !!f);
      const sc = scoreCategory(r.c.label, r.c.weight, r.mine, r.outcomes, findings, r.ev.scoring);
      return r.error ? { ...sc, score: null, note: `This category could not be evaluated (${r.error}).` } : sc;
    });
    const judged = ran.reduce((n, r) => n + r.judged, 0); const aiNote = ran.find((r) => r.aiNote)?.aiNote;
    return {
      rulesVersion: manifest.libraryVersion, ranAt: new Date().toISOString(), categories, overall: scoreOverall(categories, manifest),
      ai: { used: judged > 0, model: this.llm?.model, reason: aiNote, rulesJudged: judged }, loaderIssues: issues,
      aiReview: this.llm ? buildAiReview(this.llm.model, manifest.categories.map((c) => c.label), rules, all) : undefined,
      executions: recordsFromOutcomes(rules, all, manifest),
    };
  }
}
