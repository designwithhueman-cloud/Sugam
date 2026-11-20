import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;
const STALE_MS = 10 * 60_000;
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await canViewScan(await currentUser(), id)) && !(await isClaimed(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const db = await getDb();
  const [s] = await db.select({ status: schema.scans.status, progress: schema.scans.progress, error: schema.scans.error, url: schema.scans.url, createdAt: schema.scans.createdAt }).from(schema.scans).where(eq(schema.scans.id, id));
  if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // A scan that never finished (the server restarted mid-scan, or a worker died) must not spin forever.
  if (['queued', 'running', 'analyzing'].includes(s.status) && Date.now() - s.createdAt.getTime() > STALE_MS) {
    const error = { code: 'interrupted', message: 'This scan did not finish. Please run it again.' };
    await db.update(schema.scans).set({ status: 'failed', error, completedAt: new Date() }).where(eq(schema.scans.id, id));
    return NextResponse.json({ status: 'failed', progress: s.progress, error, url: s.url });
  }
  return NextResponse.json({ status: s.status, progress: s.progress, error: s.error, url: s.url });
}
