// Turns a report into the one decision the page is built around: "which fix should I make next?". Pure functions of the report, so what the page says is
// whatever the scan evidence supports. Copy names the visible control and describes what a visitor would see; design observations use advisory wording.
import type { AvaraFinding, AvaraFix, AvaraOutcome, AvaraRecommendation, Report, ViewportId } from './report-types.ts';

/** The width a viewport was captured at: from the report itself, so scans made with the 320px phone keep saying 320px. */
export const widthOf = (report: Report, vp: string) => report.viewports.find((x) => x.viewport === vp)?.viewportWidth ?? (vp === 'desktop' ? 1280 : vp === 'narrow' ? 320 : 390);
export const deviceLabel = (report: Report, vp: string) => (vp === 'desktop' ? `Desktop (${widthOf(report, vp)}px wide)` : `Phone (${widthOf(report, vp)}px wide)`);
import { plainTitle } from './plain.ts';
import { affectsSentence } from './impact.ts';

export type Box = { x: number; y: number; width: number; height: number };
export type ShotBox = { box: Box; kind: 'affected' | 'cause'; label: string };
export type Shot = { src: string; pageWidth: number; pageHeight: number; viewport: ViewportId; boxes: ShotBox[]; crop: Box; alt: string };
export type Item = {
  id: string; kind: 'fix' | 'confirmed' | 'review'; rank: number; tier: 'fix_immediately' | 'fix_before_launch' | 'improve_later' | null; blocker: boolean;
  title: string; location: string; sentence: string; categories: string[]; sharedBy: number; fixes: AvaraFix[] | null; fixText: string | null; locked: boolean;
  members: AvaraFinding[]; shot: Shot | null; evidence: string[]; source: string | null;
  issueId?: string; level: Level;
  trace: { owner: AvaraRecommendation['owner']; related: AvaraRecommendation['related']; lenses: AvaraRecommendation['lenses']; scoring: AvaraRecommendation['scoring'] } | null;
};
export type Level = 'critical' | 'high' | 'medium' | 'review';
export type Score = { label: string; score: number | null; status: 'provisional' | 'final'; coveragePct: number; missing: number; unscored?: string; ran: number; rules: number; notRun: NotRunRule[]; issues: number; critical: number; review: number; observationsOnly: boolean };
export type NotRunRule = { id: string; title: string; outcome: string; reason: string | null };
export type Board = { overall: { score: number | null; status: 'provisional' | 'final'; coveragePct: number; note: string; assessed: number; total: number; why: string[] } | null; cats: Score[]; totals: Record<Level, number> };

/** Plain reasons a scan has no overall score, in the order a reader can act on them. A score needs every required check to have run with saved proof. */
export function unscoredWhy(aiOff: boolean, historical: boolean): string[] {
  const why: string[] = [];
  if (historical) why.push('This scan was saved before each check’s result was kept, so it can’t be scored. A rescan records every result.');
  if (aiOff) why.push('Checks that need judgement (wording, trust, design) didn’t run on this scan, and a score needs every required check.');
  if (!why.length) why.push('Some required checks didn’t run on this scan, and a score needs every one of them.');
  return why;
}
export type View = {
  board: Board;
  domain: string; date: string | null; access: 'anonymous' | 'free' | 'paid';
  primary: Item | null; others: Item[]; moreIssues: { title: string; count: number; severity: string }[]; moreIssueTotal: number;
  scope: { devices: string[]; analyzers: { name: string; status: string; message?: string }[]; notes: string[]; library: Report['avara'] extends infer A ? (A extends { library: infer L } ? L : never) : never } | null;
  latestRescanId: string | null;
  changes: { headline: string; counts: { fixed: number; still: number; unverified: number }; rows: { outcome: AvaraOutcome['outcome']; title: string; before: string; now: string }[]; fromId: string } | null;
  categories: string[];
};

