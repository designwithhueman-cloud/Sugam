import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { getObject } from './storage.ts';

export async function serveShot(scanId: string, viewport: string) {
  if (!/^[0-9a-f-]{36}$/i.test(scanId) || !['desktop', 'mobile', 'narrow'].includes(viewport)) return new Response('Not found', { status: 404 });
  const db = await getDb();
  const [v] = await db.select().from(schema.scanViewports).where(and(eq(schema.scanViewports.scanId, scanId), eq(schema.scanViewports.viewport, viewport as 'desktop' | 'mobile' | 'narrow')));
  const buf = v ? await getObject(v.screenshotKey) : null;
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}
