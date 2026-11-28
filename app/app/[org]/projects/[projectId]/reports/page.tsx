import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { desc, and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { loadReport } from '@/lib/report.ts';
import { ReportsTable, type ReportsData } from '@/components/dashboard/ReportsTable.tsx';
import { hasFeature } from '@/lib/plans.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';

export const dynamic = 'force-dynamic';
export default async function Reports({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/reports`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const db = await getDb();
  const [o] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, pa.project.organizationId));
  const plan = o?.plan ?? 'free';
  const data: ReportsData = [];
  for (const env of ['live', 'staging'] as const) {
    const [s, prev] = await db.select({ id: schema.scans.id }).from(schema.scans).where(and(eq(schema.scans.projectId, projectId), eq(schema.scans.environment, env), eq(schema.scans.status, 'completed'))).orderBy(desc(schema.scans.completedAt)).limit(2);
    if (!s) continue;
    const r = await loadReport(s.id); if (!r) continue;
    const previousKeys = prev ? (await db.select({ k: schema.issues.componentKey, b: schema.issues.bucket }).from(schema.issues).where(eq(schema.issues.scanId, prev.id))).filter((x) => x.b !== 'verified_pass').map((x) => x.k) : null;
    data.push({ env, report: r, previousKeys, previousId: prev?.id ?? null });
  }
  const decisionRows = await db.select({ key: schema.reviewDecisions.componentKey, decision: schema.reviewDecisions.decision, note: schema.reviewDecisions.note, at: schema.reviewDecisions.decidedAt, by: schema.users.email }).from(schema.reviewDecisions).leftJoin(schema.users, eq(schema.users.id, schema.reviewDecisions.decidedBy)).where(eq(schema.reviewDecisions.projectId, projectId));
  const decisions = Object.fromEntries(decisionRows.map((d) => [d.key, { decision: d.decision, note: d.note, at: d.at.toISOString(), by: d.by }]));
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Reports" title="Issues and fixes" sub="Every accessibility finding from the latest scan, with how to fix it and what you decided." />
      <div><Suspense><ReportsTable locked={!hasFeature(plan, 'full_report')} canShare={hasFeature(plan, 'share_links')} data={data} projectBase={`/app/${org}/projects/${projectId}`} projectId={projectId} decisions={decisions} /></Suspense></div>
    </main>
  );
}