const CAT: Record<string, string> = { accessibility: 'Accessibility', mobile: 'Mobile', ux_workflow: 'UX and workflow', performance: 'Performance' };
export const ENGINE_CAT: Record<string, string> = { 'Product Clarity': 'Product clarity', 'UX & Workflow Quality': 'UX and workflow', 'Mobile Responsiveness': 'Mobile', Accessibility: 'Accessibility', 'Trust & Credibility': 'Trust', 'Design & Brand Quality': 'Design', 'Conversion Readiness': 'Conversion', Performance: 'Performance', 'Differentiation & Design Maturity': 'Differentiation' };
const LEVEL = { fix_immediately: 'critical', fix_before_launch: 'high', improve_later: 'medium' } as const;
const lvl = (s: string): Level => (/crit/i.test(s) ? 'critical' : /high|major|serious/i.test(s) ? 'high' : 'medium');
const SEV = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const q = (s: string) => `“${s}”`;
/** A row title from what was observed: the first sentence, without its full stop, so it says what is wrong on this page rather than naming a rule. */
const firstSentence = (obs: string, fb: string) => { const t = obs.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, '') ?? ''; return t.length >= 12 ? (t.length > 110 ? t.slice(0, 107) + '…' : t) : fb; };
const sec = (ms: number) => `${Math.round(ms / 100) / 10}`;

type Meas = { box?: Box; cover?: { selector: string; position: string; text: string; box?: Box } | null; visibleRatio?: number; width?: number; height?: number; clippedBy?: string | null; reasons?: string[]; viewportWidth?: number; pageWidth?: number; phrase?: string };
const measOf = (f: AvaraFinding): { m: Meas; viewport: string } | null => { const e = f.evidence?.find((x) => x.kind === 'measurement' && (x.data as Meas).box); return e ? { m: e.data as Meas, viewport: e.viewport ?? 'desktop' } : null; };
const domOf = (f: AvaraFinding) => f.evidence?.find((x) => x.kind === 'dom');
const quoted = (s: string) => /“([^”]+)”/.exec(s)?.[1] ?? null;

function coverNoun(c: NonNullable<Meas['cover']>, vh: number) {
  const hay = `${c.selector} ${c.text}`.toLowerCase();
  const noun = /banner|promo|cookie|offer|notice|consent|alert|announce/.test(hay) ? 'banner' : /modal|dialog|popup|pop-up/.test(hay) ? 'pop-up' : /chat|widget/.test(hay) ? 'chat widget' : /nav|header|menu/.test(hay) ? 'header bar' : 'bar';
  const where = c.box ? (c.box.y + c.box.height / 2 > vh / 2 ? 'bottom' : 'top') : null;
  return `${where ? `the ${where} ` : 'a '}${noun === 'bar' && !where ? 'fixed bar' : noun}`.replace(/^the (bottom|top) $/, 'the $1 ');
}
const goalOr = (f: AvaraFinding, action = '') => (f.trying && f.trying !== 'use the page' && f.trying !== 'read and use the page' && !(action && f.trying.toLowerCase().includes(action.toLowerCase())) ? ` or ${f.trying}` : '');
const toGoal = (f: AvaraFinding) => (f.trying && f.trying !== 'use the page' && f.trying !== 'read and use the page' ? `, so they cannot ${f.trying}` : '');

