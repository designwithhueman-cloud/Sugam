// One client project: its latest scan at a glance. The numbers and the first fixes come from the same view the report uses (lib/review-view.ts),
// so this page, the report and the workspace overview always agree: recommended fixes and observations by the report's own levels, the
// report's ranked repairs in its own words, and where each was measured. The breakdowns underneath are of the accessibility findings.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Accessibility, ArrowRight, AudioLines, CheckCircle2, Contrast, Keyboard, Mic, Play, ScanSearch, ShieldCheck, Table2, UserCheck, Wrench } from 'lucide-react';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug, projectAccess } from '@/lib/access.ts';
import { siteStats } from '@/lib/dashboard.ts';
import { loadReadiness } from '@/lib/readiness-data.ts';
import { ReadinessBanner } from '@/components/dashboard/ReadinessView.tsx';
import { loadReport } from '@/lib/report.ts';
import { buildView, type Item } from '@/lib/review-view.ts';
import { STANDARDS } from '@/lib/standards.ts';
import { PILLARS, PILLAR_KEYS } from '@/lib/groups.ts';
import { SegmentedBar, FIX_COLORS, FIX_LABELS, SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { DayDate, Panel, btnOutline, btnPrimary, IconBadge } from '@/components/dashboard/bits.tsx';
import { EmptyNote } from '@/components/dashboard/Tables.tsx';
import { ScreenshotCrop } from '@/components/report/ScreenshotCrop.tsx';
import { LEVELS } from '@/lib/levels.ts';
import { cn } from '@/lib/utils.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Project overview | Avara' };
const PILLAR_ICON = { visual: Contrast, voice: Mic, keyboard: Keyboard, screen_reader: AudioLines } as const;
const h2 = 'text-[1.375rem] font-semibold tracking-tight text-ink';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default async function ProjectOverview({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}`);
  const [pa, oa] = await Promise.all([projectAccess(user, projectId), orgForSlug(user, org)]); if (!pa || !oa) notFound();
  const p = pa.project; const db = await getDb();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, p.clientId));
  const s = await siteStats(p.id);
  const [org0] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, p.organizationId));
  const readiness = await loadReadiness(p, org, org0?.plan ?? 'free');
  const root = `/app/${org}`, base = `${root}/projects/${p.id}`;
  const report = s.latest ? await loadReport(s.latest.id) : null;
  const view = report ? buildView(report, report.locked ? 'free' : 'paid') : null;
  const items = view ? [...(view.primary ? [view.primary] : []), ...view.others] : [];
  const fixes = items.filter((i) => i.level !== 'review').slice(0, 3);
  const t = view?.board.totals; const recommended = t ? t.critical + t.high + t.medium : 0;
  const reportHref = s.latest ? `/scans/${s.latest.id}` : `${base}/scanner`;
  // The widths this scan was captured at, from the scan itself (scans made before the 390px phone say 320px).
  const full = report ? report.viewports.filter((v) => v.viewport !== 'narrow').map((v) => v.viewportWidth) : []; const narrow = report?.viewports.find((v) => v.viewport === 'narrow')?.viewportWidth;
  const at = (ws: number[]) => `${ws.join('px and ')}px`;

  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: oa.org.name, href: root }, { label: 'Client projects', href: `${root}/projects` }, ...(client ? [{ label: client.name }] : [])]} current="Project overview" title={p.name}
        sub={<>{p.liveUrl || p.stagingUrl} · {STANDARDS[p.defaultStandard].label}</>}>
        <div className="flex flex-wrap gap-2">
          {s.latest && <Link href={`${base}/reports`} className={btnOutline}><Table2 aria-hidden className="size-4" />All issues and fixes</Link>}
          <Link href={`${base}/scanner`} className={btnPrimary}><Play aria-hidden className="size-4" />Run a new scan</Link>
        </div>
      </PageHead>

      <div className="mb-6"><ReadinessBanner r={readiness} compact href={`${base}/ready`} /></div>

      {!s.latest || !view ? (
        <Panel aria-labelledby="none-h" className="p-5 sm:p-7">
          <h2 id="none-h" className={h2}>No scans yet</h2>
          <p className="mt-1 max-w-2xl text-pine-700">Run the first scan of {p.liveUrl || p.stagingUrl || 'this site'}. Its most important fixes, and what changed since the scan before, show up here.</p>
          <Link href={`${base}/scanner`} className={cn(btnPrimary, 'mt-4')}>Run the first scan<ArrowRight aria-hidden className="size-4" /></Link>
        </Panel>
      ) : (<>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Latest scan">
          <Stat accent="border-t-[#c9c4b8]" label="Score" value={s.score?.score != null ? String(s.score.score) : 'Not scored'} note={s.score?.score == null ? (s.score?.reason ?? '') : s.change?.delta != null ? `${s.change.delta >= 0 ? '+' : ''}${s.change.delta} since the last scan` : 'No earlier score'} small={s.score?.score == null} />
          <Stat accent="border-t-[#e0623a]" label="Recommended fixes" value={String(recommended)} note={t ? [t.critical && `${t.critical} critical`, t.high && `${t.high} before launch`, t.medium && `${t.medium} to improve`].filter(Boolean).join(' · ') || 'Nothing to fix' : ''} />
          <Stat accent="border-t-[#7c5cf0]" label="Observations" value={String(t?.review ?? 0)} note="Worth a look. A person decides; they never count as failures." />
          <Stat accent="border-t-[#2f9e6a]" label="Since the last scan" value={s.change ? `${s.change.resolved} fixed` : '–'} note={s.change ? `${s.change.introduced} new since the scan before` : 'Needs two scans of the same site'} />
        </dl>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel aria-labelledby="ff-h" className="p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ff-h" className={cn(h2, 'flex items-center gap-3')}><IconBadge icon={Wrench} tone="peach" />Fix these first</h2>
              <p className="text-sm text-pine-600">From the {s.latest.environment} scan, <DayDate date={s.latest.completedAt!} lower /></p>
            </div>
            {fixes.length ? (
              <ol className="mt-4 space-y-4">{fixes.map((it, n) => <FixRow key={it.id} it={it} n={n} href={it.issueId ? `${reportHref}?issue=${it.issueId}` : reportHref} lead={n === 0} />)}</ol>
            ) : <div className="mt-4"><EmptyNote>No recommended fixes in this scan.{t?.review ? ` ${plural(t.review, 'observation')} are worth a look.` : ''}</EmptyNote></div>}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-stone-line pt-4">
              <Link href={reportHref} className={btnPrimary}>Open the full report<ArrowRight aria-hidden className="size-4" /></Link>
              {s.undecided > 0 && <Link href={`${base}/reports?result=needs_review`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-ink underline underline-offset-4 hover:text-vio">Decide {plural(s.undecided, 'accessibility finding')}</Link>}
            </div>
          </Panel>

          <Panel aria-labelledby="cov-h" className="p-5 sm:p-7">
            <h2 id="cov-h" className={cn(h2, 'flex items-center gap-3')}><IconBadge icon={ShieldCheck} tone="green" />What was checked</h2>
            <ul className="mt-4 space-y-2.5">
              <Check icon={ScanSearch} title="Automated rules" note={`axe-core and Avara checks at ${at(full)}`} done />
              <Check icon={Keyboard} title="Keyboard and layout" note={`Tab trace at ${at(full)}${narrow ? `; reflow and the main button at ${narrow}px` : ''}`} done />
              <Check icon={UserCheck} title="Decided by a person" note={`${s.undecided} accessibility finding${s.undecided === 1 ? '' : 's'} to decide · ${s.decided} decided`} done={s.undecided === 0} />
            </ul>
            <p className="mt-4 text-sm text-pine-600">Automated checks find a share of barriers, not all of them. Avara never claims legal compliance.</p>
          </Panel>
        </div>

        {s.byPillar && s.byFix && s.bySeverity && (
          <section aria-labelledby="acc-h" className="mt-6">
            <div className="mb-3"><h2 id="acc-h" className={cn(h2, 'flex items-center gap-3')}><IconBadge icon={Accessibility} tone="blue" />Accessibility findings</h2>
              <p className="text-sm text-pine-600">Everything axe-core and Avara’s accessibility checks reported in this scan, confirmed and worth a look, by who it affects, who fixes it and how serious it is.</p></div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Panel aria-labelledby="pil-h" className="p-5 md:col-span-2 xl:col-span-1">
                <h3 id="pil-h" className="text-lg font-semibold text-ink">Who it affects</h3>
                <ul className="mt-3 space-y-2">
                  {PILLAR_KEYS.map((k) => { const Icon = PILLAR_ICON[k]; const v = s.byPillar![k]; const max = Math.max(1, ...Object.values(s.byPillar!)); return (
                    <li key={k}><Link href={`${base}/reports?pillar=${k}`} className="group block rounded-lg p-1.5 hover:bg-pine-50">
                      <span className="flex items-center gap-2 text-[15px]"><Icon aria-hidden className="size-4 text-pine-600" /><span className="flex-1 font-medium text-ink group-hover:underline">{PILLARS[k].label}</span><span className="font-semibold tabular-nums text-ink">{v}</span></span>
                      <span aria-hidden className="mt-1.5 block h-2 rounded-full bg-pine-100"><span className="block h-2 rounded-full bg-ink" style={{ width: `${(v / max) * 100}%` }} /></span>
                    </Link></li>); })}
                </ul>
              </Panel>
              <Panel aria-labelledby="fix-h" className="p-5"><h3 id="fix-h" className="mb-3 text-lg font-semibold text-ink">Who fixes it</h3>
                <SegmentedBar title="Accessibility findings by who fixes them" parts={(['design', 'no_code', 'dev'] as const).map((k) => ({ key: k, label: FIX_LABELS[k], value: s.byFix![k], color: FIX_COLORS[k] }))} /></Panel>
              <Panel aria-labelledby="sev-h" className="p-5"><h3 id="sev-h" className="mb-3 text-lg font-semibold text-ink">How serious</h3>
                <SegmentedBar title="Accessibility findings by severity" parts={(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), icon: SEV_ICON[k], value: s.bySeverity![k], color: SEV_STATUS[k] }))} /></Panel>
            </div>
          </section>
        )}
      </>)}
    </main>
  );
}

function Stat({ label, value, note, small, accent }: { label: string; value: string; note: string; small?: boolean; accent: string }) {
  return (
    <div className={cn('rounded-2xl border border-stone-line border-t-4 bg-white p-4 sm:p-5', accent)}>
      <dt className="text-sm font-medium text-pine-600">{label}</dt>
      <dd className={cn('mt-1 font-semibold tracking-tight text-ink tabular-nums', small ? 'text-2xl sm:text-[1.75rem]' : 'text-[2rem] sm:text-[2.25rem]')}>{value}</dd>
      {note && <dd className="mt-1 text-sm leading-snug text-pine-600">{note}</dd>}
    </div>
  );
}

function FixRow({ it, n, href, lead }: { it: Item; n: number; href: string; lead: boolean }) {
  const lv = LEVELS[it.level]; const phone = !!it.shot && it.shot.viewport !== 'desktop';
  return (
    <li className={cn('rounded-xl', lead && it.shot ? 'grid gap-4 border border-[#ddd2ff] bg-[linear-gradient(135deg,#f3efff_0%,#ebe4ff_100%)] p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center' : 'flex items-start gap-3 border border-stone-line p-4')}>
      <div className={cn('min-w-0', !(lead && it.shot) && 'flex flex-1 items-start gap-3')}>
        {!(lead && it.shot) && <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{n + 1}</span>}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            {lead && it.shot && <span className="rounded-lg bg-[#ddd2ff] px-2.5 py-0.5 text-sm font-semibold text-[#2a1470]">Fix this first</span>}
            <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold', lv.chip)}>{lv.label}</span>
            {it.sharedBy > 1 && <span className="text-sm text-pine-600">One change fixes {it.sharedBy} findings</span>}
          </p>
          <h3 className={cn('mt-2 font-semibold leading-snug tracking-tight text-ink', lead && it.shot ? 'text-xl sm:text-2xl' : 'text-lg')}><Link href={href} className="underline-offset-4 hover:underline">{it.title}</Link></h3>
          {it.location && <p className="mt-1 text-[15px] text-pine-700">{it.location}</p>}
          {lead && it.sentence && <p className="mt-2 max-w-2xl text-[15px] text-[#3d3654]">{it.sentence}</p>}
        </div>
      </div>
      {lead && it.shot && <div className={cn('justify-self-center', phone ? 'w-full max-w-[12rem]' : 'w-full')}><ScreenshotCrop shot={it.shot} /></div>}
    </li>
  );
}

function Check({ icon: Icon, title, note, done }: { icon: typeof ScanSearch; title: string; note: string; done: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-stone-line p-3">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-pine-600" />
      <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[15px] font-semibold text-ink">{title}<span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold', done ? 'bg-[#dcf3e7] text-[#174a32]' : 'bg-[#ffecc7] text-[#6b3b00]')}>{done && <CheckCircle2 aria-hidden className="size-3.5" />}{done ? 'Done' : 'Open'}</span></p><p className="mt-0.5 text-sm text-pine-600">{note}</p></div>
    </li>
  );
}
