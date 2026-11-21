// Scan job: scan -> analyse -> (optional AI) -> persist. Runs from the BullMQ worker, or
// in-process when no Redis is configured.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { putObject } from './storage.ts';
import { scanUrl, ScanError } from '../scanner/scanner.ts';
import { analyze } from '../analysis/analyze.ts';
import { enrich } from '../analysis/claude.ts';
import type { ScanSummary } from './db/schema.ts';
import { analyzeAvara, type AvaraAnalysis } from '../analysis/avara/build.ts';
import { avaraRows, insertAvara, outcomeRow } from './avara/persist.ts';
import { verifyProbes, type Probe } from '../scanner/avara-verify.ts';
import { runReview } from '../src/services/scan-service/index.ts';
import { heroDiagnostic } from '../src/services/scan-service/hero-layout.ts';
import { saveReview } from '../src/context/findings/index.ts';
import { recordKnowledge } from '../src/context/knowledge/index.ts';
import { detectPatterns } from '../src/context/knowledge/patterns.ts';
import { ruleLoader } from '../src/engines/rule-engine/RuleLoader.ts';

export async function runScanJob(scanId: string): Promise<void> {
  const db = await getDb();
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan || scan.status === 'completed') return;
  const progress = (step: string, percent: number) => db.update(schema.scans).set({ progress: { step, percent } }).where(eq(schema.scans.id, scanId));
  await db.update(schema.scans).set({ status: 'running', startedAt: new Date(), progress: { step: 'Starting browser', percent: 5 } }).where(eq(schema.scans.id, scanId));
  try {
    const out = await scanUrl(scan.url, scan.standard, (s, p) => { void progress(s, p); }, { goal: scan.goal ?? null, perfRuns: scan.rescanOf ? 3 : 1 });
    await db.update(schema.scans).set({ status: 'analyzing', progress: { step: 'Grouping findings and writing fixes', percent: 85 } }).where(eq(schema.scans.id, scanId));
    const a = analyze(out);
    const ai = await enrich(out, a.issues);
    // Avara's analysis must never cost the report: if it throws, the accessibility report is still saved and the failure is recorded.
    let av: AvaraAnalysis | null = null; const analyzers = { ...out.analyzers };
    try { if (process.env.AVARA_FAIL_ANALYZER === 'analysis') throw new Error('forced failure'); av = analyzeAvara(out, a); } catch (e) { analyzers.analysis = { status: 'failed', message: `The cross-category analysis did not complete: ${(e as Error).message.split('\n')[0].slice(0, 160)}` }; }

    // The rule engine reviews the page against the JSON rule library. A failure here is recorded and never costs the rest of the report.
    const rv = process.env.AVARA_FAIL_ANALYZER === 'review' ? { review: null, error: 'forced failure' } : await runReview(out, a, av);
    if (!rv.review) analyzers.review = { status: 'failed', message: `The rule review did not complete: ${rv.error ?? 'unknown error'}` }; else analyzers.review = { status: 'ok' };
    // DIFF-002 hero-layout comparison: diagnostic evidence kept beside the scan (never a finding, never scored), read through /api/scans/{id}/diagnostics.
    try { await putObject(`scans/${scanId}/diagnostics/diff-002.json`, JSON.stringify(heroDiagnostic(out))); } catch (e) { console.error('DIFF-002 diagnostic not stored', scanId, e); }

    // Files first (they live outside the database), then every row in ONE transaction, in a few
    // batched inserts. A failure part-way rolls back, so a scan never keeps half its findings,
    // and a page with hundreds of elements costs a handful of queries, not hundreds.
    const viewportRows: (typeof schema.scanViewports.$inferInsert)[] = [];
    for (const v of out.viewports) {
      const shot = await putObject(`scans/${scanId}/${v.name}.jpg`, v.screenshot);
      const raw = await putObject(`scans/${scanId}/${v.name}.axe.json`, JSON.stringify(v.axe));
      viewportRows.push({ scanId, viewport: v.name, viewportWidth: v.width, viewportHeight: v.height, pageWidth: v.pageWidth, pageHeight: v.pageHeight, screenshotKey: shot, screenshotTruncated: v.truncated, rawAxeKey: raw, keyboardTrace: v.keyboard });
    }
    const issueRows: (typeof schema.issues.$inferInsert)[] = []; const instanceRows: (typeof schema.issueInstances.$inferInsert)[] = []; const boxRows: (typeof schema.boundingBoxes.$inferInsert)[] = [];
    a.issues.forEach((d, n) => {
      const issueId = crypto.randomUUID();
      issueRows.push({
        id: issueId, scanId, position: n + 1, ruleId: d.ruleId, source: d.source, bucket: d.bucket, severity: d.severity, title: d.title, wcag: d.wcag,
        impactGroups: d.impactGroups, roleTag: d.roleTag, componentKey: d.componentKey, instanceCount: d.instances.length, whatToChange: d.whatToChange,
        evidence: d.instances[0] ? { html: d.instances[0].html, selector: d.instances[0].selector, detail: d.instances[0].detail, helpUrl: d.helpUrl } : { helpUrl: d.helpUrl },
        fixes: d.fixes ?? null, aiEnriched: !!d.aiEnriched,
      });
      for (const inst of d.instances) {
        const instanceId = crypto.randomUUID();
        instanceRows.push({ id: instanceId, issueId, scanId, selector: inst.selector, html: inst.html, detail: inst.detail ?? null, viewports: inst.viewports });
        for (const [vp, b] of Object.entries(inst.boxes)) if (b) boxRows.push({ instanceId, scanId, viewport: vp as 'desktop' | 'mobile', x: b.x, y: b.y, width: b.width, height: b.height, visible: b.visible });
      }
    });
    let productId = scan.productId; let avRows: ReturnType<typeof avaraRows> | null = null; void avRows;
    const chunk = <T,>(rows: T[], size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
    await db.transaction(async (tx) => {
      if (!productId) { productId = crypto.randomUUID(); await tx.insert(schema.products).values({ id: productId, origin: new URL(out.finalUrl).origin, mainGoal: scan.goal ?? null }); }
      if (viewportRows.length) await tx.insert(schema.scanViewports).values(viewportRows);
      for (const c of chunk(issueRows)) await tx.insert(schema.issues).values(c);
      for (const c of chunk(instanceRows)) await tx.insert(schema.issueInstances).values(c);
      for (const c of chunk(boxRows)) await tx.insert(schema.boundingBoxes).values(c);
      if (rv.review) { await saveReview(tx, scanId, productId, rv.review, ruleLoader().loadAllRules()); await recordKnowledge(tx, scanId, productId, out.finalUrl, rv.review); }
      if (av) { avRows = avaraRows(scanId, productId, av, issueRows.map((r) => r.id as string), issueRows.map((r) => r.fixes ?? null)); await insertAvara(tx as never, avRows); }
    });
    if (rv.review) { try { await detectPatterns(); } catch (e) { console.error('pattern detection failed', e); } }
    // A rescan compares each earlier finding with a fresh, comparable check. Failing to run the checks leaves "could not verify", never "fixed".
    if (scan.rescanOf) {
      try {
        const prev = await db.select().from(schema.findings).where(eq(schema.findings.scanId, scan.rescanOf));
        const prevRecs = await db.select().from(schema.recommendations).where(eq(schema.recommendations.scanId, scan.rescanOf));
        const mobile = out.viewports.find((v) => v.name === 'mobile');
        const checks = prev.filter((f) => f.bucket !== 'verified_pass');
        const results = await verifyProbes(out.finalUrl, checks.map((f) => f.verify as Probe | null), { perf: out.perf, mobilePageWidth: mobile?.pageWidth ?? null });
        const recOf = (fid: string) => prevRecs.find((r) => r.findingIds.includes(fid))?.id ?? null;
        const rows = checks.map((f, i) => outcomeRow(scanId, scan.rescanOf as string, f, recOf(f.id), results[i]));
        if (rows.length) await db.insert(schema.rescanOutcomes).values(rows);
        analyzers.verification = { status: 'ok' };
      } catch (e) { analyzers.verification = { status: 'failed', message: `The re-check did not complete: ${(e as Error).message.split('\n')[0].slice(0, 160)}` }; }
    }
    const confirmed = a.issues.filter((i) => i.bucket === 'confirmed_failure');
    const summary: ScanSummary = {
      confirmed: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      confirmedIssues: confirmed.length, confirmedInstances: confirmed.reduce((n, i) => n + i.instances.length, 0),
      needsReview: a.issues.filter((i) => i.bucket === 'needs_review').length, verifiedPasses: a.issues.filter((i) => i.bucket === 'verified_pass').length,
      coverage: av?.coverage ?? [], limitations: [...out.limitations, ...(a.outOfScope ? [`${a.outOfScope} finding(s) fall outside the selected standard and are not listed.`] : [])],
    };
    confirmed.forEach((i) => { summary.confirmed[i.severity]++; });
    await db.update(schema.scans).set({ status: 'completed', completedAt: new Date(), finalUrl: out.finalUrl, pageTitle: out.title, score: a.score, summary, engine: out.engine, ai: { used: ai.used, model: ai.model, reason: ai.reason }, productId, analyzers, progress: { step: 'Done', percent: 100 } }).where(eq(schema.scans.id, scanId));
  } catch (e) {
    const err = e instanceof ScanError ? { code: e.code, message: e.message } : { code: (e as { code?: string }).code || 'internal', message: (e as Error).message?.split('\n')[0] || 'The scan failed.' };
    if (!(e instanceof ScanError)) console.error('scan failed', scanId, e);
    await db.update(schema.scans).set({ status: 'failed', error: err, completedAt: new Date() }).where(eq(schema.scans.id, scanId));
  }
}
