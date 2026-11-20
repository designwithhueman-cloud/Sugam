// Pattern detection across stored reviews. Question asked of the data: when a site scores low in category X, which rules in OTHER categories were also
// flagged, and how often? Each site counts once (its latest review). A pattern with fewer than `minSupport` sites is stored as "emerging" and is not
// stated as a finding. The sentence is built from the counts, so it can never claim more than the stored scans show.
import { and, desc, eq, inArray, lt, isNotNull } from 'drizzle-orm';
import { getDb, schema } from '../../../lib/db/index.ts';
import { ruleLoader } from '../../engines/rule-engine/RuleLoader.ts';

export const LOW = 60;
// How sure Avara is that something is a pattern, from how many reviewed pages show it. A pattern never becomes a score.
export type PatternStatus = 'emerging_observation' | 'pattern_identified' | 'high_confidence_pattern';
export const PATTERN_LABEL: Record<PatternStatus, string> = { emerging_observation: 'Emerging Observation', pattern_identified: 'Pattern Identified', high_confidence_pattern: 'High Confidence Pattern' };
type Th = { patternIdentified: { minScans: number; minRate: number }; highConfidence: { minScans: number; minRate: number } };
const thresholds = (): Th => (ruleLoader().getRuleById('DIFF-010')?.parameters as { thresholds?: Th } | undefined)?.thresholds ?? { patternIdentified: { minScans: 5, minRate: 0.3 }, highConfidence: { minScans: 20, minRate: 0.5 } };
export function statusFor(total: number, rate: number, th: Th = thresholds(), minSupport?: number): PatternStatus {
  const idMin = minSupport ?? th.patternIdentified.minScans;
  if (total >= th.highConfidence.minScans && rate >= th.highConfidence.minRate) return 'high_confidence_pattern';
  if (total >= idMin && rate >= th.patternIdentified.minRate) return 'pattern_identified';
  return 'emerging_observation';
}
export type PatternRow = typeof schema.patterns.$inferSelect;

async function detectCrossCategory(opts: { low?: number; minRate?: number; minSupport?: number } = {}): Promise<PatternRow[]> {
  const low = opts.low ?? LOW, minRate = opts.minRate ?? 0.5, minSupport = opts.minSupport ?? 5;
  const db = await getDb();
  const scores = await db.select({ scanId: schema.categoryScores.scanId, category: schema.categoryScores.category, score: schema.categoryScores.score }).from(schema.categoryScores).where(and(isNotNull(schema.categoryScores.score)));
  const scanIds = [...new Set(scores.map((s) => s.scanId))]; if (!scanIds.length) return [];
  const scans = await db.select({ id: schema.scans.id, productId: schema.scans.productId, at: schema.scans.completedAt }).from(schema.scans).where(inArray(schema.scans.id, scanIds));
  // one review per product: the most recent
  const latest = new Map<string, { id: string; at: number }>();
  for (const s of scans) { const k = s.productId ?? s.id; const at = s.at ? s.at.getTime() : 0; if (!latest.has(k) || latest.get(k)!.at < at) latest.set(k, { id: s.id, at }); }
  const keep = new Set([...latest.values()].map((x) => x.id));
  const fails = await db.select({ scanId: schema.ruleFindings.scanId, ruleId: schema.ruleFindings.ruleId, category: schema.ruleFindings.category, title: schema.ruleFindings.title }).from(schema.ruleFindings).where(and(eq(schema.ruleFindings.passed, false), inArray(schema.ruleFindings.result, ['observed_failure', 'needs_human_review'])));
  const out: (typeof schema.patterns.$inferInsert)[] = [];
  const cats = [...new Set(scores.map((s) => s.category))];
  for (const cat of cats) {
    const lowScans = new Set(scores.filter((s) => s.category === cat && (s.score as number) < low && keep.has(s.scanId)).map((s) => s.scanId));
    if (!lowScans.size) continue;
    const byRule = new Map<string, { title: string; scans: Set<string>; category: string }>();
    for (const f of fails) if (lowScans.has(f.scanId) && f.category !== cat) { const e = byRule.get(f.ruleId) ?? { title: f.title, scans: new Set(), category: f.category }; e.scans.add(f.scanId); byRule.set(f.ruleId, e); }
    for (const [ruleId, e] of byRule) {
      const rate = e.scans.size / lowScans.size; if (rate < minRate) continue;
      out.push({ key: `${cat}|${ruleId}`, lowCategory: cat, ruleId, support: e.scans.size, total: lowScans.size, rate, status: statusFor(lowScans.size, rate, undefined, minSupport),
        description: `${Math.round(rate * 100)}% of ${lowScans.size} reviewed site${lowScans.size === 1 ? '' : 's'} with a low ${cat} score also had "${e.title}" (${ruleId}) flagged${lowScans.size >= minSupport ? '' : ' (too few sites to call this a pattern yet)'}.` });
    }
  }
  for (const p of out) await db.insert(schema.patterns).values({ ...p, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.patterns.key, set: { support: p.support, total: p.total, rate: p.rate, status: p.status, description: p.description, updatedAt: new Date() } });
  return db.select().from(schema.patterns).orderBy(desc(schema.patterns.rate));
}
void lt;

