import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Plus, MousePointerClick, Lock, CheckCircle2, ChevronDown, Globe, Layers } from 'lucide-react';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { workspaceOverview, quickScans, type Attention, type ProjectRow } from '@/lib/overview.ts';
import { ScreenshotCrop } from '@/components/report/ScreenshotCrop.tsx';
import { DayDate, Panel, btnOutline, btnPrimary } from '@/components/dashboard/bits.tsx';
import { ProjectTable, QuickScanTable, EmptyNote } from '@/components/dashboard/Tables.tsx';
import { cn } from '@/lib/utils.ts';
import { PageHead } from '@/components/dashboard/PageHead.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview | Avara' };
const QUICK = 5;
const SEV: Record<Attention['severity'], string> = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' };

export default async function Overview({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const [{ rows, attention }, quick] = await Promise.all([workspaceOverview(a.org.id, a.org.plan), quickScans(user.id, QUICK)]);
  const root = `/app/${org}`;
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name }]} current="Overview" title={a.org.plan === 'agency' ? 'Agency overview' : 'Overview'}>
        <NewScan root={root} projects={rows} />
      </PageHead>

      <NeedsAttention root={root} attention={attention} rows={rows} />

      <Panel aria-labelledby="projects-h" className="mt-6 px-4 pb-2 pt-5 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="projects-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">Client projects</h2>
            <p className="text-sm text-pine-600">{rows.length ? `${rows.length} project${rows.length === 1 ? '' : 's'}, latest scan of each` : 'Each project is one client site.'}</p></div>
          <Link href={`${root}/projects#add-project`} className={btnOutline}><Plus aria-hidden className="size-4" />Add project</Link>
        </div>
        {rows.length ? <ProjectTable org={org} rows={rows} caption="Client projects, with confirmed issues from each project's latest scan" />
          : <div className="pb-4"><EmptyNote>No client projects yet. Add one with its live or staging address to run its first scan.</EmptyNote></div>}
      </Panel>

      <Panel aria-labelledby="quick-h" className="mt-6 px-4 pb-2 pt-5 sm:px-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Lock aria-hidden className="mt-1 size-5 shrink-0 text-pine-600" />
            <div><h2 id="quick-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">My quick scans</h2>
              <p className="text-sm text-pine-600">Outside client projects. Only you see these.</p></div>
          </div>
          {quick.total > QUICK && <Link href={`${root}/quick-scans`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-ink underline underline-offset-4 hover:text-vio">View all {quick.total}<span className="sr-only"> quick scans</span><ArrowRight aria-hidden className="size-4" /></Link>}
        </div>
        {quick.scans.length ? <QuickScanTable rows={quick.scans} caption={`Your ${Math.min(QUICK, quick.total)} most recent quick scans${quick.total > QUICK ? ` of ${quick.total}` : ''}`} />
          : <div className="pb-4"><EmptyNote>No quick scans yet. <Link href="/website-accessibility-checker" className="font-semibold text-ink underline underline-offset-4">Scan any page</Link> to check it without adding a project.</EmptyNote></div>}
      </Panel>
    </main>
  );
}

