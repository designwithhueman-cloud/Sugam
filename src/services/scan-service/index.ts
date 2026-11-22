// Turns a finished scan into the website context the rule engine reads, and runs the review. The context is observations only; no rules.
import type { ScanOutput } from '../../../scanner/scanner.ts';
import type { Analysis } from '../../../analysis/analyze.ts';
import type { AvaraAnalysis } from '../../../analysis/avara/build.ts';
import { RuleEngine } from '../../engines/rule-engine/RuleEngine.ts';
import { ruleLoader } from '../../engines/rule-engine/RuleLoader.ts';
import { createLlmClient } from '../../engines/rule-engine/llm/index.ts';
import { derivedReports } from './derived.ts';
import { trackReports } from './tracks.ts';
import type { DetectorReport, LlmClient, ReviewResult, WebsiteContext } from '../../engines/rule-engine/RuleTypes.ts';

const short = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const EXTRA_FED = new Set(['sugam/auth-autocomplete-off', 'sugam/auth-captcha', 'sugam/auth-paste-blocked', 'sugam/autofocus', 'sugam/autoplay-no-pause', 'sugam/dragging-alternative', 'sugam/forced-colors-optout', 'sugam/form-autocomplete-missing', 'sugam/form-error-not-linked', 'sugam/form-group-name', 'sugam/form-input-type', 'sugam/form-label-not-visible', 'sugam/form-required-not-marked', 'sugam/heading-structure', 'sugam/image-of-text', 'sugam/new-tab-warning', 'sugam/no-main-landmark', 'sugam/non-text-contrast', 'sugam/placeholder-only-label', 'sugam/positive-tabindex', 'sugam/small-text', 'sugam/text-spacing', 'sugam/vague-link-text', 'sugam/voice-name-not-first']);
/** For every detector id any rule names: did it run on this scan, and what did it find. */
export function detectorReports(out: ScanOutput, a: Analysis | null, av: AvaraAnalysis | null, ids: Iterable<string>): Record<string, DetectorReport> {
  const an = out.analyzers; const ok = (k: string) => an[k]?.status === 'ok';
  const reports: Record<string, DetectorReport> = {};
  const derived = derivedReports(out);
  for (const id of ids) {
    if (derived[id]) { reports[id] = derived[id]; continue; }
    const key = id.startsWith('mobile/') || id === 'accessibility/reflow-function-loss' ? 'mobile' : id.startsWith('workflow/') ? 'workflow' : id.startsWith('perf/') ? 'performance' : null;
    // A heuristic fed by the extra in-page capture, or the reduced-motion sample, ran only when that capture came back; otherwise it is unknown, not a pass.
    const capture = EXTRA_FED.has(id) ? out.viewports.some((v) => v.heuristics?.extra) : id === 'sugam/reduced-motion' ? out.viewports.some((v) => v.motion) : true;
    const ran = (key ? ok(key) : out.viewports.length > 0) && capture;
    const hits: DetectorReport['hits'] = [];
    for (const i of a?.issues ?? []) if (i.ruleId === id && i.bucket !== 'verified_pass') hits.push({ bucket: i.bucket === 'confirmed_failure' ? 'confirmed_failure' : 'needs_review', title: i.title, severity: i.severity, summary: `${i.title}: ${i.instances.length} element${i.instances.length === 1 ? '' : 's'}${i.instances[0] ? `, for example ${i.instances[0].selector}` : ''}.`, evidence: i.instances.slice(0, 3).map((x) => short(`${x.selector}  ${x.html}`)) });
    for (const f of av?.findings ?? []) if (f.rule.id === id && f.bucket !== 'verified_pass') hits.push({ bucket: f.bucket === 'confirmed_failure' ? 'confirmed_failure' : 'needs_review', title: f.title, severity: f.severity, summary: f.summary, evidence: f.evidence.slice(0, 3).map((e) => short(JSON.stringify(e.data))) });
    reports[id] = { ran, hits, note: ran ? undefined : !capture ? (id === 'sugam/reduced-motion' ? 'The reduced-motion sample was not captured.' : 'The in-page form and structure capture did not complete.') : (key ? an[key]?.message : 'No page was captured.'), analyzerError: !ran && !!key && an[key]?.status === 'failed' };
  }
  return reports;
}

export function buildWebsiteContext(out: ScanOutput, a: Analysis | null, av: AvaraAnalysis | null, detectorIds: Iterable<string>): WebsiteContext {
  const desktop = out.viewports.find((v) => v.name === 'desktop'); const mobile = out.viewports.find((v) => v.name === 'mobile');
  const page = (desktop?.pageContext ?? {}) as Record<string, unknown>;
  const probe = (v: typeof desktop) => v?.avara ? { candidates: v.avara.candidates.map((c) => ({ text: c.candidate.text, level: c.classification?.level ?? null, reasons: c.classification?.reasons ?? [], width: c.measurement?.width, height: c.measurement?.height, visibleRatio: c.measurement?.visibleRatio })), workflow: v.avara.workflow ?? null } : null;
  // heroLayout is DIFF-002's diagnostic capture: kept out of what rules and models read until it is validated.
  const { bodyText, heroLayout: _heroLayout, ...rest } = page; void _heroLayout;
  return {
    url: out.finalUrl, goal: out.goal,
    screenshots: out.viewports.map((v) => ({ viewport: v.name, mime: 'image/jpeg', data: v.viewportShot })),
    pageContent: typeof bodyText === 'string' ? bodyText : '',
    metadata: { ...rest, mobile: { pageWidth: mobile?.pageWidth, viewportWidth: mobile?.width, action: probe(mobile) }, desktopAction: probe(desktop), workflow: av?.coverage ?? [] },
    lighthouseResults: out.perf ? { median: out.perf.median, range: out.perf.range, runs: out.perf.runs.length, conditions: out.perf.conditions, field: out.perf.field, diagnostics: out.perf.diagnostics } as unknown as Record<string, unknown> : null,
    axeResults: desktop ? { version: out.engine.axe, violations: desktop.axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })), incomplete: desktop.axe.incomplete.map((v) => v.id), passes: desktop.axe.passes.length } : null,
    detectors: detectorReports(out, a, av, detectorIds),
  };
}

/** Runs the whole review. Never throws: a failure becomes a note and the rest of the report is unaffected. */
export async function runReview(out: ScanOutput, a: Analysis | null, av: AvaraAnalysis | null, opts: { llm?: LlmClient | null; aiPending?: boolean } = {}): Promise<{ review: ReviewResult | null; error?: string }> {
  try {
    const loader = ruleLoader(); const ids = new Set(loader.loadAllRules().flatMap((r) => (r.evaluator && 'detectors' in r.evaluator ? r.evaluator.detectors ?? [] : [])));
    const ctx = { ...buildWebsiteContext(out, a, av, ids), aiPending: opts.aiPending };
    const llm = opts.llm === undefined ? createLlmClient() : opts.llm;
    const review = await new RuleEngine(loader, llm).review(ctx);
    const sig = out.viewports.find((v) => v.name === 'desktop')?.signals ?? null;
    let local = false; try { const h = new URL(out.finalUrl).hostname; local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'); } catch { /* keep false */ }
    return { review: { ...review, tracks: trackReports(sig, local) } };
  } catch (e) { return { review: null, error: (e as Error).message.split('\n')[0].slice(0, 160) }; }
}
