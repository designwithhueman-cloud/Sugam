// Before/after comparison of two scans of the same project. Issues are matched by component
// key (rule + markup shape), so a fix to a shared component shows as one resolved issue.
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';

export type CompareRow = { componentKey: string; title: string; severity: string; before: number; after: number };
export async function compareScans(beforeId: string, afterId: string) {
  const db = await getDb();
  const scans = await db.select().from(schema.scans).where(inArray(schema.scans.id, [beforeId, afterId]));
  const before = scans.find((s) => s.id === beforeId); const after = scans.find((s) => s.id === afterId);
  if (!before || !after) return null;
  const load = async (id: string) => (await db.select().from(schema.issues).where(eq(schema.issues.scanId, id))).filter((i) => i.bucket === 'confirmed_failure');
  const [bi, ai] = [await load(beforeId), await load(afterId)];
  const bm = new Map(bi.map((i) => [i.componentKey, i])); const am = new Map(ai.map((i) => [i.componentKey, i]));
  const row = (i: typeof bi[number], b: number, a: number): CompareRow => ({ componentKey: i.componentKey, title: i.title, severity: i.severity, before: b, after: a });
  return {
    before, after,
    resolved: bi.filter((i) => !am.has(i.componentKey)).map((i) => row(i, i.instanceCount, 0)),
    introduced: ai.filter((i) => !bm.has(i.componentKey)).map((i) => row(i, 0, i.instanceCount)),
    persisting: ai.filter((i) => bm.has(i.componentKey)).map((i) => row(i, bm.get(i.componentKey)!.instanceCount, i.instanceCount)),
  };
}
