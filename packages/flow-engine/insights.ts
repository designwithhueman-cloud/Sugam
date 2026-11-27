// What a founder needs from a flow run, beyond pass or fail: whether to believe a failure, what changed since the last run, and what a failed
// step means in plain words. Pure functions over FlowRun (no browser, no I/O), so the app, the worker and tests share them.
import type { FlowRun, StepResult } from '../contracts/index.ts';

const failedStep = (r: FlowRun) => r.steps.find((s) => s.status === 'failed' || s.status === 'blocked')?.stepId ?? null;

/** Runs a flow, and if it failed, once more. A run that passes on the repeat is reported as passed but flaky; two failures at different steps are
 *  failed but flaky; two failures at the same step are a confirmed failure. Blocked runs are never repeated (a safety rule does not change), and a
 *  run that already used more than half its time budget is not repeated. */
export async function settleRun(runOnce: () => Promise<FlowRun>, o: { maxMs?: number } = {}): Promise<FlowRun> {
  const maxMs = o.maxMs ?? 60000; const first = await runOnce();
  if (first.status !== 'failed' || first.ms > maxMs / 2) return { ...first, attempts: 1, flaky: false };
  const second = await runOnce();
  if (second.status === 'passed') return { ...second, attempts: 2, flaky: true };
  return { ...second, attempts: 2, flaky: second.status === 'failed' && failedStep(first) !== failedStep(second) };
}

export type StepChange = { stepId: string; outcome: 'fixed' | 'still_failing' | 'newly_failing' | 'not_reached' };
export type RunComparison = {
  result: 'fixed' | 'still_failing' | 'regressed' | 'still_passing' | 'unreliable';
  summary: string; steps: StepChange[]; newConsoleErrors: string[]; newFailedRequests: string[];
};
const bad = (s: StepResult['status']) => s === 'failed' || s === 'blocked';
const reqKey = (r: FlowRun['failedRequests'][number]) => `${r.status ?? r.reason} ${r.url.replace(/[?#].*$/, '')}`;

/** Compares two runs of the same flow. A step that passed before and fails now is "newly failing": something the last change broke. */
export function compareRuns(before: FlowRun, after: FlowRun): RunComparison {
  const was = new Map(before.steps.map((s) => [s.stepId, s.status])); const steps: StepChange[] = [];
  for (const s of after.steps) {
    const w = was.get(s.stepId); if (!w) continue;
    if (bad(w) && s.status === 'passed') steps.push({ stepId: s.stepId, outcome: 'fixed' });
    else if (bad(w) && bad(s.status)) steps.push({ stepId: s.stepId, outcome: 'still_failing' });
    else if (w === 'passed' && bad(s.status)) steps.push({ stepId: s.stepId, outcome: 'newly_failing' });
    else if (w === 'passed' && s.status === 'skipped') steps.push({ stepId: s.stepId, outcome: 'not_reached' });
  }
  const seenErr = new Set(before.consoleErrors), seenReq = new Set(before.failedRequests.map(reqKey));
  const newConsoleErrors = after.consoleErrors.filter((e) => !seenErr.has(e)); const newFailedRequests = [...new Set(after.failedRequests.map(reqKey).filter((k) => !seenReq.has(k)))];
  const wasOk = before.status === 'passed', isOk = after.status === 'passed';
  const result: RunComparison['result'] = after.flaky ? 'unreliable' : !wasOk && isOk ? 'fixed' : !wasOk && !isOk ? 'still_failing' : wasOk && !isOk ? 'regressed' : 'still_passing';
  const summary = {
    unreliable: 'This flow gives different answers on repeat runs, so the comparison cannot be trusted yet. Run it again.',
    fixed: 'The flow failed last time and passes now.',
    still_failing: 'The flow still fails.',
    regressed: 'Something that worked last time is broken now. Fix this first.',
    still_passing: newConsoleErrors.length || newFailedRequests.length ? 'The flow still passes, but new errors appeared on the page.' : 'The flow still passes and nothing new went wrong.',
  }[result];
  return { result, summary, steps, newConsoleErrors, newFailedRequests };
}

/** A failed or blocked step in everyday words. Returns null for steps that did not fail. */
export function plainStep(s: StepResult): string | null {
  if (s.status === 'blocked') {
    const m = /^Blocked by policy \(([^)]+)\): (.*)$/.exec(s.error ?? '');
    return m ? `Avara did not do this step on purpose: ${m[2].replace(/\.$/, '')}. Flows never submit forms, sign in, spend money or leave your site.` : 'Avara did not do this step on purpose, because it could change something on your site.';
  }
  if (s.status !== 'failed') return null;
  const e = s.error ?? '';
  const a = s.assertions.find((x) => !x.passed);
  if (a) {
    const x = a.assertion;
    if (x.type === 'visible') return `After this step, “${x.selector}” should have been on the page, but Avara could not see it.`;
    if (x.type === 'hidden') return `After this step, “${x.selector}” should have gone away, but it was still showing.`;
    if (x.type === 'text_contains') return `After this step, the page should have said “${x.text}”, but it did not. It said: “${a.observed.slice(0, 80)}”.`;
    if (x.type === 'url_contains') return `After this step, the address should have contained “${x.value}”, but it was “${a.observed.slice(0, 80)}”.`;
    return `After this step, the page title should have contained “${x.value}”, but it was “${a.observed.slice(0, 80)}”.`;
  }
  if (/time limit/i.test(e)) return 'The flow took too long, so Avara stopped it.';
  const st = /answered (\d{3})/.exec(e); if (st) return `The page did not load properly. It returned an error (${st[1]}).`;
  if (s.action === 'goto') return 'The page did not load.';
  if (/timeout|waiting for|not visible|resolved to|intercept/i.test(e)) return `Avara could not find or use the ${s.action === 'fill' ? 'field' : s.action === 'wait_for' ? 'item it was waiting for' : 'button or link'} for this step within a few seconds. It may have been renamed, moved, hidden, or the page was too slow.`;
  return 'This step did not work.';
}
