// Sentences about coverage, built only from the scan's per-rule records (library.coverage). Shared by the report page and the panel so they match.
import type { AvaraReport } from './report-types.ts';
type Lib = AvaraReport['library'];
const REASON: Record<string, string> = { missing_detector: 'no detector built', ai_unavailable: 'AI review unavailable', missing_input: 'needed input was missing', not_applicable: 'not applicable to this page', analyzer_error: 'analyzer error', needs_person: 'needs a person', rollup_no_inputs: 'summary with nothing to summarise', unknown_historical: 'no saved result (older scan)' };
const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
export function ranSentence(l: Lib): string {
  const c = l.coverage;
  return `${l.executedOnUrl} of ${c.snapshotSize || l.catalogued} rules in this scan's rule set have saved evidence that they ran.` + (c.buckets.unknown ? ` ${c.buckets.unknown} have no saved result, so whether they ran is unknown.` : '') + (c.reconciles ? '' : ` The counts do not reconcile: ${c.problems.join(' ')}`);
}
export function notRunSentence(l: Lib): string {
  const parts = Object.entries(l.notRun.reasons).filter(([k]) => k !== 'unknown_historical').map(([k, v]) => `${v} ${REASON[k] ?? k}`);
  return (parts.length ? `Did not run: ${parts.join(', ')}.` : 'No rule is recorded as skipped.') + (l.notRun.unknown ? ` ${n(l.notRun.unknown, 'rule')} ha${l.notRun.unknown === 1 ? 's' : 've'} no saved result.` : '');
}
export function humanSentence(l: Lib): string {
  const h = l.needsPerson;
  return `${n(h.reviewTasks, 'rule')} returned a result that needs a person to decide; ${n(h.personOnlyTopics, 'rule')} can only be answered in a session with a person (${h.sessionKinds.join(', ') || 'none'}). Across those, ${n(h.reviewFindings, 'finding')} wait for review, covering ${n(h.reviewRepairs, 'unique repair')}. Separately, ${n(h.confirmedRepairs, 'confirmed unique repair')} and ${n(h.repairGroups, 'ranked fix', 'ranked fixes')}.`;
}
export function scoreSentence(l: Lib): string {
  return l.overall == null ? `No overall score under the strict policy (${l.policy}): ${l.overallWithheld ?? 'scoring is not enabled yet.'} Rules that did not run, observation-only rules and summaries never count as passes.` : `Overall ${l.overall} under the strict policy (${l.policy}).`;
}
