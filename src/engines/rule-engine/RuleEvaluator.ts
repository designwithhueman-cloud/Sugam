// The shared evaluation machinery. A category evaluator (see evaluators/) decides what slice of the website context its rules see and how its score is
// built; this base decides HOW a rule is answered, by looking at the rule's own data:
//   detector : measurements the scanner already took (axe, Lighthouse, Playwright probes). Cheap, repeatable, preferred.
//   llm      : a model is handed THIS rule (id, title, evaluation prompt) as data, plus the page context. Rules are never written into a prompt template.
//   human    : needs a person; reported as not run.
//   rollup   : resolved by the engine after every category has run.
// Anything a model says is checked: a failure must quote text that exists in the context, or it is downgraded to inconclusive.
import type { LlmClient, Rule, RuleOutcome, WebsiteContext } from './RuleTypes.ts';
import type { ScorerOptions } from './RuleScorer.ts';
import { aiProvider } from './llm/index.ts';

export const SYSTEM_PROMPT = 'You are a careful website reviewer. You are given a JSON list of review rules and a JSON page context. For each rule, apply ONLY the rule\'s evaluationPrompt to the page context. Answer "pass", "fail", "inconclusive" or "not_applicable". For "fail" you must quote exact words or elements from the context in "evidence"; if you cannot, answer "inconclusive". Never use knowledge about the website that is not in the context. Return one verdict per rule.';
export const BATCH = Number(process.env.AVARA_RULE_BATCH || 25);   // rules per model call, so 1000 rules is 40 calls, not one giant prompt

