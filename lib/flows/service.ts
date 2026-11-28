// Saved flows for a project: create, list, delete, and run (the browser work happens in the worker; see ./worker.ts).
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { parseFlow, type Flow } from '../../packages/contracts/index.ts';
import { checkUrl, BlockedUrlError } from '../net/guard.ts';
import { runOnWorker, WorkerError } from './worker.ts';
import { settleRun } from '../../packages/flow-engine/insights.ts';
import { logError, redactDeep, sensitiveFillProblem } from '../security/redact.ts';

export const MAX_FLOWS_PER_PROJECT = 25;
const RUN_WINDOW_MS = 600_000, MAX_RUNS_PER_WINDOW = Number(process.env.FLOW_RUNS_PER_WINDOW) || 10;
const recent = new Map<string, number[]>();   // per user, in this process

export type Created = { ok: true; id: string } | { ok: false; status: number; error: string; message: string };
export async function createFlow(projectId: string, userId: string, input: unknown, opts: { journeyKey?: string; note?: string } = {}): Promise<Created> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const parsed = parseFlow({ ...body, id: 'pending' });   // the real id is the row id, set below
  if (!parsed.ok) return { ok: false, status: 400, error: 'invalid_flow', message: parsed.error };
  const sensitive = sensitiveFillProblem(parsed.flow as unknown as Parameters<typeof sensitiveFillProblem>[0]);   // before anything is stored: no credentials, keys, card or ID numbers
  if (sensitive) return { ok: false, status: 400, error: 'sensitive_value', message: sensitive.reason };
  try { parsed.flow.startUrl = (await checkUrl(parsed.flow.startUrl)).toString(); } catch (e) { if (e instanceof BlockedUrlError) return { ok: false, status: 400, error: 'blocked_url', message: e.message }; throw e; }   // the stored address has secret parameters removed
  parsed.flow = redactDeep(parsed.flow);
  const db = await getDb();
  const have = await db.select({ id: schema.flows.id }).from(schema.flows).where(eq(schema.flows.projectId, projectId));
  if (have.length >= MAX_FLOWS_PER_PROJECT) return { ok: false, status: 409, error: 'limit', message: `A project can keep ${MAX_FLOWS_PER_PROJECT} flows.` };
  const [row] = await db.insert(schema.flows).values({ projectId, name: parsed.flow.name, definition: { ...parsed.flow, id: 'pending' }, createdBy: userId, journeyKey: opts.journeyKey ?? null }).returning({ id: schema.flows.id });
  await db.update(schema.flows).set({ definition: { ...parsed.flow, id: row.id } }).where(eq(schema.flows.id, row.id));
  await db.insert(schema.flowVersions).values({ flowId: row.id, version: 1, definition: { ...parsed.flow, id: row.id }, note: opts.note ?? null, approvedBy: userId });
  return { ok: true, id: row.id };
}

export async function listFlows(projectId: string) {
  const db = await getDb();
  const flows = await db.select().from(schema.flows).where(eq(schema.flows.projectId, projectId)).orderBy(desc(schema.flows.createdAt));
  const out = [];
  for (const f of flows) { const [last] = await db.select({ id: schema.flowRuns.id, status: schema.flowRuns.status, startedAt: schema.flowRuns.startedAt }).from(schema.flowRuns).where(eq(schema.flowRuns.flowId, f.id)).orderBy(desc(schema.flowRuns.startedAt)).limit(1); out.push({ id: f.id, name: f.name, version: f.version, journeyKey: f.journeyKey, definition: f.definition, createdAt: f.createdAt, lastRun: last ?? null }); }
  return out;
}

export async function getFlow(flowId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(flowId)) return null;
  const db = await getDb(); const [f] = await db.select().from(schema.flows).where(eq(schema.flows.id, flowId)); return f ?? null;
}

export async function listRuns(flowId: string) {
  const db = await getDb(); return db.select().from(schema.flowRuns).where(eq(schema.flowRuns.flowId, flowId)).orderBy(desc(schema.flowRuns.startedAt)).limit(20);
}

