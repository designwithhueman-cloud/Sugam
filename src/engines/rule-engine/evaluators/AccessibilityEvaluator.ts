import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Accessibility reviewer: axe-core and the Sugam checks answer first; a model only explains failures. Sees only: axe-core results and the headings; nothing else */
export class AccessibilityEvaluator extends CategoryEvaluator {
  readonly category = 'Accessibility'; readonly name = 'AccessibilityEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: false, severityBoost: { critical: 1.5, high: 1.25 } };
  protected override readonly interpretFailures = true;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, axe: ctx.axeResults, ...pickMeta(ctx, ['headings', 'forms']) }; }
}
