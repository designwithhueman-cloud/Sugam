import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { redactDeep } from '@/lib/security/redact.ts';
import { loadReport } from '@/lib/report.ts';
import { ReviewPage } from '@/components/report/ReviewPage.tsx';
import { ReportView } from '@/components/report/ReportView.tsx';
import { LaunchChecks } from '@/components/report/LaunchChecks.tsx';
import { ScanProgress } from '@/components/ScanProgress.tsx';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';
import { canDeleteScan, ANON_RETENTION_DAYS } from '@/lib/deletion.ts';
import { DangerDelete } from '@/components/forms/DangerDelete.tsx';
import { deleteScanAction } from '@/app/actions.ts';

// Delete this scan, for whoever may (workspace owners and admins, the person who ran it, or the browser that started an anonymous scan).
function DeleteScan({ id, anonymous }: { id: string; anonymous: boolean }) {
  return (
    <div className="px-5 pb-16 sm:px-10"><div className="mx-auto max-w-7xl">
      {anonymous && <p className="mb-3 text-base text-neutral-700">Scans started without an account are deleted automatically after {ANON_RETENTION_DAYS()} days.</p>}
      <DangerDelete id="del-scan" summary="Delete this scan" explain="Removes the report, its findings and fixes, its screenshots and any share links for it. This cannot be undone." action={deleteScanAction} hidden={{ scanId: id }} confirmLabel="Type delete to confirm" submit="Delete scan permanently" />
    </div></div>
  );
}

export const dynamic = 'force-dynamic';
export default async function ScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issue?: string }> }) {
  const { id } = await params; const { issue } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const scan = redactDeep((await db.select().from(schema.scans).where(eq(schema.scans.id, id)))[0]);
  if (!scan) notFound();
  const user = await currentUser();
  const claimed = await isClaimed(id);
  if (user && claimed && !scan.createdBy && !scan.projectId) { await db.update(schema.scans).set({ createdBy: user.id }).where(eq(schema.scans.id, id)); scan.createdBy = user.id; }
  const allowed = user ? await canViewScan(user, id) : false;
  if (!allowed && !claimed) { if (!user) redirect(`/login?next=${encodeURIComponent(`/scans/${id}`)}`); notFound(); }

  const deletable = await canDeleteScan(user, scan, claimed);
  if (scan.status === 'failed') return (<>
    <main id="main" className="px-5 pb-20 pt-12 sm:px-10 sm:pt-20"><div className="mx-auto max-w-2xl rounded-[2rem] border border-black/10 bg-white p-8 sm:p-12">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink">We could not review this page</h1>
      <p role="alert" className="mt-5 rounded-2xl bg-[#fde7e1] p-4 text-lg font-semibold text-[#7a1f0b]">{scan.error?.message || 'The scan failed.'}</p>
      <p className="mt-4 break-all text-base text-neutral-700">{scan.url}</p>
      <a href="/website-accessibility-checker" className="mt-8 inline-flex min-h-14 items-center rounded-full bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800">Try another address</a>
    </div></main>
    {deletable && <DeleteScan id={id} anonymous={!scan.createdBy && !scan.projectId} />}</>);
  if (scan.status !== 'completed') return <ScanProgress id={id} url={scan.url} />;
  // One page for every plan: the same decision-first layout. The server has already removed what the plan does not include (screenshots, other fixes, evidence).
  const report = await loadReport(id);
  if (!report) notFound();
  const access = !allowed ? 'anonymous' : report.locked ? 'free' : 'paid';
  return (
    <>
      <ReviewPage report={report} access={access} />
      {access === 'paid' && (
        <div className="px-5 pb-16 sm:px-10"><div className="mx-auto max-w-7xl"><ReportView report={report} initialIssueId={issue} /></div></div>
      )}
      {access === 'paid' && report.launch && <LaunchChecks launch={report.launch} />}
      {deletable && <DeleteScan id={id} anonymous={!scan.createdBy && !scan.projectId} />}
    </>
  );
}
