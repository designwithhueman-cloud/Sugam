import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { ScorerOptions } from '../RuleScorer.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { pickMeta, text } from './pick.ts';

/** Trust reviewer. Sees only: contact and legal links, the footer, testimonials, logos, security wording and an excerpt of the body */
export class TrustEvaluator extends CategoryEvaluator {
  readonly category = 'Trust & Credibility'; readonly name = 'TrustEvaluator';
  override readonly useImages = false;
  override readonly scoring: ScorerOptions = { countAiAssisted: true, severityBoost: {} };
  protected override readonly interpretFailures = false;
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, ...pickMeta(ctx, ['title', 'contact', 'legalLinks', 'footerLinks', 'testimonials', 'logos', 'securityMentions', 'forms']), bodyExcerpt: text(ctx, 3000) }; }
}
