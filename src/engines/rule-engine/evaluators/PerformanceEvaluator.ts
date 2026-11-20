import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Performance reviewer: Lighthouse answers first; a model only explains failures. Sees only: Lighthouse lab results and their test conditions */
export class PerformanceEvaluator extends CategoryEvaluator {
  readonly category = 'Performance'; readonly name = 'PerformanceEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: false, severityBoost: {} };
  protected override readonly interpretFailures = true;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, lighthouse: ctx.lighthouseResults }; }
}
