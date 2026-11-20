// Loads a completed scan with its viewports, issues, instances and bounding boxes.
import { eq, asc, and, isNull, inArray, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { getDb, schema } from './db/index.ts';
import { STANDARDS } from './standards.ts';
import type { Report, AvaraReport } from './report-types.ts';
import { planForScan, redactReport } from './entitlements.ts';
import { hasFeature } from './plans.ts';
import { BY_ID, CATALOG, LENSES, HEURISTICS, RELATED, SOURCES, canonicalFor, coverage as libCoverage, executedTopics } from './avara/catalog.ts';
import { loadReview } from '../src/services/findings-service/index.ts';
import { DEFAULT_PROFILE, scoreGroups, type ScoredGroup } from './avara/scoring.ts';

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function scanIdForShareToken(token: string): Promise<string | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const db = await getDb();
  const [l] = await db.select().from(schema.shareLinks).where(and(eq(schema.shareLinks.tokenHash, hashToken(token)), isNull(schema.shareLinks.revokedAt)));
  if (!l || (l.expiresAt && l.expiresAt < new Date())) return null;
  return l.scanId;
}

const SPECIFIC_FIRST = ['mobile/sticky-ui-interference'];
const SEVN = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
// Which topic owns a repair group, which others are linked as evidence, which heuristic lenses apply, and what it deducts. Derived, so old scans get it too.
function recMeta(r: typeof schema.recommendations.$inferSelect, fs: (typeof schema.findings.$inferSelect)[]) {
  const members = r.findingIds.map((id) => fs.find((f) => f.id === id)).filter(Boolean) as (typeof schema.findings.$inferSelect)[];
  const ownerF = [...members].sort((a, b) => (SPECIFIC_FIRST.includes(b.ruleId) ? 1 : 0) - (SPECIFIC_FIRST.includes(a.ruleId) ? 1 : 0) || SEVN[a.severity] - SEVN[b.severity])[0];
  const ownerId = ownerF ? canonicalFor(ownerF.ruleId) : null; const top = ownerId ? BY_ID.get(ownerId) : null;
  const relIds = [...new Set([...(ownerId ? RELATED[ownerId] ?? [] : []), ...members.map((m) => canonicalFor(m.ruleId)).filter((x): x is string => !!x && x !== ownerId)])];
  const lensIds = [...new Set([...(ownerId ? LENSES[ownerId] ?? [] : []), ...relIds.flatMap((x) => LENSES[x] ?? [])])];
  const sev = ownerF?.severity === 'critical' ? 'critical' : ownerF?.severity === 'serious' ? 'major' : 'minor';
  const pts = { critical: 40, major: 15, minor: 5 }[sev];
  const ownerOther = members.length > 1 ? 'Most specific rule that directly explains the failure; the other findings in this group are linked evidence and are not counted again.' : 'The only rule that explains this failure.';
  return {
    ownerIssueId: ownerF?.issueId ?? null,
    owner: top ? { id: top.id, title: top.title, why: ownerOther } : null,
    related: relIds.map((x) => BY_ID.get(x)).filter(Boolean).map((x) => ({ id: x!.id, title: x!.title })),
    lenses: lensIds.map((l) => HEURISTICS.find((h) => h.lens === l)).filter(Boolean).map((h) => ({ lens: h!.lens, name: h!.name })),
    deductions: { groups: 1, points: pts, applied: !!top?.scoreEligible, why: top?.scoreEligible ? 'Counted once for this repair group.' : 'This repair counts once when scoring is enabled. No rule is score-eligible yet, so nothing is deducted today.' },
  };
}
async function loadAvara(scanId: string, scan: typeof schema.scans.$inferSelect): Promise<AvaraReport | null> {
  const db = await getDb();
  const fs = await db.select().from(schema.findings).where(eq(schema.findings.scanId, scanId));
  const recs = await db.select().from(schema.recommendations).where(eq(schema.recommendations.scanId, scanId)).orderBy(asc(schema.recommendations.rank));
  if (!fs.length && !recs.length && !scan.analyzers) return null;
  const ev = fs.length ? await db.select().from(schema.findingEvidence).where(eq(schema.findingEvidence.scanId, scanId)) : [];
  const rv = fs.length ? await db.select().from(schema.ruleVersions) : [];
  const fx = recs.length ? await db.select().from(schema.generatedFixes).where(inArray(schema.generatedFixes.recommendationId, recs.map((r) => r.id))) : [];
  const outs = scan.rescanOf ? await db.select().from(schema.rescanOutcomes).where(eq(schema.rescanOutcomes.scanId, scanId)) : null;
  const prevFs = outs?.length ? await db.select().from(schema.findings).where(eq(schema.findings.scanId, scan.rescanOf!)) : [];
  const [later] = await db.select({ id: schema.scans.id }).from(schema.scans).where(and(eq(schema.scans.rescanOf, scanId), eq(schema.scans.status, 'completed'))).orderBy(desc(schema.scans.createdAt)).limit(1);
  const rule = (f: typeof fs[number]) => rv.find((r) => r.ruleId === f.ruleId && r.version === f.ruleVersion);
  const rank1 = recs[0];
  const leadIssueId = rank1 ? recMeta(rank1, fs).ownerIssueId : null;
  const executed = executedTopics(scan.analyzers); const cov = libCoverage(executed);
  const groups: ScoredGroup[] = [...new Map(fs.filter((f) => f.bucket === 'confirmed_failure').map((f) => [f.repairKey, f])).values()].map((f) => ({ groupId: f.repairKey, ownerRuleId: canonicalFor(f.ruleId) ?? f.ruleId, category: ({ ux_workflow: 'ux_workflow', mobile: 'mobile', accessibility: 'accessibility', performance: 'performance' } as const)[f.category], severity: f.severity === 'critical' ? 'critical' : f.severity === 'serious' ? 'major' : 'minor', confirmed: true, scoreEligible: false, advisory: false, blocksMainTask: f.goalImpact === 'blocks' }));
  const sc = scoreGroups(groups, new Set(executed), DEFAULT_PROFILE);
  return {
    library: { ran: executed.map((id) => ({ id, title: BY_ID.get(id)!.title })), notRun: CATALOG.length - executed.length,
      needsPerson: { heuristic: CATALOG.filter((r) => r.mode === 'H').length, session: CATALOG.filter((r) => r.mode === 'U').length, ids: CATALOG.filter((r) => r.mode === 'H' || r.mode === 'U').map((r) => r.id) },
      unverifiedSources: Object.values(SOURCES).map((src) => ({ key: src.key, name: src.name, url: src.url, topics: CATALOG.filter((r) => r.sourceKey === src.key).length })).filter((x) => x.topics > 0),
      catalogued: cov.catalogued, implemented: cov.implemented, exercisedOnFixtures: cov.exercisedOnFixtures, executedOnUrl: cov.executedOnUrl, scoreEligible: cov.scoreEligible, policy: sc.policy, coverageProfile: sc.coverageProfile, overall: sc.overall, overallWithheld: sc.overallWithheld, headline: sc.headline, advisoryCount: sc.advisory.length },
    goal: scan.goal ?? null, analyzers: scan.analyzers ?? {}, coverage: scan.summary?.coverage ?? [],
    findings: fs.map((f) => ({
      id: f.id, ruleId: f.ruleId, ruleVersion: f.ruleVersion, ruleTitle: rule(f)?.title ?? f.ruleId, category: f.category, bucket: f.bucket, severity: f.severity, confidence: f.confidence, canonicalId: canonicalFor(f.ruleId), sourceType: f.sourceType,
      sourceUrl: rule(f)?.sourceUrl ?? '', sourceSection: rule(f)?.sourceSection ?? '', title: f.title, summary: f.summary, affects: f.affects, trying: f.trying, consequence: f.consequence,
      consequenceKind: f.consequenceKind as 'observed' | 'hypothesis', goalImpact: f.goalImpact as 'blocks' | 'hinders' | 'none', issueId: f.issueId,
      evidence: ev.filter((e) => e.findingId === f.id).map((e) => ({ kind: e.kind as 'dom', viewport: e.viewport, data: e.data })),
    })),
    recommendations: recs.map((r) => { const { ownerIssueId, ...meta } = recMeta(r, fs); void ownerIssueId; return { ...meta, id: r.id, rank: r.rank, tier: r.tier, title: r.title, sentence: r.sentence, categories: r.categories, findingIds: r.findingIds, fixLocked: false, fixes: fx.filter((x) => x.recommendationId === r.id).map((x) => ({ tool: x.tool, kind: x.kind, content: x.content })) }; }),
    rescanOf: scan.rescanOf ?? null, latestRescanId: later?.id ?? null, leadIssueId,
    outcomes: outs ? outs.map((o) => { const pf = prevFs.find((f) => f.id === o.findingId); return { findingId: o.findingId, findingTitle: pf?.title ?? 'Earlier finding', category: pf?.category ?? 'accessibility', recommendationId: o.recommendationId, outcome: o.outcome, comparable: o.comparable, before: o.before, after: o.after, reason: o.reason }; }) : null,
  };
}

