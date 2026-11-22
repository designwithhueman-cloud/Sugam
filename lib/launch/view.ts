// The launch checks as the paid report and API show them: one line per pack entry, with each viewport's outcome, reason, target and
// evidence, plus the owner input that would let a blocked check decide. Free plans never receive this (lib/report.ts).
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { LAUNCH_ENTRIES, NEEDS_LABEL } from './registry.ts';

export type LaunchCell = { outcome: string; reason: string; target: string | null; evidence: unknown[]; ruleVersion: string };
export type LaunchLine = { entry: string; hostRuleId: string; title: string; decision: string; needs: string | null; viewports: { desktop?: LaunchCell; mobile?: LaunchCell } };
export type LaunchReport = { packVersion: string | null; lines: LaunchLine[]; pageState: 'initial'; note: string } | null;

export async function loadLaunch(scanId: string): Promise<LaunchReport> {
  const db = await getDb();
  const rows = await db.select().from(schema.launchChecks).where(eq(schema.launchChecks.scanId, scanId)).orderBy(asc(schema.launchChecks.createdAt));
  if (!rows.length) return null;
  const lines: LaunchLine[] = LAUNCH_ENTRIES.map((e) => {
    const mine = rows.filter((r) => r.entry === e.entry);
    const cell = (vp: string): LaunchCell | undefined => { const r = mine.find((x) => x.viewport === vp); return r ? { outcome: r.outcome, reason: r.reason, target: r.target, evidence: r.evidence, ruleVersion: r.ruleVersion } : undefined; };
    const needs = mine.find((r) => r.needs)?.needs as keyof typeof NEEDS_LABEL | undefined;
    return { entry: e.entry, hostRuleId: e.hostRuleId, title: e.title, decision: e.decision, needs: needs ? NEEDS_LABEL[needs] : null, viewports: { desktop: cell('desktop'), mobile: cell('mobile') } };
  });
  const broken = rows.filter((r) => r.entry === 'pack');
  return { packVersion: rows[0].packVersion, lines, pageState: 'initial', note: broken.length ? broken.map((b) => `${b.viewport}: ${b.reason}`).join(' ') : 'Read once per viewport on the page as it first loaded. Zero weight: never counted in scores or rule totals.' };
}
