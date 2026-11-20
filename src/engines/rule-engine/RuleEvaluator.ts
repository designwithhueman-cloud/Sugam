// The shared evaluation machinery. A category evaluator (see evaluators/) decides what slice of the website context its rules see and how its score is
// built; this base decides HOW a rule is answered, by looking at the rule's own data:
//   detector : measurements the scanner already took (axe, Lighthouse, Playwright probes). Cheap, repeatable, preferred.
//   llm      : a model is handed THIS rule (id, title, evaluation prompt) as data, plus the page context. Rules are never written into a prompt template.
//   human    : needs a person; reported as not run.
//   rollup   : resolved by the engine after every category has run.
// Anything a model says is checked: a failure must quote text that exists in the context, or it is downgraded to inconclusive.
import type { LlmClient, Rule, RuleOutcome, WebsiteContext } from './RuleTypes.ts';
import type { ScorerOptions } from './RuleScorer.ts';

export const SYSTEM_PROMPT = 'You are a careful website reviewer. You are given a JSON list of review rules and a JSON page context. For each rule, apply ONLY the rule\'s evaluationPrompt to the page context. Answer "pass", "fail", "inconclusive" or "not_applicable". For "fail" you must quote exact words or elements from the context in "evidence"; if you cannot, answer "inconclusive". Never use knowledge about the website that is not in the context. Return one verdict per rule.';
export const BATCH = Number(process.env.AVARA_RULE_BATCH || 25);   // rules per model call, so 1000 rules is 40 calls, not one giant prompt

const specOf = (r: Rule) => r.evaluator ?? (r.mode === 'H' ? { type: 'llm' as const } : r.mode === 'U' ? { type: 'human' as const } : r.mode === 'R' ? { type: 'rollup' as const } : { type: 'detector' as const });
const flat = (v: unknown) => JSON.stringify(v ?? '').toLowerCase().replace(/\s+/g, ' ');

export abstract class CategoryEvaluator {
  abstract readonly category: string;      // must equal the "category" of its rules
  abstract readonly name: string;
  readonly useImages: boolean = false;
  readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  /** What this category's reviewer is allowed to see. */
  protected abstract slice(ctx: WebsiteContext): Record<string, unknown>;
  /** Accessibility and Performance read measurements first and use a model only to explain failures. */
  protected readonly interpretFailures: boolean = false;

  async evaluate(ctx: WebsiteContext, rules: Rule[], llm: LlmClient | null): Promise<{ outcomes: RuleOutcome[]; judged: number; aiNote?: string }> {
    const outcomes: RuleOutcome[] = []; const forAi: Rule[] = []; let judged = 0; let aiNote: string | undefined;
    for (const r of rules) {
      const spec = specOf(r);
      if (spec.type === 'rollup') continue;                                        // resolved later, with zero weight
      if (spec.type === 'human') { outcomes.push(this.out(r, 'not_run', 'human', 'Needs a person or an assistive-technology session; no model or scan can decide it.', [], 0)); continue; }
      const det = spec.detectors ?? [];
      if (spec.type === 'detector') { outcomes.push(this.byDetectors(r, det, ctx)); continue; }
      // llm rule: detectors that already found something answer it; otherwise the model is asked.
      const first = det.length ? this.byDetectors(r, det, ctx) : null;
      if (first && (first.result === 'observed_failure' || first.result === 'needs_human_review')) { outcomes.push(first); continue; }
      // Hybrid rule whose measurement passed or does not apply: with no model, that measured answer stands; with one, the model judges the rest.
      if (first && !llm && (first.result === 'observed_pass' || first.result === 'not_applicable')) { outcomes.push(first); continue; }
      forAi.push(r);
    }
    if (forAi.length) {
      if (!llm) { aiNote = 'No AI model is configured (set AVARA_AI=on and ANTHROPIC_API_KEY), so rules that need judgement did not run.'; for (const r of forAi) outcomes.push(this.out(r, 'not_run', 'none', aiNote, [], 0)); }
      else {
        const context = this.slice(ctx); const haystack = flat(context);
        for (let i = 0; i < forAi.length; i += BATCH) {
          const chunk = forAi.slice(i, i + BATCH);
          try {
            const verdicts = await llm.evaluate({ system: SYSTEM_PROMPT, rules: chunk.map((r) => ({ ruleId: r.ruleId, title: r.title, evaluationPrompt: r.evaluationPrompt })), context, images: this.useImages ? ctx.screenshots : undefined });
            for (const r of chunk) {
              const v = verdicts.find((x) => x.ruleId === r.ruleId);
              if (!v) { outcomes.push(this.out(r, 'inconclusive', 'ai_assisted', 'The model returned no verdict for this rule.', [], 0.3)); continue; }
              judged++; outcomes.push(this.fromVerdict(r, v, haystack));
            }
          } catch (e) { aiNote = `The model call failed (${(e as Error).message.split('\n')[0].slice(0, 100)}).`; for (const r of chunk) outcomes.push(this.out(r, 'not_run', 'none', aiNote, [], 0)); }
        }
      }
    }
    if (this.interpretFailures && llm?.interpret) await this.explain(ctx, rules, outcomes, llm).catch(() => {});
    return { outcomes, judged, aiNote };
  }

