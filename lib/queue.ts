// Scan queue. With REDIS_URL: BullMQ (run `npm run worker` as a separate process, and use a
// PostgreSQL DATABASE_URL, since PGlite is single-process). Without Redis: an in-process queue
// in the web server, for local development.
import { runScanJob } from './jobs.ts';
import { logError } from './security/redact.ts';

const QUEUE = 'sugam-scans';
const g = globalThis as unknown as { __sugamQueue?: { add: (id: string) => Promise<void> } };

function inProcess() {
  const pending: string[] = []; let running = 0; const MAX = Number(process.env.SCAN_CONCURRENCY || 2);
  const pump = () => { while (running < MAX && pending.length) { const id = pending.shift()!; running++; runScanJob(id).catch((e) => logError('scan job failed', e)).finally(() => { running--; pump(); }); } };
  return { add: async (id: string) => { pending.push(id); pump(); } };
}
async function bull() {
  const { Queue } = await import('bullmq');
  const q = new Queue(QUEUE, { connection: { url: process.env.REDIS_URL } });
  return { add: async (id: string) => { await q.add('scan', { scanId: id }, { jobId: id, removeOnComplete: 1000, removeOnFail: 1000 }); } };
}
export async function enqueueScan(scanId: string) {
  if (!g.__sugamQueue) g.__sugamQueue = process.env.REDIS_URL ? await bull() : inProcess();
  await g.__sugamQueue.add(scanId);
}
export { QUEUE };
