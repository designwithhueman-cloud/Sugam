import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { sharedReports, pageLabel } from '@/lib/overview.ts';
import { hasFeature } from '@/lib/plans.ts';
import { Panel, Initials, OpenLink, fullDate, shortDate, IconBadge } from '@/components/dashboard/bits.tsx';
import { SearchBar, Pager, listPage } from '@/components/dashboard/ListNav.tsx';
import { Link2 } from 'lucide-react';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { EmptyNote } from '@/components/dashboard/Tables.tsx';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { revokeShareAction } from '@/app/actions.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared reports | Avara' };
const th = 'px-3 pb-2.5 pt-1 text-left text-[13px] font-medium text-pine-600';
const STATE = { Active: 'bg-[#dcf3e7] text-[#174a32]', Expired: 'bg-pine-100 text-pine-700', Revoked: 'bg-pine-100 text-pine-700' };
export default async function Shared({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const user = await requireUser(`/app/${org}/shared`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const can = hasFeature(a.org.plan, 'share_links');
  const all = can ? await sharedReports(a.org.id) : [];
  const base = `/app/${org}/shared`; const L = listPage(all, (r) => [r.project, pageLabel(r.scan), r.scan.url, r.state], sp); const rows = L.rows;
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Shared reports" title="Shared reports" />
      <Panel aria-labelledby="sh-h" className="px-4 pb-1 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><IconBadge icon={Link2} tone="green" />
            <div><h2 id="sh-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">Read-only links sent to clients</h2>
              <p className="max-w-xl text-sm text-pine-600">Create a link from a project&rsquo;s Reports page. For safety the link itself is shown only once, when you create it. Links last 90 days; stop one at any time.</p></div></div>
          {all.length > 0 && <SearchBar base={base} q={L.q} label="Search shared reports" placeholder="Search by project, page or status" />}
        </div>
        {!can ? <div className="pb-4"><EmptyNote>Sharing read-only reports with clients is part of the Agency Pro plan. <Link href="/upgrade" className="font-semibold text-ink underline underline-offset-4">See plans</Link></EmptyNote></div>
          : !rows.length ? <div className="pb-4"><EmptyNote>{all.length ? 'No shared reports match that search.' : 'No reports shared yet.'}</EmptyNote></div>
          : <table className="w-full table-fixed border-collapse text-[15px]">
              <caption className="sr-only">Shared report links, newest first</caption>
              <thead><tr className="border-b border-stone-line"><th scope="col" className={th}>Report</th><th scope="col" className={`${th} w-[6rem]`}>Link</th><th scope="col" className={`${th} hidden w-[9.5rem] sm:table-cell`}>Shared</th><th scope="col" className={`${th} w-[8.5rem] md:w-[16rem]`}><span className="sr-only">Open</span></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.link.id} className="border-b border-stone-line last:border-0">
                  <th scope="row" className="px-3 py-3 text-left font-normal"><div className="flex items-center gap-3"><Initials name={r.project} className="size-9 rounded-lg text-[13px] max-sm:hidden" /><div className="min-w-0"><p className="truncate font-semibold text-ink">{r.project}</p><p className="truncate text-sm text-pine-600">{pageLabel(r.scan)}</p></div></div></th>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${STATE[r.state]}`}>{r.state}</span></td>
                  <td className="hidden px-3 py-3 text-pine-700 sm:table-cell"><time dateTime={r.link.createdAt.toISOString()} title={fullDate(r.link.createdAt)}>{shortDate(r.link.createdAt)}</time></td>
                  <td className="px-3 py-3 text-right"><div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:justify-end md:gap-3"><OpenLink href={`/scans/${r.scan.id}`} name={`${r.project}, ${pageLabel(r.scan)}`} />
                    {r.state === 'Active' && <ActionForm action={revokeShareAction} submit="Stop sharing" submitLabel={`Stop sharing ${r.project}, ${pageLabel(r.scan)}`} refreshOnOk className="space-y-1 text-left [&_button]:min-h-11"><input type="hidden" name="org" value={org} /><input type="hidden" name="linkId" value={r.link.id} /></ActionForm>}</div></td>
                </tr>))}</tbody>
            </table>}
        {can && all.length > 0 && <Pager base={base} q={L.q} page={L.page} pages={L.pages} matched={L.matched} noun="shared report" />}
      </Panel>
    </main>
  );
}
