// What a scan teaches Avara. Written after every review: the product's shape, its failed findings and their recommendations, as plain facts
// with their source. Nothing here is invented; every row points at a scan.
import type { ReviewResult } from '../../engines/rule-engine/RuleTypes.ts';
import { schema } from '../../../lib/db/index.ts';

type Tx = { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } };
export async function recordKnowledge(tx: unknown, scanId: string, productId: string | null, url: string, review: ReviewResult) {
  const t = tx as Tx; const rows: (typeof schema.knowledge.$inferInsert)[] = [];
  const scored = review.categories.filter((c) => c.score != null);
  rows.push({ kind: 'product', key: new URL(url).origin, text: `Reviewed ${url}: ${scored.map((c) => `${c.category} ${c.score}`).join(', ') || 'no category could be scored'} (provisional).`, data: { scores: Object.fromEntries(review.categories.map((c) => [c.category, c.score])), coveragePct: review.overall.coveragePct }, productId, scanId });
  for (const c of review.categories) for (const f of c.findings.filter((x) => !x.passed && x.result !== 'inconclusive')) {
    rows.push({ kind: 'finding', key: f.ruleId, text: `${f.ruleId} ${f.title}: ${f.observation}`, data: { result: f.result, method: f.method, severity: f.severity, confidence: f.confidence }, productId, scanId });
    if (f.recommendation) rows.push({ kind: 'recommendation', key: f.ruleId, text: f.recommendation, data: { template: f.ruleId, advisory: f.advisory }, productId, scanId });
  }
  if (rows.length) await t.insert(schema.knowledge).values(rows);
}