  private out(r: Rule, result: RuleOutcome['result'], method: RuleOutcome['method'], observation: string, evidence: string[], confidence: number, reason?: string): RuleOutcome {
    return { ruleId: r.ruleId, result, method, observation, evidence, confidence, reason };
  }
  protected byDetectors(r: Rule, ids: string[], ctx: WebsiteContext): RuleOutcome {
    if (!ids.length) return this.out(r, 'unimplemented', 'none', 'No detector or evaluator exists for this rule yet.', [], 0);
    const ran = ids.map((id) => ctx.detectors[id]).filter((x) => x?.ran);
    const reps = ran.filter((x) => !x.notApplicable);
    if (!reps.length && ran.length) return this.out(r, 'not_applicable', 'measured', ran[0].notApplicable ?? 'The rule does not apply to this page.', [], 0.7);
    if (!reps.length) return this.out(r, 'not_run', 'none', `The measurement for this rule did not run (${ids.slice(0, 3).join(', ')}).`, [], 0);
    const hits = reps.flatMap((x) => x.hits);
    const fails = hits.filter((h) => h.bucket === 'confirmed_failure'); const review = hits.filter((h) => h.bucket === 'needs_review');
    if (fails.length) return this.out(r, 'observed_failure', 'measured', fails[0].summary + (fails.length > 1 ? ` (and ${fails.length - 1} more)` : ''), fails.flatMap((h) => h.evidence).slice(0, 6), 0.9);
    if (review.length) return this.out(r, 'needs_human_review', 'measured', review[0].summary, review.flatMap((h) => h.evidence).slice(0, 4), 0.5);
    return this.out(r, 'observed_pass', 'measured', 'The measurable part of this rule ran and found nothing. This does not prove the whole topic passes.', [], 0.7);
  }
  private fromVerdict(r: Rule, v: import('./RuleTypes.ts').LlmVerdict, haystack: string): RuleOutcome {
    const conf = Math.max(0, Math.min(0.7, Number(v.confidence) || 0.5));   // an AI-assisted judgement never claims more than medium confidence
    if (v.result === 'not_applicable') return this.out(r, 'not_applicable', 'ai_assisted', v.observation || 'The rule does not apply to this page.', [], conf);
    if (v.result === 'inconclusive') return this.out(r, 'inconclusive', 'ai_assisted', v.observation || 'The context was not enough to decide.', v.evidence ?? [], conf);
    if (v.result === 'pass') return this.out(r, 'observed_pass', 'ai_assisted', v.observation, v.evidence ?? [], conf);
    const quotes = (v.evidence ?? []).filter((q) => q.trim().length > 2 && haystack.includes(q.toLowerCase().replace(/\s+/g, ' ').trim()));
    if (!quotes.length) return this.out(r, 'inconclusive', 'ai_assisted', 'The model reported a problem but its quoted evidence was not found in the page, so it is not counted.', v.evidence ?? [], 0.3, 'evidence-not-found');
    return this.out(r, 'needs_human_review', 'ai_assisted', v.observation, quotes, conf);   // a model alone does not confirm a failure; a person does
  }
  private async explain(ctx: WebsiteContext, rules: Rule[], outcomes: RuleOutcome[], llm: LlmClient) {
    const failed = outcomes.filter((o) => o.result === 'observed_failure').slice(0, 20); if (!failed.length) return;
    const res = await llm.interpret!({ system: 'Explain, in one sentence each, who is affected and the likely consequence. Use only the evidence given. Say "may" for anything inferred.', failures: failed.map((o) => ({ ruleId: o.ruleId, title: rules.find((r) => r.ruleId === o.ruleId)?.title ?? o.ruleId, observation: o.observation, evidence: o.evidence })), context: this.slice(ctx) });
    for (const x of res) { const o = failed.find((f) => f.ruleId === x.ruleId); if (o) { o.userImpact = x.userImpact; o.businessImpact = x.businessImpact; } }
  }
}
