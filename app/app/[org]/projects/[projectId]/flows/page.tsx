import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess, canManage } from '@/lib/access.ts';
import { hasFeature } from '@/lib/plans.ts';
import { listFlows } from '@/lib/flows/service.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';
import { FlowsPanel } from '@/components/dashboard/FlowsPanel.tsx';

export const dynamic = 'force-dynamic';
export default async function Flows({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/flows`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const [o] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, pa.project.organizationId));
  const allowed = hasFeature(o?.plan ?? 'free', 'saved_flows');
  const flows = allowed ? (await listFlows(projectId)).map((f) => ({ id: f.id, name: f.name, steps: ((f.definition as { steps?: unknown[] }).steps ?? []).length, startUrl: String((f.definition as { startUrl?: string }).startUrl ?? ''), lastRun: f.lastRun ? { status: f.lastRun.status, at: f.lastRun.startedAt.toISOString() } : null })) : [];
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Flows" title="Saved flows" sub="Replay a short path through your site, like opening a menu or reaching a form, and see exactly which step breaks." />
      {allowed
        ? <FlowsPanel projectId={projectId} canDelete={canManage(pa.role)} initial={flows} />
        : <div className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-ink">Saved flows are part of Creator and Agency</h2><p className="mt-2 max-w-prose text-slate-600">Free scans check one page with built-in checks. Saved flows replay several steps in a real browser. <Link className="font-semibold text-pine-800 underline" href="/upgrade">See plans</Link></p></div>}
    </main>
  );
}
