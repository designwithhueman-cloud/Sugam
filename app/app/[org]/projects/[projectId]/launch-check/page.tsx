import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess, canManage } from '@/lib/access.ts';
import { isVerified, metaTag, originOf, ownershipToken } from '@/lib/security/ownership.ts';
import { latestRuns } from '@/lib/security/service.ts';
import { verdict } from '@/packages/security-exposure/index.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';
import { LaunchCheckPanel } from '@/components/dashboard/LaunchCheckPanel.tsx';

export const dynamic = 'force-dynamic';
export default async function LaunchCheck({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/launch-check`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const origin = originOf(pa.project.liveUrl); const token = origin ? ownershipToken(projectId, origin) : null;
  const runs = await latestRuns(projectId, 2);
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Launch check" title="Launch check" sub="Look for leaked keys, public private files and open customer data before real people use your product." />
      <LaunchCheckPanel projectId={projectId} liveUrl={pa.project.liveUrl} verified={await isVerified(projectId, origin)} tag={token ? metaTag(token) : null} canVerify={canManage(pa.role)}
        initial={runs[0] ? { at: runs[0].at, active: runs[0].active, results: runs[0].results, verdict: verdict(runs[0].results) } : null} />
    </main>
  );
}
