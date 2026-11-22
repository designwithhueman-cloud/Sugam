// The first-screen screenshot of one DIFF-002 reference. These are MIT-licensed open-source templates and the project's own fixtures (see
// data/hero-references/manifest.json for each one's origin and licence), so they are public. Scanned pages' screenshots stay behind their own plan-gated route.
import { referenceShot } from '@/src/services/vision/hero-refs.ts';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const img = referenceShot(id);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
}
