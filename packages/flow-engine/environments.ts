// Comparing one approved flow version on two environments (published and preview). Pure functions: move a flow to another origin, and decide what the
// two results mean together. A paired result is not a rerun comparison (insights.ts): both runs are of the same version, at the same time, on different sites.
import type { Flow, FlowRun, StepResult } from '../contracts/index.ts';
import { blockedSummary } from './insights.ts';

/** The same flow aimed at another origin: the start address and any `goto` step. Selectors and expectations are untouched. */
export function retarget(flow: Flow, fromOrigin: string, toOrigin: string): Flow {
  const swap = (u: string) => { try { const x = new URL(u); return x.origin === fromOrigin ? toOrigin + x.pathname + x.search + x.hash : u; } catch { return u; } };
  return { ...flow, startUrl: swap(flow.startUrl), steps: flow.steps.map((s) => (s.action === 'goto' ? { ...s, url: swap(s.url) } : s)) } as Flow;
}

export type Side = { status: 'passed' | 'failed' | 'blocked' | 'error' | 'missing'; run: FlowRun | null; error: string | null };
export type Verdict = 'passed_both' | 'preview_regression' | 'existing_failure_both' | 'failed_differently' | 'passing_on_preview' | 'inconclusive';
export type SideSummary = { status: Side['status']; failedStep: string | null; failure: string | null; inconclusive: string | null };
export type Comparison = { verdict: Verdict; headline: string; detail: string; published: SideSummary; preview: SideSummary };

const failedOf = (r: FlowRun | null): StepResult | null => r?.steps.find((s) => s.status === 'failed') ?? null;
/** What failed, so two failures can be told apart: the step and the first assertion that was not true (or the step's own error). */
export function failureKey(r: FlowRun | null): string | null {
  const s = failedOf(r); if (!s) return null; const a = s.assertions.find((x) => !x.passed)?.assertion;
  const what = a ? JSON.stringify(a.type === 'visible' || a.type === 'hidden' ? [a.type, a.selector] : a.type === 'text_contains' ? [a.type, a.selector ?? '', a.text] : [a.type, (a as { value: string }).value]) : `error:${s.error ?? ''}`;
  return `${s.stepId}|${what}`;
}
/** Why a side cannot be trusted as evidence (null when it can). A page that could not be opened is not a regression; it is not knowing. */
export function inconclusiveReason(side: Side): string | null {
  if (side.status === 'missing') return 'This run did not happen.';
  if (side.status === 'error') return `The run could not be completed${side.error ? `: ${side.error}` : '.'}`;
  const r = side.run; if (!r) return 'There is no result for this run.';
  if (r.status === 'blocked') return blockedSummary(r)?.sentence ?? 'A safety rule stopped this run before it finished, so the outcome is unknown.';
  if (r.flaky) return 'This run gave different answers when repeated, so it cannot be trusted.';
  const start = r.steps.find((s) => s.stepId === 'start'); if (start && start.status === 'failed') return `The start page could not be opened (${(start.error ?? 'no detail').slice(0, 120)}), so the flow was not run.`;
  return null;
}
const summarise = (side: Side): SideSummary => { const f = failedOf(side.run); const fa = f?.assertions.find((x) => !x.passed);
  return { status: side.status === 'failed' && side.run?.status === 'blocked' ? 'blocked' : side.status, failedStep: f?.stepId ?? null, failure: fa ? `expected ${JSON.stringify(fa.assertion)}; observed ${fa.observed}` : f?.error ?? null, inconclusive: inconclusiveReason(side) }; };

/** What the two results mean together. */
export function compareEnvironments(published: Side, preview: Side): Comparison {
  const p = summarise(published), v = summarise(preview); const base = { published: p, preview: v };
  if (p.inconclusive || v.inconclusive) {
    const who = [p.inconclusive && 'published', v.inconclusive && 'preview'].filter(Boolean).join(' and ');
    return { verdict: 'inconclusive', headline: 'Comparison inconclusive', detail: `The ${who} run could not be used as evidence, so no verdict is given. The other result is shown as observed.`, ...base };
  }
  const pOk = published.run?.status === 'passed', vOk = preview.run?.status === 'passed';
  if (pOk && vOk) return { verdict: 'passed_both', headline: 'Passed on both', detail: 'The same approved version passed on the published site and on the preview.', ...base };
  if (pOk && !vOk) return { verdict: 'preview_regression', headline: 'Preview regression', detail: 'This passes on the published site and fails on the preview. Something in the preview broke it.', ...base };
  if (!pOk && vOk) return { verdict: 'passing_on_preview', headline: 'Passing on preview', detail: 'This fails on the published site and passes on the preview. The published site is not fixed until a later production run passes.', ...base };
  const same = failureKey(published.run) !== null && failureKey(published.run) === failureKey(preview.run);
  return same ? { verdict: 'existing_failure_both', headline: 'Existing failure on both', detail: 'The same expectation fails on the published site and on the preview, so the preview did not introduce it.', ...base }
    : { verdict: 'failed_differently', headline: 'Fails on both, in different ways', detail: 'The published site and the preview fail differently. Both failures are shown; neither is a regression from the other.', ...base };
}
