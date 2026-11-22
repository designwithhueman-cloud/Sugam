// Scan job: scan -> analyse -> (optional AI) -> persist. Runs from the BullMQ worker, or
// in-process when no Redis is configured.
import crypto from 'node:crypto';
import { eq, inArray, and, sql } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { putObject } from './storage.ts';
import { scanUrl, ScanError, type EarlyBlocker } from '../scanner/scanner.ts';
import { buildAvaraFix } from '../analysis/avara/fixes.ts';
import { analyze } from '../analysis/analyze.ts';
import { enrich, selectFixTargets, aiEnabled as aiEnabledForFixes } from '../analysis/claude.ts';
import type { ScanSummary } from './db/schema.ts';
import type { ScanOutput } from '../scanner/scanner.ts';
import { analyzeAvara, type AvaraAnalysis } from '../analysis/avara/build.ts';
import { avaraRows, insertAvara, outcomeRow } from './avara/persist.ts';
import { launchRows, actionHitEvidence } from './launch/persist.ts';
import { verifyProbes, remeasureWithCss, type Probe } from '../scanner/avara-verify.ts';
import { runReview } from '../src/services/scan-service/index.ts';
import { heroDiagnostic } from '../src/services/scan-service/hero-layout.ts';
import { saveReview } from '../src/context/findings/index.ts';
import { recordKnowledge } from '../src/context/knowledge/index.ts';
import { detectPatterns } from '../src/context/knowledge/patterns.ts';
import { ruleLoader } from '../src/engines/rule-engine/RuleLoader.ts';
import { createLlmClient } from '../src/engines/rule-engine/llm/index.ts';
import type { ReviewResult } from '../src/engines/rule-engine/RuleTypes.ts';