/**
 * AI-SaaS pattern observations. The patterns are defined as data in DIFF-010's parameters (a name and the detectors whose findings make it).
 * For each, over the latest review of each page: how many pages could be assessed, and how many were flagged. Stored in the same patterns table.
 */
async function observeSaasPatterns(): Promise<void> {
  const loader = ruleLoader(); const spec = (loader.getRuleById('DIFF-010')?.parameters as { patterns?: { key: string; label: string; detectors: string[]; minFlags: number }[] } | undefined)?.patterns ?? [];
  if (!spec.length) return;
  const owner = new Map(loader.loadAllRules().flatMap((r) => ((r.evaluator as { detectors?: string[] } | undefined)?.detectors ?? []).map((d) => [d, r.ruleId] as const)));
  const db = await getDb();
  const rows = await db.select({ scanId: schema.ruleFindings.scanId, ruleId: schema.ruleFindings.ruleId, result: schema.ruleFindings.result }).from(schema.ruleFindings);
  if (!rows.length) return;
  const scans = await db.select({ id: schema.scans.id, productId: schema.scans.productId, at: schema.scans.completedAt }).from(schema.scans).where(inArray(schema.scans.id, [...new Set(rows.map((r) => r.scanId))]));
  const latest = new Map<string, { id: string; at: number }>(); for (const s of scans) { const k = s.productId ?? s.id; const at = s.at ? s.at.getTime() : 0; if (!latest.has(k) || latest.get(k)!.at < at) latest.set(k, { id: s.id, at }); }
  const keep = new Set([...latest.values()].map((x) => x.id)); const th = thresholds();
  for (const p of spec) {
    const ruleIds = [...new Set(p.detectors.map((d) => owner.get(d)).filter((x): x is string => !!x))]; let total = 0, support = 0;
    for (const id of keep) {
      const mine = rows.filter((r) => r.scanId === id && ruleIds.includes(r.ruleId)); if (!mine.length) continue;
      total++; if (mine.filter((r) => r.result === 'observed_failure' || r.result === 'needs_human_review').length >= p.minFlags) support++;
    }
    if (!total || !support) continue;
    const rate = support / total; const status = statusFor(total, rate, th);
    const description = `${Math.round(rate * 100)}% of ${total} reviewed page${total === 1 ? '' : 's'} show ${p.label} (${ruleIds.join(', ')})${status === 'emerging_observation' ? ', too few pages to call this a pattern yet' : ''}.`;
    await db.insert(schema.patterns).values({ key: `pattern|${p.key}`, lowCategory: 'Differentiation & Design Maturity', ruleId: p.key, support, total, rate, status, description, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.patterns.key, set: { support, total, rate, status, description, updatedAt: new Date() } });
  }
}

/** Cross-category patterns (a low score in one category alongside a failed rule in another) and the AI-SaaS pattern observations. */
export async function detectPatterns(opts: { low?: number; minRate?: number; minSupport?: number } = {}): Promise<PatternRow[]> {
  await detectCrossCategory(opts); await observeSaasPatterns();
  const db = await getDb(); return db.select().from(schema.patterns).orderBy(desc(schema.patterns.rate));
}
