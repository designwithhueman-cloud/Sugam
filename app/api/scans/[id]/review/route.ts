import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';
import { loadReport } from '@/lib/report.ts';

export const dynamic = 'force-dynamic';
// Category scores and findings from the rule engine, with the same strict scores and record-based counts the report page shows (loadReport applies
// them; the engine's stored provisional averages are never returned). On the free plan recommendations, impacts and evidence are withheld on the server.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const user = await currentUser();
  if (!((await canViewScan(user, id)) || (await isClaimed(id)))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const report = await loadReport(id); const review = report?.review ?? null;
  // The launch checks travel with the review for paid plans only; loadReport already returns null for them on the free plan.
  return review ? NextResponse.json({ ...review, launch: report?.launch ?? null }) : NextResponse.json({ error: 'no_review', message: 'This scan has no rule review.' }, { status: 404 });
}
