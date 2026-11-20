import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db/index.ts';
import { checkUrl, BlockedUrlError } from '@/lib/net/guard.ts';
import { isStandard } from '@/lib/standards.ts';
import { enqueueScan } from '@/lib/queue.ts';
import { currentUser } from '@/lib/auth.ts';
import { sameOrigin } from '@/lib/access.ts';
import { addClaim } from '@/lib/claims.ts';
import { clientIp } from '@/lib/ip.ts';

export const dynamic = 'force-dynamic';
const hits = new Map<string, number[]>();
const WINDOW = 600_000;
// Keep the map from growing forever: drop keys with no recent hits once it gets large.
function prune(now: number) { if (hits.size < 2000) return; for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW) hits.delete(k); }
function limited(ip: string, max: number) { const now = Date.now(); prune(now); const a = (hits.get(ip) || []).filter((t) => now - t < WINDOW); a.push(now); hits.set(ip, a); return a.length > Number(process.env.SCAN_RATE_LIMIT || max); }

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const user = await currentUser();
  const ip = user ? user.id : 'anon:' + clientIp(req.headers);
  if (limited(ip, user ? 20 : 5)) return NextResponse.json({ error: 'rate_limited', message: 'Too many scans from your network. Please wait a few minutes.' }, { status: 429 });
  let body: { url?: unknown; standard?: unknown; goal?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json', message: 'Invalid request.' }, { status: 400 }); }
  let url = String(body.url || '').trim();
  if (!url) return NextResponse.json({ error: 'invalid_url', message: 'Enter the address of a public website.' }, { status: 422 });
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  const standard = isStandard(body.standard) ? body.standard : 'wcag22aa';
  try { url = (await checkUrl(url)).toString(); }
  catch (e) { if (e instanceof BlockedUrlError) return NextResponse.json({ error: e.code, message: e.message }, { status: 422 }); throw e; }
  const db = await getDb();
  // The main goal is optional and builder-confirmed: plain text, trimmed and capped.
  const goal = typeof body.goal === 'string' ? body.goal.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null : null;
  const [scan] = await db.insert(schema.scans).values({ url, standard, goal, createdBy: user?.id ?? null }).returning({ id: schema.scans.id });
  await enqueueScan(scan.id);
  if (!user) await addClaim(scan.id);
  return NextResponse.json({ id: scan.id }, { status: 202 });
}
