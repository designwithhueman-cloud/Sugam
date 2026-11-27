import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { loadReadiness } from '@/lib/readiness-data.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';
import { ReadinessView } from '@/components/dashboard/ReadinessView.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ready to launch? | Avara' };
export default async function Ready({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/ready`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const [o] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, pa.project.organizationId));
  const r = await loadReadiness(pa.project, org, o?.plan ?? 'free');
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Ready to launch?" title="Ready to launch?" sub="One answer from your latest scan, your launch check and your saved flows, and exactly what to do next." />
      <ReadinessView r={r} />
    </main>
  );
}
