import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { scanHas } from '@/lib/entitlements.ts';
import { serveShot } from '@/lib/shots.ts';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; viewport: string }> }) {
  const { id, viewport } = await params;
  if (!(await canViewScan(await currentUser(), id))) return new Response('Not found', { status: 404 });
  if (!(await scanHas(id, 'full_report'))) return new Response('This needs a paid plan.', { status: 402 });
  return serveShot(id, viewport);
}
