// First-party product events. Only "a fix prompt was copied for a finding" is stored; the other steps of the funnel already exist in the data
// (see lib/db/schema.ts, productEvents). Ids only: nothing from the request body but the two ids is used, and a failure here never reaches the caller.
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { logError } from './security/redact.ts';

export const EVENT_KINDS = ['prompt_copied'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recent = new Map<string, number[]>();   // per scan, in this process: at most 60 events in 10 minutes

export type EventResult = { ok: true; recorded: boolean } | { ok: false; status: number; error: string };

/** Records that a prompt was copied for a finding of a scan. Recorded once per finding. The finding must belong to the scan. */
export async function recordEvent(scanId: string, kind: unknown, findingId: unknown): Promise<EventResult> {
  if (!EVENT_KINDS.includes(kind as never)) return { ok: false, status: 400, error: 'unknown_event' };
  if (typeof scanId !== 'string' || !UUID.test(scanId) || typeof findingId !== 'string' || !UUID.test(findingId)) return { ok: false, status: 400, error: 'invalid_ids' };
  const now = Date.now(); const mine = (recent.get(scanId) ?? []).filter((t) => now - t < 600_000); if (mine.length >= 60) return { ok: false, status: 429, error: 'rate_limited' };
  mine.push(now); recent.set(scanId, mine);
  try {
    const db = await getDb();
    const [s] = await db.select({ id: schema.scans.id }).from(schema.scans).where(eq(schema.scans.id, scanId)); if (!s) return { ok: false, status: 404, error: 'not_found' };
    const [i] = await db.select({ id: schema.issues.id }).from(schema.issues).where(and(eq(schema.issues.id, findingId), eq(schema.issues.scanId, scanId)));
    const [f] = i ? [] : await db.select({ id: schema.findings.id }).from(schema.findings).where(and(eq(schema.findings.id, findingId), eq(schema.findings.scanId, scanId)));
    const [r] = i || f ? [] : await db.select({ id: schema.recommendations.id }).from(schema.recommendations).where(and(eq(schema.recommendations.id, findingId), eq(schema.recommendations.scanId, scanId)));
    if (!i && !f && !r) return { ok: false, status: 404, error: 'not_found' };   // a finding of some other scan, or one that does not exist: same answer
    const ins = await db.insert(schema.productEvents).values({ kind: kind as string, scanId, findingRef: findingId }).onConflictDoNothing().returning({ id: schema.productEvents.id });
    return { ok: true, recorded: ins.length > 0 };
  } catch (e) { logError('event not recorded', e); return { ok: false, status: 503, error: 'unavailable' }; }
}
