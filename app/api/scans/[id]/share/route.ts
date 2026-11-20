import { currentUser } from '@/lib/auth.ts';
import { canViewScan, sameOrigin } from '@/lib/access.ts';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { hashToken } from '@/lib/report.ts';
import { scanHas } from '@/lib/entitlements.ts';

export const dynamic = 'force-dynamic';
// Creates a tokenized read-only link. The token is returned once; only its hash is stored.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
  if (!(await canViewScan(await currentUser(), id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await scanHas(id, 'share_links'))) return NextResponse.json({ error: 'plan', message: 'Client report links are part of the Agency Pro plan.' }, { status: 402 });
  const db = await getDb();
  const [s] = await db.select({ status: schema.scans.status }).from(schema.scans).where(eq(schema.scans.id, id));
  if (!s || s.status !== 'completed') return NextResponse.json({ error: 'not_ready', message: 'The report is not finished yet.' }, { status: 409 });
  const token = crypto.randomBytes(24).toString('base64url');
  await db.insert(schema.shareLinks).values({ scanId: id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 90 * 86400_000) });
  return NextResponse.json({ url: `${new URL(req.url).origin}/share/${token}`, expiresInDays: 90 }, { status: 201 });
}
