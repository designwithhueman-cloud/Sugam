import { notFound } from 'next/navigation';
import { loadReport, scanIdForShareToken } from '@/lib/report.ts';
import { ReportView } from '@/components/report/ReportView.tsx';
import { FreeReport } from '@/components/report/FreeReport.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params; const q = await searchParams;
  const scanId = await scanIdForShareToken(token);
  if (!scanId) notFound();
  const report = await loadReport(scanId, { shareToken: token });
  if (!report) notFound();
  if (report.locked) return <FreeReport report={report} readOnly />;
  return <main id="main"><ReportView report={report} readOnly filters={{ fix: q.fix, wcag: q.wcag, severity: q.severity, result: q.result, group: q.group }} /></main>;
}
