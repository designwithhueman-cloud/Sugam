import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { quickScans } from '@/lib/overview.ts';
import { strictScores } from '@/lib/score-display.ts';
import { Panel, btnPrimary } from '@/components/dashboard/bits.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { QuickScanTable, EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Quick scans | Avara' };
export default async function QuickScans({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}/quick-scans`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const { scans, total } = await quickScans(user.id); const scores = await strictScores(scans);
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Quick scans" title="My quick scans">
        <Link href="/website-accessibility-checker" className={btnPrimary}><Plus aria-hidden className="size-5" />Scan a page</Link>
      </PageHead>
      <Panel aria-labelledby="qs-h" className="px-4 pb-2 pt-5 sm:px-6">
        <h2 id="qs-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">{total} single-page scan{total === 1 ? '' : 's'}</h2>
        <p className="mb-3 text-sm text-pine-600">Scans you ran outside a client project. They are yours alone, in every workspace.</p>
        {scans.length ? <QuickScanTable rows={scans} scores={scores} caption="All your quick scans, newest first" /> : <div className="pb-4"><EmptyNote>No quick scans yet.</EmptyNote></div>}
      </Panel>
    </main>
  );
}