/** The headline and the visitor sentence, written from this finding's evidence. */
function words(f: AvaraFinding, all: AvaraFinding[]): { headline: string; sentence: string } {
  // The widths it was measured at, from its own evidence; findings saved before the 390px phone were measured at 320px.
  const ws = [...new Set((f.evidence ?? []).filter((e) => e.kind === 'measurement').map((e) => Number((e.data as { viewportWidth?: number }).viewportWidth)).filter((n) => n > 0 && n < 1024))].sort((x, y) => y - x);
  const atW = `at ${ws.length ? ws.join('px and ') : 320}px wide`;
  const id = f.ruleId; const r = measOf(f); const m = r?.m; const action = quoted(f.title) ?? quoted(all.map((x) => x.title).join(' ')) ?? 'the main action'; const goal = toGoal(f); const A = q(action);
  if (id === 'mobile/sticky-ui-interference' && m?.cover) { const noun = coverNoun(m.cover, 640); return { headline: `On phones, ${noun} covers ${A}.`, sentence: `A visitor on a phone taps ${A} and hits the ${noun.replace(/^(the |a )(bottom |top )?/, '')} instead${goal}.` }; }
  if (id === 'mobile/primary-action-unusable' || id === 'accessibility/reflow-function-loss') {
    const why = m?.reasons?.[0] ?? ''; const vis = m?.visibleRatio != null ? Math.round(m.visibleRatio * 100) : null;
    const what = /covers|covered/.test(why) ? 'is covered' : /off the screen|edge|outside/.test(why) ? 'runs off the screen' : /hidden|not shown/.test(why) ? 'is hidden' : 'is cut off';
    return { headline: `On phones, ${A} ${what}.`, sentence: vis != null && vis < 100 ? `${vis === 0 ? `None of ${A} is` : `Only ${vis}% of ${A} is`} on screen ${atW}, so a visitor on a phone cannot tap it${goalOr(f, action)}.` : `A visitor on a phone cannot use ${A}${goal}.` };
  }
  if (id === 'mobile/primary-action-missing') return { headline: `On phones, ${A} is missing.`, sentence: `The desktop page has ${A}. ${cap(atW)} Avara could not find it${goal}.` };
  if (id === 'mobile/primary-action-inconvenient') return { headline: `On phones, ${A} is hard to tap.`, sentence: `${m?.width && m?.height ? `At ${m.width} by ${m.height} px it is smaller than a thumb needs` : 'It is smaller than a thumb needs'}, so visitors may miss it or give up${goal ? goal.replace('so they cannot', 'and may not') : ''}.` };
  if (id === 'workflow/action-cannot-be-activated') return { headline: `Tapping ${A} does nothing on a phone.`, sentence: `Avara tried to activate ${A} ${atW} and could not${goal}.` };
  if (id === 'workflow/action-no-response') return { headline: `${cap(A)} seems to do nothing.`, sentence: `After activating ${A} no form, dialog or new page appeared, so a visitor may think it is broken${goal}.` };
  if (id === 'workflow/first-field-unreachable') return { headline: `After ${A}, the first field cannot be reached.`, sentence: `The form opens, but a visitor cannot get to its first field${goal}.` };
  if (id === 'mobile/horizontal-scroll') return { headline: 'On phones, the page scrolls sideways.', sentence: `${cap(atW)} the page is ${m?.pageWidth ?? 'wider than the screen'}px wide, so a visitor has to scroll sideways to see all of it.` };
  if (id.startsWith('perf/')) { const e = f.evidence?.find((x) => x.kind === 'metric')?.data as { value?: number; metric?: string } | undefined;
    if (e?.metric === 'cls') return { headline: 'The page jumps around while it loads on a phone.', sentence: 'Content that moves as it loads can make a visitor tap the wrong thing.' };
    return { headline: e?.value ? `On a phone, the main content takes about ${sec(e.value)} seconds to appear.` : 'On a phone, the main content appears slowly.', sentence: 'A visitor waits, on a simulated phone and connection, before they can see the page.' }; }
  return { headline: plainTitle(id, f.title), sentence: `${cap(f.affects)} may be unable to ${f.trying}.` };
}

function locationOf(report: Report, f: AvaraFinding, all: AvaraFinding[], vh: number): string {
  const r = measOf(f) ?? all.map(measOf).find(Boolean) ?? null; const dom = domOf(f) ?? all.map(domOf).find(Boolean);
  const viewport = r?.viewport ?? (f.ruleId.startsWith('mobile/') || f.ruleId.startsWith('accessibility/reflow') ? 'mobile' : 'desktop');
  const device = deviceLabel(report, viewport);
  const html = (dom?.data as { html?: string } | undefined)?.html ?? '';
  const name = quoted(f.title) ?? (html ? strip(html).slice(0, 40) : '');
  const role = /^<button|role="button"|type="submit"/i.test(html) ? 'button' : /^<a[\s>]/i.test(html) ? 'link' : /^<(input|select|textarea)/i.test(html) ? 'field' : /^<img/i.test(html) ? 'image' : 'control';
  const where = r?.m.box ? (r.m.box.y < vh ? 'in the first screen' : 'below the first screen') : '';
  return [device, name ? `${q(name)} ${role}` : '', where].filter(Boolean).join(' · ');
}

