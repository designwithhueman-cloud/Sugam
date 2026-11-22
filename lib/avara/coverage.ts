// Loads a scan's per-rule records and builds every coverage number and the strict score from them. The report page, the board, the category
// reviews and the API all read this, so they cannot disagree. New scans have saved records (rule_executions). Older scans get records derived from
// their stored rule findings: a rule with a stored row ran; every other rule is "unknown (historical)", never a pass and never "not run".
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { ruleLoader } from '../../src/engines/rule-engine/RuleLoader.ts';
import { recordsFromHistory, summarize, bucketOf, type CoverageSummary, type RuleRecord } from '../../src/engines/rule-engine/RuleCoverage.ts';
import { DEFAULT_PROFILE, scoreRecords, type ScoreResult } from './scoring.ts';
import { canonicalFor, type CatCode } from './catalog.ts';

export type ScanCoverage = {
  records: RuleRecord[]; summary: CoverageSummary;
  human: CoverageSummary['human'] & { reviewFindings: number; reviewRepairs: number; confirmedRepairs: number; repairGroups: number };
  strict: ScoreResult;
  cannotProve: string[];
};

type Finding = typeof schema.findings.$inferSelect;

export async function loadRecords(scanId: string): Promise<{ records: RuleRecord[]; snapshot: Record<string, number>; saved: boolean } | null> {
  const db = await getDb();
  const saved = await db.select().from(schema.ruleExecutions).where(eq(schema.ruleExecutions.scanId, scanId));
  const cats = await db.select().from(schema.categoryScores).where(eq(schema.categoryScores.scanId, scanId));
  // The engine counted one outcome per rule it loaded, so each category's counts add up to that category's rule snapshot.
  const fromCounts = Object.fromEntries(cats.map((c) => [c.category, Object.values(c.counts).reduce((n, v) => n + v, 0)]));
  if (saved.length) {
    const records = saved.map((x): RuleRecord => ({ ruleId: x.ruleId, ruleVersion: x.ruleVersion, definitionHash: x.definitionHash, category: x.category, title: x.title, mode: x.mode, weight: x.weight, session: x.session, implementation: x.implementation as RuleRecord['implementation'], execution: x.execution as RuleRecord['execution'], reason: x.reason as RuleRecord['reason'], evidence: x.evidence, outcome: x.outcome as RuleRecord['outcome'], method: x.method as RuleRecord['method'], scope: x.scope as RuleRecord['scope'], scoreEligible: x.scoreEligible, observationOnly: x.observationOnly, origin: 'engine' }));
    return { records, snapshot: cats.length ? fromCounts : Object.fromEntries([...new Set(records.map((r) => r.category))].map((c) => [c, records.filter((r) => r.category === c).length])), saved: true };
  }
  if (!cats.length) return null;   // the rule engine never ran on this scan
  const rows = await db.select().from(schema.ruleFindings).where(eq(schema.ruleFindings.scanId, scanId));
  return { records: recordsFromHistory(ruleLoader().loadAllRules(), rows), snapshot: fromCounts, saved: false };
}

/** Coverage plus the strict score. `fs` are the scan's legacy findings; `repairGroups` the number of ranked repairs (recommendations). */
export function buildCoverage(loaded: NonNullable<Awaited<ReturnType<typeof loadRecords>>>, fs: Finding[], repairGroups: number): ScanCoverage {
  const { records, snapshot, saved } = loaded;
  const summary = summarize(records, snapshot);
  // Policy avara-score-1.0 (lib/avara/scoring.ts), the only score anywhere. Eligibility comes from the scan's own rule snapshot (records), so a
  // later admission never rescores an old scan. A record without saved execution evidence is treated as not run.
  const confirmed = [...new Map(fs.filter((f) => f.bucket === 'confirmed_failure').map((f) => [f.repairKey, f])).values()];
  const blocker = confirmed.find((f) => f.goalImpact === 'blocks');
  const strict = scoreRecords(records.map((r) => (r.execution === 'ran' && !r.evidence.length ? { ...r, execution: 'unknown' } : r)), DEFAULT_PROFILE,
    blocker ? `A confirmed blocker on the main task (${canonicalFor(blocker.ruleId) ?? blocker.ruleId}) comes before any average.` : null);
  const review = fs.filter((f) => f.bucket === 'needs_review');
  const human = { ...summary.human, reviewFindings: review.length, reviewRepairs: new Set(review.map((f) => f.repairKey)).size, confirmedRepairs: confirmed.length, repairGroups };
  const cannotProve = saved ? [] : [
    `${summary.totals.buckets.unknown} of ${records.length} rules have no saved per-rule result. This scan stored only rules that produced a finding, so whether the others were skipped, not applicable, or waiting for AI cannot be recovered.`,
    'The rule definitions used at scan time were not saved per scan; records use today\'s rule library, which matches the scan\'s per-category rule counts but may differ in wording or detectors.',
    'Rollup results and the per-category aggregate counts were saved only as totals, so they cannot be tied to individual rules.',
  ];
  return { records, summary, human, strict, cannotProve };
}

export const isRan = (r: RuleRecord) => bucketOf(r) !== 'unknown' && r.execution === 'ran';
export const EMPTY_LOADED = { records: [] as RuleRecord[], snapshot: {} as Record<string, number>, saved: false };
