// The report's three answers, computed once on the server from the full report before any plan redaction, so Free and Paid get the same numbers:
//   How did my page do?            the page score /100 (policy avara-score-1.0), or why there is none, and how many categories contributed.
//   Which category has most issues? all nine categories by confirmed issue count, highest first, with score or scoring status and scored rules.
//   What should I fix first?        the report's first fix (rank 1), the one Free also gets in full.
// An issue is one confirmed finding (Avara groups the same problem across widths into one finding, with evidence from each width); a fix is a
// grouped repair that resolves one or more issues. Each issue is counted once, in the category of the rule that owns its fix.
import type { Report } from './report-types.ts';
import { buildView, ENGINE_CAT, type Item } from './review-view.ts';
import { CATALOG, CATEGORIES, canonicalFor, type CatCode } from './avara/catalog.ts';

type Sev = { critical: number; high: number; medium: number; review: number };
export type SummaryCategory = { code: string; label: string; boardLabel: string; severity: Sev; /** failed scored checks: each one is listed among this category's issues */ failedChecks: number; status: 'scored' | 'insufficient' | 'observation' | 'not_applicable' | 'unknown'; score: number | null; note: string; issues: number; fixes: number; scoredRules: number; firstFix: boolean };
export type PageSummary = {
  policy: string | null; score: number | null; reason: string | null; contributing: number; scorable: number;
  issues: number; fixes: number; observations: number; severity: Sev;
  /** Every item after the first fix, as severity and category only: what a Free report shows as locked rows (no titles, no elements). */
  locked: { level: Item['level']; category: string }[];
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
  const zero = (): Sev => ({ critical: 0, high: 0, medium: 0, review: 0 }); const sev = zero(); const sevBy = new Map<CatCode, Sev>(); const locked: PageSummary['locked'] = [];
  for (const it of all) { const c = catOf(report, it); sev[it.level]++; if (c) { const x = sevBy.get(c) ?? zero(); x[it.level]++; sevBy.set(c, x); } if (it !== v.primary) locked.push({ level: it.level, category: c ?? '' }); }
  // Each confirmed issue counts once, in the category of its own rule (so every failed check that lowers a category's score is listed in that
  // category), whichever fix groups it. A fix counts in every category where it resolves an issue; the page total counts each fix once.
  const engineRule = new Map<string, string>((report.review?.categories ?? []).flatMap((c) => c.findings.map((f) => [`x-${f.findingId}`, f.ruleId] as [string, string])));
  const catOfRule = (ruleId: string | null | undefined, legacy?: string): CatCode | null => (ruleId && RULE_CAT.get(canonicalFor(ruleId) ?? ruleId)) || (legacy && LEGACY[legacy]) || null;
  const fixesIn = new Map<CatCode, Set<string>>(); const counted = new Set<string>(); const shownRules = new Set<string>();
  const add = (key: string, c: CatCode | null, fixId: string | null, ruleId?: string | null) => {
    if (!c) return;
    if (ruleId) shownRules.add(canonicalFor(ruleId) ?? ruleId);
    if (!seen.has(key)) { seen.add(key); const row = per.get(c) ?? { issues: 0, fixes: 0 }; row.issues += 1; per.set(c, row); issues += 1; }
    if (fixId) { const f = fixesIn.get(c) ?? new Set<string>(); f.add(fixId); fixesIn.set(c, f); counted.add(fixId); }
  };
  for (const it of all) {
    if (it.kind === 'review') continue;
    if (it.kind === 'fix' && it.members.length) { for (const m of it.members.filter((x) => x.bucket === 'confirmed_failure')) add(m.issueId ? `i:${m.issueId}` : `f:${m.id}`, catOfRule(m.canonicalId ?? m.ruleId, m.category), it.id, m.canonicalId ?? m.ruleId); continue; }
    if (it.issueId) { const iss = report.issues.find((x) => x.id === it.issueId); add(`i:${it.issueId}`, catOfRule(iss?.ruleId, 'accessibility'), it.id, iss?.ruleId); continue; }
    const rid = engineRule.get(it.id); add(`x:${it.id}`, catOfRule(rid) ?? catOf(report, it), it.id, rid);
  }
  // Confirmed accessibility issues that no ranked fix covers are still issues on the page.
  for (const iss of report.issues.filter((x) => x.bucket === 'confirmed_failure')) add(`i:${iss.id}`, catOfRule(iss.ruleId, 'accessibility'), null, iss.ruleId);
  // A failed scored check whose rule no listed issue represents (its fix is owned by another rule's finding) is listed as its own issue.
  const failedScored = new Set((lib?.strict ?? []).flatMap((c) => c.rules.filter((r) => r.result === 'fail').map((r) => r.ruleId)));
  for (const c of report.review?.categories ?? []) for (const f of c.findings) if (f.result === 'observed_failure' && failedScored.has(f.ruleId) && !shownRules.has(f.ruleId)) add(`x:x-${f.findingId}`, catOfRule(f.ruleId), null, f.ruleId);
  for (const [c, f] of fixesIn) { const row = per.get(c) ?? { issues: 0, fixes: 0 }; row.fixes = f.size; per.set(c, row); }
  fixes = counted.size;
  const lead = v.primary && v.primary.kind !== 'review' ? v.primary : null;
  const leadCat = lead ? catOf(report, lead) : null;
  const strict = new Map((lib?.strict ?? []).map((c) => [c.code, c]));
  const categories: SummaryCategory[] = (Object.keys(CATEGORIES) as CatCode[]).map((code): SummaryCategory => {
    const s = strict.get(code); const n = per.get(code) ?? { issues: 0, fixes: 0 };
    return { code, failedChecks: s?.rules?.filter((r) => r.result === 'fail').length ?? 0, severity: sevBy.get(code) ?? zero(), label: CATEGORIES[code].label, boardLabel: ENGINE_CAT[CATEGORIES[code].label] ?? CATEGORIES[code].label, status: s?.status ?? 'unknown', score: s?.status === 'scored' ? s.score : null, note: s?.note ?? 'The rule review did not run on this scan.', issues: n.issues, fixes: n.fixes, scoredRules: s?.scoredRules ?? 0, firstFix: code === leadCat };
  }).sort((a, b) => b.issues - a.issues || b.fixes - a.fixes || CATEGORIES[b.code as CatCode].weight - CATEGORIES[a.code as CatCode].weight || a.label.localeCompare(b.label));
  return {
    policy: lib?.policy ?? null, score: report.score, reason: report.score == null ? report.scoreReason ?? 'No score for this scan.' : null,
    contributing: lib?.contributing ?? 0, scorable: lib?.scorable ?? 0, issues, fixes, observations: v.board.totals.review, severity: sev, locked,
    firstFix: lead ? { id: lead.id, title: lead.title, location: lead.location, sentence: lead.sentence, level: lead.level, category: leadCat ?? '', categoryLabel: leadCat ? CATEGORIES[leadCat].label : '', fixText: lead.fixText } : null,
    categories,
  };
}
