// BullMQ worker process: REDIS_URL=redis://… DATABASE_URL=postgres://… npm run worker
import { Worker } from 'bullmq';
import { runScanJob } from '../lib/jobs.ts';
import { QUEUE } from '../lib/queue.ts';

if (!process.env.REDIS_URL || !process.env.DATABASE_URL) {
  console.error('The worker needs REDIS_URL and DATABASE_URL (a PostgreSQL server). Without Redis, the web server runs scans in-process.');
  process.exit(1);
}
const worker = new Worker(QUEUE, async (job) => runScanJob(job.data.scanId), { connection: { url: process.env.REDIS_URL }, concurrency: Number(process.env.SCAN_CONCURRENCY || 2) });
worker.on('failed', (job, err) => console.error('scan job failed', job?.id, err.message));
console.log(`Sugam worker listening on queue "${QUEUE}"`);