function shotAt(report: Report, viewport: ViewportId, box: Box | null, cause: Box | null, label: string): Shot | null {
  const v = report.viewports.find((x) => x.viewport === viewport); if (!box || !v || !v.screenshotUrl || box.y + box.height > v.pageHeight) return null;
  // An element pushed past the page edge still gets an outline: show the part that is on the page, or a marker at the edge when none of it is.
  const x0v = Math.max(0, box.x), x1v = Math.min(v.pageWidth, box.x + box.width); box = x1v > x0v ? { ...box, x: x0v, width: x1v - x0v } : { ...box, x: Math.max(0, v.pageWidth - 28), width: Math.min(28, v.pageWidth) };
  const parts = [box, ...(cause ? [cause] : [])]; const pad = 28; const x0 = Math.min(...parts.map((b) => b.x)) - pad, y0 = Math.min(...parts.map((b) => b.y)) - pad, x1 = Math.max(...parts.map((b) => b.x + b.width)) + pad, y1 = Math.max(...parts.map((b) => b.y + b.height)) + pad;
  const minW = viewport === 'mobile' ? v.pageWidth : 640, minH = viewport === 'mobile' ? 260 : 300; let w = Math.min(v.pageWidth, Math.max(minW, x1 - x0)), h = Math.min(v.pageHeight, Math.max(minH, y1 - y0));
  const cx = Math.max(0, Math.min(v.pageWidth - w, (x0 + x1) / 2 - w / 2)), cy = Math.max(0, Math.min(v.pageHeight - h, (y0 + y1) / 2 - h / 2)); w = Math.round(w); h = Math.round(h);
  return { src: v.screenshotUrl, pageWidth: v.pageWidth, pageHeight: v.pageHeight, viewport, crop: { x: Math.round(cx), y: Math.round(cy), width: w, height: h },
    boxes: [{ box, kind: 'affected', label }, ...(cause ? [{ box: cause, kind: 'cause' as const, label: 'What covers it' }] : [])], alt: `${viewport === 'mobile' ? 'Phone' : 'Desktop'} screenshot with ${label} outlined` };
}
function shotFor(report: Report, lead: AvaraFinding, all: AvaraFinding[], label: string): Shot | null {
  const r = measOf(lead) ?? all.map(measOf).find(Boolean) ?? null; let viewport = (r?.viewport === 'mobile' || r?.viewport === 'narrow' ? r.viewport : 'desktop') as ViewportId; let box = r?.m.box ?? null;   // the screenshot of the width the problem was measured at
  const cause = r?.m.cover?.box ?? null;
  if (!box && lead.issueId) { const issue = report.issues.find((i) => i.id === lead.issueId); const b = issue?.instances.flatMap((x) => x.boxes).find((x) => x.visible); if (b) { box = b; viewport = b.viewport; } }
  return shotAt(report, viewport, box, cause, label);
}

/** Scans made before Avara have no ranked recommendations. They still get the same page, built from the accessibility issues they do have. */
function legacyItems(report: Report): Item[] {
  const SEVR = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
  return report.issues.filter((i) => i.bucket === 'confirmed_failure').sort((a, b) => SEVR[a.severity] - SEVR[b.severity] || b.instanceCount - a.instanceCount || a.position - b.position).slice(0, 5).map((i, n) => {
    const inst = i.instances[0]; const html = inst?.html ?? ''; const name = html ? strip(html).slice(0, 40) : ''; const box = inst?.boxes.find((b) => b.visible) ?? null; const viewport = (box?.viewport ?? 'desktop') as 'mobile' | 'desktop';
    const role = /^<button/i.test(html) ? 'button' : /^<a[\s>]/i.test(html) ? 'link' : /^<img/i.test(html) ? 'image' : /^<(input|select|textarea)/i.test(html) ? 'field' : 'element';
    const location = [deviceLabel(report, viewport), name ? `${q(name)} ${role}` : inst?.selector ?? '', i.instanceCount > 1 ? `and ${i.instanceCount - 1} more like it` : ''].filter(Boolean).join(' · ');
    const f = i.fixes; const fixes: AvaraFix[] | null = f ? [...(['lovable', 'bolt', 'v0', 'cursor'] as const).map((t) => ({ tool: t, kind: 'prompt', content: f.aiPrompt[t] })), { tool: 'framer', kind: 'steps', content: f.noCode.framer.join('\n') }, { tool: 'webflow', kind: 'steps', content: f.noCode.webflow.join('\n') }, { tool: 'code', kind: 'patch', content: JSON.stringify(f.code) }] : null;
    return { id: `i-${i.id}`, level: i.severity === 'critical' ? 'critical' : i.severity === 'serious' ? 'high' : 'medium', issueId: i.id, kind: 'fix', rank: n + 1, tier: i.severity === 'critical' ? 'fix_immediately' : i.severity === 'serious' ? 'fix_before_launch' : 'improve_later', blocker: false, title: plainTitle(i.ruleId, i.title), location, sentence: affectsSentence(i.impactGroups),
      categories: ['Accessibility'], sharedBy: 0, fixes, fixText: null, locked: !fixes, members: [], evidence: i.instances.slice(0, 3).map((x) => `${x.selector}  ${x.html}`), source: i.wcag.map((w) => `WCAG ${w.sc}`).join(', ') || null, trace: null,
      shot: shotAt(report, viewport, box, null, `${name ? q(name) : 'the element'}`) } as Item;
  });
}

