// Saves Avara's analysis (rule versions, findings, evidence, recommendations, generated fixes) inside the scan's transaction,
// and later the outcomes of a rescan. The original scan's rows are never changed by a rescan.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.ts';
import type { AvaraAnalysis } from '../../analysis/avara/build.ts';
import type { FixSet } from '../db/schema.ts';
import type { VerifyResult } from '../../scanner/avara-verify.ts';

type Tx = { insert: (t: never) => { values: (v: never) => Promise<unknown> & { onConflictDoNothing: () => Promise<unknown> } } };
const chunk = <T,>(rows: T[], size = 300) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
const FORMATS = ['lovable', 'bolt', 'v0', 'cursor'] as const;

export function avaraRows(scanId: string, productId: string, av: AvaraAnalysis, issueIds: string[], issueFixes: (FixSet | null)[] = []) {
  const ids = new Map(av.findings.map((f) => [f.key, crypto.randomUUID()]));
  const findingRows = av.findings.map((f) => ({
    id: ids.get(f.key)!, scanId, productId, issueId: f.issueIndex != null ? issueIds[f.issueIndex] ?? null : null, ruleId: f.rule.id, ruleVersion: f.rule.version, category: f.category, bucket: f.bucket,
    severity: f.severity, confidence: f.confidence, sourceType: f.rule.sourceType, title: f.title, summary: f.summary, affects: f.affects, trying: f.trying, consequence: f.consequence,
    consequenceKind: f.consequenceKind, goalImpact: f.goalImpact, fingerprint: f.fingerprint, repairKey: f.repairKey, verify: f.verify,
  } satisfies typeof schema.findings.$inferInsert));
  const evidenceRows = av.findings.flatMap((f) => f.evidence.map((e) => ({ findingId: ids.get(f.key)!, scanId, kind: e.kind, viewport: e.viewport ?? null, data: e.data } satisfies typeof schema.findingEvidence.$inferInsert)));
  const ruleRows = [...new Map(av.findings.map((f) => [`${f.rule.id}@${f.rule.version}`, f.rule])).values()].map((r) => ({ ruleId: r.id, version: r.version, category: r.category, sourceType: r.sourceType, sourceUrl: r.sourceUrl, sourceSection: r.sourceSection, title: r.title } satisfies typeof schema.ruleVersions.$inferInsert));
  const recRows: (typeof schema.recommendations.$inferInsert)[] = []; const fixRows: (typeof schema.generatedFixes.$inferInsert)[] = [];
  for (const r of av.recommendations) {
    const id = crypto.randomUUID();
    recRows.push({ id, scanId, rank: r.rank, tier: r.tier, title: r.title, sentence: r.sentence, repairKey: r.repairKey, categories: r.categories, findingIds: r.findingKeys.map((k) => ids.get(k)!) });
    // The fix comes from the finding that removes the cause. An accessibility-led action reuses the existing fix set of its issue.
    const lead = av.findings.find((f) => f.key === r.leadKey);
    const fixes: FixSet | null = r.fixes ?? (lead?.issueIndex != null ? issueFixes[lead.issueIndex] ?? null : null);
    if (fixes) for (const t of FORMATS) fixRows.push({ recommendationId: id, tool: t, kind: 'prompt', content: fixes.aiPrompt[t] });
    if (fixes) {
      fixRows.push({ recommendationId: id, tool: 'framer', kind: 'steps', content: fixes.noCode.framer.join('\n') }, { recommendationId: id, tool: 'webflow', kind: 'steps', content: fixes.noCode.webflow.join('\n') },
        { recommendationId: id, tool: 'code', kind: 'patch', content: JSON.stringify(fixes.code) });
    }
  }
  return { findingRows, evidenceRows, ruleRows, recRows, fixRows, ids };
}

export async function insertAvara(tx: Tx, rows: ReturnType<typeof avaraRows>) {
  const t = tx as unknown as { insert: (x: unknown) => { values: (v: unknown) => { onConflictDoNothing: () => Promise<unknown> } & Promise<unknown> } };
  if (rows.ruleRows.length) await t.insert(schema.ruleVersions).values(rows.ruleRows).onConflictDoNothing();
  for (const c of chunk(rows.findingRows)) await t.insert(schema.findings).values(c);
  for (const c of chunk(rows.evidenceRows)) await t.insert(schema.findingEvidence).values(c);
  for (const c of chunk(rows.recRows)) await t.insert(schema.recommendations).values(c);
  for (const c of chunk(rows.fixRows)) await t.insert(schema.generatedFixes).values(c);
}

export type OutcomeRow = typeof schema.rescanOutcomes.$inferInsert;
export function outcomeRow(scanId: string, previousScanId: string, f: { id: string; summary: string; verify: Record<string, unknown> | null }, recommendationId: string | null, r: VerifyResult): OutcomeRow {
  return { scanId, previousScanId, findingId: f.id, recommendationId, outcome: r.outcome, comparable: r.comparable, before: { observation: f.summary, check: f.verify }, after: r.after, reason: r.reason };
}
export { eq };
