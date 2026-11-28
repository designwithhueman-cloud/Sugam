'use client';
// The step list and status badges of a flow run, shared by the run result and the published-vs-preview comparison.
import * as React from 'react';
import { plainStep } from '@/packages/flow-engine/insights.ts';
import { describeAssertion } from '@/packages/flow-engine/journeys.ts';

export type Step = { stepId: string; action: string; status: string; ms: number; urlAfter: string | null; error: string | null; assertions: { passed: boolean; observed: string; assertion: { type: string } }[] };
export const LABEL: Record<string, string> = { passed: 'Passed', failed: 'Failed', blocked: 'Could not verify', error: 'Could not run', running: 'Running', skipped: 'Skipped' };
const STEP_LABEL: Record<string, string> = { blocked: 'Skipped for safety', skipped: 'Not checked' };   // a step label never says “Failed” for a step Avara chose not to do
const TONE: Record<string, string> = { passed: 'bg-emerald-50 text-emerald-900', failed: 'bg-red-50 text-red-900', blocked: 'bg-amber-50 text-amber-900', error: 'bg-slate-100 text-slate-800', running: 'bg-blue-50 text-blue-900', skipped: 'bg-slate-100 text-slate-600' };
export const Badge = ({ s, step }: { s: string; step?: boolean }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[s] ?? TONE.error}`}>{(step && STEP_LABEL[s]) || LABEL[s] || s}</span>;

/** Every step with its status, a plain sentence for a failure or a safety stop, and each assertion. A failed assertion also says what was expected and what was observed. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2">{steps.map((s) => { const plain = plainStep(s as never); return (
      <li key={s.stepId} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">{s.stepId} <span className="font-normal text-slate-600">({s.action})</span></span><Badge s={s.status} step /></div>
        {plain && <p data-testid="plain-step" className="mt-1 text-slate-800">{plain}</p>}
        {s.error && <details className="mt-1 text-slate-600"><summary className="cursor-pointer">Technical detail</summary><p className="mt-1 break-words">{s.error}</p></details>}
        {s.assertions.map((a, i) => <React.Fragment key={i}><p className="mt-1 text-slate-600">{a.passed ? '✓' : '✗'} {a.assertion.type.replace('_', ' ')}: {a.observed}</p>
          {!a.passed && <p data-testid="expected-observed" className="mt-1 text-red-900">Expected: {describeAssertion(a.assertion as never)}. Observed: {a.observed}.</p>}</React.Fragment>)}</li>); })}</ol>
  );
}
