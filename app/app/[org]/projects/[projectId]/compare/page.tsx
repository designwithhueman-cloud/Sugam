import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { compareScans, type CompareRow } from '@/lib/compare.ts';
import { strictScore } from '@/lib/score-display.ts';
import { siteStats } from '@/lib/dashboard.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { getDb, schema } from '@/lib/db/index.ts';
import { eq } from 'drizzle-orm';
import { hasFeature } from '@/lib/plans.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';

export const dynamic = 'force-dynamic';
function Table({ rows, caption, empty }: { rows: CompareRow[]; caption: string; empty: string }) {
  if (!rows.length) return <p className="mt-2 text-sm text-slate-600">{empty}</p>;
  return (
    <table className="mt-2 w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-3">Issue</th><th className="p-3">Severity</th><th className="p-3">Instances before</th><th className="p-3">Instances after</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.componentKey} className="border-t border-slate-100"><td className="p-3">{r.title}</td><td className="p-3"><Badge variant={r.severity as 'critical'}>{r.severity}</Badge></td><td className="p-3">{r.before}</td><td className="p-3">{r.after}</td></tr>)}</tbody>
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
  const shown = (v: typeof sb) => v.score != null ? <p className="text-4xl font-extrabold">{v.score}</p> : <><p className="text-2xl font-bold">Not scored</p><p className="text-sm text-slate-600">{v.reason}</p></>;
  const label = (s: typeof c.before) => `${s.environment} · ${s.createdAt.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`;
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={pa.project} current="Before and after" sub="What changed between two scans of the same site." />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-line bg-white p-5"><p className="text-sm text-slate-600">Before ({label(c.before)})</p>{shown(sb)}<Link className="text-sm text-pine-700 underline" href={`/scans/${c.before.id}`}>Open report</Link></div>
        <div className="rounded-2xl border border-stone-line bg-white p-5"><p className="text-sm text-slate-600">After ({label(c.after)})</p>{shown(sa)}<Link className="text-sm text-pine-700 underline" href={`/scans/${c.after.id}`}>Open report</Link></div>
        <div className={`rounded-2xl p-5 ${delta == null ? 'bg-slate-50 text-slate-900' : delta >= 0 ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`}><p className="text-sm">Score change</p><p className="text-4xl font-extrabold">{delta == null ? '–' : `${delta > 0 ? '+' : ''}${delta}`}</p>{delta == null && <p className="text-sm">No change to show: a score is missing on one side.</p>}<p className="text-sm">{c.resolved.length} resolved · {c.introduced.length} new · {c.persisting.length} remaining</p></div>
      </div>
      <p className="mt-3 text-xs text-slate-600">Compares confirmed failures only, matched by rule and markup pattern. The score is for tracking progress, not a compliance grade.</p>
      <section className="mt-8" aria-labelledby="r-h"><h2 id="r-h" className="text-lg font-semibold text-green-800">Resolved ({c.resolved.length})</h2><Table rows={c.resolved} caption="Resolved issues" empty="Nothing resolved between these scans." /></section>
      <section className="mt-8" aria-labelledby="n-h"><h2 id="n-h" className="text-lg font-semibold text-red-800">New ({c.introduced.length})</h2><Table rows={c.introduced} caption="New issues" empty="No new issues." /></section>
      <section className="mt-8" aria-labelledby="p-h"><h2 id="p-h" className="text-lg font-semibold">Still present ({c.persisting.length})</h2><Table rows={c.persisting} caption="Issues still present" empty="None." /></section>
    </main>
  );
}
