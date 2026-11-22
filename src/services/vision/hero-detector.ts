// diff/hero-match: the DIFF-002 detector that reads the worker's hero comparison (src/services/vision/hero-match.ts) from the page context.
// Pure. A finding appears only when the match cleared the validated threshold; below it, the nearest match is reported as a diagnostic in the pass
// note. A comparison that could not run says why. Section order is never mentioned here: DIFF-001 owns it.
import type { DetectorReport } from '../../engines/rule-engine/RuleTypes.ts';
import { refTag, type HeroMatch } from './hero-layout.ts';

const ANALYZER = new Set(['model_failed', 'model_mismatch']);
export function heroMatchReport(m: HeroMatch | undefined): DetectorReport {
  if (!m) return { ran: false, hits: [], note: 'The hero comparison runs in the scan worker and did not run for this scan.' };
  if (m.status === 'skipped') return { ran: false, hits: [], note: `Hero comparison skipped (${m.skip}): ${m.reason}`, analyzerError: ANALYZER.has(m.skip) };
  const c = m.candidates[0];
  if (!c) return { ran: false, hits: [], note: 'Hero comparison skipped (no_references): no reference could be compared.' };
  const what = c.kind === 'fixture' ? 'test fixture' : 'template';
  const diag = `Nearest reference ${what}: “${c.name}” (image similarity ${c.similarity}, ${c.shared.length} shared layout features). ${m.reason}`;
  if (!m.surfaced) return { ran: true, hits: [], passNote: `${diag} Kept as a diagnostic; nothing is reported.` };
  const t = m.threshold!;
  return { ran: true, hits: [{
    bucket: 'needs_review', title: `The first screen closely resembles the ${what} “${c.name}”`,
    summary: `The first screen closely resembles the ${what} “${c.name}”: ${c.shared.slice(0, 3).map((s) => s.replace(/^Both /, '').replace(/\.$/, '')).join('; ')}. This compares layout and appearance only. It does not say the page was copied, is unoriginal, or how it was made.`,
    evidence: [
      `reference: ${c.name} · ${c.origin} · ${c.license} ${refTag(c.id)}`,
      `image similarity ${c.similarity} with ${m.model} (threshold ${t.minSimilarity}); ${c.shared.length} shared layout features (threshold ${t.minShared}); reference set ${m.referenceSet}, ${m.references} references`,
      ...c.shared, ...(c.differs.length ? [`Differs: ${c.differs.join(' ')}`] : []),
    ],
  }] };
}
