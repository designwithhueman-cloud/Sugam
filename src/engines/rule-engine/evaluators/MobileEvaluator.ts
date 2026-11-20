import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Mobile reviewer (measurements first). Sees only: the 320px measurements and main-action probe; judgement rules also get the headings and calls to action */
export class MobileEvaluator extends CategoryEvaluator {
  readonly category = 'Mobile Responsiveness'; readonly name = 'MobileEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: false, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, goal: ctx.goal, ...pickMeta(ctx, ['mobile', 'ctas', 'forms']) }; }
}
