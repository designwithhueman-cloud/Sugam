// Products: one per site origin. A review links its findings to the product, so later scans of the same site build on what was learned.
import { eq } from 'drizzle-orm';
import { schema } from '../../../lib/db/index.ts';

export async function productOrigin(url: string): Promise<string> { try { return new URL(url).origin; } catch { return url; } }
export async function findProduct(db: { select: Function }, id: string | null) {   // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  if (!id) return null;
  const [p] = await (db as { select: () => { from: (t: unknown) => { where: (w: unknown) => Promise<(typeof schema.products.$inferSelect)[]> } } }).select().from(schema.products).where(eq(schema.products.id, id));
  return p ?? null;
}
