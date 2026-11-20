// Small helpers for slicing the website context. Each evaluator names the parts of the context its category may see.
import type { WebsiteContext } from '../RuleTypes.ts';
export const meta = (ctx: WebsiteContext) => ctx.metadata as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
export const pickMeta = (ctx: WebsiteContext, keys: string[]) => Object.fromEntries(keys.filter((k) => meta(ctx)[k] !== undefined).map((k) => [k, meta(ctx)[k]]));
export const text = (ctx: WebsiteContext, n: number) => ctx.pageContent.slice(0, n);