/** Starts a run and returns its id at once; the worker call finishes in the background and updates the row. */
export async function startRun(flowId: string, userId: string): Promise<{ ok: true; runId: string } | { ok: false; status: number; error: string; message: string }> {
  const now = Date.now(); const mine = (recent.get(userId) ?? []).filter((t) => now - t < RUN_WINDOW_MS);
  if (mine.length >= MAX_RUNS_PER_WINDOW) return { ok: false, status: 429, error: 'rate_limited', message: 'Too many flow runs. Please wait a few minutes.' };
  const db = await getDb(); const f = await getFlow(flowId); if (!f) return { ok: false, status: 404, error: 'not_found', message: 'Flow not found.' };
  const [active] = await db.select({ id: schema.flowRuns.id }).from(schema.flowRuns).where(and(eq(schema.flowRuns.flowId, flowId), eq(schema.flowRuns.status, 'running'))).limit(1);
  if (active) return { ok: false, status: 409, error: 'already_running', message: 'This flow is already running.' };
  const parsed = parseFlow(f.definition); if (!parsed.ok) return { ok: false, status: 422, error: 'invalid_flow', message: parsed.error };
  mine.push(now); recent.set(userId, mine);
  const [run] = await db.insert(schema.flowRuns).values({ flowId, createdBy: userId, status: 'running', version: f.version }).returning({ id: schema.flowRuns.id });   // the run keeps this definition and this version even if a newer one is approved before it finishes
  void finishRun(run.id, parsed.flow);
  return { ok: true, runId: run.id };
}

async function finishRun(runId: string, flow: Flow): Promise<void> {
  const db = await getDb();
  try {
    const result = redactDeep(await settleRun(() => runOnWorker(flow)));   // the page's console text, request addresses and step messages are masked before they are stored   // a failure is repeated once, so a slow page is not reported as a broken one
    await db.update(schema.flowRuns).set({ status: result.status, result: result as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowRuns.id, runId));
  } catch (e) {
    const message = e instanceof WorkerError ? e.message : 'The run could not be completed.';
    if (!(e instanceof WorkerError)) logError(`flow run failed ${runId}`, e);
    await db.update(schema.flowRuns).set({ status: 'error', error: message, finishedAt: new Date() }).where(eq(schema.flowRuns.id, runId)).catch(() => {});
  }
}

// ---- versions: the owner's approved expectation, kept as a history. A flow always runs its newest approved version. ----
export async function listVersions(flowId: string) {
  const db = await getDb(); return db.select().from(schema.flowVersions).where(eq(schema.flowVersions.flowId, flowId)).orderBy(desc(schema.flowVersions.version));
}
/** Approves a new definition for a flow as its next version. The definition is parsed and checked like a new flow; nothing else about the flow changes. */
export async function approveVersion(flowId: string, userId: string, definition: unknown, note: string | null): Promise<{ ok: true; version: number } | { ok: false; status: number; error: string; message: string }> {
  const f = await getFlow(flowId); if (!f) return { ok: false, status: 404, error: 'not_found', message: 'Flow not found.' };
  const parsed = parseFlow({ ...(definition as object), id: f.id }); if (!parsed.ok) return { ok: false, status: 400, error: 'invalid_flow', message: parsed.error };
  const sensitive = sensitiveFillProblem(parsed.flow as unknown as Parameters<typeof sensitiveFillProblem>[0]); if (sensitive) return { ok: false, status: 400, error: 'sensitive_value', message: sensitive.reason };
  try { parsed.flow.startUrl = (await checkUrl(parsed.flow.startUrl)).toString(); } catch (e) { if (e instanceof BlockedUrlError) return { ok: false, status: 400, error: 'blocked_url', message: e.message }; throw e; }
  const flow = redactDeep(parsed.flow); const db = await getDb(); const version = f.version + 1;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.flowVersions).values({ flowId: f.id, version, definition: flow as unknown as Record<string, unknown>, note, approvedBy: userId });   // (flow, version) is unique: two approvals of the same next version cannot both succeed
      const moved = await tx.update(schema.flows).set({ definition: flow as unknown as Record<string, unknown>, name: flow.name, version, updatedAt: new Date() }).where(and(eq(schema.flows.id, f.id), eq(schema.flows.version, f.version))).returning({ id: schema.flows.id });
      if (!moved.length) throw new Error('version_conflict');
    });
  } catch (e) { if (/version_conflict|duplicate key|unique/i.test(String((e as Error).message))) return { ok: false, status: 409, error: 'version_conflict', message: 'The flow changed while this was being approved. Reload and try again.' }; throw e; }
  return { ok: true, version };
}