export async function loadReport(scanId: string, opts: { shareToken?: string } = {}): Promise<Report | null> {
  const db = await getDb();
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan) return null;
  const vps = await db.select().from(schema.scanViewports).where(eq(schema.scanViewports.scanId, scanId));
  const issues = await db.select().from(schema.issues).where(eq(schema.issues.scanId, scanId)).orderBy(asc(schema.issues.position));
  const insts = issues.length ? await db.select().from(schema.issueInstances).where(inArray(schema.issueInstances.issueId, issues.map((i) => i.id))) : [];
  const boxes = await db.select().from(schema.boundingBoxes).where(eq(schema.boundingBoxes.scanId, scanId));
  let brand: Report['brand'] = null;
  if (scan.projectId) {
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, scan.projectId));
    if (p) { const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, p.organizationId)); if (o) brand = { name: o.brandName || o.name, primary: o.brandPrimaryColor }; }
  }
  const shot = (vp: string) => (opts.shareToken ? `/api/share/${opts.shareToken}/screenshot/${vp}` : `/api/scans/${scanId}/screenshot/${vp}`);
  const std = STANDARDS[scan.standard];
  const report: Report = {
    id: scan.id, url: scan.url, finalUrl: scan.finalUrl, pageTitle: scan.pageTitle, standard: scan.standard, standardLabel: std.label, standardNote: std.note,
    score: scan.score, summary: scan.summary ?? null, engine: scan.engine ?? null, ai: scan.ai ?? null, completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    viewports: vps.sort((a, b) => (a.viewport === 'desktop' ? -1 : 1) - (b.viewport === 'desktop' ? -1 : 1)).map((v) => ({ viewport: v.viewport, viewportWidth: v.viewportWidth, viewportHeight: v.viewportHeight, pageWidth: v.pageWidth, pageHeight: v.pageHeight, truncated: v.screenshotTruncated, screenshotUrl: shot(v.viewport) })),
    issues: issues.map((i) => ({
      id: i.id, position: i.position, ruleId: i.ruleId, componentKey: i.componentKey, source: i.source, bucket: i.bucket, severity: i.severity, title: i.title, wcag: i.wcag, impactGroups: i.impactGroups, roleTag: i.roleTag,
      instanceCount: i.instanceCount, whatToChange: i.whatToChange, helpUrl: i.evidence?.helpUrl, fixes: i.fixes ?? null, aiEnriched: i.aiEnriched,
      instances: insts.filter((x) => x.issueId === i.id).map((x) => ({ id: x.id, selector: x.selector, html: x.html, detail: x.detail, viewports: x.viewports, boxes: boxes.filter((b) => b.instanceId === x.id).map((b) => ({ viewport: b.viewport, x: b.x, y: b.y, width: b.width, height: b.height, visible: b.visible })) })),
    })),
    brand,
    avara: await loadAvara(scanId, scan),
    review: null,
  };
  const planFull = hasFeature(await planForScan(scanId), 'full_report');
  report.review = await loadReview(scanId, { full: planFull });
  // Entitlements are applied here so no caller can hand a locked report to the browser by accident.
  return hasFeature(await planForScan(scanId), 'full_report') ? report : redactReport(report);
}
