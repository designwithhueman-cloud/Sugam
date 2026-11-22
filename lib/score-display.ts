// The one place a scan's score is read for display outside the report board. Only the strict policy (lib/avara/scoring.ts) produces a number;
// the legacy accessibility number stored on the scan row (scans.score) is never shown as the score. A null comes with the reason, so "Not scored"
// is never mistaken for 0. Read at request time from the scan's own saved rule snapshot; stored rows are never rewritten.
import { loadRecords } from './avara/coverage.ts';
import { loadReport } from './report.ts';

export type ShownScore = { score: number | null; reason: string | null };
export const NO_ELIGIBLE = 'No rule is score-eligible yet, so nothing is scored.';

export async function strictScore(scanId: string, status?: string): Promise<ShownScore> {
  if (status && status !== 'completed') return { score: null, reason: 'The scan has not finished.' };
  const loaded = await loadRecords(scanId);
  if (!loaded) return { score: null, reason: 'The rule review did not run on this scan.' };
  if (!loaded.records.some((r) => r.scoreEligible)) return { score: null, reason: NO_ELIGIBLE };
  const o = (await loadReport(scanId))?.review?.overall;
  return o?.score != null ? { score: o.score, reason: null } : { score: null, reason: o?.note ?? 'No strict score is available for this scan.' };
}
export async function strictScores(scans: { id: string; status?: string }[]): Promise<Record<string, ShownScore>> {
  return Object.fromEntries(await Promise.all(scans.map(async (s) => [s.id, await strictScore(s.id, s.status)] as const)));
}