const specOf = (r: Rule) => r.evaluator ?? (r.mode === 'H' ? { type: 'llm' as const } : r.mode === 'U' ? { type: 'human' as const } : r.mode === 'R' ? { type: 'rollup' as const } : { type: 'detector' as const });
export const AI_PLAN_NOTE = 'Not part of the Free plan: AI-assisted checks run on Creator and Agency. This says nothing about the page.';
export const AI_PENDING_NOTE = 'AI checks are still running for this scan; this report updates when they finish.';
/** Why judgement rules did not run, naming the switch and the key for the configured provider. */
export function aiOffNote(): string {
  if (process.env.AVARA_AI !== 'on') return 'No AI model is configured: AVARA_AI is not "on", so rules that need judgement did not run.';
  const p = aiProvider(); const key = p === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  return p ? `No AI model is configured: AVARA_AI is on but ${key} is not set for the ${p === 'gemini' ? 'Gemini' : 'Claude'} provider, so rules that need judgement did not run.` : `No AI model is configured: AVARA_AI_PROVIDER is not "claude" or "gemini", so rules that need judgement did not run.`;
}
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
    // A hybrid rule's detectors may have run before the model is asked; their evidence stays on the outcome the model decides.
    const measured = new Map<string, RuleOutcome>();
    for (const r of rules) {
      const spec = specOf(r);
      if (spec.type === 'rollup') continue;                                        // resolved later, with zero weight
      if (spec.type === 'human') { outcomes.push({ ...this.out(r, 'not_run', 'human', 'Needs a person or an assistive-technology session; no model or scan can decide it.', [], 0), skip: 'needs_person' as const }); continue; }
      const det = spec.detectors ?? [];
      if (spec.type === 'detector') { outcomes.push(this.byDetectors(r, det, ctx)); continue; }
      // llm rule: detectors that already found something answer it; otherwise the model is asked.
      const first = det.length ? this.byDetectors(r, det, ctx) : null;
      if (first && (first.result === 'observed_failure' || first.result === 'needs_human_review')) { outcomes.push(first); continue; }
      // Hybrid rule whose measurement passed or does not apply: with no model, that measured answer stands; with one, the model judges the rest.
      if (first && !llm && (first.result === 'observed_pass' || first.result === 'not_applicable')) { outcomes.push(first); continue; }
      // Hybrid rule whose measurement did not run, with no model: keep the detector's own skip reason (missing input, analyzer error). Filing it
      // under "AI unavailable" would hide that the implemented detector itself was skipped.
      if (first && !llm && (first.result === 'not_run' || first.result === 'unimplemented')) { outcomes.push({ ...first, observation: `${first.observation} ${ctx.aiPending ? AI_PENDING_NOTE : ctx.aiExcluded ? AI_PLAN_NOTE : aiOffNote()}` }); continue; }
      if (first?.detectorsRan?.length) measured.set(r.ruleId, first);
      forAi.push(r);
    }
    if (forAi.length) {
      if (!llm) { aiNote = ctx.aiPending ? AI_PENDING_NOTE : ctx.aiExcluded ? AI_PLAN_NOTE : aiOffNote(); for (const r of forAi) outcomes.push({ ...this.out(r, 'not_run', 'none', aiNote, [], 0), skip: ctx.aiPending ? 'ai_pending' : 'ai_unavailable' }); }
      else {
        const context = this.slice(ctx); const haystack = flat(context);
        for (let i = 0; i < forAi.length; i += BATCH) {
          const chunk = forAi.slice(i, i + BATCH);
          try {
            const verdicts = await llm.evaluate({ system: SYSTEM_PROMPT, rules: chunk.map((r) => ({ ruleId: r.ruleId, title: r.title, evaluationPrompt: r.evaluationPrompt })), context, images: this.useImages ? ctx.screenshots : undefined });
            for (const r of chunk) {
              const v = verdicts.find((x) => x.ruleId === r.ruleId);
              if (!v) { outcomes.push(this.out(r, 'inconclusive', 'ai_assisted', 'The model returned no verdict for this rule.', [], 0.3)); continue; }
              // An unanswered call (rate limit, overload, refusal) is not a judgement: the rule did not run, and says why.
              if (v.undecided) { const why = v.observation.replace(/^Not decided: /, 'The model gave no answer: ').replace(/ This says nothing about the page\.$/, ''); aiNote ??= why; outcomes.push(this.measuredOr(r, ctx, why) ?? { ...this.out(r, 'not_run', 'none', `${why}. This says nothing about the page.`, [], 0), skip: 'ai_no_answer' }); continue; }
              judged++; const o = this.fromVerdict(r, v, haystack); const m = measured.get(r.ruleId);
              outcomes.push(m ? { ...o, detectorsRan: m.detectorsRan, measuredResult: m.result, observation: `${o.observation} Measured part: ${m.observation}` } : o);
            }
          } catch (e) { aiNote = `The model call failed (${(e as Error).message.split('\n')[0].slice(0, 100)}).`; for (const r of chunk) outcomes.push(this.measuredOr(r, ctx, aiNote) ?? { ...this.out(r, 'not_run', 'none', aiNote, [], 0), skip: 'ai_unavailable' }); }
        }
      }
    }
    if (this.interpretFailures && llm?.interpret) await this.explain(ctx, rules, outcomes, llm).catch(() => {});
    return { outcomes, judged, aiNote };
  }

  /** A hybrid rule whose measurement already answered (pass or not applicable) keeps that answer when the model does not; null otherwise. */
  private measuredOr(r: Rule, ctx: WebsiteContext, why: string): RuleOutcome | null {
    const spec = specOf(r); const det = 'detectors' in spec ? spec.detectors ?? [] : []; if (!det.length) return null;
    const m = this.byDetectors(r, det, ctx);
    return m.result === 'observed_pass' || m.result === 'not_applicable' ? { ...m, observation: `${m.observation} The judgement part did not run: ${why.replace(/\.$/, '')}.` } : null;
  }
  private out(r: Rule, result: RuleOutcome['result'], method: RuleOutcome['method'], observation: string, evidence: string[], confidence: number, reason?: string): RuleOutcome {
    return { ruleId: r.ruleId, result, method, observation, evidence, confidence, reason };
  }
  protected byDetectors(r: Rule, ids: string[], ctx: WebsiteContext): RuleOutcome {
    if (!ids.length) return { ...this.out(r, 'unimplemented', 'none', 'No detector or evaluator exists for this rule yet.', [], 0), skip: 'missing_detector' };
    const ran = ids.filter((id) => ctx.detectors[id]?.ran);
    const reps = ran.filter((id) => !ctx.detectors[id].notApplicable);
    const tag = (o: RuleOutcome): RuleOutcome => ({ ...o, detectorsRan: ran });
    // Every reason is kept: with several checks, the first one's reason alone can hide what another check could not inspect (UX-017's "No visible error").
    if (!reps.length && ran.length) return tag({ ...this.out(r, 'not_applicable', 'measured', [...new Set(ran.map((id) => ctx.detectors[id].notApplicable).filter(Boolean))].join(' ') || 'The rule does not apply to this page.', [], 0.7), skip: 'not_applicable' });
    if (!reps.length) {
      // Why nothing ran: no report at all means the scanner has no such detector; a report that did not run is missing input, unless its analyzer failed.
      const known = ids.map((id) => ctx.detectors[id]).filter(Boolean);
      const skip = !known.length ? 'missing_detector' : known.some((x) => x.analyzerError) ? 'analyzer_error' : 'missing_input';
      return { ...this.out(r, 'not_run', 'none', `The measurement for this rule did not run (${ids.slice(0, 3).join(', ')})${known[0]?.note ? `: ${known[0].note.replace(/\.$/, '')}` : ''}.`, [], 0), skip };
    }
    const hits = reps.flatMap((id) => ctx.detectors[id].hits);
    const fails = hits.filter((h) => h.bucket === 'confirmed_failure'); const review = hits.filter((h) => h.bucket === 'needs_review');
    // A confirmed failure leads, but review items from the same rule stay visible beside it instead of being dropped.
    if (fails.length) return tag(this.out(r, 'observed_failure', 'measured', fails[0].summary + (fails.length > 1 ? ` (and ${fails.length - 1} more)` : '') + (review.length ? ` Also needs review: ${review[0].summary}` : ''),
      [...fails.flatMap((h) => h.evidence).slice(0, review.length ? 4 : 6), ...review.slice(0, 2).map((h) => `Also needs review: ${h.summary}`)], 0.9));
    if (review.length) return tag(this.out(r, 'needs_human_review', 'measured', review[0].summary, review.flatMap((h) => h.evidence).slice(0, 4), 0.5));
    // Say what a clean run checked and what it could not inspect, so "the message is clear" and "there was nothing to look at" never read the same.
    const said = [...reps.map((id) => ctx.detectors[id].passNote).filter(Boolean), ...ran.filter((id) => ctx.detectors[id].notApplicable).map((id) => `Not inspected: ${ctx.detectors[id].notApplicable}`)];
    return tag(this.out(r, 'observed_pass', 'measured', said.length ? `${said.join(' ')} This does not prove the whole topic passes.` : 'The measurable part of this rule ran and found nothing. This does not prove the whole topic passes.', [], 0.7));
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
