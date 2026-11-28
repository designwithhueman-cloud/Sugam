import { NextResponse } from 'next/server';
import { canManage, sameOrigin } from '@/lib/access.ts';
import { projectFlowAccess } from '@/lib/flows/access.ts';
import { rotateDeployToken } from '@/lib/flows/deployments.ts';

export const dynamic = 'force-dynamic';
/** Creates or replaces the project's deployment-webhook token. Owners and admins only. The token is returned once and never stored; the old one stops working at once. */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const a = await projectFlowAccess((await ctx.params).projectId); if ('res' in a) return a.res;
  if (!canManage(a.role)) return NextResponse.json({ error: 'forbidden', message: 'Only a workspace owner or admin can create the deployment token.' }, { status: 403 });
  return NextResponse.json({ token: await rotateDeployToken(a.project.id) }, { status: 201, headers: { 'cache-control': 'no-store' } });
}
