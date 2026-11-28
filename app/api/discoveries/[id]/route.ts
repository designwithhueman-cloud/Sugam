import { NextResponse } from 'next/server';
import { projectFlowAccess } from '@/lib/flows/access.ts';
import { getDiscovery, savedJourneys } from '@/lib/flows/discovery.ts';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const d = await getDiscovery((await ctx.params).id); if (!d) return NextResponse.json({ error: 'not_found', message: 'Discovery not found.' }, { status: 404 });
  const g = await projectFlowAccess(d.projectId); if ('res' in g) return g.res;
  return NextResponse.json({ discovery: { id: d.id, status: d.status, error: d.error, startUrl: d.startUrl, createdAt: d.createdAt, result: d.result, saved: await savedJourneys(d.projectId) } });
}
