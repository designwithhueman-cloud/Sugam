// Shared contracts for saved flows: what a flow is, what a run records. Pure Zod, no I/O, so the web app, the worker and tests agree.
// Milestone 1. A flow is a list of typed steps with assertions; there is no step that carries a credential (see `fill`).
import { z } from 'zod';

const selector = z.string().min(1).max(500);
const text = z.string().min(1).max(300);

/** What must be true after a step. Each one is a measurable condition, never an opinion. */
export const Assertion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visible'), selector }),
  z.object({ type: z.literal('hidden'), selector }),
  z.object({ type: z.literal('text_contains'), selector: selector.optional(), text }),   // no selector: the whole page body
  z.object({ type: z.literal('url_contains'), value: text }),
  z.object({ type: z.literal('title_contains'), value: text }),
]);
export type Assertion = z.infer<typeof Assertion>;

const base = { id: z.string().min(1).max(60), label: z.string().max(200).optional(), expect: z.array(Assertion).max(10).default([]) };

/** Typed actions. `fill` takes a literal, non-secret value; the runner refuses password fields. `goto` is checked by the URL guard. */
export const Step = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('goto'), url: z.string().url().max(2000) }),
  z.object({ ...base, action: z.literal('click'), selector }),
  z.object({ ...base, action: z.literal('fill'), selector, value: z.string().max(500) }),
  z.object({ ...base, action: z.literal('press'), key: z.string().min(1).max(40) }),
  z.object({ ...base, action: z.literal('reload') }),
  z.object({ ...base, action: z.literal('wait_for'), selector, timeoutMs: z.number().int().min(100).max(15000).default(5000) }),
]);
export type Step = z.infer<typeof Step>;

export const Flow = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  startUrl: z.string().url().max(2000),
  steps: z.array(Step).min(1).max(30),
}).superRefine((f, ctx) => {
  const seen = new Set<string>();
  f.steps.forEach((s, i) => { if (s.id === 'start') ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: 'The step id “start” is reserved.' }); });
  f.steps.forEach((s, i) => { if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: `Duplicate step id “${s.id}”.` }); seen.add(s.id); });
});
export type Flow = z.infer<typeof Flow>;

export const AssertionResult = z.object({ assertion: Assertion, passed: z.boolean(), observed: z.string().max(500) });
export type AssertionResult = z.infer<typeof AssertionResult>;

/** `blocked` = a safety check refused the step (nothing was done); `skipped` = an earlier step failed. */
export const StepStatus = z.enum(['passed', 'failed', 'blocked', 'skipped']);
export const StepResult = z.object({
  stepId: z.string(), action: z.string(), status: StepStatus, ms: z.number().int().nonnegative(),
  urlAfter: z.string().nullable(), error: z.string().max(400).nullable(), assertions: z.array(AssertionResult),
  screenshot: z.string().max(200).nullable().default(null),   // file name of the screenshot taken after the step, when the host asked for them
});
export type StepResult = z.infer<typeof StepResult>;

export const RunStatus = z.enum(['passed', 'failed', 'blocked']);
export const FlowRun = z.object({
  flowId: z.string(), status: RunStatus, startedAt: z.string(), ms: z.number().int().nonnegative(),
  steps: z.array(StepResult),
  consoleErrors: z.array(z.string().max(300)).max(50),
  failedRequests: z.array(z.object({ url: z.string().max(300), status: z.number().int().nullable(), reason: z.string().max(120) })).max(50),
});
export type FlowRun = z.infer<typeof FlowRun>;

/** Parses untrusted flow JSON and says what is wrong in a sentence, never a stack trace. */
export function parseFlow(input: unknown): { ok: true; flow: Flow } | { ok: false; error: string } {
  const r = Flow.safeParse(input);
  if (r.success) return { ok: true, flow: r.data };
  const i = r.error.issues[0]; return { ok: false, error: `${i.path.join('.') || 'flow'}: ${i.message}` };
}
