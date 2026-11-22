import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Globe } from 'lucide-react';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { quickScans } from '@/lib/overview.ts';
import { strictScores } from '@/lib/score-display.ts';
import { Panel, btnPrimary, IconBadge } from '@/components/dashboard/bits.tsx';
import { SearchBar, Pager, listPage } from '@/components/dashboard/ListNav.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { QuickScanTable, EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Quick scans | Avara' };
export default async function QuickScans({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const user = await requireUser(`/app/${org}/quick-scans`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const { scans, total } = await quickScans(user.id);
  const base = `/app/${org}/quick-scans`; const L = listPage(scans, (s) => [s.pageTitle, s.url, s.finalUrl], sp); const scores = await strictScores(L.rows);
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Quick scans" title="My quick scans">
        <Link href="/website-accessibility-checker" className={btnPrimary}><Plus aria-hidden className="size-5" />Scan a page</Link>
      </PageHead>
      <Panel aria-labelledby="qs-h" className="px-4 pb-1 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><IconBadge icon={Globe} tone="lilac" />
            <div><h2 id="qs-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">{total} single-page scan{total === 1 ? '' : 's'}</h2>
              <p className="text-sm text-pine-600">Scans you ran outside a client project. They are yours alone, in every workspace.</p></div></div>
          {total > 0 && <SearchBar base={base} q={L.q} label="Search your quick scans" placeholder="Search by page or address" />}
        </div>
        {L.rows.length ? <QuickScanTable rows={L.rows} scores={scores} caption={`Your quick scans, newest first, page ${L.page} of ${L.pages}`} /> : <div className="pb-4"><EmptyNote>{total ? 'No quick scans match that search.' : 'No quick scans yet.'}</EmptyNote></div>}
        {total > 0 && <Pager base={base} q={L.q} page={L.page} pages={L.pages} matched={L.matched} noun="scan" />}
      </Panel>
    </main>
  );
}
