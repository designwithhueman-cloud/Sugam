import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { flowAccess } from '@/lib/flows/access.ts';
import { listComparisons, startComparison } from '@/lib/flows/comparison.ts';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  return NextResponse.json({ comparisons: await listComparisons(a.flow.id) });
}
/** Compare the flow's approved version on the project's published and preview addresses. Manual. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  const r = await startComparison(a.flow.id, a.user.id);
  return r.ok ? NextResponse.json({ id: r.id }, { status: 202 }) : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
}
