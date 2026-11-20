// The rule engine's result: one card per review category with a provisional score, how much of the category was actually decided, and the findings.
// The distinctions are kept visible: measured vs AI-assisted, decided vs not run vs needs a person, provisional vs final.
import type { ReviewReport } from '@/lib/report-types.ts';

const wrap = '[overflow-wrap:anywhere]';
const RES: Record<string, string> = { observed_pass: 'Passed', observed_failure: 'Failed', needs_human_review: 'Needs a person', inconclusive: 'Inconclusive' };

export function CategoryReviews({ review }: { review: ReviewReport }) {
  const o = review.overall;
  return (
    <section aria-labelledby="rev-h" className="rounded-[2rem] border border-black/10 bg-white p-5 sm:p-8" data-testid="reviews">
      <h2 id="rev-h" className="text-2xl font-semibold tracking-tight text-ink">Category reviews</h2>
      <p className="mt-2 text-base text-neutral-800" data-testid="overall">
        {o.score == null ? 'No overall number yet. ' : <>Overall <b className="tabular-nums">{o.score}</b> ({o.status}). </>}{o.note}
      </p>
      {review.ai.reason && <p className="mt-1 text-sm text-neutral-700" data-testid="ai-note">{review.ai.reason}</p>}
      {review.ai.used && <p className="mt-1 text-sm text-neutral-700">AI-assisted: {review.ai.rulesJudged} rules were judged by {review.ai.model}. A model alone never confirms a failure; those findings need a person.</p>}
      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        {review.categories.map((c) => { const bad = c.findings.filter((f) => !f.passed && f.result !== 'inconclusive'); return (
          <li key={c.category} className="rounded-2xl border border-black/10 p-4" data-testid="review-category">
            <div className="flex items-baseline justify-between gap-3"><h3 className="text-xl font-semibold text-ink">{c.category}</h3><p className="text-2xl font-semibold tabular-nums" data-testid="cat-score">{c.score ?? '–'}</p></div>
            <p className="mt-1 text-sm text-neutral-700">Weight {c.weight}% · {c.status} · {c.coveragePct}% of rule weight decided</p>
            <p className="mt-1 text-sm text-neutral-700">{c.counts.observed_pass ?? 0} passed · {c.counts.observed_failure ?? 0} failed · {c.counts.needs_human_review ?? 0} need a person · {c.counts.not_run ?? 0} not run · {c.counts.unimplemented ?? 0} not built yet · {c.basis.measured} measured, {c.basis.aiAssisted} AI-assisted</p>
            {bad.length > 0 && (
              <details className="mt-3 rounded-xl border border-black/15 p-3"><summary className="min-h-11 cursor-pointer text-base font-semibold">{bad.length} finding{bad.length === 1 ? '' : 's'}</summary>
                <ul className="mt-2 space-y-3">{bad.map((f) => (
                  <li key={f.findingId} className="rounded-xl bg-[#f6f5f1] p-3 text-sm" data-testid="review-finding">
                    <p className={`font-semibold text-ink ${wrap}`}>{f.ruleId} {f.title} · {RES[f.result] ?? f.result} · {f.method === 'ai_assisted' ? 'AI-assisted' : 'measured'} · {f.severity}</p>
                    <p className={`mt-1 ${wrap}`}>{f.observation}</p>
                    {f.recommendation ? <p className={`mt-1 ${wrap}`}><b>Fix:</b> {f.recommendation}</p> : <p className="mt-1 text-neutral-700">The recommendation is part of a paid plan.</p>}
                    {f.evidence.slice(0, 2).map((e, i) => <pre key={i} className={`mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-xs ${wrap}`}>{e}</pre>)}
                    <p className="mt-1 text-xs text-neutral-700">{f.source} · {f.sourceStatus === 'verified-passage' ? 'passage verified' : f.sourceStatus === 'needs-owner-input' ? 'needs owner input' : 'source passage awaiting verification'}</p>
                  </li>))}</ul></details>)}
          </li>); })}
      </ul>
      {review.loaderIssues.length > 0 && <p className="mt-3 text-sm text-[#7a1f0b]">{review.loaderIssues.length} rule file problem{review.loaderIssues.length === 1 ? '' : 's'}: {review.loaderIssues.slice(0, 2).join('; ')}</p>}
    </section>
  );
}
