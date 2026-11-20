// TEMPORARY: the previous scan page, kept only to capture a before screenshot on the same scan. Deleted after the comparison.
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { loadReport } from '@/lib/report.ts';
import { ScanTeaser } from '@/components/report/ScanTeaser.tsx';
import { fromReportIssue, unlockedFindingFor } from '@/lib/unlocked.ts';
export const dynamic = 'force-dynamic';
export default async function Old({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = await getDb();
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, id)); if (!scan) notFound();
  const free = await loadReport(id); const hasAvara = !!free?.avara?.recommendations.length;
  const lead = hasAvara ? free!.issues.find((i) => i.id === free!.unlockedIssueId) : null;
  const unlocked = hasAvara ? (lead ? fromReportIssue(lead) : null) : await unlockedFindingFor(id);
  return <ScanTeaser scan={scan} issueRows={await db.select().from(schema.issues).where(eq(schema.issues.scanId, id)).orderBy(asc(schema.issues.position))} unlocked={unlocked} report={free} />;
}
