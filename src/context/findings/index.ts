// Stores a review: a snapshot of the rules it used, its findings and their evidence, the category scores and the overall result.
import crypto from 'node:crypto';
import { schema } from '../../../lib/db/index.ts';
import type { ReviewResult, Rule } from '../../engines/rule-engine/RuleTypes.ts';

type Tx = { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> & { onConflictDoNothing: () => Promise<unknown> } } };
const chunk = <T,>(rows: T[], n = 300) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));

export async function saveReview(tx: unknown, scanId: string, productId: string | null, review: ReviewResult, rules: Rule[]) {
  const t = tx as Tx;
  // Every rule the review loaded is snapshotted, not only the ones that produced a finding, so the scan's rule set can be rebuilt later.
  const snap = rules.map((r) => ({ ruleId: r.ruleId, version: r.version ?? '1', category: r.category, enabled: r.enabled, definition: r as unknown as Record<string, unknown> }));
  for (const c of chunk(snap)) await t.insert(schema.rulesTable).values(c).onConflictDoNothing();
  const rows: (typeof schema.ruleFindings.$inferInsert)[] = []; const ev: (typeof schema.ruleEvidence.$inferInsert)[] = [];
  for (const cat of review.categories) for (const f of cat.findings) {
    const id = crypto.randomUUID();
    rows.push({ id, scanId, productId, findingId: f.findingId, ruleId: f.ruleId, ruleVersion: f.ruleVersion, category: f.category, title: f.title, severity: f.severity, score: f.score, passed: f.passed, confidence: f.confidence, result: f.result, method: f.method, observation: f.observation, recommendation: f.recommendation, businessImpact: f.businessImpact, userImpact: f.userImpact, advisory: f.advisory, source: f.source, sourceUrl: f.sourceUrl, sourceStatus: f.sourceStatus });
    f.evidence.forEach((text, position) => ev.push({ ruleFindingId: id, scanId, position, text: text.slice(0, 2000) }));
  }
  for (const c of chunk(rows)) await t.insert(schema.ruleFindings).values(c);
  for (const c of chunk(ev)) await t.insert(schema.ruleEvidence).values(c);
  const recs = (review.executions ?? []).map((x) => ({ scanId, ruleId: x.ruleId, ruleVersion: x.ruleVersion, definitionHash: x.definitionHash, category: x.category, title: x.title, mode: x.mode, weight: x.weight, session: x.session, implementation: x.implementation, execution: x.execution, reason: x.reason, evidence: x.evidence, outcome: x.outcome, method: x.method, scope: x.scope, scoreEligible: x.scoreEligible, observationOnly: x.observationOnly }));
  for (const c of chunk(recs)) await t.insert(schema.ruleExecutions).values(c);
  await t.insert(schema.categoryScores).values(review.categories.map((c) => ({ scanId, category: c.category, score: c.score, status: c.scoreStatus, weight: c.weight, coveragePct: c.coverage.pct, counts: c.counts, basis: c.basis, note: c.note })));
  await t.insert(schema.scanResults).values({ scanId, rulesVersion: review.rulesVersion, overallScore: review.overall.score, overallStatus: review.overall.status, assessedCategories: review.overall.assessedCategories, coveragePct: review.overall.coveragePct, note: review.overall.note, ai: review.ai, loaderIssues: review.loaderIssues, ranAt: new Date(review.ranAt) });
}
