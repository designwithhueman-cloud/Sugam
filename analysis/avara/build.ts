// Avara's analysis: turns what the scan observed (accessibility issues, the main action at 320px and desktop, what happens when it is activated,
// lab performance) into findings that each carry a versioned rule, evidence, who is affected and how sure we are; groups findings that one change
// fixes; and ranks up to five actions across categories. Pure functions of the scan output, so they can be tested without a browser.
import type { ScanOutput } from '../../scanner/scanner.ts';
import type { Classification, Measurement } from '../../scanner/avara.ts';
import { THRESHOLDS } from '../../scanner/perf.ts';
import type { DraftIssue, Analysis, Severity } from '../analyze.ts';
import type { FixSet } from '../../lib/db/schema.ts';
import { RULES, RULE_VERSION, accessibilityRule, type Category, type RuleDef } from '../../lib/avara/rules.ts';
import { plainTitle } from '../../lib/plain.ts';
import { buildAvaraFix, type FixContext } from './fixes.ts';

export type Confidence = 'high' | 'medium' | 'low';
export type Tier = 'fix_immediately' | 'fix_before_launch' | 'improve_later';
export type EvidenceDraft = { kind: 'dom' | 'measurement' | 'step' | 'metric'; viewport?: string; data: Record<string, unknown> };
export type FindingDraft = {
  key: string; category: Category; rule: RuleDef; bucket: 'confirmed_failure' | 'needs_review' | 'verified_pass'; severity: Severity; confidence: Confidence;
  title: string; summary: string; affects: string; trying: string; consequence: string; consequenceKind: 'observed' | 'hypothesis';
  goalImpact: 'blocks' | 'hinders' | 'none'; fingerprint: string; repairKey: string; verify: Record<string, unknown> | null;
  evidence: EvidenceDraft[]; issueIndex?: number; fix?: { title: string; fixes: FixSet; plainChange: string };
};
export type RecommendationDraft = { rank: number; tier: Tier; title: string; sentence: string; repairKey: string; categories: Category[]; findingKeys: string[]; leadKey: string; fixes: FixSet | null };
export type AvaraAnalysis = { findings: FindingDraft[]; recommendations: RecommendationDraft[]; action: { text: string; selector: string; inferred: boolean } | null; coverage: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const SEV: Record<Severity, number> = { critical: 100, serious: 70, moderate: 40, minor: 15 };
const CONF: Record<Confidence, number> = { high: 1, medium: 0.85, low: 0.6 };
const WHO: Record<string, string> = { screen_reader: 'people who use screen readers', keyboard: 'people who use a keyboard', speech: 'people who use voice control', visual: 'people with low vision', hearing: 'people who are deaf or hard of hearing', cognitive: 'people with cognitive or attention needs', motor: 'people with limited dexterity' };
const BLOCKS = new Set(['sugam/focus-offscreen', 'sugam/focus-obscured', 'button-name', 'link-name', 'sugam/non-semantic-clickable', 'input-button-name']);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sec = (ms: number) => `${Math.round(ms / 100) / 10} s`;
// One plain phrase for why a measured action fails, used in the one-sentence explanation of a priority.
function phrase(c: Classification | null, m: Measurement | null): string {
  const k = c?.causes[0]?.kind;
  if (!m || !k) return 'it does not work as expected';
  return k === 'covered' ? `${m.cover?.selector || 'another element'} covers it` : k === 'clipped' ? (m.clippedBy ? `it is cut off by ${m.clippedBy}` : 'part of it is cut off') : k === 'offscreen' ? 'it runs past the edge of the screen'
    : k === 'hidden' ? 'it is not shown' : k === 'ignored' ? 'it ignores taps' : k === 'small' ? `it is only ${m.width} by ${m.height} px` : 'it needs sideways scrolling';
}

export function analyzeAvara(out: ScanOutput, a: Analysis): AvaraAnalysis {
  const findings: FindingDraft[] = [];
  const coverage: string[] = [];
  const D = out.viewports.find((v) => v.name === 'desktop')?.avara ?? null;
  const M = out.viewports.find((v) => v.name === 'mobile')?.avara ?? null;
  const top = D?.candidates[0] ?? null;
  const actionText = top?.candidate.text ?? M?.candidates[0]?.candidate.text ?? null;
  const actionSel = top?.candidate.selector ?? M?.candidates[0]?.candidate.selector ?? null;
  const inferred = !out.goal || top?.candidate.how !== 'goal';
  const goalVerb = out.goal ? lower(out.goal) : actionText ? lower(actionText) : 'use the page';
  const action = actionText && actionSel ? { text: actionText, selector: actionSel, inferred } : null;
  const aKey = actionText ? norm(actionText) : 'page';
  if (!action) coverage.push('Sugam could not find a main action on this page, so the mobile and workflow checks on it did not run.');
  else if (inferred) coverage.push(`The main action, “${actionText}”, was chosen by Sugam from the page. Confirm the goal when you scan to make these checks sharper.`);

  const push = (f: Omit<FindingDraft, 'fingerprint'> & { fp: string }) => { const { fp, ...rest } = f; findings.push({ ...rest, fingerprint: fp }); };
  const rule = (id: string) => { const r = RULES[id]; if (!r) throw new Error(`Unknown rule ${id}`); return r; };
  const sentenceMobile = 'people on phones (a 320px-wide screen, or anyone who zooms in)';

  // ---------- mobile responsiveness: the main action at 320px against desktop ----------
  const mCand = actionText && M ? M.candidates.find((c) => norm(c.candidate.text) === aKey) ?? null : null;
  const measEv = (vp: string, m: Measurement | null, c: Classification | null): EvidenceDraft[] => m ? [{ kind: 'dom', viewport: vp, data: { selector: m.selector, html: m.html } }, { kind: 'measurement', viewport: vp, data: { phrase: phrase(c, m), box: m.box, width: m.width, height: m.height, visibleRatio: m.visibleRatio, clippedBy: m.clippedBy, cover: m.cover, outsideX: m.outsideX, viewportWidth: m.viewportWidth, pageWidth: m.pageWidth, level: c?.level, reasons: c?.reasons } }] : [];
  if (action && M) {
    if (!mCand) {
      push({ key: 'mobile-missing', category: 'mobile', rule: rule('mobile/primary-action-missing'), bucket: 'confirmed_failure', severity: 'critical', confidence: inferred ? 'medium' : 'high',
        title: `“${actionText}” is missing at 320px wide`, summary: `On desktop the main action is “${actionText}”. At 320px wide Sugam could not find it among the page's likely main actions (${M.candidates.map((c) => `“${c.candidate.text}”`).join(', ') || 'none found'}).`,
        affects: sentenceMobile, trying: goalVerb, consequence: `Some visitors on phones may leave without being able to ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: 'blocks',
        repairKey: `action:${aKey}`, fp: `mobile|missing|${aKey}`, verify: { kind: 'action', viewport: 'mobile', text: actionText, selector: actionSel, goal: out.goal },
        evidence: [{ kind: 'dom', viewport: 'desktop', data: { selector: actionSel, html: top?.candidate.html } }, { kind: 'measurement', viewport: 'mobile', data: { candidatesSeen: M.candidates.map((c) => c.candidate.text), viewportWidth: M.width } }] });
    } else if (mCand.measurement && mCand.classification) {
      const c = mCand.classification, m = mCand.measurement;
      // A fixed or sticky element covering the working action is its own, more specific cause (MOB-013) than "the action cannot be used".
      const sticky = c.level !== 'ok' && c.causes[0]?.kind === 'covered' && !!m.cover && /^(fixed|sticky)$/.test(m.cover.position ?? '');
      const ctx: FixContext = { ruleId: c.level === 'unusable' ? 'mobile/primary-action-unusable' : 'mobile/primary-action-inconvenient', action: { text: actionText!, selector: m.selector, html: m.html }, causes: c.causes, clippedBy: m.clippedBy, cover: m.cover, width: M.width };
      if (sticky) {
        push({ key: 'mobile-sticky', category: 'mobile', rule: rule('mobile/sticky-ui-interference'), bucket: 'confirmed_failure', severity: c.level === 'unusable' ? 'critical' : 'serious', confidence: inferred ? 'medium' : 'high',
          title: `A ${m.cover!.position} element covers “${actionText}” at 320px wide`, summary: `At 320px wide ${m.cover!.selector} (position: ${m.cover!.position}) covers “${actionText}”${c.level === 'unusable' ? ', so a tap lands on it instead' : ''}. On desktop “${actionText}” is not covered.`,
          affects: sentenceMobile, trying: goalVerb, consequence: `Some visitors on phones may leave without being able to ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: c.level === 'unusable' ? 'blocks' : 'hinders',
          repairKey: `action:${aKey}`, fp: `mobile|sticky|${aKey}`, verify: { kind: 'action', viewport: 'mobile', text: actionText, selector: m.selector, goal: out.goal }, evidence: measEv('mobile', m, c), fix: buildAvaraFix(ctx) });
      } else if (c.level === 'unusable') {
        push({ key: 'mobile-unusable', category: 'mobile', rule: rule('mobile/primary-action-unusable'), bucket: 'confirmed_failure', severity: 'critical', confidence: inferred ? 'medium' : 'high',
          title: `“${actionText}” cannot be used at 320px wide`, summary: `At 320px wide, “${actionText}” ${lower(c.reasons[0])} On desktop it works as expected.`,
          affects: sentenceMobile, trying: goalVerb, consequence: `Some visitors on phones may leave without being able to ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: 'blocks',
          repairKey: `action:${aKey}`, fp: `mobile|unusable|${aKey}`, verify: { kind: 'action', viewport: 'mobile', text: actionText, selector: m.selector, goal: out.goal }, evidence: measEv('mobile', m, c), fix: buildAvaraFix(ctx) });
        // The same cause is also an accessibility failure (WCAG 1.4.10: function lost at 320px). It is a separate finding in its own category but shares the repair.
        push({ key: 'a11y-reflow', category: 'accessibility', rule: rule('accessibility/reflow-function-loss'), bucket: 'confirmed_failure', severity: 'serious', confidence: inferred ? 'medium' : 'high',
          title: `Part of the page cannot be used at 320px wide`, summary: `“${actionText}” cannot be used at 320px wide (${phrase(c, m)}). People who zoom to 400% on a desktop see the same layout.`, affects: 'people who zoom in, and people on small screens', trying: goalVerb,
          consequence: `These visitors may not be able to ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: 'blocks', repairKey: `action:${aKey}`, fp: `accessibility|reflow-function-loss|${aKey}`,
          verify: { kind: 'action', viewport: 'mobile', text: actionText, selector: m.selector, goal: out.goal }, evidence: measEv('mobile', m, c) });
      } else if (c.level === 'inconvenient') {
        push({ key: 'mobile-inconvenient', category: 'mobile', rule: rule('mobile/primary-action-inconvenient'), bucket: 'confirmed_failure', severity: m.width < 24 || m.height < 24 ? 'serious' : 'moderate', confidence: inferred ? 'medium' : 'high',
          title: `“${actionText}” is hard to use at 320px wide`, summary: `At 320px wide a visitor can still use “${actionText}”, but it is harder: ${lower(c.reasons.join(' '))}`,
          affects: sentenceMobile, trying: goalVerb, consequence: `Some visitors on phones may give up or make mistakes. This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: 'hinders',
          repairKey: `action:${aKey}`, fp: `mobile|inconvenient|${aKey}`, verify: { kind: 'action', viewport: 'mobile', text: actionText, selector: m.selector, goal: out.goal }, evidence: measEv('mobile', m, c), fix: buildAvaraFix(ctx) });
      } else {
        push({ key: 'mobile-ok', category: 'mobile', rule: rule('mobile/primary-action-unusable'), bucket: 'verified_pass', severity: 'minor', confidence: inferred ? 'medium' : 'high', title: `“${actionText}” is usable at 320px wide`, summary: `At 320px wide “${actionText}” is fully on screen, not covered, and large enough (${m.width} by ${m.height} px).`,
          affects: sentenceMobile, trying: goalVerb, consequence: 'No consequence: the check passed.', consequenceKind: 'observed', goalImpact: 'none', repairKey: `action:${aKey}`, fp: `mobile|ok|${aKey}`, verify: null, evidence: measEv('mobile', m, c) });
      }
    }
  }
  const mw = out.viewports.find((v) => v.name === 'mobile');
  if (mw && mw.pageWidth > mw.width + 1) {
    const offenders = (mw.heuristics.reflow?.offenders ?? []).slice(0, 3).map((o) => ({ selector: o.selector, html: o.html }));
    push({ key: 'mobile-hscroll', category: 'mobile', rule: rule('mobile/horizontal-scroll'), bucket: 'confirmed_failure', severity: mw.pageWidth - mw.width >= 120 ? 'serious' : 'moderate', confidence: 'high',
      title: 'The page scrolls sideways at 320px wide', summary: `At 320px wide the page is ${mw.pageWidth}px wide, so a visitor has to scroll sideways to see all of it.`, affects: sentenceMobile, trying: 'read and use the page', consequence: 'Some visitors on phones may miss content or controls. This is a hypothesis; Sugam did not measure conversions.', consequenceKind: 'hypothesis', goalImpact: 'hinders',
      repairKey: 'mobile:hscroll', fp: 'mobile|hscroll|page', verify: { kind: 'hscroll', viewport: 'mobile' }, evidence: [{ kind: 'measurement', viewport: 'mobile', data: { pageWidth: mw.pageWidth, viewportWidth: mw.width } }, ...offenders.map((o) => ({ kind: 'dom' as const, viewport: 'mobile', data: o }))] });
  }

  // ---------- UX and workflow: what happens when the main action is activated ----------
  const wfRule: Record<string, string> = { could_not_activate: 'workflow/action-cannot-be-activated', no_visible_change: 'workflow/action-no-response', form_not_reached: 'workflow/first-field-unreachable', form_reached: 'workflow/first-field-unreachable' };
  for (const [vp, P] of [['desktop', D], ['mobile', M]] as const) {
    const wf = P?.workflow; const cand = P?.candidates[0];
    if (!P || !wf || !cand || !actionText) continue;
    coverage.push(`${vp === 'desktop' ? 'Desktop' : 'Phone (320px)'}: ${wf.coverage}`);
    const stepEv: EvidenceDraft = { kind: 'step', viewport: vp, data: { steps: wf.steps, outcome: wf.outcome, coverage: wf.coverage } };
    const label = vp === 'mobile' ? 'at 320px wide' : 'on desktop';
    const base = { affects: vp === 'mobile' ? sentenceMobile : 'visitors on a desktop browser', trying: goalVerb, consequenceKind: 'hypothesis' as const, repairKey: `action:${aKey}` };
    const verify = { kind: 'workflow', viewport: vp, text: actionText, selector: cand.candidate.selector, goal: out.goal };
    if (wf.outcome === 'could_not_activate') {
      const c = cand.classification; const m = cand.measurement;
      push({ ...base, key: `wf-${vp}-activate`, category: 'ux_workflow', rule: rule(wfRule.could_not_activate), bucket: 'confirmed_failure', severity: 'critical', confidence: c?.level === 'unusable' && !inferred ? 'high' : 'medium',
        title: `“${actionText}” could not be activated ${label}`, summary: `Sugam tried to activate “${actionText}” ${label}: ${wf.reason}`, consequence: `Some visitors may leave without being able to ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, goalImpact: 'blocks',
        fp: `workflow|${vp}|activate|${aKey}`, verify, evidence: [stepEv, ...(m ? measEv(vp, m, c ?? null) : [])],
        fix: m && c ? buildAvaraFix({ ruleId: 'workflow/action-cannot-be-activated', action: { text: actionText, selector: m.selector, html: m.html }, causes: c.causes, clippedBy: m.clippedBy, cover: m.cover, width: P.width }) : undefined });
    } else if (wf.outcome === 'no_visible_change') {
      push({ ...base, key: `wf-${vp}-nochange`, category: 'ux_workflow', rule: rule(wfRule.no_visible_change), bucket: 'confirmed_failure', severity: 'serious', confidence: inferred ? 'low' : 'medium',
        title: `Activating “${actionText}” ${label} shows no response`, summary: wf.reason, consequence: `Some visitors may think the button is broken and leave. This is a hypothesis; Sugam did not measure conversions.`, goalImpact: 'hinders',
        fp: `workflow|${vp}|nochange|${aKey}`, verify, evidence: [stepEv, { kind: 'dom', viewport: vp, data: { selector: cand.candidate.selector, html: cand.candidate.html } }],
        fix: buildAvaraFix({ ruleId: 'workflow/action-no-response', action: { text: actionText, selector: cand.candidate.selector, html: cand.candidate.html }, causes: [], width: P.width }) });
    } else if (wf.outcome === 'form_not_reached') {
      push({ ...base, key: `wf-${vp}-field`, category: 'ux_workflow', rule: rule(wfRule.form_not_reached), bucket: 'confirmed_failure', severity: 'serious', confidence: inferred ? 'medium' : 'high',
        title: `The first field cannot be reached after “${actionText}” ${label}`, summary: wf.reason, consequence: `Some visitors may not be able to finish ${goalVerb}. This is a hypothesis; Sugam did not measure conversions.`, goalImpact: 'blocks',
        fp: `workflow|${vp}|field|${aKey}`, verify, evidence: [stepEv, ...(wf.firstField ? [{ kind: 'dom' as const, viewport: vp, data: { selector: wf.firstField.selector, name: wf.firstField.name } }] : [])],
        fix: buildAvaraFix({ ruleId: 'workflow/first-field-unreachable', action: { text: actionText, selector: cand.candidate.selector, html: cand.candidate.html }, causes: [], width: P.width, workflow: { reason: wf.reason, firstField: wf.firstField?.name, outcome: wf.outcome } }) });
    } else if (wf.outcome === 'form_reached') {
      push({ ...base, key: `wf-${vp}-ok`, category: 'ux_workflow', rule: rule('workflow/first-field-unreachable'), bucket: 'verified_pass', severity: 'minor', confidence: inferred ? 'medium' : 'high', title: `A visitor can reach the first field after “${actionText}” ${label}`, summary: wf.steps.at(-1) || wf.reason,
        consequence: 'No consequence: the check passed.', consequenceKind: 'observed', goalImpact: 'none', fp: `workflow|${vp}|ok|${aKey}`, verify, evidence: [stepEv] });
    }
  }

  // ---------- performance: lab numbers from mobile Lighthouse ----------
  const perf = out.perf;
  if (perf) {
    const m = perf.median; const runs = perf.runs.length;
    const fieldText = perf.field.available ? perf.field.note : perf.field.reason;
    const byGoogle = perf.conditions.runBy === 'google' ? ' (run by Google PageSpeed Insights, not by Avara)' : '';
    const spread = perf.range.lcp ? (perf.range.lcp[1] - perf.range.lcp[0]) / Math.max(perf.range.lcp[1], 1) : 1;
    const conf: Confidence = runs >= 3 && spread < 0.15 ? 'high' : 'medium';
    const metricEv = (metric: 'lcp' | 'cls'): EvidenceDraft => ({ kind: 'metric', data: { metric, value: m[metric], runs: perf.runs.map((r) => r[metric]), range: perf.range[metric], conditions: perf.conditions, lab: true, field: fieldText,
      // Real-visitor numbers for the same metric, kept apart from the lab value above. Null unless Google actually has them.
      fieldMetric: perf.field.available && perf.field.metrics[metric] ? { ...perf.field.metrics[metric], scope: perf.field.scope, period: perf.field.periodNote, source: perf.field.source } : null } });
    const lcpCtx: FixContext = { ruleId: 'perf/lcp', action: { text: 'main content', selector: perf.diagnostics.lcpElement?.selector || 'body', html: perf.diagnostics.lcpElement?.snippet || '' }, causes: [], width: 0, perf: { lcpElement: perf.diagnostics.lcpElement, renderBlocking: perf.diagnostics.renderBlocking } };
    if (m.lcp != null && m.lcp > THRESHOLDS.lcp.good) {
      const poor = m.lcp > THRESHOLDS.lcp.poor;
      const cause = perf.diagnostics.lcpLazyLoaded ? 'perf/lcp-image-lazy' : null;
      push({ key: 'perf-lcp', category: 'performance', rule: rule('perf/lcp'), bucket: 'confirmed_failure', severity: poor ? 'serious' : 'moderate', confidence: conf,
        title: `The main content takes ${sec(m.lcp)} to appear on a phone`, summary: `Lab LCP on mobile Lighthouse${byGoogle} was ${sec(m.lcp)} (${runs} run${runs === 1 ? '' : 's'}; good is 2.5 s or less). Test: ${perf.conditions.emulatedDevice}, ${perf.conditions.network}, ${perf.conditions.cpuSlowdown}.`,
        affects: 'visitors on phones and slower connections', trying: goalVerb, consequence: 'Slow pages tend to lose some visitors before they can act. This is a hypothesis; Sugam did not measure your visitors or conversions.', consequenceKind: 'hypothesis', goalImpact: 'hinders',
        repairKey: cause ? 'perf:lcp-image' : 'perf:lcp', fp: 'performance|lcp|page', verify: { kind: 'perf', metric: 'lcp', before: m.lcp, runs, range: perf.range.lcp }, evidence: [metricEv('lcp'), ...(perf.diagnostics.lcpElement ? [{ kind: 'dom' as const, data: perf.diagnostics.lcpElement as unknown as Record<string, unknown> }] : [])],
        fix: buildAvaraFix({ ...lcpCtx, ruleId: cause || 'perf/lcp' }) });
      if (cause) push({ key: 'perf-lcp-lazy', category: 'performance', rule: rule(cause), bucket: 'confirmed_failure', severity: 'serious', confidence: 'high', title: 'The main image is lazy-loaded', summary: `Lighthouse reports the largest element (${perf.diagnostics.lcpElement?.selector || 'an image'}) is lazy-loaded, which delays it.`,
        affects: 'visitors on phones and slower connections', trying: goalVerb, consequence: 'It makes the main content appear later. This is a hypothesis about visitors; the delay itself was measured.', consequenceKind: 'hypothesis', goalImpact: 'hinders', repairKey: 'perf:lcp-image', fp: 'performance|lcp-lazy|page',
        verify: { kind: 'perf', metric: 'lcp', before: m.lcp, runs, range: perf.range.lcp }, evidence: [{ kind: 'dom', data: (perf.diagnostics.lcpElement ?? {}) as Record<string, unknown> }], fix: buildAvaraFix({ ...lcpCtx, ruleId: cause }) });
    } else if (m.lcp != null) push({ key: 'perf-lcp-ok', category: 'performance', rule: rule('perf/lcp'), bucket: 'verified_pass', severity: 'minor', confidence: conf, title: `The main content appears in ${sec(m.lcp)} on a phone`, summary: `Lab LCP ${sec(m.lcp)} is within the 2.5 s guideline.`, affects: 'visitors on phones', trying: goalVerb, consequence: 'No consequence: the check passed.', consequenceKind: 'observed', goalImpact: 'none', repairKey: 'perf:lcp', fp: 'performance|lcp-ok|page', verify: null, evidence: [metricEv('lcp')] });
    if (m.cls != null && m.cls > THRESHOLDS.cls.good) {
      const poor = m.cls > THRESHOLDS.cls.poor; const unsized = perf.diagnostics.unsizedImages.length > 0;
      push({ key: 'perf-cls', category: 'performance', rule: rule(unsized ? 'perf/cls-unsized-images' : 'perf/cls'), bucket: 'confirmed_failure', severity: poor ? 'serious' : 'moderate', confidence: conf,
        title: `The layout shifts while loading (score ${Math.round(m.cls * 1000) / 1000})`, summary: `Lab CLS${byGoogle} was ${Math.round(m.cls * 1000) / 1000} (good is 0.1 or less)${unsized ? `; ${perf.diagnostics.unsizedImages.length} image(s) have no width and height` : ''}.`,
        affects: 'visitors on phones', trying: goalVerb, consequence: 'Content that jumps can make visitors tap the wrong thing. This is a hypothesis; Sugam did not measure mistakes.', consequenceKind: 'hypothesis', goalImpact: 'hinders', repairKey: 'perf:cls', fp: 'performance|cls|page',
        verify: { kind: 'perf', metric: 'cls', before: m.cls, runs, range: perf.range.cls }, evidence: [metricEv('cls'), ...perf.diagnostics.unsizedImages.slice(0, 3).map((i) => ({ kind: 'dom' as const, data: i as unknown as Record<string, unknown> }))],
        fix: unsized ? buildAvaraFix({ ruleId: 'perf/cls-unsized-images', action: { text: 'images', selector: perf.diagnostics.unsizedImages[0].selector, html: perf.diagnostics.unsizedImages[0].snippet }, causes: [], width: 0, perf: { unsized: perf.diagnostics.unsizedImages } }) : undefined });
    } else if (m.cls != null) push({ key: 'perf-cls-ok', category: 'performance', rule: rule('perf/cls'), bucket: 'verified_pass', severity: 'minor', confidence: conf, title: 'The layout stays steady while loading', summary: `Lab CLS ${Math.round(m.cls * 1000) / 1000} is within the 0.1 guideline.`, affects: 'visitors on phones', trying: goalVerb, consequence: 'No consequence: the check passed.', consequenceKind: 'observed', goalImpact: 'none', repairKey: 'perf:cls', fp: 'performance|cls-ok|page', verify: null, evidence: [metricEv('cls')] });
    coverage.push(`Performance findings are lab measurements (${perf.conditions.tool} ${perf.conditions.version}, ${runs} run${runs === 1 ? '' : 's'}).`, fieldText);
  } else if (out.analyzers.performance?.status !== 'ok') coverage.push(`Performance: ${out.analyzers.performance?.message || 'not measured'}`);

  // ---------- accessibility: the existing issues, brought into the same model ----------
  const related = (i: DraftIssue) => !!actionSel && i.instances.some((x) => x.selector === actionSel || x.selector.startsWith(actionSel + ' ') || actionSel.startsWith(x.selector + ' '));
  a.issues.forEach((i, idx) => {
    if (i.bucket === 'verified_pass') return;
    const rel = related(i); const blocks = rel && BLOCKS.has(i.ruleId) && (i.severity === 'critical' || i.severity === 'serious');
    const who = i.impactGroups.map((g) => WHO[g]).filter(Boolean);
    const first = i.instances[0];
    const verifyAxe = i.source === 'axe' && first ? { kind: 'axe', ruleId: i.ruleId, selector: first.selector, viewport: first.viewports.includes('desktop') ? 'desktop' : 'mobile' } : null;
    const verifyAction = rel && actionText ? { kind: 'action', viewport: 'mobile', text: actionText, selector: actionSel, goal: out.goal } : null;
    const title = plainTitle(i.ruleId, i.title);
    push({ key: `a11y-${idx}`, category: 'accessibility', rule: accessibilityRule(i.ruleId, i.title, i.wcag, i.helpUrl, i.source, out.engine.axe), bucket: i.bucket, severity: i.severity, confidence: i.bucket === 'needs_review' ? 'low' : i.source === 'axe' ? 'high' : 'medium',
      title, summary: `${i.title}. ${i.instances.length} element${i.instances.length === 1 ? '' : 's'} on this page${first ? `, for example ${first.selector}` : ''}.`, affects: who.length ? who.join(' and ') : 'some visitors', trying: rel && actionText ? goalVerb : 'use the page',
      consequence: `${rel ? 'Visitors who hit this may not be able to ' + goalVerb + '.' : 'Visitors who hit this may be unable to use part of the page.'} This is a hypothesis; Sugam did not measure conversions.`, consequenceKind: 'hypothesis', goalImpact: blocks ? 'blocks' : rel ? 'hinders' : 'none',
      // Keyboard focus hidden by the very element that covers the action is the same cause, so it joins that repair. Anything else on the same element stays its own group.
      repairKey: rel && actionText && i.ruleId === 'sugam/focus-obscured' && findings.some((x) => x.rule.id === 'mobile/sticky-ui-interference') ? `action:${aKey}` : `a11y:${i.ruleId}:${i.componentKey}`, fp: `accessibility|${i.ruleId}|${i.componentKey}`, verify: verifyAxe ?? verifyAction,
      evidence: i.instances.slice(0, 3).map((x) => ({ kind: 'dom' as const, viewport: x.viewports[0], data: { selector: x.selector, html: x.html, detail: x.detail ?? null } })), issueIndex: idx });
  });

  return { findings, recommendations: rank(findings, out, action), action, coverage };
}

// ---------- ranking: group findings that one change fixes, then order up to five actions ----------
// When several rules explain one repair, the most specific cause owns it (a covering banner over "the action cannot be used").
const SPECIFIC = new Set(['mobile/sticky-ui-interference']);
const ORDER: Tier[] = ['fix_immediately', 'fix_before_launch', 'improve_later'];
function score(f: FindingDraft) { return (SEV[f.severity] + (f.goalImpact === 'blocks' ? 60 : f.goalImpact === 'hinders' ? 25 : 0)) * CONF[f.confidence]; }

function rank(findings: FindingDraft[], out: ScanOutput, action: AvaraAnalysis['action']): RecommendationDraft[] {
  const groups = new Map<string, FindingDraft[]>();
  for (const f of findings.filter((x) => x.bucket === 'confirmed_failure')) groups.set(f.repairKey, [...(groups.get(f.repairKey) ?? []), f]);
  const recs = [...groups.entries()].map(([repairKey, members]) => {
    const lead = [...members].sort((a, b) => (SPECIFIC.has(b.rule.id) ? 1 : 0) - (SPECIFIC.has(a.rule.id) ? 1 : 0) || score(b) - score(a))[0];
    const cats = [...new Set(members.map((m) => m.category))];
    const g = score(lead) + 8 * (cats.length - 1) + 4 * (members.length - 1);
    const tier: Tier = members.some((m) => m.goalImpact === 'blocks' && (m.severity === 'critical' || m.severity === 'serious') && m.confidence !== 'low') ? 'fix_immediately'
      : members.some((m) => m.severity === 'critical' || m.severity === 'serious' || m.goalImpact === 'hinders') ? 'fix_before_launch' : 'improve_later';
    // The fix of a shared repair is the one that removes the cause (mobile or workflow evidence), not the accessibility symptom.
    const fixed = members.filter((m) => m.fix).sort((a, b) => (SPECIFIC.has(b.rule.id) ? 1 : 0) - (SPECIFIC.has(a.rule.id) ? 1 : 0) || score(b) - score(a))[0];
    return { repairKey, members, lead, cats, g, tier, fixed };
  }).sort((a, b) => ORDER.indexOf(a.tier) - ORDER.indexOf(b.tier) || b.g - a.g).slice(0, 5);
  const act = action?.text ?? 'the main action';
  const q = `“${act}”`;
  const goalVerb = out.goal ? lower(out.goal) : lower(act);
  return recs.map((r, i) => {
    const l = r.lead; const id = l.rule.id;
    const title = id === 'mobile/sticky-ui-interference' ? `Stop the banner covering ${q} on a phone` : id.startsWith('mobile/primary-action-unusable') || id === 'workflow/action-cannot-be-activated' ? `Make ${q} usable on a phone`
      : id === 'mobile/primary-action-missing' ? `Show ${q} on a phone` : id === 'mobile/primary-action-inconvenient' ? `Make ${q} easier to tap on a phone`
      : id === 'workflow/action-no-response' ? `Make ${q} open the sign-up form` : id === 'workflow/first-field-unreachable' ? `Let visitors reach the first field after ${q}`
      : id === 'perf/lcp' ? 'Speed up the main content on phones' : id.startsWith('perf/lcp-') ? 'Load the main image sooner' : id.startsWith('perf/cls') ? 'Stop the layout jumping while it loads' : id === 'mobile/horizontal-scroll' ? 'Stop the page scrolling sideways on phones' : l.title;
    const mEv = l.evidence.find((e) => e.kind === 'measurement')?.data as { phrase?: string } | undefined;
    const why = mEv?.phrase;
    const sentence = id === 'mobile/sticky-ui-interference' || id === 'mobile/primary-action-unusable' || id === 'workflow/action-cannot-be-activated' || id === 'mobile/primary-action-missing'
      ? `${q} is the main thing visitors do on this page, but at 320px wide ${id === 'mobile/primary-action-missing' ? 'it cannot be found' : why || 'it cannot be used'}, so a visitor on a phone cannot ${goalVerb}.`
      : id === 'mobile/primary-action-inconvenient' ? `${q} is the main thing visitors do on this page, but at 320px wide ${why || 'it is hard to use'}, so visitors on phones may struggle to ${goalVerb}.`
      : id === 'workflow/first-field-unreachable' ? `${q} is the main thing visitors do on this page, but after they activate it ${lower(l.summary.replace(/\.$/, ''))}, so some visitors cannot ${goalVerb}.`
      : id === 'workflow/action-no-response' ? `${q} is the main thing visitors do on this page, but activating it shows nothing (no form, dialog or new page), so some visitors may think it is broken and not ${goalVerb}.`
      : l.category === 'performance' ? `${l.title.replace(/ on a phone$/, '')} on a simulated phone, which may cost you visitors before they can ${goalVerb} (a hypothesis; Sugam did not measure your visitors).`
      : `${l.title}: ${l.affects} may not be able to ${goalVerb}.`;
    return { rank: i + 1, tier: r.tier, title, sentence, repairKey: r.repairKey, categories: r.cats, findingKeys: r.members.map((m) => m.key), leadKey: (r.fixed ?? l).key, fixes: r.fixed?.fix?.fixes ?? null };
  });
}
export { RULE_VERSION };
