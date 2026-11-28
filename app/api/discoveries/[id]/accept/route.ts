import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { projectFlowAccess } from '@/lib/flows/access.ts';
import { acceptJourney, getDiscovery } from '@/lib/flows/discovery.ts';

export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const d = await getDiscovery((await ctx.params).id); if (!d) return NextResponse.json({ error: 'not_found', message: 'Discovery not found.' }, { status: 404 });
  const g = await projectFlowAccess(d.projectId); if ('res' in g) return g.res;
  if (Number(req.headers.get('content-length') ?? 0) > 65536) return NextResponse.json({ error: 'too_large', message: 'The request is too large.' }, { status: 413 });
  const b = (await req.json().catch(() => null)) as { journeyId?: unknown; name?: unknown; success?: unknown } | null; if (!b || typeof b.journeyId !== 'string') return NextResponse.json({ error: 'invalid', message: 'Say which journey to save.' }, { status: 400 });
  const r = await acceptJourney(d.id, b.journeyId, g.user.id, { name: b.name, success: b.success });
  return r.ok ? NextResponse.json({ flowId: r.flowId }, { status: 201 }) : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
}
