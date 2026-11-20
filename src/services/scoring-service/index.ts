// Category and product scores, read from storage. The arithmetic itself lives in the engine (RuleScorer) so there is one definition of a score.
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../lib/db/index.ts';
export async function loadScores(scanId: string) {
  const db = await getDb();
  const [overall] = await db.select().from(schema.scanResults).where(eq(schema.scanResults.scanId, scanId));
  const categories = await db.select().from(schema.categoryScores).where(eq(schema.categoryScores.scanId, scanId));
  return overall ? { overall, categories } : null;
}
