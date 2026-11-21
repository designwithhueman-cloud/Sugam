import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { scanHas } from '@/lib/entitlements.ts';
import { getObject } from '@/lib/storage.ts';

export const dynamic = 'force-dynamic';
// Diagnostic detector output stored by the scan worker (today: DIFF-002 hero-layout comparison). Not part of the report and never scored.
// Signed-in members who can view the scan and whose plan includes the full report; an anonymous claim on a scan is not enough.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const user = await currentUser();
  if (!user || !(await canViewScan(user, id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await scanHas(id, 'full_report'))) return NextResponse.json({ error: 'plan', message: 'Diagnostics need a paid plan.' }, { status: 402 });
  const raw = await getObject(`scans/${id}/diagnostics/diff-002.json`);
  const diff002 = raw ? JSON.parse(raw.toString('utf8')) : { ruleId: 'DIFF-002', status: 'not-run', reason: 'This scan was run before the DIFF-002 comparison was stored. Rescan to produce it.', weight: 0, publish: false };
  return NextResponse.json({ scanId: id, visibility: 'diagnostic: not shown in reports, not scored', diagnostics: { 'DIFF-002': diff002 } }, { headers: { 'cache-control': 'no-store' } });
}