export async function runScanJob(scanId: string): Promise<void> {
  const db = await getDb();
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan || scan.status === 'completed' || scan.status === 'failed') return; // done, or given up on (interrupted) while it waited
  // Drizzle queries are lazy: they run only when awaited or then-ed. Progress is fired without awaiting, so it calls then() itself; a failed
  // progress write never stops the scan.
  const progress = (step: string, percent: number, stages?: import('../scanner/scanner.ts').ScanStages) => db.update(schema.scans).set({ progress: { step, percent, ...(stages ? { stages } : {}) } }).where(eq(schema.scans.id, scanId)).then(() => undefined, (e) => { console.error('progress not saved', scanId, e); });
  await db.update(schema.scans).set({ status: 'running', startedAt: new Date(), progress: { step: 'Starting browser', percent: 5 } }).where(eq(schema.scans.id, scanId));
  try {
    const out = await scanUrl(scan.url, scan.standard, (s, p, st) => { void progress(s, p, st); }, { goal: scan.goal ?? null, perfRuns: scan.rescanOf ? 3 : 1, onBlocker: (b) => { void saveEarlyBlocker(scanId, b); } });
    await db.update(schema.scans).set({ status: 'analyzing', progress: { step: 'Grouping findings and writing fixes', percent: 92 } }).where(eq(schema.scans.id, scanId));
    const a = analyze(out);
    // The AI fix writer runs after the report is saved (finishFixWriter), so the first usable fix never waits on a model.
    const fixTargets = aiEnabledForFixes() ? selectFixTargets(a.issues).length : 0;
    const ai = fixTargets ? { used: false, reason: 'AI fix wording is still running; Avara’s own fixes are shown until it finishes.', model: undefined as string | undefined }
      : await enrich(out, a.issues);   // returns at once with the reason (off, no mapped fix): no model call
    // Avara's analysis must never cost the report: if it throws, the accessibility report is still saved and the failure is recorded.
    let av: AvaraAnalysis | null = null; const analyzers = { ...out.analyzers };
    try { if (process.env.AVARA_FAIL_ANALYZER === 'analysis') throw new Error('forced failure'); av = analyzeAvara(out, a); } catch (e) { analyzers.analysis = { status: 'failed', message: `The cross-category analysis did not complete: ${(e as Error).message.split('\n')[0].slice(0, 160)}` }; }

    // Paste-ready CSS for the main action is applied to a fresh copy of the page and remeasured at 320px and 390px before it is offered. The
    // fix is rebuilt from the result, so its label ("Verified at 320px and 390px" or "Suggested CSS") says what Avara actually did.
    if (av) { try { analyzers.patchCheck = await checkPatches(out, av); } catch (e) { analyzers.patchCheck = { status: 'failed', message: (e as Error).message.split('\n')[0].slice(0, 120) }; } }
    // The rule engine reviews the page against the JSON rule library. A failure here is recorded and never costs the rest of the report.
    // Report first: with AI on, the review is saved now with judgement rules marked pending, the scan completes, and the AI review runs after
    // (finishAiReview). Nothing a free user can open waits on it: the first fix comes from measured findings.
    const aiLater = !!createLlmClient();
    const rv = process.env.AVARA_FAIL_ANALYZER === 'review' ? { review: null, error: 'forced failure' } : await runReview(out, a, av, aiLater ? { llm: null, aiPending: true } : {});
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
    // The focused 320px pass keeps its own screenshot, so a finding measured there is shown on the page as it looked at 320px.
    if (out.narrow) {
      const n = out.narrow; const shot = await putObject(`scans/${scanId}/narrow.jpg`, n.screenshot);
      viewportRows.push({ scanId, viewport: 'narrow', viewportWidth: n.width, viewportHeight: n.height, pageWidth: n.pageWidth, pageHeight: n.pageHeight, screenshotKey: shot, screenshotTruncated: n.truncated, rawAxeKey: null, keyboardTrace: null });
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
    await progress('Saving the report', 97);
    await db.transaction(async (tx) => {
      if (!productId) { productId = crypto.randomUUID(); await tx.insert(schema.products).values({ id: productId, origin: new URL(out.finalUrl).origin, mainGoal: scan.goal ?? null }); }
      if (viewportRows.length) await tx.insert(schema.scanViewports).values(viewportRows);
      for (const c of chunk(issueRows)) await tx.insert(schema.issues).values(c);
      for (const c of chunk(instanceRows)) await tx.insert(schema.issueInstances).values(c);
      for (const c of chunk(boxRows)) await tx.insert(schema.boundingBoxes).values(c);
      if (rv.review) { await saveReview(tx, scanId, productId, rv.review, ruleLoader().loadAllRules()); if (!aiLater) await recordKnowledge(tx, scanId, productId, out.finalUrl, rv.review); }
      if (av) {
        avRows = avaraRows(scanId, productId, av, issueRows.map((r) => r.id as string), issueRows.map((r) => r.fixes ?? null));
        // The launch pack's 320px hit sample becomes evidence on the existing main-action repair, never a new finding.
        avRows.evidenceRows.push(...(actionHitEvidence(scanId, out, avRows.findingRows.map((f) => ({ id: f.id as string, repairKey: f.repairKey, ruleId: f.ruleId }))) as unknown as typeof avRows.evidenceRows));
        await insertAvara(tx as never, avRows);
      }
      const lr = launchRows(scanId, out); for (const c of chunk(lr)) await tx.insert(schema.launchChecks).values(c);
    });
    if (rv.review && !aiLater) { try { await detectPatterns(); } catch (e) { console.error('pattern detection failed', e); } }
    // A rescan compares each earlier finding with a fresh, comparable check. Failing to run the checks leaves "could not verify", never "fixed".
    if (scan.rescanOf) {
      try {
        const prev = await db.select().from(schema.findings).where(eq(schema.findings.scanId, scan.rescanOf));
        const prevRecs = await db.select().from(schema.recommendations).where(eq(schema.recommendations.scanId, scan.rescanOf));
        const mobile = out.viewports.find((v) => v.name === 'mobile');
        const checks = prev.filter((f) => f.bucket !== 'verified_pass');
        const results = await verifyProbes(out.finalUrl, checks.map((f) => f.verify as Probe | null), { perf: out.perf, pageWidths: Object.fromEntries([...(mobile ? [[mobile.width, mobile.pageWidth]] : []), ...(out.narrow ? [[out.narrow.width, out.narrow.pageWidth]] : [])]) });
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
    await db.update(schema.scans).set({ status: 'completed', completedAt: new Date(), finalUrl: out.finalUrl, pageTitle: out.title, score: a.score, summary, engine: out.engine, ai: { used: ai.used, model: ai.model, reason: ai.reason, ...(aiLater && rv.review ? { pending: true } : {}), ...(fixTargets ? { fixes: { state: 'pending' as const } } : {}) }, productId, analyzers, progress: { step: 'Done', percent: 100 } }).where(eq(schema.scans.id, scanId));
    if (aiLater && rv.review) void finishAiReview(scanId, productId!, out, a, av);   // not awaited: the queue slot is freed for the next scan
    if (fixTargets) void finishFixWriter(scanId, out, a, issueRows.map((r) => r.id as string), recsByIssue(av, avRows));
  } catch (e) {
    const err = e instanceof ScanError ? { code: e.code, message: e.message } : { code: (e as { code?: string }).code || 'internal', message: (e as Error).message?.split('\n')[0] || 'The scan failed.' };
    if (!(e instanceof ScanError)) console.error('scan failed', scanId, e);
    await db.update(schema.scans).set({ status: 'failed', error: err, completedAt: new Date() }).where(eq(schema.scans.id, scanId));
  }
}

/** The AI half of a report-first scan. Replaces the scan's saved review with the full one (judgement rules decided by the model), in one
 *  transaction, then clears the pending flag. If the model call fails, the review is replaced with one that records why, so nothing stays
 *  "still checking". A server restart mid-way leaves the flag set; readers treat a pending review older than 15 minutes as unfinished. */
export async function finishAiReview(scanId: string, productId: string, out: Parameters<typeof runReview>[0], a: Parameters<typeof runReview>[1], av: AvaraAnalysis | null): Promise<void> {
  const db = await getDb();
  let rv: { review: ReviewResult | null; error?: string } = await runReview(out, a, av).catch((e) => ({ review: null, error: (e as Error).message }));
  if (!rv.review) {   // the model path itself failed: record it as a failed model call instead of a pending one
    const why = (rv.error ?? 'unknown error').split('\n')[0].slice(0, 120);
    rv = await runReview(out, a, av, { llm: { model: 'unavailable', async evaluate() { throw new Error(why); } } });
  }
  const review = rv.review;
  try {
    await db.transaction(async (tx) => {
      if (review) {
        for (const t of [schema.ruleFindings, schema.ruleExecutions, schema.categoryScores, schema.scanResults] as const) await tx.delete(t).where(eq(t.scanId, scanId));
        await saveReview(tx, scanId, productId, review, ruleLoader().loadAllRules()); await recordKnowledge(tx, scanId, productId, out.finalUrl, review);
      }
      await tx.update(schema.scans).set({ ai: mergeAi({ pending: false }) }).where(eq(schema.scans.id, scanId));   // merged in SQL: the fix writer may update the same field
    });
    if (review) { try { await detectPatterns(); } catch (e) { console.error('pattern detection failed', e); } }
  } catch (e) { console.error('AI review not saved', scanId, e); }
}

/** Early reveal of a confirmed blocker: the 320px probe found the main action covered by a fixed or sticky element that cannot be dismissed.
 *  The screenshot is saved first, then one record with the evidence and the fix (the same recipe the full report uses); the scan page shows it
 *  only once that record exists, so evidence and fix always arrive together. The full report still makes the final call. */
export type EarlyBlockerRecord = { savedAt: string; title: string; summary: string; evidence: string[]; viewport: { width: number; height: number }; action: { text: string; selector: string }; cover: { selector: string; position: string; text: string }; plainChange: string; prompts: Record<string, string>; hasShot: boolean };
async function saveEarlyBlocker(scanId: string, b: EarlyBlocker): Promise<void> {
  try {
    const m = b.measurement, c = b.classification, text = b.candidate.text, cover = m.cover!;
    // The desktop pass has not finished yet: it counts as clear, so CSS is given only with a breakpoint from the page's own rules.
    const fix = buildAvaraFix({ ruleId: 'mobile/primary-action-unusable', action: { text, selector: m.selector, html: m.html }, causes: c.causes, clippedBy: m.clippedBy, cover, width: b.width, evidence: { action: m.code?.action ?? null, cover: m.code?.cover ?? null, clippedBy: m.code?.clippedBy ?? null, seenAt: [b.width], clearAt: [1280] } });
    let hasShot = false; try { await putObject(`scans/${scanId}/early/blocker.jpg`, b.shot); hasShot = true; } catch { /* evidence text still stands */ }
    const rec: EarlyBlockerRecord = { savedAt: new Date().toISOString(), title: `A ${cover.position} element covers “${text}” at ${b.width}px wide`,
      summary: `On a phone (${b.width}px wide), ${cover.selector} (position: ${cover.position}) sits over “${text}”, so a tap lands on it instead.`,
      evidence: [`Measured at ${b.width}×${b.height}px: “${text}” (${m.selector}) is covered at its centre by ${cover.selector}${cover.text ? ` (“${cover.text.slice(0, 60)}”)` : ''}.`, ...c.reasons.slice(0, 2)],
      viewport: { width: b.width, height: b.height }, action: { text, selector: m.selector }, cover: { selector: cover.selector, position: cover.position, text: (cover.text ?? '').slice(0, 120) },
      plainChange: fix.plainChange, prompts: fix.fixes.aiPrompt, hasShot };
    await putObject(`scans/${scanId}/early/blocker.json`, JSON.stringify(rec));
  } catch (e) { console.error('early blocker not saved', scanId, e); }
}

/** Merges keys into scans.ai in one statement, so the AI review and the fix writer, finishing in either order, never overwrite each other. */
const mergeAi = (patch: Record<string, unknown>) => sql`coalesce(${schema.scans.ai}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;

/** Which saved recommendations reuse each issue's fix (their lead finding came from that issue), so a reworded fix reaches both. */
function recsByIssue(av: AvaraAnalysis | null, rows: ReturnType<typeof avaraRows> | null): Map<number, string[]> {
  const m = new Map<number, string[]>(); if (!av || !rows) return m;
  av.recommendations.forEach((r, k) => {
    if (r.fixes) return;   // a recommendation with its own repair fix does not use the issue's fix
    const lead = av.findings.find((f) => f.key === r.leadKey); const id = rows.recRows[k]?.id as string | undefined;
    if (lead?.issueIndex != null && id) m.set(lead.issueIndex, [...(m.get(lead.issueIndex) ?? []), id]);
  });
  return m;
}

/** The AI half of the fix writer: reword the Change line of rubric-mapped fixes, then update those issues and the prompts of the
 *  recommendations that reuse them. Whatever happens, scans.ai.fixes ends as done with the outcome, so nothing stays "still running". */
export async function finishFixWriter(scanId: string, out: ScanOutput, a: { issues: Parameters<typeof enrich>[1] }, issueIds: string[], recs: Map<number, string[]>): Promise<void> {
  const db = await getDb();
  const r = await enrich(out, a.issues).catch((e) => ({ used: false, changed: 0, reason: `AI fix wording failed (${(e as Error).message.split('\n')[0].slice(0, 80)}); Avara’s own fixes are shown.` } as Awaited<ReturnType<typeof enrich>>));
  try {
    await db.transaction(async (tx) => {
      for (const [n, i] of a.issues.entries()) {
        if (!i.aiEnriched || !i.fixes || !issueIds[n]) continue;
        await tx.update(schema.issues).set({ fixes: i.fixes, whatToChange: i.whatToChange, aiEnriched: true }).where(eq(schema.issues.id, issueIds[n]));
        const ids = recs.get(n) ?? [];
        if (ids.length) for (const t of ['lovable', 'bolt', 'v0', 'cursor'] as const) await tx.update(schema.generatedFixes).set({ content: i.fixes.aiPrompt[t] }).where(and(inArray(schema.generatedFixes.recommendationId, ids), eq(schema.generatedFixes.tool, t), eq(schema.generatedFixes.kind, 'prompt')));
      }
      await tx.update(schema.scans).set({ ai: mergeAi({ used: r.used, model: r.model ?? null, reason: r.reason ?? null, fixes: { state: 'done', changed: r.changed, refused: r.refused ?? 0, rubrics: r.rubrics ?? [], ms: r.ms ?? null } }) }).where(eq(schema.scans.id, scanId));
    });
  } catch (e) { console.error('AI fix wording not saved', scanId, (e as Error).message); }
}

/** Remeasure the main action with each repair's CSS applied, at both phone widths, and rebuild those fixes from the result (in place, so the
 *  recommendations that reuse them get the same text). A check that cannot run leaves the fix labelled "Suggested CSS". */
async function checkPatches(out: ScanOutput, av: AvaraAnalysis): Promise<{ status: 'ok' | 'skipped'; message?: string; ms?: number }> {
  const t0 = Date.now(); let n = 0;
  for (const f of av.findings) {
    const ctx = f.fixCtx; const css = f.fix?.fixes.code.language === 'css' ? f.fix.fixes.code.after : '';
    if (!ctx || !css || !f.fix) continue;
    const results = await remeasureWithCss(out.finalUrl, css, ctx.action.text, out.goal, [320, 390]);
    const again = buildAvaraFix({ ...ctx, patchCheck: { css, results } });
    Object.assign(f.fix.fixes, again.fixes); f.fix.plainChange = again.plainChange; f.fix.title = again.title; n++;
  }
  return n ? { status: 'ok', ms: Date.now() - t0 } : { status: 'skipped', message: 'No repair had paste-ready CSS to test.' };
}
