import { currentUser } from '@/lib/auth.ts';
import { canViewScan } from '@/lib/access.ts';
import { scanHas } from '@/lib/entitlements.ts';
import { loadReport } from '@/lib/report.ts';

export const dynamic = 'force-dynamic';
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Developer exports: CSV (one row per element) and SARIF 2.1.0 (for code-scanning tools).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  // Access first: someone who cannot see the scan learns nothing about it (not even its plan).
  if (!(await canViewScan(await currentUser(), id))) return new Response('Not found', { status: 404 });
  if (!(await scanHas(id, 'full_report'))) return new Response('This needs a paid plan.', { status: 402 });
  const r = await loadReport(id);
  if (!r || !r.completedAt) return new Response('Not found', { status: 404 });
  const format = new URL(req.url).searchParams.get('format');
  const issues = r.issues.filter((i) => i.bucket !== 'verified_pass');
  const ps = r.pageSummary;
  // The page score and the nine categories, from the same object the report renders (lib/page-summary.ts).
  if (format === 'summary') {
    const head = ['category', 'status', 'score', 'confirmed_issues', 'fixes', 'scored_rules', 'first_fix', 'reason'].join(',');
    const page = ['Page', ps?.score != null ? 'scored' : 'not_scored', ps?.score ?? '', ps?.issues ?? 0, ps?.fixes ?? 0, '', ps?.firstFix?.title ?? '', ps?.score != null ? `${ps.contributing} of ${ps.scorable} categories contributed (${ps.policy})` : ps?.reason ?? ''].map(csvCell).join(',');
    const rows = (ps?.categories ?? []).map((c) => [c.label, c.status, c.score ?? '', c.issues, c.fixes, c.scoredRules, c.firstFix ? 'yes' : '', c.status === 'scored' ? '' : c.note].map(csvCell).join(','));
    return new Response([head, page, ...rows].join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="avara-${id.slice(0, 8)}-summary.csv"` } });
  }
  if (format === 'sarif') {
    const rules = [...new Map(issues.map((i) => [i.ruleId, { id: i.ruleId, shortDescription: { text: i.title }, helpUri: i.helpUrl, properties: { tags: i.wcag.map((w) => `WCAG ${w.sc}`) } }])).values()];
    const level = (i: typeof issues[number]) => (i.bucket === 'needs_review' ? 'note' : i.severity === 'critical' || i.severity === 'serious' ? 'error' : 'warning');
    const sarif = { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{ properties: { avaraPageSummary: ps ?? null }, tool: { driver: { name: 'Avara', informationUri: process.env.SUGAM_URL || new URL(req.url).origin, rules } }, results: issues.flatMap((i) => i.instances.map((x) => ({ ruleId: i.ruleId, level: level(i), message: { text: `${i.title}. ${i.whatToChange}` }, locations: [{ physicalLocation: { artifactLocation: { uri: r.finalUrl || r.url } }, logicalLocations: [{ fullyQualifiedName: x.selector }] }], properties: { bucket: i.bucket, severity: i.severity, html: x.html } }))) }] };
    return new Response(JSON.stringify(sarif, null, 2), { headers: { 'content-type': 'application/sarif+json', 'content-disposition': `attachment; filename="avara-${id.slice(0, 8)}.sarif"` } });
  }
  const rows = [['issue_number', 'bucket', 'severity', 'rule', 'title', 'wcag', 'role', 'page', 'selector', 'html', 'detail', 'what_to_change'].join(',')];
  for (const i of issues) for (const x of i.instances) rows.push([i.position, i.bucket, i.severity, i.ruleId, i.title, i.wcag.map((w) => w.sc).join(' '), i.roleTag, r.finalUrl || r.url, x.selector, x.html, x.detail, i.whatToChange].map(csvCell).join(','));
  return new Response(rows.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="avara-${id.slice(0, 8)}.csv"` } });
}
