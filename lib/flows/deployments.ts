// "Preview is ready" trigger for M2a: a bearer-authenticated webhook starts the same published-vs-preview comparison a person starts by hand.
//   1. ACCEPT (one transaction): save the event, then one pending comparison per flow (the approved version pinned, both addresses pinned) and the
//      reasons for any flows that were not compared. Nothing is run here, and a retry of the same (project, deployment id) only reads this back,
//      so it always returns the same comparison ids, and a crash after this point loses nothing.
//   2. DISPATCH: pending comparisons are claimed one at a time (an atomic UPDATE) and run in order on the worker. A comparison left "running" by a
//      process that died is put back to pending (at start-up, or once its claim is older than DEPLOY_STALE_MS) and run again.
// The preview address is always the project's own staging address; the event only says which deployment it is for, so it cannot point the worker anywhere new.
import crypto from 'node:crypto';
import { and, asc, desc, eq, lt, or, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { parseFlow } from '../../packages/contracts/index.ts';
import { compareEnvironments, type Side } from '../../packages/flow-engine/environments.ts';
import { finishComparison, hydrateComparison, sidesFor } from './comparison.ts';
import { logError, redactText } from '../security/redact.ts';

export const MAX_FLOWS_PER_DEPLOYMENT = 5;
const INSTANCE = crypto.randomUUID();   // this process; a claim by any other process is a claim by a process that is gone, once the web server has started
const staleMs = () => Number(process.env.DEPLOY_STALE_MS) || 600_000;
const originOf = (u: string | null) => { try { return u ? new URL(u).origin : null; } catch { return null; } };
const hash = (t: string) => crypto.createHash('sha256').update(t).digest();

type Fail = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Fail => ({ ok: false, status, error, message });

// ---- the bearer token: shown once, only its hash is stored ----
export async function rotateDeployToken(projectId: string): Promise<string> {
  const token = 'avd_' + crypto.randomBytes(24).toString('base64url');
  await (await getDb()).update(schema.projects).set({ deployTokenHash: hash(token).toString('hex') }).where(eq(schema.projects.id, projectId));
  return token;
}
/** The project when the token is its current token; null otherwise (the same answer for a missing project, no token set and a wrong token). */
export async function verifyDeployToken(projectId: string, token: string) {
  const none = Buffer.alloc(32); if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const [p] = await (await getDb()).select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const stored = p?.deployTokenHash ? Buffer.from(p.deployTokenHash, 'hex') : none; const given = hash(token);
  const same = stored.length === given.length && crypto.timingSafeEqual(stored, given);
  return p && p.deployTokenHash && same ? p : null;
}

export type Accepted = { ok: true; eventId: string; duplicate: boolean; deploymentId: string; comparisons: { id: string; flowId: string; name: string; status: string }[]; skipped: { flowId: string; name: string; reason: string; message: string }[] };

async function read(eventId: string, duplicate: boolean): Promise<Accepted> {
  const db = await getDb(); const [e] = await db.select().from(schema.deploymentEvents).where(eq(schema.deploymentEvents.id, eventId));
  const rows = await db.select({ id: schema.flowComparisons.id, flowId: schema.flowComparisons.flowId, name: schema.flows.name, status: schema.flowComparisons.status }).from(schema.flowComparisons).innerJoin(schema.flows, eq(schema.flows.id, schema.flowComparisons.flowId)).where(eq(schema.flowComparisons.deploymentEventId, eventId)).orderBy(asc(schema.flowComparisons.createdAt), asc(schema.flowComparisons.id));
  return { ok: true, eventId, duplicate, deploymentId: e.deploymentId, comparisons: rows, skipped: e.skipped };
}

/** Step 1. Everything is written in one transaction, or nothing is. */
export async function acceptDeployment(projectId: string, rawDeploymentId: string): Promise<Accepted | Fail> {
  const deploymentId = redactText(rawDeploymentId).trim();
  const db = await getDb();
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.select({ live: schema.projects.liveUrl, staging: schema.projects.stagingUrl }).from(schema.projects).where(eq(schema.projects.id, projectId));
    const live = originOf(p?.live ?? null), staging = originOf(p?.staging ?? null);
    if (!live || !staging) return fail(400, 'needs_both_addresses', 'Add both the live address and the preview (staging) address to the project first.');
    if (live === staging) return fail(400, 'same_address', 'The live and preview addresses are the same, so there is nothing to compare.');
    const [ev] = await tx.insert(schema.deploymentEvents).values({ projectId, deploymentId, publishedOrigin: live, previewOrigin: staging }).onConflictDoNothing().returning({ id: schema.deploymentEvents.id });
    if (!ev) { const [old] = await tx.select({ id: schema.deploymentEvents.id }).from(schema.deploymentEvents).where(and(eq(schema.deploymentEvents.projectId, projectId), eq(schema.deploymentEvents.deploymentId, deploymentId))); return { dup: old!.id }; }
    const flows = await tx.select().from(schema.flows).where(eq(schema.flows.projectId, projectId)).orderBy(asc(schema.flows.createdAt), asc(schema.flows.id));
    const skipped: { flowId: string; name: string; reason: string; message: string }[] = []; let taken = 0;
    for (const f of flows) {
      const [v] = await tx.select({ definition: schema.flowVersions.definition }).from(schema.flowVersions).where(and(eq(schema.flowVersions.flowId, f.id), eq(schema.flowVersions.version, f.version)));
      const parsed = parseFlow(v?.definition ?? f.definition);
      if (!parsed.ok) { skipped.push({ flowId: f.id, name: f.name, reason: 'invalid_flow', message: 'The saved flow could not be read.' }); continue; }
      if (!sidesFor(parsed.flow, live, staging)) { skipped.push({ flowId: f.id, name: f.name, reason: 'not_on_either', message: 'This flow starts on neither the live nor the preview address, so it cannot be compared.' }); continue; }
      if (taken >= MAX_FLOWS_PER_DEPLOYMENT) { skipped.push({ flowId: f.id, name: f.name, reason: 'over_limit', message: `Not compared: one deployment compares at most ${MAX_FLOWS_PER_DEPLOYMENT} flows. Compare this one by hand.` }); continue; }
      await tx.insert(schema.flowComparisons).values({ flowId: f.id, version: f.version, status: 'pending', publishedOrigin: live, previewOrigin: staging, deploymentEventId: ev.id, createdBy: null, createdAt: new Date(Date.now() + taken) }); taken++;   // a transaction has one clock time: stagger by a millisecond so "in order" is real
    }
    await tx.update(schema.deploymentEvents).set({ skipped }).where(eq(schema.deploymentEvents.id, ev.id));
    return { fresh: ev.id };
  });
  if ('ok' in out) return out;
  const r = out as { dup?: string; fresh?: string };
  return r.dup ? read(r.dup, true) : read(r.fresh!, false);
}

