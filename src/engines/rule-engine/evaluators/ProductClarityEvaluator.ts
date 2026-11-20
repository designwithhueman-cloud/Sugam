import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Product Clarity reviewer. Sees only: the page title, meta description, headings, first-screen text, calls to action and an excerpt of the body; the screenshots */
export class ProductClarityEvaluator extends CategoryEvaluator {
  readonly category = 'Product Clarity'; readonly name = 'ProductClarityEvaluator';
  override readonly useImages = true;
  override readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, goal: ctx.goal, ...pickMeta(ctx, ['title', 'metaDescription', 'headings', 'firstViewportText', 'ctas']), bodyExcerpt: text(ctx, 3500) }; }
}
