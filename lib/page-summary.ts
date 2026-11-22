// The report's three answers, computed once on the server from the full report before any plan redaction, so Free and Paid get the same numbers:
//   How did my page do?            the page score /100 (policy avara-score-1.0), or why there is none, and how many categories contributed.
//   Which category has most issues? all nine categories by confirmed issue count, highest first, with score or scoring status and scored rules.
//   What should I fix first?        the report's first fix (rank 1), the one Free also gets in full.
// An issue is one confirmed finding (Avara groups the same problem across widths into one finding, with evidence from each width); a fix is a
// grouped repair that resolves one or more issues. Each issue is counted once, in the category of the rule that owns its fix.
import type { Report } from './report-types.ts';
import { buildView, ENGINE_CAT, type Item } from './review-view.ts';
import { CATALOG, CATEGORIES, type CatCode } from './avara/catalog.ts';

export type SummaryCategory = { code: string; label: string; boardLabel: string; status: 'scored' | 'insufficient' | 'observation' | 'not_applicable' | 'unknown'; score: number | null; note: string; issues: number; fixes: number; scoredRules: number; firstFix: boolean };
export type PageSummary = {
  policy: string | null; score: number | null; reason: string | null; contributing: number; scorable: number;
  issues: number; fixes: number; observations: number;
  firstFix: { id: string; title: string; location: string; sentence: string; level: Item['level']; category: string; categoryLabel: string; fixText: string | null } | null;
  categories: SummaryCategory[];
};

const RULE_CAT = new Map(CATALOG.map((r) => [r.id, r.category]));
const LEGACY: Record<string, CatCode> = { accessibility: 'accessibility' as CatCode, mobile: 'mobile' as CatCode, ux_workflow: 'ux_workflow' as CatCode, performance: 'performance' as CatCode };
const DISPLAY: Record<string, CatCode> = Object.fromEntries(Object.entries({ 'Product clarity': 'Product Clarity', 'UX and workflow': 'UX & Workflow Quality', Mobile: 'Mobile Responsiveness', Accessibility: 'Accessibility', Trust: 'Trust & Credibility', Design: 'Design & Brand Quality', Conversion: 'Conversion Readiness', Performance: 'Performance', Differentiation: 'Differentiation & Design Maturity' })
  .map(([d, l]) => [d, (Object.entries(CATEGORIES).find(([, v]) => v.label === l)?.[0] ?? '') as CatCode]));

/** The category an item's issues are counted in: the owner rule's category, else the first category the item names. */
function catOf(report: Report, it: Item): CatCode | null {
  const rec = report.avara?.recommendations.find((r) => r.id === it.id);
  const owner = rec?.owner?.id ? RULE_CAT.get(rec.owner.id) : undefined;
  if (owner) return owner;
  const first = it.members.find((m) => m.canonicalId && RULE_CAT.has(m.canonicalId));
  if (first) return RULE_CAT.get(first.canonicalId!)!;
  if (rec?.categories[0] && LEGACY[rec.categories[0]]) return LEGACY[rec.categories[0]];
  return DISPLAY[it.categories[0] ?? ''] || null;
}

export function pageSummary(report: Report): PageSummary {
  const v = buildView(report, 'paid'); const lib = report.avara?.library;
  const all = [...(v.primary ? [v.primary] : []), ...v.others];
  const seen = new Set<string>();
  const per = new Map<CatCode, { issues: number; fixes: number }>();
  let issues = 0, fixes = 0;
  for (const it of all) {
    if (it.kind === 'review') continue;
    // Confirmed findings of a grouped fix; an engine failure or a legacy accessibility issue is one issue on its own.
    const keys = it.kind === 'fix' && it.members.length ? it.members.filter((m) => m.bucket === 'confirmed_failure').map((m) => m.issueId ? `i:${m.issueId}` : `f:${m.id}`) : [it.issueId ? `i:${it.issueId}` : `x:${it.id}`];
    const fresh = keys.filter((k) => !seen.has(k)); fresh.forEach((k) => seen.add(k));
    if (!keys.length) continue;   // a fix whose findings all need review is not a confirmed issue
    const c = catOf(report, it); if (!c) continue;
    const row = per.get(c) ?? { issues: 0, fixes: 0 }; row.issues += fresh.length; row.fixes += 1; per.set(c, row);
    issues += fresh.length; fixes += 1;
  }
  const lead = v.primary && v.primary.kind !== 'review' ? v.primary : null;
  const leadCat = lead ? catOf(report, lead) : null;
  const strict = new Map((lib?.strict ?? []).map((c) => [c.code, c]));
  const categories: SummaryCategory[] = (Object.keys(CATEGORIES) as CatCode[]).map((code): SummaryCategory => {
    const s = strict.get(code); const n = per.get(code) ?? { issues: 0, fixes: 0 };
    return { code, label: CATEGORIES[code].label, boardLabel: ENGINE_CAT[CATEGORIES[code].label] ?? CATEGORIES[code].label, status: s?.status ?? 'unknown', score: s?.status === 'scored' ? s.score : null, note: s?.note ?? 'The rule review did not run on this scan.', issues: n.issues, fixes: n.fixes, scoredRules: s?.scoredRules ?? 0, firstFix: code === leadCat };
  }).sort((a, b) => b.issues - a.issues || b.fixes - a.fixes || CATEGORIES[b.code as CatCode].weight - CATEGORIES[a.code as CatCode].weight || a.label.localeCompare(b.label));
  return {
    policy: lib?.policy ?? null, score: report.score, reason: report.score == null ? report.scoreReason ?? 'No score for this scan.' : null,
    contributing: lib?.contributing ?? 0, scorable: lib?.scorable ?? 0, issues, fixes, observations: v.board.totals.review,
    firstFix: lead ? { id: lead.id, title: lead.title, location: lead.location, sentence: lead.sentence, level: lead.level, category: leadCat ?? '', categoryLabel: leadCat ? CATEGORIES[leadCat].label : '', fixText: lead.fixText } : null,
    categories,
  };
}
