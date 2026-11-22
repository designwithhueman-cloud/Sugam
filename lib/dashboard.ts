// Per-site numbers for the dashboard: latest completed scan per environment, issue breakdowns,
// and what changed since the scan before it.
import { and, desc, eq } from 'drizzle-orm';
import { strictScore } from './score-display.ts';
import { getDb, schema } from './db/index.ts';
import { compareScans } from './compare.ts';
import { groupOf, pillarOf, PILLAR_KEYS } from './groups.ts';

export async function siteStats(projectId: string) {
  const db = await getDb();
  const scans = await db.select().from(schema.scans).where(and(eq(schema.scans.projectId, projectId), eq(schema.scans.status, 'completed'))).orderBy(desc(schema.scans.completedAt)).limit(30);
  const latest = scans.find((s) => s.environment === 'live') ?? scans[0] ?? null;
  if (!latest) return { latest: null, previous: null, byPillar: null, byFix: null, bySeverity: null, buckets: null, change: null, scans, fixFirst: [], undecided: 0, decided: 0 };
  const decisions = new Map((await db.select().from(schema.reviewDecisions).where(eq(schema.reviewDecisions.projectId, projectId))).map((d) => [d.componentKey, d.decision]));
  const issues = (await db.select().from(schema.issues).where(eq(schema.issues.scanId, latest.id))).filter((i) => decisions.get(i.componentKey) !== 'not_an_issue');
  const open = issues.filter((i) => i.bucket !== 'verified_pass');
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
  const fixFirst = open.filter((i) => i.bucket === 'confirmed_failure' || decisions.get(i.componentKey) === 'confirmed').sort((a, b) => rank[a.severity] - rank[b.severity] || b.instanceCount - a.instanceCount).slice(0, 3);
  const undecided = open.filter((i) => i.bucket === 'needs_review' && !decisions.has(i.componentKey)).length;
  const count = <K extends string>(keys: readonly K[], pick: (i: typeof open[number]) => string) => Object.fromEntries(keys.map((k) => [k, open.filter((i) => pick(i) === k).length])) as Record<K, number>;
  const previous = scans.find((s) => s.environment === latest.environment && s.id !== latest.id) ?? null;
  const change = previous ? await compareScans(previous.id, latest.id) : null;
  // Scores follow the strict policy only; a change is reported only when both scans have a number (never null counted as 0).
  const score = await strictScore(latest.id, latest.status); const prevScore = previous ? await strictScore(previous.id, previous.status) : null;
  return {
    latest, previous, scans, fixFirst, undecided, decided: decisions.size,
    byPillar: count(PILLAR_KEYS, (i) => pillarOf(groupOf(i.ruleId, (i.wcag as { sc: string }[]).map((w) => w.sc)))),
    byFix: count(['design', 'no_code', 'dev'] as const, (i) => i.roleTag),
    bySeverity: count(['critical', 'serious', 'moderate', 'minor'] as const, (i) => i.severity),
    buckets: { confirmed: issues.filter((i) => i.bucket === 'confirmed_failure').length, review: issues.filter((i) => i.bucket === 'needs_review').length, passes: issues.filter((i) => i.bucket === 'verified_pass').length },
    change: change ? { resolved: change.resolved.length, introduced: change.introduced.length, persisting: change.persisting.length, delta: score.score != null && prevScore?.score != null ? score.score - prevScore.score : null } : null,
    score,
  };
}
