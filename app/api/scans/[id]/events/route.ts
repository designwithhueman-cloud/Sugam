import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { recordEvent } from '@/lib/events.ts';

export const dynamic = 'force-dynamic';
/** First-party event: a fix prompt was copied for a finding. No cookies, no user, only the two ids. Never blocks the page: callers ignore the answer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  if (Number(req.headers.get('content-length') ?? 0) > 1024) return new NextResponse(null, { status: 413 });
  const b = (await req.json().catch(() => null)) as { kind?: unknown; findingId?: unknown } | null; if (!b) return new NextResponse(null, { status: 400 });
  const r = await recordEvent((await params).id, b.kind, b.findingId);
  return r.ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: r.error }, { status: r.status });
}
