import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { projectFlowAccess } from '@/lib/flows/access.ts';
import { latestDiscovery, savedJourneys, startDiscovery } from '@/lib/flows/discovery.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });
const view = (d: Awaited<ReturnType<typeof latestDiscovery>>, saved: Record<string, { flowId: string; name: string }>) => d ? { id: d.id, status: d.status, error: d.error, startUrl: d.startUrl, createdAt: d.createdAt, result: d.result, saved } : null;

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params; const g = await projectFlowAccess(projectId); if ('res' in g) return g.res;
  return NextResponse.json({ discovery: view(await latestDiscovery(projectId), await savedJourneys(projectId)) });
}
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(req)) return err(403, 'bad_origin', 'Request refused.');
  const { projectId } = await ctx.params; const g = await projectFlowAccess(projectId); if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as { environment?: string };
  const r = await startDiscovery(g.project, g.user.id, body.environment ?? null);
  return r.ok ? NextResponse.json({ id: r.id }, { status: 202 }) : err(r.status, r.error, r.message);
}
