import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { sharedReports, pageLabel } from '@/lib/overview.ts';
import { hasFeature } from '@/lib/plans.ts';
import { Panel, Initials, OpenLink, fullDate, shortDate } from '@/components/dashboard/bits.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared reports | Avara' };
const th = 'px-3 pb-2.5 pt-1 text-left text-[13px] font-medium text-pine-600';
const STATE = { Active: 'bg-[#dcf3e7] text-[#174a32]', Expired: 'bg-pine-100 text-pine-700', Revoked: 'bg-pine-100 text-pine-700' };
export default async function Shared({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}/shared`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const can = hasFeature(a.org.plan, 'share_links');
  const rows = can ? await sharedReports(a.org.id) : [];
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Shared reports" title="Shared reports" />
      <Panel aria-labelledby="sh-h" className="px-4 pb-2 pt-5 sm:px-6">
        <h2 id="sh-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">Read-only links sent to clients</h2>
        <p className="mb-3 text-sm text-pine-600">Create a link from a project&rsquo;s Reports page. For safety the link itself is shown only once, when you create it.</p>
        {!can ? <div className="pb-4"><EmptyNote>Sharing read-only reports with clients is part of the Agency Pro plan. <Link href="/upgrade" className="font-semibold text-ink underline underline-offset-4">See plans</Link></EmptyNote></div>
          : !rows.length ? <div className="pb-4"><EmptyNote>No reports shared yet.</EmptyNote></div>
          : <table className="w-full table-fixed border-collapse text-[15px]">
              <caption className="sr-only">Shared report links, newest first</caption>
              <thead><tr className="border-b border-stone-line"><th scope="col" className={th}>Report</th><th scope="col" className={`${th} w-[6rem]`}>Link</th><th scope="col" className={`${th} hidden w-[9.5rem] sm:table-cell`}>Shared</th><th scope="col" className={`${th} w-[3.75rem] md:w-[10rem]`}><span className="sr-only">Open</span></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.link.id} className="border-b border-stone-line last:border-0">
                  <th scope="row" className="px-3 py-3 text-left font-normal"><div className="flex items-center gap-3"><Initials name={r.project} className="size-9 rounded-lg text-[13px] max-sm:hidden" /><div className="min-w-0"><p className="truncate font-semibold text-ink">{r.project}</p><p className="truncate text-sm text-pine-600">{pageLabel(r.scan)}</p></div></div></th>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${STATE[r.state]}`}>{r.state}</span></td>
                  <td className="hidden px-3 py-3 text-pine-700 sm:table-cell"><time dateTime={r.link.createdAt.toISOString()} title={fullDate(r.link.createdAt)}>{shortDate(r.link.createdAt)}</time></td>
                  <td className="px-3 py-3 text-right"><OpenLink href={`/scans/${r.scan.id}`} name={`${r.project}, ${pageLabel(r.scan)}`} /></td>
                </tr>))}</tbody>
            </table>}
      </Panel>
    </main>
  );
}
