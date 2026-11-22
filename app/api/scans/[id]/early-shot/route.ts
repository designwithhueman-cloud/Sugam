import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { isClaimed } from '@/lib/claims.ts';
import { scanHas } from '@/lib/entitlements.ts';
import { getObject } from '@/lib/storage.ts';

export const dynamic = 'force-dynamic';
// The phone screen as measured when the scan confirmed a covered main action (see saveEarlyBlocker). Same plan gate as every screenshot.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  if (!((await canViewScan(await currentUser(), id)) || (await isClaimed(id)))) return new Response('Not found', { status: 404 });
  if (!(await scanHas(id, 'full_report'))) return new Response('This needs a paid plan.', { status: 402 });
  const img = await getObject(`scans/${id}/early/blocker.jpg`);
  return img ? new Response(new Uint8Array(img), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } }) : new Response('Not found', { status: 404 });
}
