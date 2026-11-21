import { notFound } from 'next/navigation';
import { loadReport, scanIdForShareToken } from '@/lib/report.ts';
import { ReviewPage } from '@/components/report/ReviewPage.tsx';
import { FreeReport } from '@/components/report/FreeReport.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scanId = await scanIdForShareToken(token);
  if (!scanId) notFound();
  const report = await loadReport(scanId, { shareToken: token });
  if (!report) notFound();
  if (report.locked) return <FreeReport report={report} readOnly />;
  return <main id="main"><ReviewPage report={report} access="paid" mode="readonly" /></main>;
}
