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

export const SYSTEM_PROMPT = 'You are a careful website reviewer. You are given a JSON list of review criteria and a JSON page context (text, structure, browser measurements and, for some categories, screenshots). For each criterion, apply ONLY its evaluationPrompt, including its applicability and exceptions, to this page. First decide what kind of page it is (for example a portfolio introduces a person and their work, a product page introduces an offer, a service page introduces a service) and judge against that. Give a grade: "met", "partly_met", "unmet" or "insufficient_evidence". Ground every grade other than insufficient_evidence in exactly one of: an exact quote copied from the context (grounding.kind "quote"), a browser measurement copied from the context (kind "measurement"), or a region of a screenshot you were shown (kind "region", with viewport, x, y, width, height in CSS pixels). If you cannot ground it, answer "insufficient_evidence". Write one short observation in plain words and, for partly_met or unmet, one specific recommendation (the smallest change). Also set result ("pass" for met, "fail" for partly_met or unmet, "inconclusive" otherwise) and evidence (the quote or measurement). Never use knowledge about the website that is not in the context, and never predict sales or conversion effects as facts. Return one verdict per criterion.';
/** The criterion's applicability, exceptions and accepted evidence (src/rules/*.json "criterion") travel with its prompt. */
const withCriterion = (r: Rule) => { const c = (r as Rule & { criterion?: { applicability?: string; exceptions?: string[]; evidence?: string[] } }).criterion; return c ? `${r.evaluationPrompt} Applies to: ${c.applicability ?? 'every page'} Exceptions: ${(c.exceptions ?? []).join(' ') || 'none'} Accepted evidence: ${(c.evidence ?? ['quote']).join(', ')}.` : r.evaluationPrompt; };
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
            const verdicts = await llm.evaluate({ system: SYSTEM_PROMPT, rules: chunk.map((r) => ({ ruleId: r.ruleId, title: r.title, evaluationPrompt: withCriterion(r) })), context, images: this.useImages ? ctx.screenshots : undefined });
            for (const r of chunk) {
              const v = verdicts.find((x) => x.ruleId === r.ruleId);
              if (!v) { outcomes.push(this.out(r, 'inconclusive', 'ai_assisted', 'The model returned no verdict for this rule.', [], 0.3)); continue; }
              // An unanswered call (rate limit, overload, refusal) is not a judgement: the rule did not run, and says why.
              if (v.undecided) { const why = v.observation.replace(/^Not decided: /, 'The model gave no answer: ').replace(/ This says nothing about the page\.$/, ''); aiNote ??= why; outcomes.push(this.measuredOr(r, ctx, why) ?? { ...this.out(r, 'not_run', 'none', `${why}. This says nothing about the page.`, [], 0), skip: 'ai_no_answer' }); continue; }
              judged++; const o = this.fromVerdict(r, v, haystack, (ctx.screenshots ?? []).map((x) => x.viewport)); const m = measured.get(r.ruleId);
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
  /** Is the model's point traceable? A quote or a measurement must appear in the context it was given; a region must sit inside a screenshot
   *  it was shown. An untraceable point is insufficient evidence, never a finding. */
  private grounded(g: import('./RuleTypes.ts').AiGrounding | undefined, haystack: string, shots: string[]): boolean {
    if (!g) return false;
    const inCtx = (t?: string) => !!t && t.trim().length > 2 && haystack.includes(t.toLowerCase().replace(/\s+/g, ' ').trim());
    if (g.kind === 'quote') return inCtx(g.quote);
    if (g.kind === 'measurement') return inCtx(g.measurement);
    const r = g.region; if (!r || !shots.includes(r.viewport)) return false;
    const maxW = r.viewport === 'desktop' ? 1280 : r.viewport === 'narrow' ? 320 : 390;
    return [r.x, r.y, r.width, r.height].every((n) => Number.isFinite(n)) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= maxW + 2 && r.y + r.height <= 20000;
  }
  private fromVerdict(r: Rule, v: import('./RuleTypes.ts').LlmVerdict, haystack: string, shots: string[] = []): RuleOutcome {
    const conf = Math.max(0, Math.min(0.7, Number(v.confidence) || 0.5));   // an AI-assisted judgement never claims more than medium confidence
    if (v.result === 'not_applicable' && !v.grade) return this.out(r, 'not_applicable', 'ai_assisted', v.observation || 'The rule does not apply to this page.', [], conf);
    // The graded review: met / partly met / unmet / insufficient evidence. An ungrounded point becomes insufficient evidence.
    const quotes = (v.evidence ?? []).filter((q) => q.trim().length > 2 && haystack.includes(q.toLowerCase().replace(/\s+/g, ' ').trim()));
    const g = v.grounding ?? (quotes[0] ? { kind: 'quote' as const, quote: quotes[0] } : undefined);
    const asked = v.grade ?? (v.result === 'pass' ? 'met' : v.result === 'fail' ? 'unmet' : 'insufficient_evidence');
    const ok = this.grounded(g, haystack, shots);
    const grade = asked !== 'insufficient_evidence' && !ok ? 'insufficient_evidence' : asked;
    // An untraceable point keeps neither its quote nor its recommendation: nothing the model could not ground reaches a report.
    const ai = { grade, observation: ok ? v.observation : 'The model made a point it could not trace to the page, so it is not counted.', grounding: ok ? g ?? null : null, recommendation: ok ? v.recommendation ?? '' : '', grounded: ok };
    const ev = !ok ? [] : g?.kind === 'quote' && g.quote ? [g.quote] : g?.kind === 'measurement' && g.measurement ? [g.measurement] : g?.region ? [`${g.region.viewport} screenshot, region ${Math.round(g.region.x)},${Math.round(g.region.y)} ${Math.round(g.region.width)}×${Math.round(g.region.height)}`] : [];
    if (grade === 'met') return { ...this.out(r, 'observed_pass', 'ai_assisted', v.observation, ev, conf), ai };
    if (grade === 'insufficient_evidence') return { ...this.out(r, 'inconclusive', 'ai_assisted', asked !== grade ? 'The model reported a point it could not trace to the page (no matching quote, region or measurement), so it is not counted.' : v.observation || 'The context was not enough to decide.', ev, asked !== grade ? 0.3 : conf, asked !== grade ? 'evidence-not-found' : undefined), ai };
    return { ...this.out(r, 'needs_human_review', 'ai_assisted', v.observation, ev, conf), ai };   // a model alone does not confirm a failure; a person does
  }

  private async explain(ctx: WebsiteContext, rules: Rule[], outcomes: RuleOutcome[], llm: LlmClient) {
    const failed = outcomes.filter((o) => o.result === 'observed_failure').slice(0, 20); if (!failed.length) return;
    const res = await llm.interpret!({ system: 'Explain, in one sentence each, who is affected and the likely consequence. Use only the evidence given. Say "may" for anything inferred.', failures: failed.map((o) => ({ ruleId: o.ruleId, title: rules.find((r) => r.ruleId === o.ruleId)?.title ?? o.ruleId, observation: o.observation, evidence: o.evidence })), context: this.slice(ctx) });
    for (const x of res) { const o = failed.find((f) => f.ruleId === x.ruleId); if (o) { o.userImpact = x.userImpact; o.businessImpact = x.businessImpact; } }
  }
}
