import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Performance reviewer: Lighthouse answers first; a model only explains failures. Sees only: Lighthouse lab results and their test conditions
 *  (conditions.runBy says whether Avara or Google ran them), and `field`, Google's real-visitor data, which is `available: false` with a
 *  reason unless the Chrome UX Report has data. Lab and field values sit in separate keys and are never merged; INP (PERF-003) is answered
 *  only by the perf/inp-field detector from real field data, never from lab TBT. */
export class PerformanceEvaluator extends CategoryEvaluator {
  readonly category = 'Performance'; readonly name = 'PerformanceEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: false, severityBoost: {} };
  protected override readonly interpretFailures = true;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, lighthouse: ctx.lighthouseResults }; }
}
