// "What to fix first": up to five actions across categories, each with a tier, one sentence tied to the visitor's goal, the findings behind it
// (with rule version, source and confidence kept apart), the fix in the builder's tool, and, on a rescan, whether each earlier finding is fixed.
// Server-rendered; only the fix tabs and the rescan button are client components.
import Link from 'next/link';
import { CheckCircle2, CircleHelp, CircleAlert } from 'lucide-react';
import type { AvaraFinding, AvaraOutcome, AvaraRecommendation, Report } from '@/lib/report-types.ts';
import { AvaraFixTabs } from './AvaraFix.tsx';
import { RescanButton } from './RescanButton.tsx';
import { CategoryReviews } from './CategoryReviews.tsx';

/** The panel is shown when there is something to say: ranked actions, a rescan comparison, or an analyzer that did not complete. */
export const avaraVisible = (av: Report['avara']) => !!av && (av.recommendations.length > 0 || !!av.outcomes || Object.values(av.analyzers).some((a) => a.status === 'failed'));
const TIER = { fix_immediately: ['Fix immediately', 'bg-[#fde7e1] text-[#7a1f0b]'], fix_before_launch: ['Fix before launch', 'bg-[#fff1cc] text-[#6b4700]'], improve_later: ['Improve later', 'bg-[#f1f0ec] text-ink'] } as const;
const CAT: Record<string, string> = { accessibility: 'Accessibility', mobile: 'Mobile', ux_workflow: 'UX and workflow', performance: 'Performance' };
const SOURCE: Record<string, string> = { standard: 'Standard', vendor_guidance: 'Vendor guidance', tool_rule: 'Tool rule', usability_heuristic: 'Usability heuristic', sugam_check: 'Sugam check' };
const CONF: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
const OUT = { fixed: ['Fixed', CheckCircle2, 'bg-[#d9f56e] text-ink'], still_present: ['Still present', CircleAlert, 'bg-[#fde7e1] text-[#7a1f0b]'], could_not_verify: ['Couldn’t verify', CircleHelp, 'bg-[#f1f0ec] text-ink'] } as const;
const wrap = '[overflow-wrap:anywhere]';
const chip = 'rounded-full px-3 py-0.5 text-sm font-semibold';

