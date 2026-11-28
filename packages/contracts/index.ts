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
  attempts: z.number().int().min(1).max(3).default(1),   // 2 when a failed run was repeated once before being reported
  flaky: z.boolean().default(false),                       // passed only on the repeat, or failed differently each time: do not trust it
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

// ---- journey discovery (M1): what the worker found from one address ----
export const JourneyPurpose = z.enum(['booking', 'signup', 'pricing', 'contact', 'login', 'other']);
export type JourneyPurpose = z.infer<typeof JourneyPurpose>;
export const Journey = z.object({
  id: z.string().max(40), key: z.string().max(300), purpose: JourneyPurpose, title: z.string().max(120),
  steps: z.array(Step).min(1).max(5),                  // click steps from the start page; the last step's `expect` is the suggested success condition
  observed: z.array(z.string().max(200)).max(8),       // the same steps in plain words
  finalUrl: z.string().max(2000), finalTitle: z.string().max(200),
});
export type Journey = z.infer<typeof Journey>;
export const DiscoveryResult = z.object({
  startUrl: z.string().max(2000), ms: z.number().int().nonnegative(), pagesVisited: z.number().int().nonnegative(),
  journeys: z.array(Journey).max(12), skipped: z.array(z.object({ reason: z.string().max(80), count: z.number().int().nonnegative() })).max(20), limits: z.array(z.string().max(120)).max(10),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResult>;
