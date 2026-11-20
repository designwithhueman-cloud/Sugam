// Free-plan report: every issue type with severity, element count, WCAG criteria and who it may
// affect, plus the one finding left fully open. The server has already removed everything else
// (elements, screenshots and repairs for the other findings).
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Report } from '@/lib/report-types.ts';
import { SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';
import { impactLabels, IMPACT_NOTE } from '@/lib/impact.ts';
import { plainTitle } from '@/lib/plain.ts';
import { fromReportIssue } from '@/lib/unlocked.ts';
import { UnlockedFixCard } from './UnlockedFixCard.tsx';
import { AvaraPanel, avaraVisible } from './AvaraPanel.tsx';

const SEV_RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;

export function FreeReport({ report, upgradeHref = '/upgrade?plan=site', readOnly = false }: { report: Report; upgradeHref?: string; readOnly?: boolean }) {
  const open = report.issues.filter((i) => i.bucket !== 'verified_pass').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.instanceCount - a.instanceCount);
  const unlocked = report.issues.find((i) => i.id === report.unlockedIssueId);
  const s = report.summary;
  return (
    <main id="main" className="px-5 pb-16 pt-12 sm:px-10 sm:pt-16">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep">Free scan results</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">{report.pageTitle || report.finalUrl || report.url}</h1>
        <p className="mt-2 break-all text-lg text-neutral-700">{report.finalUrl || report.url} · {report.standardLabel}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="on-dark rounded-[1.75rem] bg-ink p-6 text-center text-white"><p className="text-base text-neutral-300">Sugam score</p><p className="text-7xl font-semibold tabular-nums">{report.score ?? '–'}</p><p className="text-sm text-neutral-300">out of 100</p></div>
          <div className="rounded-[1.75rem] border border-black/10 bg-white p-6">
            <p className="text-2xl font-semibold leading-snug text-ink">{s ? `${s.confirmedIssues} confirmed issue type${s.confirmedIssues === 1 ? '' : 's'} on ${s.confirmedInstances} element${s.confirmedInstances === 1 ? '' : 's'}, and ${s.needsReview} that need a person to check.` : `${open.length} issue types found.`}</p>
            {s && <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-lg" aria-label="Confirmed issues by severity">{(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><span aria-hidden style={{ color: SEV_STATUS[k] }}>{SEV_ICON[k]}</span><b className="tabular-nums">{s.confirmed[k]}</b> {k}</li>)}</ul>}
          </div>
        </div>

        {avaraVisible(report.avara) && <div className="mt-8"><AvaraPanel report={report} readOnly={readOnly} hideFirstFix={!!unlocked} /></div>}
        {unlocked && <div className="mt-8"><UnlockedFixCard fix={fromReportIssue(unlocked)} /></div>}

        <section aria-labelledby="types-h" className="mt-8 overflow-hidden rounded-[1.75rem] border border-black/10 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 px-6 py-5">
            <h2 id="types-h" className="text-2xl font-semibold tracking-tight text-ink">Every issue type on this page</h2>
            <p className="max-w-xl text-base text-neutral-700">{IMPACT_NOTE}</p>
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Issue types, scrolls sideways on small screens">
            <table className="w-full min-w-[680px] text-left text-base">
              <caption className="sr-only">Issue types with severity, element count and who they may affect</caption>
              <thead className="bg-[#f6f5f1] text-neutral-800"><tr><th scope="col" className="px-6 py-3 font-semibold">Severity</th><th scope="col" className="px-3 py-3 font-semibold">Issue</th><th scope="col" className="px-3 py-3 font-semibold">May affect</th><th scope="col" className="px-3 py-3 text-right font-semibold">Elements</th></tr></thead>
              <tbody>{open.map((i) => (
                <tr key={i.id} className="border-t border-black/10 align-top">
                  <td className="whitespace-nowrap px-6 py-3"><span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ color: SEV_STATUS[i.severity] }}>{SEV_ICON[i.severity]}</span><span className="capitalize">{i.severity}</span></span></td>
                  <th scope="row" className="px-3 py-3 font-normal"><span className="text-lg font-semibold text-ink">{plainTitle(i.ruleId, i.title)}</span>{i.id === report.unlockedIssueId && <span className="ml-2 rounded-full bg-[#d9f56e] px-2.5 py-0.5 text-sm font-semibold text-ink">Fix unlocked</span>}
                    <span className="mt-0.5 block text-sm text-neutral-700">{i.title}{i.bucket === 'needs_review' ? ' · needs a person to check' : ''} · {i.wcag.length ? `WCAG ${i.wcag.map((w) => w.sc).join(', ')}` : 'Best practice'}</span></th>
                  <td className="px-3 py-3"><ul className="flex flex-wrap gap-1.5">{impactLabels(i.impactGroups).map((l) => <li key={l} className="rounded-full bg-[#f1f0ec] px-3 py-0.5 text-sm font-medium text-ink">{l}</li>)}</ul></td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.instanceCount}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>

        {!readOnly && (
          <section aria-labelledby="unlock-h" className="on-dark mt-8 grid gap-6 rounded-[2rem] bg-ink p-7 text-white sm:p-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <h2 id="unlock-h" className="text-3xl font-semibold tracking-tight">You’ve checked one page.</h2>
              <p className="mt-3 max-w-2xl text-xl leading-relaxed text-neutral-200">Your other pages may have different barriers. Whole-site scanning is planned. Join the Creator waitlist to hear when it opens.</p>
            </div>
            <Link href={upgradeHref} className="inline-flex min-h-14 w-fit items-center gap-2 rounded-full bg-[#d9f56e] px-7 text-lg font-semibold text-ink hover:bg-[#cdee5c]">Join the Creator waitlist<ArrowRight aria-hidden className="size-5" /></Link>
          </section>
        )}
      </div>
    </main>
  );
}