function leadOf(rec: AvaraRecommendation, findings: AvaraFinding[]) {
  const members = rec.findingIds.map((id) => findings.find((f) => f.id === id)).filter(Boolean) as AvaraFinding[];
  const lead = [...members].sort((a, b) => (b.ruleId === 'mobile/sticky-ui-interference' ? 1 : 0) - (a.ruleId === 'mobile/sticky-ui-interference' ? 1 : 0) || SEV[a.severity] - SEV[b.severity])[0];
  return { lead, members };
}
const fixTextOf = (fixes: AvaraFix[] | null) => fixes?.find((f) => f.tool === 'cursor' || f.kind === 'prompt')?.content ?? null;

export function buildView(report: Report, access: View['access']): View {
  const av = report.avara; const url = (() => { try { return new URL(report.finalUrl || report.url); } catch { return null; } })();
  const findings = av?.findings ?? []; const recs = av?.recommendations ?? [];
  const items: Item[] = recs.length ? recs.map((rec) => {
    const { lead, members } = leadOf(rec, findings); const w = lead ? words(lead, members) : { headline: rec.title, sentence: rec.sentence };
    const loc = lead ? locationOf(report, lead, members, 640) : '';
    return { id: rec.id, level: LEVEL[rec.tier], kind: 'fix', rank: rec.rank, tier: rec.tier, blocker: rec.tier === 'fix_immediately' && members.some((m) => m.goalImpact === 'blocks'), title: w.headline, location: loc, sentence: w.sentence,
      categories: rec.categories.map((c) => CAT[c] ?? c), sharedBy: Math.max(0, members.length - 1), fixes: rec.fixes, fixText: fixTextOf(rec.fixes), locked: rec.fixLocked || !rec.fixes?.length, members, evidence: [], trace: { owner: rec.owner, related: rec.related, lenses: rec.lenses, scoring: rec.scoring },
      shot: lead ? shotFor(report, lead, members, loc.split(' · ')[1] ?? 'the affected control') : null, source: lead?.sourceSection ?? null };
  }) : legacyItems(report);
  // A rule is already shown when a finding or a fix owns it. A fix's *related* rules are context only: a related rule that failed on its own
  // check is a separate issue and is listed, so every failed check that lowers a score appears in its category.
  const covered = new Set(findings.flatMap((f) => (f.canonicalId ? [f.canonicalId] : [])).concat(recs.map((r) => r.owner?.id).filter((x): x is string => !!x)));
  const engine = report.review?.categories.flatMap((c) => c.findings.map((f) => ({ ...f, cat: c.category }))) ?? [];
  const extra: Item[] = engine.filter((f) => f.result === 'observed_failure' && f.method === 'measured' && !covered.has(f.ruleId)).map((f, i) => ({
    id: `x-${f.findingId}`, level: lvl(f.severity), kind: 'confirmed' as const, rank: 100 + i, tier: null, blocker: false, title: firstSentence(f.observation, f.title), location: '', sentence: f.observation, categories: [ENGINE_CAT[f.cat] ?? f.cat], sharedBy: 0,
    fixes: null, fixText: f.recommendation || null, locked: !f.recommendation, members: [], shot: null, evidence: f.evidence, source: f.source, trace: null }));
  const advisory: Item[] = engine.filter((f) => f.result === 'needs_human_review' && f.severity !== 'info' && !covered.has(f.ruleId)).map((f, i) => ({
    id: `r-${f.findingId}`, level: 'review' as const, kind: 'review' as const, rank: 200 + i, tier: null, blocker: false, title: firstSentence(f.observation, f.title), location: '', sentence: `Worth a look: ${f.observation.charAt(0).toLowerCase()}${f.observation.slice(1)}`, categories: [ENGINE_CAT[f.cat] ?? f.cat], sharedBy: 0,
    fixes: null, fixText: f.recommendation || null, locked: !f.recommendation, members: [], shot: null, evidence: f.evidence, source: f.source, trace: null }));
  const primary = items[0] ?? null; const others = [...items.slice(1), ...extra, ...advisory];
  const linked = new Set([...findings.map((f) => f.issueId), ...items.map((i) => i.issueId)].filter(Boolean)); const more = report.issues.filter((i) => i.bucket === 'confirmed_failure' && !linked.has(i.id)).sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const categories = [...new Set([...(primary ? primary.categories : []), ...others.flatMap((o) => o.categories)])];
  const outs = av?.outcomes; const counts = { fixed: 0, still: 0, unverified: 0 }; outs?.forEach((o) => { if (o.outcome === 'fixed') counts.fixed++; else if (o.outcome === 'still_present') counts.still++; else counts.unverified++; });
  const changes = outs && av?.rescanOf ? {
    fromId: av.rescanOf, counts, rows: outs.map((o) => ({ outcome: o.outcome, title: o.findingTitle, before: (o.before as { observation?: string }).observation ?? '', now: o.reason })),
    headline: !outs.length ? 'Nothing was re-checked' : counts.fixed === outs.length ? 'Everything that was re-checked is fixed' : counts.fixed ? `${counts.fixed} of ${outs.length} problems are fixed` : counts.still ? 'The problem is still there' : 'The earlier problems could not be re-checked' } : null;
  const all = [...(primary ? [primary] : []), ...others]; const totals: Board['totals'] = { critical: 0, high: 0, medium: 0, review: 0 }; all.forEach((i) => { totals[i.level]++; });
  const rv = report.review; const lib = av?.library;
  // Scores shown anywhere come from the strict policy only: a category's number appears when every required rule has saved execution evidence, and the
  // overall number only when every weighted category does. The rule engine's provisional averages are never displayed as scores.
  const strict = new Map((lib?.strict ?? []).map((c) => [c.label, c]));
  const board: Board = {
    overall: rv ? { score: lib ? lib.overall : null, status: 'provisional', coveragePct: rv.overall.coveragePct, note: lib?.overallWithheld ?? (lib ? rv.overall.note : 'No strict score is available for this scan.'), assessed: (lib?.strict ?? []).filter((c) => c.assessed && !c.observationsOnly).length, total: (lib?.strict ?? []).filter((c) => !c.observationsOnly).length || rv.categories.length,
      why: [...(lib?.overallWithheld ? [lib.overallWithheld] : []), ...unscoredWhy(!!rv.ai && rv.ai.used === false, lib?.coverage.origin === 'historical')] } : null,
    cats: (rv?.categories ?? []).map((c) => { const label = ENGINE_CAT[c.category] ?? c.category; const st = strict.get(c.category); const mine = all.filter((i) => i.categories.includes(label)); return { label, score: st?.assessed ? st.score : null, status: 'provisional' as const, coveragePct: c.coveragePct, missing: st?.missing ?? 0, ran: lib?.coverage.byCategory.find((b) => b.category === c.category)?.ran ?? 0, rules: lib?.coverage.byCategory.find((b) => b.category === c.category)?.rules ?? 0,
        notRun: (lib?.notRunRules ?? []).filter((r) => r.category === c.category).map(({ id, title, outcome, reason }) => ({ id, title, outcome, reason })), unscored: st && st.status !== 'scored' ? st.note : undefined, issues: mine.filter((i) => i.level !== 'review').length, critical: mine.filter((i) => i.level === 'critical').length, review: mine.filter((i) => i.level === 'review').length, observationsOnly: c.weight === 0 }; }),
    totals,
  };
  return {
    board, domain: url?.hostname.replace(/^www\./, '') ?? report.url, date: report.completedAt, access, primary, others, moreIssues: more.slice(0, 12).map((i) => ({ title: plainTitle(i.ruleId, i.title), count: i.instanceCount, severity: i.severity })), moreIssueTotal: more.length,
    scope: av ? { devices: report.viewports.map((v) => (v.viewport === 'desktop' ? `desktop, ${v.viewportWidth}px wide` : `phone, ${v.viewportWidth}px wide`)), analyzers: Object.entries(av.analyzers).map(([name, a]) => ({ name, status: a.status, message: a.message })), notes: [...av.coverage, ...(report.summary?.limitations ?? [])], library: av.library } : null,
    latestRescanId: av?.latestRescanId ?? null, changes, categories };
}
