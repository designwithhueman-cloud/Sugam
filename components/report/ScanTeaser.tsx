// What a visitor sees after a free scan, before any account: the score, counts, the top issues in
// plain language, and the top finding opened completely. A free account lists every issue type;
// exact elements for all of them, screenshots and rescans need a paid plan.
import Link from 'next/link';
import { Lock, ScanSearch } from 'lucide-react';
import type { InferSelectModel } from 'drizzle-orm';
import type { scans, issues } from '@/lib/db/schema.ts';
import { SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';
import { UnlockedFixCard } from './UnlockedFixCard.tsx';
import { plainTitle } from '@/lib/plain.ts';
import type { UnlockedFix } from '@/lib/unlocked.ts';
import type { Report } from '@/lib/report-types.ts';
import { AvaraPanel, avaraVisible } from './AvaraPanel.tsx';

export function ScanTeaser({ scan, issueRows, unlocked, report }: { scan: InferSelectModel<typeof scans>; issueRows: InferSelectModel<typeof issues>[]; unlocked: UnlockedFix | null; report?: Report | null }) {
  const open = issueRows.filter((i) => i.bucket !== 'verified_pass');
  const confirmed = open.filter((i) => i.bucket === 'confirmed_failure');
  const top = confirmed.slice(0, 3); const rest = open.length - top.length;
  const next = encodeURIComponent(`/scans/${scan.id}`);
  const s = scan.summary!;
  return (
    <main id="main" className="px-5 pb-16 pt-12 sm:px-10 sm:pt-16">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep">Free scan results</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">{scan.pageTitle || scan.finalUrl || scan.url}</h1>
        <p className="mt-2 break-all text-lg text-neutral-700">{scan.finalUrl || scan.url}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="on-dark rounded-[1.75rem] bg-ink p-6 text-center text-white"><p className="text-base text-neutral-300">Sugam score</p><p className="text-7xl font-semibold tabular-nums">{scan.score}</p><p className="text-sm text-neutral-300">out of 100</p></div>
          <div className="rounded-[1.75rem] border border-black/10 bg-white p-6">
            <p className="text-2xl font-semibold leading-snug text-ink">We found {s.confirmedIssues} confirmed issue type{s.confirmedIssues === 1 ? '' : 's'} on {s.confirmedInstances} element{s.confirmedInstances === 1 ? '' : 's'}, and {s.needsReview} that need a person to check.</p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-lg" aria-label="Confirmed issues by severity">{(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><span aria-hidden style={{ color: SEV_STATUS[k] }}>{SEV_ICON[k]}</span><b className="tabular-nums">{s.confirmed[k]}</b> {k}</li>)}</ul>
            <p className="mt-4 text-base text-neutral-700">The score tracks progress between scans. It is not a grade or a compliance rating.</p>
          </div>
        </div>

        {avaraVisible(report?.avara) && <div className="mt-6"><AvaraPanel report={report!} hideFirstFix={!!unlocked} /></div>}

        <section className="mt-6 rounded-[1.75rem] border border-black/10 bg-white p-6 sm:p-8" aria-labelledby="top-h">
          <h2 id="top-h" className="text-2xl font-semibold tracking-tight text-ink">Top issues</h2>
          <ol className="mt-4 space-y-2.5">{top.map((i, n) => (
            <li key={i.id} className="flex items-center gap-4 rounded-2xl bg-[#f6f5f1] p-4"><span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full text-base font-bold text-white" style={{ background: SEV_STATUS[i.severity] }}>{n + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-ink">{plainTitle(i.ruleId, i.title)}</span><span className="block text-sm text-neutral-700">{i.title}</span></span>
              <span className="shrink-0 text-base capitalize text-neutral-700">{i.severity} · {i.instanceCount}×</span></li>))}</ol>
          {rest > 0 && <p className="mt-4 flex items-center gap-2 text-lg font-semibold text-ink"><Lock aria-hidden className="size-4" />{rest} more issue type{rest === 1 ? '' : 's'} with a free account</p>}
        </section>

        {unlocked && <div className="mt-8"><UnlockedFixCard fix={unlocked} /></div>}

        <section className="mt-8 rounded-[2rem] bg-[#e6f9b6] p-7 sm:p-10" aria-labelledby="unlock-h">
          <h2 id="unlock-h" className="text-3xl font-semibold tracking-tight text-ink">Want the rest?</h2>
          <p className="mt-3 max-w-3xl text-xl leading-relaxed text-ink">A free account lists every issue type on this page, with how many elements each affects and who it may affect. A paid plan shows the exact elements for all of them on screenshots, every fix, and rescans to confirm each one.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/signup?next=${next}`} className="inline-flex min-h-14 items-center rounded-full bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800">Create a free account</Link>
            <Link href={`/login?next=${next}`} className="inline-flex min-h-14 items-center rounded-full border border-ink px-7 text-lg font-semibold text-ink hover:bg-black/5">I have an account</Link>
            <Link href="/#pricing" className="inline-flex min-h-14 items-center px-3 text-lg font-semibold text-ink underline underline-offset-4">Compare plans</Link>
          </div>
        </section>
        <p className="mt-6 flex items-center gap-2 text-base text-neutral-700"><ScanSearch aria-hidden className="size-4" />Automated checks find a share of barriers. This is not a compliance certificate.</p>
      </div>
    </main>
  );
}
