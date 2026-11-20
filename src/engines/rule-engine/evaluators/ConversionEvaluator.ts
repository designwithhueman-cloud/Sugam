import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Conversion reviewer. Sees only: calls to action, forms and fields, pricing wording, trust signals near the action and an excerpt of the body */
export class ConversionEvaluator extends CategoryEvaluator {
  readonly category = 'Conversion Readiness'; readonly name = 'ConversionEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, goal: ctx.goal, ...pickMeta(ctx, ['ctas', 'forms', 'pricing', 'workflow', 'contact', 'legalLinks']), bodyExcerpt: text(ctx, 2500) }; }
}
