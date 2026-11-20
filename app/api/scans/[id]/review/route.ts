import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';
import { planForScan } from '@/lib/entitlements.ts';
import { hasFeature } from '@/lib/plans.ts';
import { loadReview } from '@/src/services/findings-service/index.ts';

export const dynamic = 'force-dynamic';
// Category scores and findings from the rule engine. On the free plan recommendations, impacts and evidence are withheld on the server.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const user = await currentUser();
  if (!((await canViewScan(user, id)) || (await isClaimed(id)))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const review = await loadReview(id, { full: hasFeature(await planForScan(id), 'full_report') });
  return review ? NextResponse.json(review) : NextResponse.json({ error: 'no_review', message: 'This scan has no rule review.' }, { status: 404 });
}
