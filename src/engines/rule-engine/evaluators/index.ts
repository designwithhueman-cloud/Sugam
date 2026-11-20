// Registry of category evaluators. A category with no evaluator here still works: the engine falls back to GenericEvaluator, so a ninth category is a
// manifest entry and a rules file, not new engine code.
import { CategoryEvaluator } from '../RuleEvaluator.ts';
import type { WebsiteContext } from '../RuleTypes.ts';
import { ProductClarityEvaluator } from './ProductClarityEvaluator.ts';
import { UXEvaluator } from './UXEvaluator.ts';
import { MobileEvaluator } from './MobileEvaluator.ts';
import { AccessibilityEvaluator } from './AccessibilityEvaluator.ts';
import { TrustEvaluator } from './TrustEvaluator.ts';
import { DesignEvaluator } from './DesignEvaluator.ts';
import { ConversionEvaluator } from './ConversionEvaluator.ts';
import { PerformanceEvaluator } from './PerformanceEvaluator.ts';

export class GenericEvaluator extends CategoryEvaluator {
  readonly name = 'GenericEvaluator';
  readonly category: string;
  constructor(category: string) { super(); this.category = category; }
  protected slice(ctx: WebsiteContext) { return { url: ctx.url, goal: ctx.goal, metadata: ctx.metadata, bodyExcerpt: ctx.pageContent.slice(0, 3000) }; }
}
export const EVALUATORS: CategoryEvaluator[] = [new ProductClarityEvaluator(), new UXEvaluator(), new MobileEvaluator(), new AccessibilityEvaluator(), new TrustEvaluator(), new DesignEvaluator(), new ConversionEvaluator(), new PerformanceEvaluator()];
export const evaluatorFor = (category: string): CategoryEvaluator => EVALUATORS.find((e) => e.category === category) ?? new GenericEvaluator(category);
