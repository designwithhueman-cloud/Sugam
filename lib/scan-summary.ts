// The same numbers and first fix the report shows, for any page that lists scans: recommended fixes and observations by the report's own
// levels (lib/review-view.ts), and the report's lead fix in its own words. One source, so the workspace overview, the project page and the
// report can never disagree.
import { loadReport } from './report.ts';
import { buildView, type Item } from './review-view.ts';
import { LEVELS } from './levels.ts';

export type ScanSummaryView = { recommended: number; observations: number; issues: number; lead: Item | null; levelLabel: string | null; summary: import('./page-summary.ts').PageSummary | null };
export async function scanSummaryView(scanId: string): Promise<ScanSummaryView | null> {
  const report = await loadReport(scanId); if (!report) return null;
  const v = buildView(report, report.locked ? 'free' : 'paid'); const t = v.board.totals;
  const items = [...(v.primary ? [v.primary] : []), ...v.others].filter((i) => i.level !== 'review');
  const lead = items[0] ?? null;
  return { recommended: report.pageSummary?.fixes ?? t.critical + t.high + t.medium, observations: t.review, issues: report.pageSummary?.issues ?? 0, lead, levelLabel: lead ? LEVELS[lead.level].label : null, summary: report.pageSummary ?? null };
}
