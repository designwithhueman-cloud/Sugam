// Reads stored review findings back, with the plan's limits applied on the server.
import { eq, inArray, asc } from 'drizzle-orm';
import { getDb, schema } from '../../../lib/db/index.ts';
import type { ReviewReport } from '../../../lib/report-types.ts';
import { redactDeep } from '../../../lib/security/redact.ts';

async function loadReviewRaw(scanId: string, opts: { full: boolean }): Promise<ReviewReport | null> {
  const db = await getDb();
  const [res] = await db.select().from(schema.scanResults).where(eq(schema.scanResults.scanId, scanId)); if (!res) return null;
  const cats = await db.select().from(schema.categoryScores).where(eq(schema.categoryScores.scanId, scanId));
  const fs = await db.select().from(schema.ruleFindings).where(eq(schema.ruleFindings.scanId, scanId)).orderBy(asc(schema.ruleFindings.score), asc(schema.ruleFindings.ruleId));
  const ev = opts.full && fs.length ? await db.select().from(schema.ruleEvidence).where(inArray(schema.ruleEvidence.ruleFindingId, fs.map((f) => f.id))).orderBy(asc(schema.ruleEvidence.position)) : [];
  return {
    rulesVersion: res.rulesVersion, ranAt: res.ranAt.toISOString(), ai: res.ai, loaderIssues: res.loaderIssues, locked: !opts.full,
    overall: { score: res.overallScore, status: res.overallStatus as 'provisional' | 'final', assessedCategories: res.assessedCategories, coveragePct: res.coveragePct, note: res.note },
    categories: cats.sort((a, b) => b.weight - a.weight).map((c) => ({
      category: c.category, score: c.score, status: c.status as 'provisional' | 'final', weight: c.weight, coveragePct: c.coveragePct, counts: c.counts, basis: c.basis, note: c.note,
      findings: fs.filter((f) => f.category === c.category).map((f) => ({
        findingId: f.findingId, ruleId: f.ruleId, title: f.title, severity: f.severity, passed: f.passed, result: f.result, method: f.method, confidence: f.confidence, observation: f.observation, advisory: f.advisory,
        source: f.source, sourceUrl: f.sourceUrl, sourceStatus: f.sourceStatus,
        recommendation: opts.full ? f.recommendation : '', businessImpact: opts.full ? f.businessImpact : '', userImpact: opts.full ? f.userImpact : '', evidence: opts.full ? ev.filter((e) => e.ruleFindingId === f.id).map((e) => e.text) : [],
      })),
    })),
  };
}

export async function loadReview(scanId: string, opts: { full: boolean }): Promise<ReviewReport | null> { return redactDeep(await loadReviewRaw(scanId, opts)); }