function Evidence({ f }: { f: AvaraFinding }) {
  if (f.evidence === null) return <p className="mt-2 text-sm text-neutral-700">Evidence is part of a paid plan.</p>;
  const steps = f.evidence.filter((e) => e.kind === 'step'); const metrics = f.evidence.filter((e) => e.kind === 'metric'); const dom = f.evidence.filter((e) => e.kind === 'dom'); const meas = f.evidence.filter((e) => e.kind === 'measurement');
  return (
    <div className="mt-3 space-y-3 text-sm">
      {meas.map((e, i) => <p key={i} className={`rounded-xl bg-[#f6f5f1] p-3 ${wrap}`}><b>Measured{e.viewport ? ` (${e.viewport})` : ''}:</b> {Object.entries(e.data).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => `${k} ${v}`).join(', ')}</p>)}
      {steps.map((e, i) => { const d = e.data as { steps?: string[]; coverage?: string }; return (
        <div key={i} className="rounded-xl bg-[#f6f5f1] p-3"><p className="font-semibold">Steps Sugam took{e.viewport ? ` (${e.viewport})` : ''}</p><ol className="mt-1 list-decimal space-y-0.5 pl-5">{(d.steps ?? []).map((s, j) => <li key={j} className={wrap}>{s}</li>)}</ol>{d.coverage && <p className="mt-2 font-semibold">{d.coverage}</p>}</div>); })}
      {metrics.map((e, i) => { const d = e.data as { metric?: string; value?: number; runs?: number[]; conditions?: Record<string, unknown>; field?: string; fieldMetric?: { p75: number; category: string; scope: string; period: string } | null }; const fm = d.fieldMetric; return (<div key={i} className="space-y-2">
        {/* Real-visitor numbers get their own box so they are never read as part of the lab measurement, and appear only when Google has them. */}
        {fm && <div className="rounded-xl border border-black/10 p-3"><p className="font-semibold">Real visitors on phones, {String(d.metric).toUpperCase()}: {d.metric === 'lcp' ? `${Math.round(fm.p75 / 100) / 10} s` : Math.round(fm.p75 * 100) / 100} at the 75th percentile ({fm.category})</p><p className={`mt-1 ${wrap}`}>From Google&apos;s Chrome UX Report for {fm.scope === 'url' ? 'this page' : 'the whole site'}, {fm.period}. Not measured by Avara.</p></div>}
        <div className="rounded-xl bg-[#f6f5f1] p-3"><p className="font-semibold">Lab measurement, {String(d.metric).toUpperCase()}: {d.metric === 'lcp' ? `${Math.round((d.value ?? 0) / 100) / 10} s` : d.value} (runs: {(d.runs ?? []).map((r) => (d.metric === 'lcp' ? `${Math.round(r / 100) / 10} s` : r)).join(', ')})</p>
          <p className={`mt-1 ${wrap}`}>Conditions: {Object.entries(d.conditions ?? {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')}</p>{d.field && !fm && <p className="mt-1">{d.field}</p>}</div></div>); })}
      {dom.slice(0, 2).map((e, i) => <pre key={i} tabIndex={0} role="region" aria-label="Element" className={`max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#f6f5f1] p-3 font-mono text-xs ${wrap}`}>{String((e.data as { selector?: string }).selector ?? '')}{'\n'}{String((e.data as { html?: string }).html ?? '')}</pre>)}
    </div>
  );
}

export function Finding({ f }: { f: AvaraFinding }) {
  return (
    <li className="rounded-2xl border border-black/10 bg-white p-4" data-testid="finding">
      <p className="flex flex-wrap items-center gap-2"><span className={`${chip} bg-[#efe9ff] text-vio-deep`}>{CAT[f.category]}</span><span className={`${chip} bg-[#f1f0ec] text-ink capitalize`}>{f.severity}</span><span className={`${chip} bg-[#f1f0ec] text-ink`}>{CONF[f.confidence]}</span></p>
      <h4 className={`mt-2 text-lg font-semibold text-ink ${wrap}`}>{f.title}</h4>
      <p className={`mt-1 text-base text-neutral-800 ${wrap}`}>{f.summary}</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[9rem_minmax(0,1fr)]">
        <dt className="font-semibold">Who is affected</dt><dd className={wrap}>{f.affects}</dd>
        <dt className="font-semibold">Trying to</dt><dd className={wrap}>{f.trying}</dd>
        <dt className="font-semibold">{f.consequenceKind === 'hypothesis' ? 'Likely consequence (hypothesis)' : 'Consequence (observed)'}</dt><dd className={wrap}>{f.consequence}</dd>
        <dt className="font-semibold">Source passage</dt><dd className="text-neutral-800" data-testid="unverified">Awaiting verification: the link goes to the source, but the exact passage has not been checked against this reading yet. Confidence in the source is not set.</dd>
        <dt className="font-semibold">Rule</dt><dd className={wrap}>{f.canonicalId ? `${f.canonicalId} · ` : ''}{f.ruleId} v{f.ruleVersion} · <span data-testid="source-type">{SOURCE[f.sourceType] ?? f.sourceType}</span> · <a className="font-semibold underline underline-offset-2" href={f.sourceUrl} target="_blank" rel="noreferrer">{f.sourceSection}</a></dd>
      </dl>
      <Evidence f={f} />
    </li>
  );
}

function Outcomes({ outcomes, original }: { outcomes: AvaraOutcome[]; original: string }) {
  const count = (k: string) => outcomes.filter((o) => o.outcome === k).length;
  return (
    <section aria-labelledby="outcomes-h" className="rounded-[2rem] border-2 border-ink bg-white p-5 sm:p-8" data-testid="outcomes">
      <h2 id="outcomes-h" className="text-3xl font-semibold tracking-tight text-ink">Did the fix work?</h2>
      <p className="mt-2 text-lg text-neutral-800">{count('fixed')} fixed · {count('still_present')} still present · {count('could_not_verify')} couldn’t verify. Compared with <Link className="font-semibold underline" href={`/scans/${original}`}>the original scan</Link>, which is unchanged.</p>
      <ul className="mt-5 space-y-3">
        {outcomes.map((o) => { const [label, Icon, cls] = OUT[o.outcome]; const b = o.before as { observation?: string }; return (
          <li key={o.findingId} className="rounded-2xl border border-black/10 p-4" data-testid="outcome" data-outcome={o.outcome}>
            <p className="flex flex-wrap items-center gap-2"><span className={`${chip} inline-flex items-center gap-1.5 ${cls}`}><Icon aria-hidden className="size-4" />{label}</span><span className={`${chip} bg-[#f1f0ec]`}>{CAT[o.category]}</span></p>
            <h3 className={`mt-2 text-lg font-semibold ${wrap}`}>{o.findingTitle}</h3>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-base sm:grid-cols-[6rem_minmax(0,1fr)]"><dt className="font-semibold">Before</dt><dd className={wrap}>{b.observation}</dd><dt className="font-semibold">Now</dt><dd className={wrap}>{o.reason}</dd></dl>
          </li>); })}
      </ul>
    </section>
  );
}

export function AvaraPanel({ report, readOnly = false, hideFirstFix = false }: { report: Report; readOnly?: boolean; hideFirstFix?: boolean }) {
  const av = report.avara; if (!av) return null;
  const failed = Object.entries(av.analyzers).filter(([, a]) => a.status === 'failed');
  const byId = new Map(av.findings.map((f) => [f.id, f]));
  const first = av.recommendations[0];
  return (
    <div className="space-y-6" data-testid="avara">
      {av.outcomes && av.rescanOf && <Outcomes outcomes={av.outcomes} original={av.rescanOf} />}
      <section aria-labelledby="first-h" className="rounded-[2rem] border border-black/10 bg-white p-5 sm:p-8">
        <h2 id="first-h" className="text-3xl font-semibold tracking-tight text-ink">What to fix first</h2>
        {first ? <p className="mt-3 text-xl leading-relaxed text-ink" data-testid="first-sentence">{first.sentence}</p>
          : <p className="mt-3 text-xl leading-relaxed text-ink">Sugam did not find a confirmed problem to rank on this page.</p>}
        {av.goal && <p className="mt-2 text-base text-neutral-700">Goal you confirmed: {av.goal}</p>}
        <ol className="mt-6 space-y-4">
          {av.recommendations.map((r: AvaraRecommendation) => { const [tl, tc] = TIER[r.tier]; const members = r.findingIds.map((id) => byId.get(id)).filter(Boolean) as AvaraFinding[]; return (
            <li key={r.id} className="rounded-2xl border border-black/10 p-4 sm:p-5" data-testid="recommendation" data-rank={r.rank}>
              <p className="flex flex-wrap items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-ink text-base font-semibold text-white">{r.rank}</span><span className={`${chip} ${tc}`}>{tl}</span>{r.categories.map((c) => <span key={c} className={`${chip} bg-[#efe9ff] text-vio-deep`}>{CAT[c]}</span>)}</p>
              <h3 className={`mt-3 text-2xl font-semibold tracking-tight text-ink ${wrap}`}>{r.title}</h3>
              {r.rank > 1 && <p className={`mt-1 text-base text-neutral-800 ${wrap}`}>{r.sentence}</p>}
              {r.categories.length > 1 && <p className="mt-1 text-base text-neutral-700">One change fixes {members.length} findings across {r.categories.length} categories.</p>}
              {r.fixes && r.fixes.length > 0 && !(hideFirstFix && r.rank === 1) && (
                <div className="mt-4 rounded-[1.5rem] border-2 border-[#9fcf3a] bg-[#f3fbd9] p-3 sm:p-5"><AvaraFixTabs fixes={r.fixes} id={String(r.rank)} /></div>)}
              {r.fixLocked && <p className="mt-3 text-base text-neutral-700">The fix for this action is part of a paid plan. Your first fix is free.</p>}
              {r.owner && (
                <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-xl bg-[#f6f5f1] p-3 text-base sm:grid-cols-[10rem_minmax(0,1fr)]" data-testid="trace">
                  <dt className="font-semibold">Primary rule</dt><dd className={wrap} data-testid="owner"><b>{r.owner.id}</b> {r.owner.title}. <span className="text-neutral-700">{r.owner.why}</span></dd>
                  {r.related.length > 0 && <><dt className="font-semibold">Also relevant</dt><dd className={wrap} data-testid="related">{r.related.map((x) => `${x.id} ${x.title}`).join(' · ')} <span className="text-neutral-700">(linked as evidence, not counted again)</span></dd></>}
                  <dt className="font-semibold">Categories</dt><dd>{r.categories.map((c) => CAT[c]).join(', ')}</dd>
                  {r.lenses.length > 0 && <><dt className="font-semibold">Heuristic lenses</dt><dd className={wrap} data-testid="lenses">{r.lenses.map((l) => `${l.lens} ${l.name}`).join(' · ')} <span className="text-neutral-700">(a lens adds observations, never a penalty)</span></dd></>}
                  <dt className="font-semibold">Deductions</dt><dd className={wrap} data-testid="deductions"><b>{r.deductions.groups} repair group</b>, {r.deductions.points} points once scoring is enabled. {r.deductions.why}</dd>
                </dl>)}
              <details className="mt-3 rounded-xl border border-black/15 p-3"><summary className="min-h-11 cursor-pointer text-base font-semibold">Why Sugam thinks so ({members.length} finding{members.length === 1 ? '' : 's'})</summary>
                <ul className="mt-3 space-y-3">{members.map((f) => <Finding key={f.id} f={f} />)}</ul></details>
            </li>); })}
        </ol>
        {!readOnly && first && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-[#f3fbd9] p-4"><RescanButton scanId={report.id} label={av.rescanOf ? 'Rescan again' : 'Rescan to verify'} /><p className="max-w-xl text-base text-neutral-800">Applied the fix? Rescan the same page. Sugam marks a finding fixed only when a comparable check confirms it.</p></div>)}
        {av.latestRescanId && !av.rescanOf && <p className="mt-4 text-base"><Link className="font-semibold underline" href={`/scans/${av.latestRescanId}`}>See the latest rescan of this page</Link></p>}
      </section>
      {report.review && <CategoryReviews review={report.review} />}
      <section aria-labelledby="lib-h" className="rounded-[2rem] border border-black/10 bg-white p-5 sm:p-8" data-testid="library">
        <h2 id="lib-h" className="text-2xl font-semibold tracking-tight text-ink">Rule library coverage</h2>
        <p className="mt-2 text-base text-neutral-800">These are different measures and are not added together: <b>{av.library.catalogued}</b> topics catalogued · <b>{av.library.implemented}</b> have a detector (most only for the measurable part) · <b>{av.library.exercisedOnFixtures}</b> exercised on test pages · <b>{av.library.executedOnUrl}</b> ran on this page · <b>{av.library.scoreEligible}</b> eligible for scoring.</p>
        <p className="mt-2 text-base text-neutral-800" data-testid="score-note">{av.library.overall == null ? `No overall launch-readiness number is published: ${av.library.overallWithheld ?? 'scoring is not enabled yet'} Scoring (${av.library.policy}) is provisional and no rule is score-eligible until its source passage is verified and the check is validated.` : `Overall ${av.library.overall} (${av.library.policy}, provisional).`} {av.library.headline}</p>
        <div className="mt-3 space-y-2 text-base">
          <details data-testid="lib-ran"><summary className="min-h-11 cursor-pointer font-semibold">Ran on this page ({av.library.ran.length} topics)</summary><ul className="mt-2 flex flex-wrap gap-2">{av.library.ran.map((x) => <li key={x.id} className="rounded-full bg-[#d9f56e] px-3 py-0.5 text-sm font-medium text-ink">{x.id} {x.title}</li>)}</ul><p className="mt-2 text-neutral-700">Most run for the measurable part only. {av.library.notRun} topics did not run: they are catalogued, not built yet.</p></details>
          <details data-testid="lib-human"><summary className="min-h-11 cursor-pointer font-semibold">Needs a person ({av.library.needsPerson.heuristic} reviews, {av.library.needsPerson.session} sessions)</summary><p className="mt-2 text-neutral-800">{av.library.needsPerson.heuristic} topics are heuristic reviews that need contextual evidence and {av.library.needsPerson.session} need a user, owner or assistive-technology session. A model walkthrough alone cannot verify comprehension or conversion behaviour. {av.library.needsPerson.ids.join(', ')}.</p></details>
          <details data-testid="lib-sources"><summary className="min-h-11 cursor-pointer font-semibold">Sources awaiting verification ({av.library.unverifiedSources.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{av.library.unverifiedSources.map((x) => <li key={x.key} className={wrap}>{x.name} ({x.topics} topics){x.url ? <> · <a className="underline" href={x.url} target="_blank" rel="noreferrer">link</a></> : ' · needs owner or design-system input'}</li>)}</ul><p className="mt-2 text-neutral-700">No exact passage has been verified yet, so no rule is score-eligible.</p></details>
        </div>
        {av.library.advisoryCount > 0 && <p className="mt-2 text-base text-neutral-700">{av.library.advisoryCount} confirmed finding group{av.library.advisoryCount === 1 ? '' : 's'} shown above do not change a number: they stay advisory until their rule is score-eligible.</p>}
      </section>
      {(failed.length > 0 || av.coverage.length > 0) && (
        <section aria-labelledby="cov-h" className="rounded-[2rem] border border-black/10 bg-white p-5 sm:p-8">
          <h2 id="cov-h" className="text-2xl font-semibold tracking-tight text-ink">What was covered</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base text-neutral-800">
            {failed.map(([k, a]) => <li key={k} data-testid="analyzer-failed"><b className="capitalize">{k}</b> check did not complete: {a.message}. The rest of this report is unaffected.</li>)}
            {av.coverage.map((c, i) => <li key={i} className={wrap}>{c}</li>)}
          </ul>
        </section>)}
    </div>
  );
}
