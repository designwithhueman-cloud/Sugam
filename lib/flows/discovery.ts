// Journey discovery for a project: ask the worker to look at the project's own address, keep what it found, let the owner accept a journey as a saved
// flow (and say what success looks like), and compare a later discovery with the flows already approved. A rediscovery never edits a flow: it writes
// a proposal, and only the owner accepting it makes a new version.
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { Assertion, DiscoveryResult, parseFlow, type Flow, type Journey } from '../../packages/contracts/index.ts';
import { pathSignature } from '../../packages/flow-engine/journeys.ts';
import { checkUrl, BlockedUrlError } from '../net/guard.ts';
import { discoverOnWorker, WorkerError } from './worker.ts';
import { approveVersion, createFlow, getFlow } from './service.ts';
import { logError, redactDeep } from '../security/redact.ts';

const WINDOW_MS = 600_000, MAX_PER_WINDOW = 6; const recent = new Map<string, number[]>();   // per user, in this process
type Fail = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Fail => ({ ok: false, status, error, message });
const originOf = (u: string | null) => { try { return u ? new URL(u).origin : null; } catch { return null; } };

/** Starts discovery from the project's own address (live, else staging). Only that origin may be explored. */
export async function startDiscovery(project: { id: string; liveUrl: string | null; stagingUrl: string | null }, userId: string, which?: string | null): Promise<{ ok: true; id: string } | Fail> {
  const url = which === 'staging' ? project.stagingUrl : project.liveUrl || project.stagingUrl;
  if (!url) return fail(400, 'no_url', 'Add your live address to the project first.');
  const own = [originOf(project.liveUrl), originOf(project.stagingUrl)].filter(Boolean); if (!own.includes(originOf(url))) return fail(400, 'not_your_site', 'Journeys can only be found on this project’s own address.');
  let start: string; try { start = (await checkUrl(url)).toString(); } catch (e) { if (e instanceof BlockedUrlError) return fail(400, 'blocked_url', e.message); throw e; }
  const now = Date.now(); const mine = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS); if (mine.length >= MAX_PER_WINDOW) return fail(429, 'rate_limited', 'Too many searches. Please wait a few minutes.');
  const db = await getDb();
  const [active] = await db.select({ id: schema.flowDiscoveries.id }).from(schema.flowDiscoveries).where(and(eq(schema.flowDiscoveries.projectId, project.id), eq(schema.flowDiscoveries.status, 'running'))).limit(1);
  if (active) return fail(409, 'already_running', 'Avara is already looking for journeys on this site.');
  mine.push(now); recent.set(userId, mine);
  const [row] = await db.insert(schema.flowDiscoveries).values({ projectId: project.id, startUrl: start, status: 'running', createdBy: userId }).returning({ id: schema.flowDiscoveries.id });
  void finishDiscovery(row.id, project.id, start);
  return { ok: true, id: row.id };
}

async function finishDiscovery(id: string, projectId: string, startUrl: string): Promise<void> {
  const db = await getDb();
  try {
    const result = redactDeep(await discoverOnWorker(startUrl));
    await db.update(schema.flowDiscoveries).set({ status: 'done', result: result as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(schema.flowDiscoveries.id, id));
    await proposeChanges(projectId, id, result);
  } catch (e) {
    const message = e instanceof WorkerError ? e.message : 'Looking for journeys did not complete.'; if (!(e instanceof WorkerError)) logError(`discovery failed ${id}`, e);
    await db.update(schema.flowDiscoveries).set({ status: 'error', error: message, finishedAt: new Date() }).where(eq(schema.flowDiscoveries.id, id)).catch(() => {});
  }
}

export async function getDiscovery(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null; const db = await getDb();
  const [d] = await db.select().from(schema.flowDiscoveries).where(eq(schema.flowDiscoveries.id, id)); return d ?? null;
}
export async function latestDiscovery(projectId: string) {
  const db = await getDb(); const [d] = await db.select().from(schema.flowDiscoveries).where(eq(schema.flowDiscoveries.projectId, projectId)).orderBy(desc(schema.flowDiscoveries.createdAt)).limit(1); return d ?? null;
}
/** Journey ids already saved as flows in the project, so a discovery list can say so. */
export async function savedJourneys(projectId: string): Promise<Record<string, { flowId: string; name: string }>> {
  const db = await getDb(); const rows = await db.select({ id: schema.flows.id, name: schema.flows.name, key: schema.flows.journeyKey }).from(schema.flows).where(eq(schema.flows.projectId, projectId));
  return Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key as string, { flowId: r.id, name: r.name }]));
}

const lastOf = <T>(a: T[]) => a[a.length - 1];
/** The journey as a flow definition, with the owner's success conditions (or the suggested ones) on its last step. */
export function definitionFor(d: { startUrl: string }, j: Journey, name: string, success?: Assertion[]): Flow {
  const steps = j.steps.map((s, i) => (i === j.steps.length - 1 && success ? { ...s, expect: success } : s));
  return { id: 'pending', name, startUrl: d.startUrl, steps } as Flow;
}

