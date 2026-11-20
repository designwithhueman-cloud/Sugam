// The scan page, built around one decision: "Which fix should I make next?". A compact header, the most important finding as the biggest text with where it
// happened and one "See fix" button, then everything else as short rows. Flat sections, no cards inside cards. Server-rendered; only the fix panel, the
// rescan button and the category filter are client components. Access rules are unchanged: screenshots, evidence and fixes arrive here already
// redacted by the server for the person's plan.
import Link from 'next/link';
import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import type { Report } from '@/lib/report-types.ts';
import { buildView, type Item, type View } from '@/lib/review-view.ts';
import { CopyButton } from '@/components/CopyButton.tsx';
import { ScreenshotCrop } from './ScreenshotCrop.tsx';
import { SeeFix } from './SeeFix.tsx';
import { FixPanel } from './FixPanel.tsx';
import { FilterList } from './FilterList.tsx';
import { RescanButton } from './RescanButton.tsx';
import { Finding } from './AvaraPanel.tsx';

const wrap = '[overflow-wrap:anywhere]';
const TIER = { fix_immediately: 'Fix now', fix_before_launch: 'Fix before launch', improve_later: 'Improve later' } as const;
const OUT = { fixed: ['Fixed', CheckCircle2, 'bg-[#d9f56e] text-ink'], still_present: ['Still there', CircleAlert, 'bg-[#fde7e1] text-[#7a1f0b]'], could_not_verify: ['Couldn’t verify', CircleHelp, 'bg-[#f1f0ec] text-ink'] } as const;
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
const LOCK = 'The fix for this item is part of a paid plan. Your first fix is free.';

function Technical({ item }: { item: Item }) {
  return (
    <details className="mt-5" data-testid="technical">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink underline underline-offset-4">Technical details</summary>
      {item.trace?.owner && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[10rem_minmax(0,1fr)]" data-testid="trace">
          <dt className="font-semibold">Primary rule</dt><dd className={wrap} data-testid="owner"><b>{item.trace.owner.id}</b> {item.trace.owner.title}. <span className="text-neutral-700">{item.trace.owner.why}</span></dd>
          {item.trace.related.length > 0 && <><dt className="font-semibold">Also relevant</dt><dd className={wrap} data-testid="related">{item.trace.related.map((x) => `${x.id} ${x.title}`).join(' · ')} <span className="text-neutral-700">(linked as evidence, not counted again)</span></dd></>}
          <dt className="font-semibold">Categories</dt><dd>{item.categories.join(', ')}</dd>
          {item.trace.lenses.length > 0 && <><dt className="font-semibold">Heuristic lenses</dt><dd className={wrap} data-testid="lenses">{item.trace.lenses.map((l) => `${l.lens} ${l.name}`).join(' · ')} <span className="text-neutral-700">(a lens adds observations, never a penalty)</span></dd></>}
          <dt className="font-semibold">Deductions</dt><dd className={wrap} data-testid="deductions"><b>{item.trace.deductions.groups} repair group</b>, {item.trace.deductions.points} points once scoring is enabled. {item.trace.deductions.why}</dd>
        </dl>)}
      {item.members.length > 0 ? <ul className="mt-3 space-y-3">{item.members.map((f) => <Finding key={f.id} f={f} />)}</ul>
        : <div className="mt-3 space-y-2 text-sm text-neutral-800">{item.evidence.slice(0, 4).map((e, i) => <pre key={i} tabIndex={0} role="region" aria-label="Element" className={`max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#f6f5f1] p-3 font-mono text-xs ${wrap}`}>{e}</pre>)}{item.source && <p>Source: {item.source}. The exact passage has not been verified yet.</p>}</div>}
    </details>
  );
}

function Row({ item, scanId }: { item: Item; scanId: string }) {
  return (
    <details className="group py-4" data-testid="other-row">
      <summary className="flex min-h-12 cursor-pointer list-none flex-col gap-x-4 gap-y-2 sm:flex-row sm:items-baseline [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className={`block text-lg font-semibold leading-snug text-ink ${wrap}`}>{item.title}</span>
          <span className={`mt-0.5 block text-base text-neutral-700 ${wrap}`}>{item.location || item.categories.join(' · ')}</span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {item.tier && <span className="rounded-full bg-[#f1f0ec] px-3 py-0.5 font-semibold text-ink">{TIER[item.tier]}</span>}
          {item.kind === 'review' && <span className="rounded-full bg-[#efe9ff] px-3 py-0.5 font-semibold text-vio-deep">Worth a look</span>}
          {item.sharedBy > 0 && <span className="text-neutral-700">one change fixes {item.sharedBy + 1} findings</span>}
          <span className="font-semibold text-ink underline underline-offset-4 group-open:no-underline">{item.kind === 'review' ? 'Why' : 'See fix'}</span>
        </span>
      </summary>
      <div className="mt-4 space-y-4 pl-0 sm:pl-1">
        <p className={`text-base leading-relaxed text-neutral-800 ${wrap}`}>{item.sentence}</p>
        {item.fixes?.length && !item.locked ? <FixPanel fixes={item.fixes} id={item.id} />
          : item.fixText && !item.locked ? <div className="space-y-3 rounded-2xl bg-[#f3fbd9] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-semibold text-ink">{item.kind === 'review' ? 'What to look at' : 'The change'}</p><CopyButton text={item.fixText} label="change" className="min-h-12 rounded-full border-0 bg-ink px-5 text-white hover:bg-neutral-800" /></div><p className={`text-base text-ink ${wrap}`}>{item.fixText}</p></div>
          : <p className="rounded-xl bg-[#f6f5f1] p-3 text-base text-neutral-800">{LOCK}</p>}
        <Technical item={item} />
        <p className="sr-only">{scanId}</p>
      </div>
    </details>
  );
}

