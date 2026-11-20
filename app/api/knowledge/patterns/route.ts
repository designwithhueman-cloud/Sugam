import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { PATTERN_LABEL, type PatternStatus } from '@/src/context/knowledge/patterns.ts';

export const dynamic = 'force-dynamic';
// Patterns computed from stored reviews. Status is Emerging Observation, Pattern Identified or High Confidence Pattern, from how many reviewed pages show it. Never a score.
export async function GET() {
  const db = await getDb();
  const rows = await db.select().from(schema.patterns).orderBy(desc(schema.patterns.rate));
  return NextResponse.json({ patterns: rows.map((p) => ({ key: p.key, description: p.description, lowCategory: p.lowCategory, ruleId: p.ruleId, support: p.support, total: p.total, rate: p.rate, status: p.status, label: PATTERN_LABEL[p.status as PatternStatus] ?? p.status })) });
}
