import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ShieldCheck, ScanSearch, UserCheck, Keyboard, ArrowRight, TriangleAlert, Table2, Contrast, Mic, AudioLines, Check } from 'lucide-react';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { siteStats } from '@/lib/dashboard.ts';
import { STANDARDS } from '@/lib/standards.ts';
import { PILLARS, PILLAR_KEYS } from '@/lib/groups.ts';
import { SegmentedBar, FIX_COLORS, FIX_LABELS, SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';

export const dynamic = 'force-dynamic';
const Card = ({ children, className = '', label }: { children: React.ReactNode; className?: string; label?: string }) =>
  <section aria-labelledby={label} className={`rounded-2xl border border-stone-line bg-white p-5 ${className}`}>{children}</section>;
const PILLAR_ICON = { visual: Contrast, voice: Mic, keyboard: Keyboard, screen_reader: AudioLines } as const;
const btn = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold';

export default async function SiteDashboard({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const p = pa.project; const db = await getDb();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, p.clientId));
  const s = await siteStats(p.id);
  const base = `/app/${org}/projects/${p.id}`;
  const levels = [
    { key: 'auto', label: 'Automated rules', icon: ScanSearch, done: !!s.latest, note: 'axe-core and Sugam checks' },
    { key: 'kb', label: 'Keyboard and visual', icon: Keyboard, done: !!s.latest, note: '25-step Tab trace, 320px reflow' },
    { key: 'human', label: 'Human verified', icon: UserCheck, done: !!s.latest && s.undecided === 0, note: s.latest ? `${s.undecided} waiting · ${s.decided} decided` : 'Needs a scan first' },
  ];
  const pillarMax = s.byPillar ? Math.max(1, ...Object.values(s.byPillar)) : 1;

  return (
    <main id="main" className="w-full max-w-[1440px] space-y-4 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-pine-700">{client?.name}</p>
          <h1 className="text-2xl font-bold text-pine-900 sm:text-3xl">{p.name}</h1>
          <p className="break-all text-sm text-slate-700">{p.liveUrl || p.stagingUrl} · {STANDARDS[p.defaultStandard].label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/reports`} className={`${btn} border border-stone-line bg-white text-pine-900 hover:bg-stone`}><Table2 aria-hidden className="size-4" />All issues and fixes</Link>
          <Link href={`${base}/scanner`} className={`${btn} bg-pine-900 text-white hover:bg-pine-700`}>Run a new scan<ArrowRight aria-hidden className="size-4" /></Link>
        </div>
      </header>

      {!s.latest ? (
        <Card><h2 className="text-xl font-bold text-pine-900">No scans yet</h2><p className="mt-1 text-slate-700">Run the first scan to see issues, fixes and progress here.</p><Link href={`${base}/scanner`} className={`${btn} mt-4 bg-pine-900 text-white`}>Open the scanner</Link></Card>
      ) : (<>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Latest scan">
          {[
            ['Sugam score', String(s.latest.score ?? '–'), s.change ? `${s.change.delta >= 0 ? '+' : ''}${s.change.delta} since last scan` : 'First scan'],
            ['Confirmed failures', String(s.buckets!.confirmed), 'Must be fixed'],
            ['Needs human review', String(s.undecided), `${s.decided} already decided`],
            ['Resolved since last scan', s.change ? String(s.change.resolved) : '–', s.change ? `${s.change.introduced} new` : 'Needs two scans'],
          ].map(([k, v, n]) => (
            <div key={k} className="rounded-2xl border border-stone-line bg-white p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-700">{k}</dt><dd className="mt-1 text-3xl font-extrabold tabular-nums text-pine-900">{v}</dd><dd className="text-xs text-slate-700">{n}</dd></div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card label="ff-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ff-h" className="text-lg font-bold text-pine-900">Fix these first</h2>
              <p className="text-sm text-slate-700">From the {s.latest.environment} scan, {s.latest.completedAt!.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            {s.fixFirst.length ? (
              <ol className="mt-3 divide-y divide-stone-line">{s.fixFirst.map((i, n) => (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pine-900 text-sm font-bold text-white">{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`${base}/reports?open=${i.id}`} className="font-semibold text-pine-800 underline underline-offset-2 hover:text-pine-600">{i.title}</Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1"><span aria-hidden style={{ color: SEV_STATUS[i.severity] }}>{SEV_ICON[i.severity]}</span><span className="capitalize">{i.severity}</span></span>
                      <span>{i.instanceCount} instance{i.instanceCount === 1 ? '' : 's'}</span><span>{FIX_LABELS[i.roleTag]}</span>
                    </p>
                  </div>
                </li>))}</ol>
            ) : <p className="mt-3 flex items-center gap-2 text-slate-700"><Check aria-hidden className="size-5 text-pine-700" />No confirmed failures left. Check the items waiting for review.</p>}
            {s.undecided > 0 && <p className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><TriangleAlert aria-hidden className="size-4" />{s.undecided} finding{s.undecided === 1 ? '' : 's'} need a person to decide. <Link className="font-semibold underline" href={`${base}/reports?result=needs_review`}>Review them</Link></p>}
          </Card>

          <Card label="cov-h">
            <h2 id="cov-h" className="flex items-center gap-2 text-lg font-bold text-pine-900"><ShieldCheck aria-hidden className="size-5 text-pine-700" />Verification coverage</h2>
            <ol className="mt-3 space-y-2" aria-label="Verification levels">
              {levels.map((l) => (
                <li key={l.key} className={`flex items-center gap-3 rounded-xl border p-3 ${l.done ? 'border-pine-200 bg-pine-50' : 'border-stone-line bg-sand'}`}>
                  <l.icon aria-hidden className="size-5 shrink-0 text-pine-800" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-bark">{l.label}</p><p className="text-xs text-slate-700">{l.note}</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.done ? 'bg-pine-800 text-white' : 'bg-stone text-bark'}`}>{l.done ? 'Done' : 'Open'}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-700">Automated testing finds a share of barriers. Sugam never claims legal compliance.</p>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card label="pil-h" className="md:col-span-2 xl:col-span-1">
            <h2 id="pil-h" className="text-lg font-bold text-pine-900">Open issues by pillar</h2>
            <ul className="mt-3 space-y-2.5">
              {PILLAR_KEYS.map((k) => { const Icon = PILLAR_ICON[k]; const n = s.byPillar![k]; return (
                <li key={k}><Link href={`${base}/reports?pillar=${k}`} className="group block rounded-lg p-1 hover:bg-sand">
                  <span className="flex items-center gap-2 text-sm"><Icon aria-hidden className="size-4 text-pine-800" /><span className="flex-1 font-semibold text-bark group-hover:underline">{PILLARS[k].label}</span><span className="font-bold tabular-nums">{n}</span></span>
                  <span aria-hidden className="mt-1 block h-2 rounded-full bg-stone"><span className="block h-2 rounded-full bg-pine-700" style={{ width: `${(n / pillarMax) * 100}%` }} /></span>
                </Link></li>); })}
            </ul>
          </Card>
          <Card label="fix-h"><h2 id="fix-h" className="mb-3 text-lg font-bold text-pine-900">Open issues by fix type</h2>
            <SegmentedBar title="Open issues by fix type" parts={(['design', 'no_code', 'dev'] as const).map((k) => ({ key: k, label: FIX_LABELS[k], value: s.byFix![k], color: FIX_COLORS[k] }))} /></Card>
          <Card label="sev-h"><h2 id="sev-h" className="mb-3 text-lg font-bold text-pine-900">Open issues by severity</h2>
            <SegmentedBar title="Open issues by severity" parts={(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), icon: SEV_ICON[k], value: s.bySeverity![k], color: SEV_STATUS[k] }))} /></Card>
        </div>
      </>)}
    </main>
  );
}