export function ReviewPage({ report, access, mode = 'owner' }: { report: Report; access: View['access']; mode?: 'owner' | 'readonly' }) {
  const v = buildView(report, access); const p = v.primary; const canRescan = mode === 'owner' && !!p;
  const date = dateOf(v.date);
  return (
    <main id="main" className="px-5 pb-20 pt-6 sm:px-10 sm:pt-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0 text-sm text-neutral-700 sm:text-base" data-testid="page-header">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep">Page review</p>
          <p className={`font-semibold text-ink ${wrap}`}>{v.domain}</p>{date && <p>Scanned {date}</p>}
        </header>

        {v.latestRescanId && !v.changes && <p className="mt-4 text-base"><Link className="font-semibold underline underline-offset-4" href={`/scans/${v.latestRescanId}`}>See the latest rescan of this page</Link></p>}

        {v.scope?.analyzers.some((a) => a.status === 'failed') && (
          <div className="mt-5 rounded-xl bg-[#fff1cc] p-4 text-base text-[#6b4700]" role="status">
            {v.scope.analyzers.filter((a) => a.status === 'failed').map((a) => <p key={a.name} data-testid="analyzer-failed"><b className="capitalize">{a.name}</b> check did not complete: {a.message}. The rest of this report is unaffected.</p>)}
          </div>)}

        {v.changes && (
          <section aria-labelledby="changed-h" className="mt-8 border-b border-black/10 pb-8" data-testid="outcomes">
            <h2 id="changed-h" className="text-3xl font-semibold tracking-tight text-ink">{v.changes.headline}</h2>
            <p className="mt-2 text-lg text-neutral-800">{v.changes.counts.fixed} fixed · {v.changes.counts.still} still there · {v.changes.counts.unverified} couldn’t verify. Compared with <Link className="font-semibold underline" href={`/scans/${v.changes.fromId}`}>the earlier scan</Link>, which is unchanged.</p>
            <ul className="mt-5 divide-y divide-black/10 border-y border-black/10">
              {v.changes.rows.map((r, i) => { const [label, Icon, cls] = OUT[r.outcome]; return (
                <li key={i} className="py-4" data-testid="outcome" data-outcome={r.outcome}>
                  <p className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-semibold ${cls}`}><Icon aria-hidden className="size-4" />{label}</span><span className={`text-lg font-semibold text-ink ${wrap}`}>{r.title}</span></p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[5rem_minmax(0,1fr)]"><dt className="font-semibold">Before</dt><dd className={wrap}>{r.before}</dd><dt className="font-semibold">Now</dt><dd className={wrap}>{r.now}</dd></dl>
                </li>); })}
            </ul>
          </section>
        )}

        {p ? (
          <section aria-labelledby="first-h" className="mt-8" data-testid="primary">
            <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="text-neutral-700">Fix this first</span>
                  {p.blocker && <span className="rounded-full bg-[#fde7e1] px-3 py-0.5 text-[#7a1f0b]" data-testid="blocker">Blocks the main action</span>}
                  {!p.blocker && p.tier && <span className="rounded-full bg-[#f1f0ec] px-3 py-0.5 text-ink">{TIER[p.tier]}</span>}
                </p>
                <h1 id="first-h" className={`mt-3 text-balance text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-5xl ${wrap}`} data-testid="headline">{p.title}</h1>
                <p className={`mt-3 text-base text-neutral-800 sm:mt-4 sm:text-lg ${wrap}`} data-testid="location"><span className="font-semibold text-ink">Where: </span>{p.location}</p>
                <p className={`mt-3 max-w-2xl text-lg leading-relaxed text-ink sm:text-xl ${wrap}`} data-testid="sentence">{p.sentence}</p>
                <div className="mt-5 sm:mt-7"><SeeFix id="primary" fixes={p.fixes} scanId={report.id} lockedNote={LOCK} canRescan={canRescan} /></div>
                {p.sharedBy > 0 && <p className="mt-4 text-base text-neutral-700">One change fixes this and {p.sharedBy} related finding{p.sharedBy === 1 ? '' : 's'}.</p>}
              </div>
              {p.shot && <ScreenshotCrop shot={p.shot} />}
            </div>
            <Technical item={p} />
          </section>
        ) : (
          <section aria-labelledby="none-h" className="mt-8" data-testid="no-issues">
            <h1 id="none-h" className="text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-ink sm:text-5xl">No confirmed problems in what was checked</h1>
            <p className="mt-4 max-w-2xl text-xl leading-relaxed text-ink">Avara checked this page at {v.scope?.devices.join(' and ') ?? 'desktop and phone widths'}. {v.others.length ? `${v.others.length} thing${v.others.length === 1 ? '' : 's'} below still need a person to look.` : 'Nothing is waiting for a person either.'} This is not a guarantee: automated checks find some problems, not all.</p>
          </section>
        )}

        {v.others.length > 0 && (
          <section aria-labelledby="others-h" className="mt-14 border-t border-black/10 pt-10" data-testid="others">
            <h2 id="others-h" className="text-3xl font-semibold tracking-tight text-ink">{p ? 'Other recommended fixes' : 'Needs a person to look'}</h2>
            <p className="mb-5 mt-2 text-base text-neutral-700">Related findings that one change fixes are grouped. “Worth a look” items are observations, not defects.</p>
            <FilterList label="recommended fixes" categories={v.categories} rows={v.others.map((it) => ({ id: it.id, categories: it.categories, node: <Row item={it} scanId={report.id} /> }))} />
          </section>
        )}

        {v.moreIssueTotal > 0 && (
          <section aria-labelledby="more-h" className="mt-10" data-testid="more-issues">
            {access === 'anonymous' ? <p className="text-lg text-ink"><b>{v.moreIssueTotal}</b> more issue type{v.moreIssueTotal === 1 ? '' : 's'} on this page. <Link className="font-semibold underline underline-offset-4" href={`/signup?next=${encodeURIComponent(`/scans/${report.id}`)}`}>Create a free account</Link> to see them.</p>
              : <details><summary id="more-h" className="min-h-11 cursor-pointer text-lg font-semibold text-ink">{v.moreIssueTotal} more accessibility issue type{v.moreIssueTotal === 1 ? '' : 's'}</summary>
                  <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">{v.moreIssues.map((m, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-3 text-base"><span className={`font-semibold text-ink ${wrap}`}>{m.title}</span><span className="text-neutral-700 capitalize">{m.severity} · {m.count} element{m.count === 1 ? '' : 's'}</span></li>)}</ul></details>}
          </section>
        )}

        {v.scope && (
          <section aria-labelledby="checked-h" className="mt-14 border-t border-black/10 pt-10">
            <details data-testid="checked">
              <summary id="checked-h" className="min-h-11 cursor-pointer text-2xl font-semibold tracking-tight text-ink">What was checked</summary>
              <div className="mt-4 space-y-4 text-base text-neutral-800">
                <p>One public page, at {v.scope.devices.join(' and ')}. {v.scope.library.executedOnUrl} of {v.scope.library.catalogued} review topics ran here; {v.scope.library.catalogued - v.scope.library.implemented} have no detector yet, and many of the rest check only the measurable part. No score is published: scoring stays off until each rule’s source passage is verified.</p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {v.scope.analyzers.filter((a) => a.status === 'skipped').map((a) => <li key={a.name}><b className="capitalize">{a.name}</b>: {a.message ?? 'not requested'}</li>)}
                  {v.scope.notes.map((n, i) => <li key={i} className={wrap}>{n}</li>)}
                </ul>
                <p data-testid="score-note">{report.avara?.library.overall == null ? `No overall launch-readiness number is published: ${report.avara?.library.overallWithheld ?? 'scoring is not enabled yet'} Scoring (${report.avara?.library.policy}) is provisional, and no rule is score-eligible until its source passage is verified and the check is validated.` : `Overall ${report.avara.library.overall} (provisional).`}</p>
                <div className="space-y-1 text-base">
                  <details data-testid="lib-ran"><summary className="min-h-11 cursor-pointer font-semibold">Ran on this page ({report.avara?.library.ran.length} topics)</summary><ul className="mt-2 flex flex-wrap gap-2">{report.avara?.library.ran.map((x) => <li key={x.id} className="rounded-full bg-[#d9f56e] px-3 py-0.5 text-sm font-medium text-ink">{x.id} {x.title}</li>)}</ul><p className="mt-2 text-neutral-700">Most check only the measurable part. {report.avara?.library.notRun} topics did not run: catalogued, not built yet.</p></details>
                  <details data-testid="lib-human"><summary className="min-h-11 cursor-pointer font-semibold">Needs a person ({report.avara?.library.needsPerson.heuristic} reviews, {report.avara?.library.needsPerson.session} sessions)</summary><p className="mt-2 text-neutral-800">{report.avara?.library.needsPerson.heuristic} topics are heuristic reviews that need contextual evidence and {report.avara?.library.needsPerson.session} need a user, owner or assistive-technology session. A model walkthrough alone cannot verify comprehension or conversion behaviour.</p></details>
                  <details data-testid="lib-sources"><summary className="min-h-11 cursor-pointer font-semibold">Sources awaiting verification ({report.avara?.library.unverifiedSources.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{report.avara?.library.unverifiedSources.map((x) => <li key={x.key} className={wrap}>{x.name} ({x.topics} topics){x.url ? <> · <a className="underline" href={x.url} target="_blank" rel="noreferrer">link</a></> : ' · needs owner or design-system input'}</li>)}</ul><p className="mt-2 text-neutral-700">No exact passage has been verified yet, so no rule is score-eligible.</p></details>
                </div>
                {report.review && (
                  <div>
                    <h3 className="text-lg font-semibold text-ink">By category</h3>
                    <p className="mt-1 text-sm text-neutral-700" data-testid="overall">Counts of what was decided. Scores are not shown: they are provisional.</p>
                    <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
                      {report.review.categories.map((c) => { const bad = c.findings.filter((f) => !f.passed && f.result !== 'inconclusive'); return (
                        <li key={c.category} className="py-3" data-testid="review-category">
                          <p className="font-semibold text-ink">{c.category}</p>
                          <p className="text-sm text-neutral-700">{c.counts.observed_pass ?? 0} passed · {c.counts.observed_failure ?? 0} failed · {c.counts.needs_human_review ?? 0} need a person · {c.counts.not_run ?? 0} not run · {c.counts.unimplemented ?? 0} not built yet · {c.basis.measured} measured, {c.basis.aiAssisted} AI-assisted{c.weight === 0 ? ' · observations only' : ''}</p>
                          {bad.length > 0 && <details className="mt-1"><summary className="min-h-11 cursor-pointer text-sm font-semibold underline underline-offset-4">{bad.length} flagged</summary><ul className="mt-1 space-y-1 text-sm">{bad.map((f) => <li key={f.findingId} className={wrap}><b>{f.ruleId}</b> {f.title} · {f.method === 'ai_assisted' ? 'AI-assisted' : 'measured'} · {f.observation}</li>)}</ul></details>}
                        </li>); })}
                    </ul>
                  </div>)}
                {report.review && <p data-testid="ai-note">{report.review.ai.reason ?? 'AI-assisted review ran.'} Findings that need judgement are shown as “Worth a look”, never as confirmed problems.</p>}
              </div>
            </details>
          </section>
        )}

        {access !== 'paid' && mode === 'owner' && (
          <section aria-labelledby="up-h" className="mt-14 rounded-[1.75rem] bg-[#e6f9b6] p-7 sm:p-9" data-testid="upgrade">
            <h2 id="up-h" className="text-2xl font-semibold tracking-tight text-ink">{access === 'anonymous' ? 'Want every fix and the exact elements?' : 'Want every fix, with the elements pinned on screenshots?'}</h2>
            <p className="mt-2 max-w-2xl text-lg text-ink">{access === 'anonymous' ? 'A free account lists every issue type on this page. A paid plan shows the exact elements on screenshots, every fix, and rescans that confirm each one. Whole-site scanning is planned.' : 'Whole-site scanning is planned. Join the Creator waitlist to hear when it opens.'}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {access === 'anonymous' && <><Link href={`/signup?next=${encodeURIComponent(`/scans/${report.id}`)}`} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-lg font-semibold text-white hover:bg-neutral-800">Create a free account</Link><Link href={`/login?next=${encodeURIComponent(`/scans/${report.id}`)}`} className="inline-flex min-h-12 items-center rounded-full border border-ink px-6 text-lg font-semibold text-ink hover:bg-black/5">I have an account</Link></>}
              {access === 'free' && <Link href="/upgrade?plan=site" className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-lg font-semibold text-white hover:bg-neutral-800">Join the Creator waitlist</Link>}
              <Link href="/#pricing" className="inline-flex min-h-12 items-center px-3 text-lg font-semibold text-ink underline underline-offset-4">Compare plans</Link>
            </div>
          </section>
        )}
        <p className="mt-8 text-sm text-neutral-700">Automated checks find a share of barriers. This is not a compliance certificate.{canRescan && p ? '' : ''}</p>
        {!p && mode === 'owner' && <div className="mt-6"><RescanButton scanId={report.id} label="Rescan this page" /></div>}
      </div>
    </main>
  );
}
