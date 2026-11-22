// Server-side entitlement checks. A scan's report is unlocked when the workspace that owns its
// site is on a paid plan; a personal quick scan is unlocked when its creator belongs to any paid
// workspace. Locked reports are redacted on the server, so locations and fixes never reach the browser.
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { hasFeature, type Feature, type PlanId } from './plans.ts';
import type { Report } from './report-types.ts';
import { FREE_ELEMENTS } from './unlocked.ts';

const RANK: Record<PlanId, number> = { free: 0, site: 1, agency: 2 };
const best = (plans: PlanId[]): PlanId => plans.reduce<PlanId>((a, b) => (RANK[b] > RANK[a] ? b : a), 'free');

export async function planForScan(scanId: string): Promise<PlanId> {
  const db = await getDb();
  const [s] = await db.select({ projectId: schema.scans.projectId, createdBy: schema.scans.createdBy }).from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!s) return 'free';
  if (s.projectId) {
    const [r] = await db.select({ plan: schema.organizations.plan }).from(schema.projects).innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.organizationId)).where(eq(schema.projects.id, s.projectId));
    return r?.plan ?? 'free';
  }
  if (!s.createdBy) return 'free';
  return planForUser(s.createdBy);
}
export async function planForUser(userId: string): Promise<PlanId> {
  const db = await getDb();
  const orgIds = (await db.select({ id: schema.memberships.organizationId }).from(schema.memberships).where(eq(schema.memberships.userId, userId))).map((r) => r.id);
  if (!orgIds.length) return 'free';
  return best((await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(inArray(schema.organizations.id, orgIds))).map((r) => r.plan));
}
export async function scanHas(scanId: string, f: Feature) { return hasFeature(await planForScan(scanId), f); }

// Free view: the score, the nine categories and the counts by category and severity (report.pageSummary, built before this runs), plus ONE
// finding left fully open with its complete fix. Everything else is removed here, on the server: the other findings' titles, rules,
// elements, evidence and fixes never reach a Free browser or the review API. The report draws them as locked rows from the counts.
export function redactReport(r: Report): Report {
  // A scan with an Avara ranking opens the recommended first fix, whichever category it is in. Scans made before Avara keep the old rule:
  // the top confirmed accessibility failure.
  const first = r.avara?.recommendations[0];
  const top = first ? r.issues.find((i) => i.id === r.avara!.leadIssueId) : r.issues.filter((i) => i.bucket === 'confirmed_failure').sort((a, b) => a.position - b.position)[0];
  const av = r.avara ? {
    ...r.avara,
    recommendations: first ? [first] : [],
    findings: first ? r.avara.findings.filter((f) => first.findingIds.includes(f.id)) : [],
    // A rescan keeps the outcome of the fix this plan opened (the previous scan's first fix): the free loop is fix one, rescan, see it Fixed.
    outcomes: r.avara.outcomes ? r.avara.outcomes.filter((o) => o.firstFix) : null,
  } : r.avara;
  return {
    ...r, avara: av, locked: true, unlockedIssueId: top?.id ?? null,
    viewports: r.viewports.map((v) => ({ ...v, screenshotUrl: '' })),
    issues: top ? [{ ...top, instances: top.instances.slice(0, FREE_ELEMENTS).map((x) => ({ ...x, boxes: [] })) }] : [],
    review: r.review ? { ...r.review, categories: r.review.categories.map((c) => ({ ...c, findings: [] })) } : r.review,
  };
}