// One primary action. With projects, it asks which project to scan (each project's page has the scanner); a quick scan is always an option.
function NewScan({ root, projects }: { root: string; projects: ProjectRow[] }) {
  if (!projects.length) return <Link href="/website-accessibility-checker" className={btnPrimary}><Plus aria-hidden className="size-5" />New scan</Link>;
  return (
    <details className="group relative">
      <summary className={cn(btnPrimary, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}><Plus aria-hidden className="size-5" />New scan<ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" /></summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-stone-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(17,17,17,.3)]">
        <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-pine-600">Scan a client project</p>
        <ul>{projects.map((p) => <li key={p.id}><Link href={`${root}/projects/${p.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink hover:bg-pine-100"><Layers aria-hidden className="size-4 shrink-0 text-pine-600" /><span className="min-w-0 flex-1 truncate"><b className="font-semibold">{p.name}</b> <span className="text-pine-600">· {p.client}</span></span></Link></li>)}</ul>
        <Link href="/website-accessibility-checker" className="mt-1 flex min-h-11 items-center gap-2.5 rounded-lg border-t border-stone-line px-2.5 text-sm text-ink hover:bg-pine-100"><Globe aria-hidden className="size-4 shrink-0 text-pine-600" /><span><b className="font-semibold">Quick scan</b> <span className="text-pine-600">· any single page</span></span></Link>
      </div>
    </details>
  );
}

function NeedsAttention({ root, attention: f, rows }: { root: string; attention: Attention | null; rows: ProjectRow[] }) {
  if (!f) {
    const scanned = rows.filter((r) => r.lastScanAt); const waiting = scanned.reduce((n, r) => n + (r.waiting ?? 0), 0);
    const firstWaiting = scanned.find((r) => (r.waiting ?? 0) > 0); const unscanned = rows.find((r) => !r.lastScanAt);
    const [title, body, cta] = !rows.length
      ? ['Nothing to review yet', 'Add a client project and scan it. The most serious confirmed issue will show up here.', <Link key="c" href={`${root}/projects#add-project`} className={btnPrimary}>Add your first project<ArrowRight aria-hidden className="size-4" /></Link>]
      : !scanned.length
        ? ['No scans yet', `None of your ${rows.length} project${rows.length === 1 ? ' has' : 's have'} been scanned. Run a scan to find what needs fixing first.`, unscanned && <Link key="c" href={`${root}/projects/${unscanned.id}`} className={btnPrimary}>Scan {unscanned.name}<ArrowRight aria-hidden className="size-4" /></Link>]
        : ['No confirmed issues', `The latest scan of each project found no confirmed issues.${waiting ? ` ${waiting} finding${waiting === 1 ? ' is' : 's are'} still waiting for a person to check.` : ''}`, firstWaiting && <Link key="c" href={`${root}/projects/${firstWaiting.id}`} className={btnOutline}>Check {firstWaiting.name}<ArrowRight aria-hidden className="size-4" /></Link>];
    return (
      <section aria-labelledby="attention-h" className="rounded-2xl border border-stone-line bg-white p-5 sm:p-7">
        <div className="flex items-start gap-3"><CheckCircle2 aria-hidden className="mt-1 size-6 shrink-0 text-pine-600" />
          <div><h2 id="attention-h" className="text-xl font-semibold text-ink">{title}</h2><p className="mt-1 max-w-2xl text-pine-700">{body}</p>{cta && <div className="mt-4">{cta}</div>}</div>
        </div>
      </section>
    );
  }
  const phone = !!f.shot && f.shot.viewport !== 'desktop';
  return (
    <section aria-labelledby="attention-h" className="overflow-hidden rounded-2xl border border-[#ddd2ff] bg-[linear-gradient(135deg,#f3efff_0%,#ebe4ff_100%)]">
      <div className={cn('grid gap-6 p-5 sm:p-7', f.shot && (phone ? 'md:grid-cols-[minmax(0,1fr)_17rem] md:items-center' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center'))}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <MousePointerClick aria-hidden className="size-6 text-[#432099]" />
            <h2 id="attention-h" className="rounded-lg bg-[#ddd2ff] px-2.5 py-1 text-sm font-semibold text-[#2a1470]">Needs attention</h2>
            <span className="text-sm font-semibold text-[#432099]">{SEV[f.severity]}<span className="font-normal text-[#4a3d73]"> · confirmed{f.instances > 1 ? ` on ${f.instances} elements` : ''}</span></span>
          </div>
          <h3 className="mt-4 text-[1.625rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.125rem]">{f.title}</h3>
          <p className="mt-2 text-[15px] text-[#3d3654] sm:text-base"><span className="font-semibold text-ink">{f.project.name}</span> · {f.page}</p>
          {f.whatToChange && <p className="mt-3 line-clamp-3 max-w-2xl text-[15px] text-[#3d3654]"><span className="font-semibold text-ink">What to change: </span>{f.whatToChange}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={`/scans/${f.scanId}?issue=${f.issueId}`} className={btnPrimary}>Review finding<ArrowRight aria-hidden className="size-4" /></Link>
            {f.completedAt && <p className="text-sm text-[#4a3d73]">Found <DayDate date={f.completedAt} lower />{f.environment !== 'adhoc' ? ` on ${f.environment}` : ''}{f.otherConfirmed > 0 ? ` · ${f.otherConfirmed} more confirmed across your projects` : ''}</p>}
          </div>
        </div>
        {f.shot && <div className={cn('justify-self-center', phone ? 'w-full max-w-[17rem]' : 'w-full max-w-[26rem]')}><ScreenshotCrop shot={f.shot} /></div>}
      </div>
    </section>
  );
}
