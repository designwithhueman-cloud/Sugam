// "Compare preview with published": one approved flow version, run on the project's published (live) address and on its preview (staging) address, with
// only the origin changed. Manual. The two runs are flow_runs rows with an environment (kept out of the flow's run history); the verdict is decided by
// packages/flow-engine/environments.ts and stored with both sides' evidence.
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { FlowRun, parseFlow, type Flow } from '../../packages/contracts/index.ts';
import { compareEnvironments, retarget, type Side } from '../../packages/flow-engine/environments.ts';
import { settleRun } from '../../packages/flow-engine/insights.ts';
import { runOnWorker, WorkerError } from './worker.ts';
import { getFlow } from './service.ts';
import { logError, redactDeep } from '../security/redact.ts';

type Fail = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Fail => ({ ok: false, status, error, message });
const originOf = (u: string | null) => { try { return u ? new URL(u).origin : null; } catch { return null; } };
const recent = new Map<string, number[]>();   // per user, in this process: 5 comparisons in 10 minutes

export async function startComparison(flowId: string, userId: string): Promise<{ ok: true; id: string } | Fail> {
  const f = await getFlow(flowId); if (!f) return fail(404, 'not_found', 'Flow not found.');
  const db = await getDb(); const [p] = await db.select({ live: schema.projects.liveUrl, staging: schema.projects.stagingUrl }).from(schema.projects).where(eq(schema.projects.id, f.projectId));
  const live = originOf(p?.live ?? null), staging = originOf(p?.staging ?? null);
  if (!live || !staging) return fail(400, 'needs_both_addresses', 'Add both the live address and the preview (staging) address to the project to compare them.');
  if (live === staging) return fail(400, 'same_address', 'The live and preview addresses are the same, so there is nothing to compare.');
  const parsed = parseFlow(f.definition); if (!parsed.ok) return fail(422, 'invalid_flow', parsed.error);
  const at = originOf(parsed.flow.startUrl); if (at !== live && at !== staging) return fail(400, 'not_on_either', 'This flow starts on neither the live nor the preview address of the project, so it cannot be compared.');
  const now = Date.now(); const mine = (recent.get(userId) ?? []).filter((t) => now - t < 600_000); if (mine.length >= (Number(process.env.FLOW_COMPARISONS_PER_WINDOW) || 5)) return fail(429, 'rate_limited', 'Too many comparisons. Please wait a few minutes.');
  const [busy] = await db.select({ id: schema.flowRuns.id }).from(schema.flowRuns).where(and(eq(schema.flowRuns.flowId, flowId), eq(schema.flowRuns.status, 'running'))).limit(1);
  if (busy) return fail(409, 'already_running', 'This flow is already running.');
  mine.push(now); recent.set(userId, mine);
  const version = f.version; const published = at === live ? parsed.flow : retarget(parsed.flow, staging, live); const preview = at === live ? retarget(parsed.flow, live, staging) : parsed.flow;   // one definition, read once: both halves are the same version
  const [row] = await db.insert(schema.flowComparisons).values({ flowId, version, publishedOrigin: live, previewOrigin: staging, createdBy: userId }).returning({ id: schema.flowComparisons.id });
  void finishComparison(row.id, flowId, userId, version, published, preview);
  return { ok: true, id: row.id };
}

async function half(flowId: string, userId: string, version: number, environment: 'published' | 'preview', flow: Flow): Promise<{ runId: string; side: Side }> {
  const db = await getDb(); const [run] = await db.insert(schema.flowRuns).values({ flowId, createdBy: userId, status: 'running', version, environment }).returning({ id: schema.flowRuns.id });
  try {
    const result = redactDeep(await settleRun(() => runOnWorker(flow)));   // a failure is repeated once, as an ordinary run is
    await db.update(schema.flowRuns).set({ status: result.status, result: result as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowRuns.id, run.id));
    return { runId: run.id, side: { status: result.status, run: result, error: null } };
  } catch (e) {
    const message = e instanceof WorkerError ? e.message : 'The run could not be completed.'; if (!(e instanceof WorkerError)) logError(`comparison run failed ${run.id}`, e);
    await db.update(schema.flowRuns).set({ status: 'error', error: message, finishedAt: new Date() }).where(eq(schema.flowRuns.id, run.id)).catch(() => {});
    return { runId: run.id, side: { status: 'error', run: null, error: message } };
  }
}

async function finishComparison(id: string, flowId: string, userId: string, version: number, published: Flow, preview: Flow): Promise<void> {
  const db = await getDb();
  try {
    const a = await half(flowId, userId, version, 'published', published); await db.update(schema.flowComparisons).set({ publishedRunId: a.runId }).where(eq(schema.flowComparisons.id, id));
    const b = await half(flowId, userId, version, 'preview', preview); await db.update(schema.flowComparisons).set({ previewRunId: b.runId }).where(eq(schema.flowComparisons.id, id));
    const c = compareEnvironments(a.side, b.side);
    await db.update(schema.flowComparisons).set({ status: 'done', verdict: c.verdict, detail: c as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowComparisons.id, id));
  } catch (e) {
    logError(`comparison failed ${id}`, e);
    const none: Side = { status: 'missing', run: null, error: null }; const c = compareEnvironments(none, none);
    await db.update(schema.flowComparisons).set({ status: 'done', verdict: c.verdict, detail: c as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowComparisons.id, id)).catch(() => {});
  }
}

export async function listComparisons(flowId: string, n = 5) {
  const db = await getDb(); const rows = await db.select().from(schema.flowComparisons).where(eq(schema.flowComparisons.flowId, flowId)).orderBy(desc(schema.flowComparisons.createdAt)).limit(n);
  const out = [];
  for (const c of rows) {
    const get = async (rid: string | null) => { if (!rid) return null; const [r] = await db.select().from(schema.flowRuns).where(eq(schema.flowRuns.id, rid)); return r ? { id: r.id, status: r.status, error: r.error, version: r.version, result: FlowRun.safeParse(r.result).success ? r.result : null } : null; };
    out.push({ id: c.id, version: c.version, status: c.status, verdict: c.verdict, detail: c.detail, publishedOrigin: c.publishedOrigin, previewOrigin: c.previewOrigin, createdAt: c.createdAt, published: await get(c.publishedRunId), preview: await get(c.previewRunId) });
  }
  return out;
}
