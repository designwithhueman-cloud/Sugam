// Work the web server does when it starts, then on a timer:
// - Pick up unfinished scans. With the in-process queue (no REDIS_URL) a restart drops whatever was queued or running; recent ones are
//   queued again (the job saves every row in one transaction, so a half-run scan leaves nothing behind) and older ones are marked
//   "did not finish". With Redis, BullMQ keeps and retries its own jobs, so nothing is re-queued here.
// - Delete anonymous scans past the retention period (lib/deletion.ts), once shortly after start and then every hour.
import { and, inArray, gte, lt } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { enqueueScan } from './queue.ts';
import { purgeExpiredScans } from './deletion.ts';
import { logError } from './security/redact.ts';

export const REQUEUE_WINDOW_MS = 6 * 3600_000;
const UNFINISHED = ['queued', 'running', 'analyzing'] as const;

export async function recoverScans(now = Date.now()): Promise<{ requeued: number; interrupted: number }> {
  if (process.env.REDIS_URL) return { requeued: 0, interrupted: 0 };
  const db = await getDb(); const since = new Date(now - REQUEUE_WINDOW_MS);
  const old = await db.update(schema.scans).set({ status: 'failed', error: { code: 'interrupted', message: 'This scan did not finish. Please run it again.' }, completedAt: new Date(now) })
    .where(and(inArray(schema.scans.status, [...UNFINISHED]), lt(schema.scans.createdAt, since))).returning({ id: schema.scans.id });
  const recent = await db.update(schema.scans).set({ status: 'queued', startedAt: new Date(now), // "queued again at": the stale check counts from here, and the job overwrites it when it runs
      progress: { step: 'Waiting to start again after a restart', percent: 2 } })
    .where(and(inArray(schema.scans.status, [...UNFINISHED]), gte(schema.scans.createdAt, since))).returning({ id: schema.scans.id, createdAt: schema.scans.createdAt });
  recent.sort((a, b) => +a.createdAt - +b.createdAt);
  for (const r of recent) await enqueueScan(r.id);
  return { requeued: recent.length, interrupted: old.length };
}

const g = globalThis as unknown as { __avaraStarted?: boolean };
export function startBackgroundWork() {
  if (g.__avaraStarted) return; g.__avaraStarted = true;
  void recoverScans().then((r) => { if (r.requeued || r.interrupted) console.log(`scans after restart: ${r.requeued} queued again, ${r.interrupted} marked interrupted`); }, (e) => logError('scan recovery failed', e));
  const purge = () => purgeExpiredScans().then((n) => { if (n) console.log(`retention: deleted ${n} expired anonymous scans`); }, (e) => logError('retention run failed', e));
  setTimeout(purge, 30_000).unref();
  setInterval(purge, 3600_000).unref();
}
