import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { compareScans, type CompareRow } from '@/lib/compare.ts';
import { strictScore } from '@/lib/score-display.ts';
import { siteStats } from '@/lib/dashboard.ts';
import { Panel } from '@/components/dashboard/bits.tsx';
import { EmptyNote } from '@/components/dashboard/Tables.tsx';
import { SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';
import { plainTitle } from '@/lib/plain.ts';
import { getDb, schema } from '@/lib/db/index.ts';
import { eq } from 'drizzle-orm';
import { hasFeature } from '@/lib/plans.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';

export const dynamic = 'force-dynamic';
const th = 'px-3 pb-2.5 pt-1 text-left text-[13px] font-medium text-pine-600';
function Table({ rows, caption, empty }: { rows: CompareRow[]; caption: string; empty: string }) {
  if (!rows.length) return <div className="pb-4"><EmptyNote>{empty}</EmptyNote></div>;
  return (
    <table className="w-full table-fixed border-collapse text-[15px]">
      <caption className="sr-only">{caption}</caption>
      <thead><tr className="border-b border-stone-line"><th scope="col" className={th}>Issue</th><th scope="col" className={`${th} w-[7.5rem]`}>Severity</th><th scope="col" className={`${th} hidden w-[6rem] sm:table-cell`}>Before</th><th scope="col" className={`${th} w-[5rem] sm:w-[6rem]`}>After</th></tr></thead>
      <tbody>{rows.map((r) => { const sev = r.severity as keyof typeof SEV_STATUS; return (
        <tr key={r.componentKey} className="border-b border-stone-line last:border-0">
          <th scope="row" className="px-3 py-3 text-left font-semibold text-ink">{plainTitle(r.componentKey.split('|')[0], r.title)}<span className="block text-sm font-normal text-pine-600 sm:hidden">{r.before} before</span></th>
          <td className="px-3 py-3"><span className="inline-flex items-center gap-1 text-[15px]"><span aria-hidden style={{ color: SEV_STATUS[sev] }}>{SEV_ICON[sev]}</span><span className="capitalize">{r.severity}</span></span></td>
          <td className="hidden px-3 py-3 tabular-nums sm:table-cell">{r.before}</td><td className="px-3 py-3 font-semibold tabular-nums">{r.after}</td>
        </tr>); })}</tbody>
    </table>
  );
}
export default async function Compare({ params, searchParams }: { params: Promise<{ org: string; projectId: string }>; searchParams: Promise<{ before?: string; after?: string }> }) {
  const { org, projectId } = await params; const { before, after } = await searchParams;
  const user = await requireUser(`/app/${org}/projects/${projectId}`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const [o] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, pa.project.organizationId));
  if (!hasFeature(o?.plan ?? 'free', 'full_report')) return <main id="main" className={projectMain}><ProjectHead org={org} project={pa.project} current="Before and after" /><p className="max-w-2xl rounded-2xl border border-stone-line bg-white p-5 text-pine-700">Retests with before and after are part of the paid plans. They show which issues a rescan resolved, which remain and which are new.</p><Link href="/upgrade" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-pine-900 px-5 font-semibold text-white">See plans</Link></main>;
  let b = before, af = after;
  if (!b || !af) { const st = await siteStats(projectId); if (st.latest && st.previous) { b = st.previous.id; af = st.latest.id; } }
  if (!b || !af) return <main id="main" className={projectMain}><ProjectHead org={org} project={pa.project} current="Before and after" /><p className="max-w-2xl rounded-2xl border border-stone-line bg-white p-5 text-pine-700">Run at least two scans of the same environment to compare them.</p></main>;
  const c = await compareScans(b, af);
  if (!c || c.before.projectId !== projectId || c.after.projectId !== projectId) notFound();
  // Strict policy only; with either side unscored there is no change to show (a missing score is not 0).
  const [sb, sa] = await Promise.all([strictScore(c.before.id, c.before.status), strictScore(c.after.id, c.after.status)]);
  const delta = sb.score != null && sa.score != null ? sa.score - sb.score : null;
  const shown = (v: typeof sb) => v.score != null ? <span className="block text-[2rem] font-semibold tracking-tight text-ink tabular-nums">{v.score}</span> : <><span className="block text-[1.75rem] font-semibold tracking-tight text-ink">Not scored</span><span className="mb-1 block text-sm text-pine-600">{v.reason}</span></>;
  const label = (s: typeof c.before) => `${s.environment} · ${s.createdAt.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`;
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Before and after" sub="What changed between two scans of the same site." />
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-line border-t-4 border-t-[#c9bbff] bg-white p-5"><dt className="text-sm font-medium text-pine-600">Before · {label(c.before)}</dt><dd className="mt-1">{shown(sb)}</dd><dd><Link className="text-[15px] font-semibold text-ink underline underline-offset-4" href={`/scans/${c.before.id}`}>Open report</Link></dd></div>
        <div className="rounded-2xl border border-stone-line border-t-4 border-t-[#7c5cf0] bg-white p-5"><dt className="text-sm font-medium text-pine-600">After · {label(c.after)}</dt><dd className="mt-1">{shown(sa)}</dd><dd><Link className="text-[15px] font-semibold text-ink underline underline-offset-4" href={`/scans/${c.after.id}`}>Open report</Link></dd></div>
        <div className="rounded-2xl border border-[#b8e6cc] bg-[#effaf3] p-5"><dt className="text-sm font-medium text-[#174a32]">What changed</dt><dd className="mt-1 text-[2rem] font-semibold tracking-tight text-ink">{c.resolved.length} fixed</dd><dd className="text-sm text-pine-600">{c.introduced.length} new · {c.persisting.length} still open{delta != null ? ` · score ${delta > 0 ? '+' : ''}${delta}` : ''}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-pine-600">Compares confirmed accessibility issues, matched by rule and markup pattern. A score, when there is one, tracks progress; it is not a compliance grade.</p>
      {([['r-h', 'Fixed', c.resolved, 'Nothing was fixed between these scans.', 'bg-[#dcf3e7] text-[#174a32]'], ['n-h', 'New', c.introduced, 'Nothing new appeared.', 'bg-[#fde7e1] text-[#7a1f0b]'], ['p-h', 'Still present', c.persisting, 'Nothing is left from the earlier scan.', 'bg-pine-100 text-pine-700']] as const).map(([id, title, rows, empty, chip]) => (
        <Panel key={id} aria-labelledby={id} className="mt-6 px-4 pb-2 pt-5 sm:px-6">
          <h2 id={id} className="mb-3 flex items-center gap-2 text-[1.375rem] font-semibold tracking-tight text-ink">{title}<span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${chip}`}>{rows.length}</span></h2>
          <Table rows={[...rows]} caption={`${title} issues`} empty={empty} />
        </Panel>))}
    </main>
  );
}
