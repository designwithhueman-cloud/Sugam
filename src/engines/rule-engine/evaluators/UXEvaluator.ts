import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** UX reviewer. Sees only: navigation, headings, calls to action, forms, the workflow steps Avara observed, and an excerpt of the body */
export class UXEvaluator extends CategoryEvaluator {
  readonly category = 'UX & Workflow Quality'; readonly name = 'UXEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, goal: ctx.goal, ...pickMeta(ctx, ['title', 'nav', 'headings', 'ctas', 'forms', 'workflow']), bodyExcerpt: text(ctx, 3000) }; }
}
