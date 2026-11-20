import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { loadReport } from '@/lib/report.ts';
import { ReviewPage } from '@/components/report/ReviewPage.tsx';
import { ReportView } from '@/components/report/ReportView.tsx';
import { ScanProgress } from '@/components/ScanProgress.tsx';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';

export const dynamic = 'force-dynamic';
export default async function ScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issue?: string }> }) {
  const { id } = await params; const { issue } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, id));
  if (!scan) notFound();
  const user = await currentUser();
  const claimed = await isClaimed(id);
  if (user && claimed && !scan.createdBy && !scan.projectId) { await db.update(schema.scans).set({ createdBy: user.id }).where(eq(schema.scans.id, id)); scan.createdBy = user.id; }
  const allowed = user ? await canViewScan(user, id) : false;
  if (!allowed && !claimed) { if (!user) redirect(`/login?next=${encodeURIComponent(`/scans/${id}`)}`); notFound(); }

  if (scan.status === 'failed') return (
    <main id="main" className="px-5 pb-20 pt-12 sm:px-10 sm:pt-20"><div className="mx-auto max-w-2xl rounded-[2rem] border border-black/10 bg-white p-8 sm:p-12">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink">We could not review this page</h1>
      <p role="alert" className="mt-5 rounded-2xl bg-[#fde7e1] p-4 text-lg font-semibold text-[#7a1f0b]">{scan.error?.message || 'The scan failed.'}</p>
      <p className="mt-4 break-all text-base text-neutral-700">{scan.url}</p>
      <a href="/website-accessibility-checker" className="mt-8 inline-flex min-h-14 items-center rounded-full bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800">Try another address</a>
    </div></main>);
  if (scan.status !== 'completed') return <ScanProgress id={id} url={scan.url} />;
  // One page for every plan: the same decision-first layout. The server has already removed what the plan does not include (screenshots, other fixes, evidence).
  const report = await loadReport(id);
  if (!report) notFound();
  const access = !allowed ? 'anonymous' : report.locked ? 'free' : 'paid';
  return (
    <>
      <ReviewPage report={report} access={access} />
      {access === 'paid' && (
        <section aria-labelledby="full-h" className="border-t border-black/10 px-5 pb-10 pt-10 sm:px-10">
          <div className="mx-auto max-w-5xl"><h2 id="full-h" className="text-3xl font-semibold tracking-tight text-ink">Every finding, pinned on the screenshot</h2></div>
          <div className="[&>div]:!h-auto [&>div]:!min-h-0 lg:[&>div]:!h-[calc(100vh-4rem)] lg:[&>div]:!min-h-[640px]"><ReportView report={report} initialIssueId={issue} /></div>
        </section>
      )}
    </>
  );
}