// ---- step 2: dispatch ----
let active: Promise<void> | null = null, again = false;
/** Runs every pending comparison, one at a time. Safe to call at any moment, from any number of places: only one loop runs in this process. */
export function dispatchPending(): Promise<void> {
  if (active) { again = true; return active; }
  active = (async () => { do { again = false; await drain(); } while (again); })().catch((e) => logError('deployment dispatch failed', e)).finally(() => { active = null; });
  return active;
}

/** Puts comparisons left running by a dead process back to pending. At start-up every claim by another process is dead; later, only claims older than DEPLOY_STALE_MS. */
export async function requeueStale(startup = false): Promise<number> {
  const db = await getDb(); const cutoff = new Date(Date.now() - staleMs());
  const where = and(eq(schema.flowComparisons.status, 'running'), sql`${schema.flowComparisons.deploymentEventId} is not null`, startup ? or(isNull(schema.flowComparisons.claimedBy), sql`${schema.flowComparisons.claimedBy} <> ${INSTANCE}`) : or(isNull(schema.flowComparisons.claimedAt), lt(schema.flowComparisons.claimedAt, cutoff)));
  const rows = await db.update(schema.flowComparisons).set({ status: 'pending', claimedBy: null, claimedAt: null }).where(where).returning({ id: schema.flowComparisons.id }); return rows.length;
}

async function drain(): Promise<void> {
  const db = await getDb();
  for (;;) {
    const [next] = await db.select().from(schema.flowComparisons).where(and(eq(schema.flowComparisons.status, 'pending'), sql`${schema.flowComparisons.deploymentEventId} is not null`)).orderBy(asc(schema.flowComparisons.createdAt), asc(schema.flowComparisons.id)).limit(1);
    if (!next) return;
    const [mine] = await db.update(schema.flowComparisons).set({ status: 'running', claimedBy: INSTANCE, claimedAt: new Date() }).where(and(eq(schema.flowComparisons.id, next.id), eq(schema.flowComparisons.status, 'pending'))).returning();
    if (!mine) continue;   // another loop took it
    try {
      const [v] = await db.select({ definition: schema.flowVersions.definition }).from(schema.flowVersions).where(and(eq(schema.flowVersions.flowId, mine.flowId), eq(schema.flowVersions.version, mine.version)));
      const parsed = v ? parseFlow(v.definition) : null; const sides = parsed?.ok ? sidesFor(parsed.flow, mine.publishedOrigin, mine.previewOrigin) : null;
      if (!sides) { const none: Side = { status: 'missing', run: null, error: null }; const c = compareEnvironments(none, none); await db.update(schema.flowComparisons).set({ status: 'done', verdict: c.verdict, detail: c as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowComparisons.id, mine.id)); continue; }
      await finishComparison(mine.id, mine.flowId, null, mine.version, sides.published, sides.preview, true);
    } catch (e) { logError(`deployment comparison failed ${mine.id}`, e); }
  }
}

/** At web-server start: pick up whatever a previous process left. */
export async function resumeDeployments(): Promise<number> { const n = await requeueStale(true); await dispatchPending(); return n; }

/** The most recent deployments of a project, each with its comparisons (and the flows that were not compared). */
export async function listDeployments(projectId: string, n = 3) {
  const db = await getDb(); const events = await db.select().from(schema.deploymentEvents).where(eq(schema.deploymentEvents.projectId, projectId)).orderBy(desc(schema.deploymentEvents.receivedAt)).limit(n);
  const out = [];
  for (const e of events) {
    const rows = await db.select().from(schema.flowComparisons).where(eq(schema.flowComparisons.deploymentEventId, e.id)).orderBy(asc(schema.flowComparisons.createdAt), asc(schema.flowComparisons.id));
    const names = new Map((await db.select({ id: schema.flows.id, name: schema.flows.name }).from(schema.flows).where(eq(schema.flows.projectId, projectId))).map((f) => [f.id, f.name]));
    const comparisons = []; for (const c of rows) comparisons.push({ ...(await hydrateComparison(c)), name: names.get(c.flowId) ?? 'Flow' });
    out.push({ id: e.id, deploymentId: e.deploymentId, receivedAt: e.receivedAt, publishedOrigin: e.publishedOrigin, previewOrigin: e.previewOrigin, skipped: e.skipped, comparisons });
  }
  return out;
}
