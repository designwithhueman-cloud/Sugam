import { scanIdForShareToken } from '@/lib/report.ts';
import { serveShot } from '@/lib/shots.ts';
import { scanHas } from '@/lib/entitlements.ts';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; viewport: string }> }) {
  const { token, viewport } = await params;
  const scanId = await scanIdForShareToken(token);
  if (!scanId) return new Response('Not found', { status: 404 });
  if (!(await scanHas(scanId, 'full_report'))) return new Response('Not found', { status: 404 });
  return serveShot(scanId, viewport);
}
