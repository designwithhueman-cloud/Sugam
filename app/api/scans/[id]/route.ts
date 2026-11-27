import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';
import { aiStillRunning } from '@/lib/report.ts';
import { getObject } from '@/lib/storage.ts';
import { scanHas } from '@/lib/entitlements.ts';
import { redactDeep } from '@/lib/security/redact.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;
// How long a scan may go without finishing before it is shown as interrupted. A running scan is measured from when it started; a queued one
// may wait longer behind others (the queue runs SCAN_CONCURRENCY at a time) and is measured from when it was queued or queued again.
const RUNNING_STALE_MS = 10 * 60_000, QUEUED_STALE_MS = 60 * 60_000;
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await canViewScan(await currentUser(), id)) && !(await isClaimed(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const db = await getDb();
  const [s] = await db.select({ status: schema.scans.status, progress: schema.scans.progress, error: schema.scans.error, url: schema.scans.url, createdAt: schema.scans.createdAt, ai: schema.scans.ai, completedAt: schema.scans.completedAt, startedAt: schema.scans.startedAt }).from(schema.scans).where(eq(schema.scans.id, id));
  if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // A scan that never finished (the server restarted mid-scan, or a worker died) must not spin forever.
  const since = Date.now() - (s.startedAt ?? s.createdAt).getTime();
  if ((s.status === 'queued' && since > QUEUED_STALE_MS) || ((s.status === 'running' || s.status === 'analyzing') && since > RUNNING_STALE_MS)) {
    const error = { code: 'interrupted', message: 'This scan did not finish. Please run it again.' };
    await db.update(schema.scans).set({ status: 'failed', error, completedAt: new Date() }).where(eq(schema.scans.id, id));
    return NextResponse.json(redactDeep({ status: 'failed', progress: s.progress, error, url: s.url }));
  }
  // A blocker confirmed during the scan (evidence and fix saved together). The screenshot follows the plan gate used for every screenshot.
  const raw = s.status !== 'failed' ? await getObject(`scans/${id}/early/blocker.json`) : null;
  const early = raw ? (() => { const r = JSON.parse(raw.toString('utf8')); return r; })() : null;
  if (early) early.shotUrl = early.hasShot && (await scanHas(id, 'full_report')) ? `/api/scans/${id}/early-shot` : null;
  return NextResponse.json(redactDeep({ status: s.status, progress: s.progress, error: s.error, url: s.url, aiPending: aiStillRunning(s), fixPending: s.ai?.fixes?.state === 'pending' && !!s.completedAt && Date.now() - s.completedAt.getTime() < 15 * 60_000, early }));
}
