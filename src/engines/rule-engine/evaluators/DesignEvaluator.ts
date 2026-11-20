import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Design reviewer. Sees only: sampled typography, headings, calls to action and the screenshots */
export class DesignEvaluator extends CategoryEvaluator {
  readonly category = 'Design & Brand Quality'; readonly name = 'DesignEvaluator';
  override readonly useImages = true;
  override readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, ...pickMeta(ctx, ['typography', 'headings', 'ctas', 'colors']) }; }
}
