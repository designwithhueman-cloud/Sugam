import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { enqueueScan } from '@/lib/queue.ts';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan, sameOrigin } from '@/lib/access.ts';
import { addClaim, isClaimed } from '@/lib/claims.ts';
import { clientIp } from '@/lib/ip.ts';

export const dynamic = 'force-dynamic';
const hits = new Map<string, number[]>();

// Re-scans the same page as an earlier scan. The original report is never changed: this creates a new scan that points back at it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found', message: 'Scan not found.' }, { status: 404 });
  const allowed = (await canViewScan(user, id)) || (!user && (await isClaimed(id)));
  if (!allowed) return NextResponse.json({ error: 'not_found', message: 'Scan not found.' }, { status: 404 });
  const key = user ? user.id : 'anon:' + clientIp(req.headers); const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 600_000); recent.push(now); hits.set(key, recent);
  if (recent.length > Number(process.env.SCAN_RATE_LIMIT || (user ? 20 : 5))) return NextResponse.json({ error: 'rate_limited', message: 'Too many scans from your network. Please wait a few minutes.' }, { status: 429 });
  const db = await getDb();
  const [prev] = await db.select().from(schema.scans).where(eq(schema.scans.id, id));
  if (!prev || prev.status !== 'completed') return NextResponse.json({ error: 'not_ready', message: 'The original scan has not finished.' }, { status: 409 });
  const [scan] = await db.insert(schema.scans).values({ url: prev.url, standard: prev.standard, goal: prev.goal, productId: prev.productId, rescanOf: prev.id, projectId: prev.projectId, createdBy: user?.id ?? prev.createdBy ?? null }).returning({ id: schema.scans.id });
  await enqueueScan(scan.id);
  if (!user) await addClaim(scan.id);
  return NextResponse.json({ id: scan.id }, { status: 202 });
}