export async function acceptJourney(discoveryId: string, journeyId: string, userId: string, edits: { name?: unknown; success?: unknown }): Promise<{ ok: true; flowId: string } | Fail> {
  const d = await getDiscovery(discoveryId); if (!d || d.status !== 'done') return fail(404, 'not_found', 'Discovery not found.');
  const result = DiscoveryResult.safeParse(d.result); if (!result.success) return fail(422, 'unreadable', 'This discovery cannot be read.');
  const j = result.data.journeys.find((x) => x.id === journeyId); if (!j) return fail(404, 'not_found', 'That journey was not found.');
  const taken = (await savedJourneys(d.projectId))[j.key]; if (taken) return fail(409, 'already_saved', `This journey is already saved as “${taken.name}”.`);
  let success: Assertion[] | undefined;
  if (edits.success !== undefined) { const a = Assertion.array().min(1).max(10).safeParse(edits.success); if (!a.success) return fail(400, 'invalid_success', 'Success needs at least one condition, such as “the page says …”.'); success = a.data; }
  const name = typeof edits.name === 'string' && edits.name.trim() ? edits.name.trim().slice(0, 120) : j.title;
  const created = await createFlow(d.projectId, userId, definitionFor(result.data, j, name, success), { journeyKey: j.key, note: 'Accepted from a discovered journey' });
  return created.ok ? { ok: true, flowId: created.id } : created;
}

/** Edits what success means for a saved flow's last step and approves the result as a new version. */
export async function editSuccess(flowId: string, userId: string, success: unknown, note: string | null): Promise<{ ok: true; version: number } | Fail> {
  const f = await getFlow(flowId); if (!f) return fail(404, 'not_found', 'Flow not found.');
  const a = Assertion.array().min(1).max(10).safeParse(success); if (!a.success) return fail(400, 'invalid_success', 'Success needs at least one condition.');
  const cur = parseFlow(f.definition); if (!cur.ok) return fail(422, 'invalid_flow', cur.error);
  const steps = cur.flow.steps.map((s, i) => (i === cur.flow.steps.length - 1 ? { ...s, expect: a.data } : s));
  return approveVersion(flowId, userId, { ...cur.flow, steps }, note ?? 'Success condition edited');
}

/** Compares a fresh discovery with the saved flows that came from journeys. Writes proposals; changes no flow. */
export async function proposeChanges(projectId: string, discoveryId: string, result: DiscoveryResult): Promise<void> {
  const db = await getDb(); const flows = (await db.select().from(schema.flows).where(eq(schema.flows.projectId, projectId))).filter((f) => f.journeyKey);
  for (const f of flows) {
    const cur = parseFlow(f.definition); if (!cur.ok) continue;
    const purpose = f.journeyKey!.split('|')[0]; const same = result.journeys.find((j) => j.key === f.journeyKey);
    const alike = result.journeys.filter((j) => j.purpose === purpose && purpose !== 'other');
    const match = same ?? (alike.length === 1 ? alike[0] : undefined);
    let kind: 'changed' | 'missing' | null = null, proposed: Record<string, unknown> | null = null, reason = '';
    if (!match) { kind = 'missing'; reason = 'Avara could not find this journey on your site any more. The link may have been renamed, moved or removed.'; }
    else if (pathSignature(match.steps as never) !== pathSignature(cur.flow.steps as never) || (!same && match.key !== f.journeyKey)) {
      kind = 'changed'; const last = cur.flow.steps[cur.flow.steps.length - 1];
      const keep = last.expect.filter((e) => e.type !== 'url_contains'); const fresh = lastOf(match.steps).expect.filter((e) => e.type === 'url_contains');
      const steps = match.steps.map((s, i) => (i === match.steps.length - 1 ? { ...s, expect: [...fresh, ...keep] } : s));
      proposed = { ...cur.flow, steps }; reason = `The way to this journey changed. Before: ${cur.flow.steps.map((s) => `‘${s.label ?? (s as { selector?: string }).selector}’`).join(' → ')}. Now: ${match.steps.map((s) => `‘${s.label ?? (s as { selector?: string }).selector}’`).join(' → ')}. Your approved success conditions are kept.`;
    }
    await db.delete(schema.flowProposals).where(and(eq(schema.flowProposals.flowId, f.id), eq(schema.flowProposals.status, 'pending')));
    if (kind) await db.insert(schema.flowProposals).values({ flowId: f.id, discoveryId, kind, proposed: proposed ? (redactDeep(proposed) as Record<string, unknown>) : null, reason });
  }
}

export async function pendingProposals(flowIds: string[]) {
  if (!flowIds.length) return []; const db = await getDb();
  const rows = await db.select().from(schema.flowProposals).where(eq(schema.flowProposals.status, 'pending'));
  return rows.filter((r) => flowIds.includes(r.flowId)).map((r) => ({ id: r.id, flowId: r.flowId, kind: r.kind, reason: r.reason, createdAt: r.createdAt }));
}

export async function decideProposal(proposalId: string, userId: string, decision: 'accept' | 'dismiss'): Promise<{ ok: true; version?: number } | Fail> {
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) return fail(404, 'not_found', 'Proposal not found.');
  const db = await getDb(); const [p] = await db.select().from(schema.flowProposals).where(eq(schema.flowProposals.id, proposalId)); if (!p || p.status !== 'pending') return fail(404, 'not_found', 'Proposal not found.');
  let version: number | undefined;
  if (decision === 'accept') {
    if (p.kind !== 'changed' || !p.proposed) return fail(400, 'nothing_to_apply', 'There is nothing to apply. Dismiss this, or delete the flow if the journey is gone.');
    const r = await approveVersion(p.flowId, userId, p.proposed, 'Accepted a change found on the site'); if (!r.ok) return r; version = r.version;
  }
  await db.update(schema.flowProposals).set({ status: decision === 'accept' ? 'accepted' : 'dismissed', decidedBy: userId, decidedAt: new Date() }).where(eq(schema.flowProposals.id, proposalId));
  return { ok: true, version };
}
