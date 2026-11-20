// Turns raw scanner output into component-level issues.
//  - instances are merged across viewports by selector
//  - instances of the same rule on the same markup pattern become one issue ("1 card, 12 instances")
//  - every issue lands in exactly one bucket: confirmed_failure, needs_review or verified_pass
//  - findings outside the chosen compliance target are left out and counted
import type { Result as AxeResult, NodeResult } from 'axe-core';
import type { ScanOutput, Box, ViewportId, FocusStep } from '../scanner/scanner.ts';
import type { FixSet } from '../lib/db/schema.ts';
import { STANDARDS, criterionInScope } from '../lib/standards.ts';
import { sc, SC_NAMES, impactFor, roleFor, type ImpactGroup } from './meta.ts';
import { buildFixes } from './fixes.ts';

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type Bucket = 'confirmed_failure' | 'needs_review' | 'verified_pass';
export type DraftInstance = { selector: string; html: string; detail?: string; viewports: ViewportId[]; boxes: Partial<Record<ViewportId, Box>> };
export type DraftIssue = {
  ruleId: string; source: 'axe' | 'heuristic' | 'keyboard'; bucket: Bucket; severity: Severity; title: string;
  wcag: { sc: string; name: string; level: string }[]; impactGroups: ImpactGroup[]; roleTag: 'design' | 'no_code' | 'dev';
  componentKey: string; whatToChange: string; helpUrl?: string; data?: Record<string, unknown>;
  instances: DraftInstance[]; fixes?: FixSet; aiEnriched?: boolean;
};
export type Analysis = { issues: DraftIssue[]; score: number; outOfScope: number };

const SEV_RANK: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const BUCKET_RANK: Record<Bucket, number> = { confirmed_failure: 0, needs_review: 1, verified_pass: 2 };

// Markup "shape" used to group repeated components: tag + class list + attribute names.
export function signature(html: string): string {
  const m = html.match(/^<([a-zA-Z][\w-]*)([^>]*)>/);
  if (!m) return html.slice(0, 60);
  const attrs = [...m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)].map((a) => {
    const n = a[1].toLowerCase(); const v = (a[2] || '').replace(/^["']|["']$/g, '');
    if (n === 'class') return 'class=' + v.split(/\s+/).filter(Boolean).sort().join('.');
    if (['role', 'type', 'tabindex'].includes(n)) return `${n}=${v}`;
    return n;
  }).sort();
  return `${m[1].toLowerCase()}[${attrs.join(',')}]`;
}

function wcagFromTags(tags: string[]) {
  const ids = tags.map((t) => t.match(/^wcag(\d)(\d)(\d{1,2})$/)).filter(Boolean).map((m) => `${m![1]}.${m![2]}.${m![3]}`);
  return sc(...[...new Set(ids)]);
}
const axeSelector = (n: NodeResult) => (n.target.length === 1 && typeof n.target[0] === 'string' ? (n.target[0] as string) : JSON.stringify(n.target));
const axeDetail = (n: NodeResult) => (n.failureSummary || [...n.any, ...n.all, ...n.none].map((c) => c.message).filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
const axeData = (n: NodeResult) => { const c = [...n.any, ...n.all, ...n.none].find((x) => x.data && typeof x.data === 'object'); return (c?.data as Record<string, unknown>) || undefined; };

class Collector {
  issues = new Map<string, DraftIssue>();
  add(base: Omit<DraftIssue, 'instances' | 'componentKey'> & { groupBy: string }, inst: { selector: string; html: string; detail?: string; viewport: ViewportId; box?: Box | null }) {
    const key = `${base.bucket}|${base.ruleId}|${base.groupBy}`;
    let issue = this.issues.get(key);
    if (!issue) { const { groupBy, ...rest } = base; issue = { ...rest, componentKey: `${base.ruleId}|${groupBy}`, instances: [] }; this.issues.set(key, issue); }
    let i = issue.instances.find((x) => x.selector === inst.selector);
    if (!i) { i = { selector: inst.selector, html: inst.html, detail: inst.detail, viewports: [], boxes: {} }; issue.instances.push(i); }
    if (!i.viewports.includes(inst.viewport)) i.viewports.push(inst.viewport);
    if (inst.box && inst.box.width > 0 && inst.box.height > 0) i.boxes[inst.viewport] = inst.box;
    if (!issue.data && base.data) issue.data = base.data;
  }
}

function keyboardFindings(c: Collector, vp: ViewportId, steps: FocusStep[]) {
  // WCAG 3.2.1 On Focus: Tab alone changed the page or opened a window. Certain, so a confirmed failure.
  for (const s of steps) if (s.contextChange) {
    c.add({ ruleId: 'sugam/focus-context-change', source: 'keyboard', bucket: 'confirmed_failure', severity: 'serious', title: 'Moving focus changes the page', wcag: sc('3.2.1'), impactGroups: ['keyboard', 'cognitive'], roleTag: 'dev', groupBy: signature(s.html || 'page'),
      whatToChange: 'Pressing Tab, with no other action, navigated away or opened a new window. Receiving focus must never trigger a change of context: it surprises keyboard and screen-reader users and can lose their place.' },
    { selector: s.selector || 'html', html: s.html || '', viewport: vp, box: s.box, detail: `Press ${s.press}: ${s.contextChange}` });
  }
  const real = steps.filter((s) => !s.none && !s.iframe && s.selector);
  for (const s of real) {
    const inst = { selector: s.selector!, html: s.html || '', viewport: vp, box: s.box };
    if (s.inView && s.indicator === false) {
      c.add({ ruleId: 'sugam/focus-not-visible', source: 'keyboard', bucket: 'confirmed_failure', severity: 'serious', title: 'No visible focus indicator', wcag: sc('2.4.7'), impactGroups: ['keyboard', 'visual'], roleTag: 'design', groupBy: signature(s.html || ''),
        whatToChange: 'When this element receives keyboard focus nothing visible changes: no outline, ring, border, background, colour or underline on the element, its pseudo-elements or its parent. Keyboard users cannot see where they are.' },
      { ...inst, detail: `Focused with Tab (press ${s.press}). Focus outline: ${s.focusStyle?.outline}; box-shadow: ${s.focusStyle?.boxShadow}.` });
    }
    if (s.obscured === 'full' || s.obscured === 'partial') {
      const ob = s.obscuredBy;
      const vh = vp === 'desktop' ? 800 : 640;
      const edge = ob && ob.box ? (ob.box.y - (s.box ? s.box.y - (s.box.y % 1) : 0) > 0 && ob.box.height < vh && (ob.box.y % vh) > vh / 2 ? 'bottom' : 'top') : 'top';
      c.add({ ruleId: 'sugam/focus-obscured', source: 'keyboard', bucket: s.obscured === 'full' ? 'confirmed_failure' : 'needs_review', severity: s.obscured === 'full' ? 'serious' : 'minor', title: s.obscured === 'full' ? 'Focused element hidden behind fixed content' : 'Focused element partly covered by fixed content', wcag: sc('2.4.11'), impactGroups: ['keyboard', 'visual'], roleTag: 'design', groupBy: ob ? ob.selector : 'unknown',
        data: { obscurer: ob?.selector, position: ob?.position, obscurerHeight: ob?.box.height, obscurerEdge: /cookie|consent|banner|bottom/i.test((ob?.html || '') + ob?.selector) ? 'bottom' : edge },
        whatToChange: s.obscured === 'full' ? 'When this element is focused with the keyboard it is completely covered by a fixed or sticky element (such as a header or cookie banner), so keyboard users cannot see what they are on.' : 'When focused, this element is partly covered by a fixed or sticky element. WCAG 2.4.11 allows partial cover, but check that the focused control is still recognisable.' },
      { ...inst, detail: `Press ${s.press}: covered by ${ob?.selector} (position: ${ob?.position}).` });
    }
    if (s.inView === false) {
      c.add({ ruleId: 'sugam/focus-offscreen', source: 'keyboard', bucket: 'needs_review', severity: 'moderate', title: 'Focus moves to an element that is not on screen', wcag: sc('2.4.7'), impactGroups: ['keyboard'], roleTag: 'dev', groupBy: signature(s.html || ''),
        whatToChange: 'Tab moved focus to an element outside the visible area (often a hidden menu or off-canvas drawer). Keyboard users lose track of where focus is.' },
      { ...inst, detail: `Press ${s.press}: the focused element is outside the viewport.` });
    }
  }
  // Possible keyboard trap: the same element keeps focus for 4+ presses.
  for (let i = 0; i + 3 < steps.length; i++) {
    const w = steps.slice(i, i + 4);
    if (w.every((s) => s.selector && s.selector === w[0].selector)) {
      c.add({ ruleId: 'sugam/keyboard-trap', source: 'keyboard', bucket: 'needs_review', severity: 'critical', title: 'Possible keyboard trap', wcag: sc('2.1.2'), impactGroups: ['keyboard'], roleTag: 'dev', groupBy: w[0].selector!,
        whatToChange: 'Focus stayed on the same element for four Tab presses in a row. If Tab cannot move on, keyboard users are stuck.' },
      { selector: w[0].selector!, html: w[0].html || '', viewport: vp, box: w[0].box, detail: `Presses ${w[0].press}–${w[3].press} all focused this element.` });
      break;
    }
  }
}

// Why axe could not measure a contrast pair (node.any[0].data.messageKey), in words a site owner can act on.
const CONTRAST_WHY: Record<string, string> = {
  bgImage: 'This text sits on an image. Check it against both the lightest and darkest parts of the image.',
  bgGradient: 'This text sits on a gradient. Check it against both ends of the gradient.',
  bgOverlap: 'Another element overlaps this text, so the background could not be measured. Check it by eye.',
  pseudoContent: 'A decorative layer sits behind this text, so the background could not be measured. Check it by eye.',
  imgNode: 'This text is part of an image. Check it by eye.',
};
const contrastReason = (n: unknown): string => (n as { any?: { data?: { messageKey?: string } }[] }).any?.[0]?.data?.messageKey || 'other';

export function analyze(scan: ScanOutput): Analysis {
  const std = scan.standard;
  const c = new Collector();
  let outOfScope = 0;
  const inScope = (w: { sc: string }[]) => !w.length || w.some((x) => criterionInScope(x.sc, std));

  for (const v of scan.viewports) {
    const box = (s: string) => v.boxes[s] ?? null;
    // ---- axe-core: violations are confirmed, incomplete needs a person ----
    const ingest = (results: AxeResult[], bucket: Bucket) => {
      for (const r of results) {
        const wcag = wcagFromTags(r.tags).filter((w) => w.sc !== '4.1.1' || std === 'aoda');
        if (!inScope(wcag)) { outOfScope += r.nodes.length; continue; }
        for (const n of r.nodes) {
          const sel = axeSelector(n);
          // Contrast that axe could not measure is grouped by WHY (image, gradient, overlap...), not by markup:
          // one review item per reason instead of one per element. Digits and symbols are not text.
          const why = bucket === 'needs_review' && r.id === 'color-contrast' ? contrastReason(n) : null;
          if (why === 'shortTextContent' || why === 'nonBmp') continue;
          c.add({ ruleId: r.id, source: 'axe', bucket, severity: (r.impact as Severity) || 'moderate', title: r.help, wcag, impactGroups: impactFor(wcag.map((w) => w.sc)), roleTag: roleFor(r.id), groupBy: why ? 'incomplete:' + why : signature(n.html), helpUrl: r.helpUrl, data: r.id.startsWith('color-contrast') ? axeData(n) : undefined,
            whatToChange: bucket === 'needs_review' ? `axe-core could not decide this automatically: ${r.description} ${why && CONTRAST_WHY[why] ? CONTRAST_WHY[why] : 'A person needs to check it (for example text over an image or gradient).'}` : r.description },
          { selector: sel, html: n.html, detail: axeDetail(n), viewport: v.name, box: box(sel) });
        }
      }
    };
    ingest(v.axe.violations, 'confirmed_failure');
    ingest(v.axe.incomplete, 'needs_review');

    // ---- heuristics ----
    const h = v.heuristics;
    for (const g of h.duplicateCtas) for (const n of g.nodes)
      c.add({ ruleId: 'sugam/duplicate-cta-label', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: `"${g.name}" is used for ${g.nodes.length} different actions`, wcag: sc('2.4.4', '2.4.6'), impactGroups: ['screen_reader', 'speech', 'cognitive'], roleTag: 'no_code', groupBy: g.name.toLowerCase(),
        whatToChange: `${g.nodes.length} controls are all announced as "${g.name}". Screen reader users listing links or buttons hear identical entries, and voice-control users get numbered choices instead of a direct hit. Surrounding text may give enough context (WCAG 2.4.4 allows that), so a person should confirm.` },
      { ...n, viewport: v.name, box: box(n.selector) });
    for (const n of h.clickables)
      c.add(n.confirmed
        ? { ruleId: 'sugam/non-semantic-clickable', source: 'heuristic', bucket: 'confirmed_failure', severity: 'serious', title: 'Clickable element is not a button or link', wcag: sc('2.1.1', '4.1.2'), impactGroups: ['keyboard', 'screen_reader', 'speech'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'This element has a click handler but is a plain container with no button or link role, and cannot be reached with Tab. Keyboard and screen reader users cannot use it.' }
        : { ruleId: 'sugam/looks-clickable', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Element looks clickable but is not a control', wcag: sc('2.1.1', '4.1.2'), impactGroups: ['keyboard', 'screen_reader'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'This element shows a pointer cursor but is not a button or link, and no click handler was visible to the scan (handlers added by some frameworks are hidden). A person should check whether it does anything.' },
      { ...n, viewport: v.name, box: box(n.selector) });
    for (const t of h.tablists) {
      const problems = [...t.problems];
      if (t.keyboard && !t.keyboard.arrowMovesFocus) problems.push('Pressing the Right arrow key on the selected tab did not move focus to the next tab.');
      if (t.keyboard && !t.keyboard.tabLeavesTablist) problems.push('Pressing Tab on the selected tab moved to another tab instead of into the panel.');
      if (!problems.length) continue;
      c.add({ ruleId: 'sugam/aria-tablist', source: 'heuristic', bucket: 'confirmed_failure', severity: 'serious', title: 'Tabs do not follow the ARIA tabs pattern', wcag: sc('4.1.2', '2.1.1'), impactGroups: ['keyboard', 'screen_reader'], roleTag: 'dev', groupBy: signature(t.html),
        whatToChange: 'This tab set announces itself as tabs but does not behave like them: ' + problems.join(' ') },
      { selector: t.selector, html: t.html, detail: problems.join(' '), viewport: v.name, box: box(t.selector) });
    }
    if (h.reflow && criterionInScope('1.4.10', std)) {
      for (const o of h.reflow.offenders)
        c.add({ ruleId: 'sugam/reflow-320', source: 'heuristic', bucket: o.exempt ? 'needs_review' : 'confirmed_failure', severity: 'serious', title: 'Content does not fit a 320px-wide screen', wcag: sc('1.4.10'), impactGroups: ['visual'], roleTag: 'design', groupBy: 'page',
          whatToChange: `At 320 CSS pixels wide (the same as 400% zoom on a desktop) the page scrolls sideways by ${h.reflow.overflow}px. People who zoom in must scroll in two directions to read.${o.exempt ? ' This element is a table, image or code block, which WCAG allows to scroll, so a person should confirm.' : ''}` },
        { ...o, viewport: v.name, box: box(o.selector) });
    } else if (h.reflow) outOfScope += h.reflow.offenders.length;
    if (v.motion && v.motion.running.length)
      for (const m of v.motion.running)
        c.add({ ruleId: 'sugam/reduced-motion', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Animation ignores the reduced-motion setting', wcag: sc('2.2.2'), impactGroups: ['cognitive', 'visual'], roleTag: 'design', groupBy: signature(m.html),
          whatToChange: `With "reduce motion" switched on in the operating system, this animation keeps running.${v.motion.hasReducedMotionRule ? '' : ' None of the readable stylesheets contain a prefers-reduced-motion rule.'} Moving content that lasts more than five seconds needs a way to pause it (WCAG 2.2.2), and motion can make people with vestibular disorders unwell.` },
        { ...m, viewport: v.name, box: box(m.selector) });

    // ---- speech in media (captions and transcripts) ----
    for (const m of h.media ?? []) {
      if (m.kind === 'embed') {
        c.add({ ruleId: 'sugam/embedded-media', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Embedded audio or video needs a captions and transcript check', wcag: sc('1.2.1', '1.2.2'), impactGroups: ['hearing'], roleTag: 'no_code', groupBy: 'embed',
          whatToChange: `This player is loaded from another service, so the scan cannot see whether captions are switched on or accurate.${m.transcript ? ' A transcript link was found nearby.' : ' No transcript link was found nearby.'} A person should play it and check that any speech has accurate, synchronised captions, and that audio-only content has a transcript.` },
        { selector: m.selector, html: m.html, detail: m.detail, viewport: v.name, box: box(m.selector) });
      } else if (!m.transcript) {
        const audio = m.kind === 'audio';
        c.add({ ruleId: 'sugam/media-transcript', source: 'heuristic', bucket: 'needs_review', severity: audio ? 'serious' : 'moderate', title: audio ? 'Audio has no transcript nearby' : 'Video has no transcript nearby', wcag: audio ? sc('1.2.1') : sc('1.2.3'), impactGroups: ['hearing', 'visual'], roleTag: 'no_code', groupBy: m.kind,
          whatToChange: audio
            ? 'People who are deaf or hard of hearing need a text version of recorded audio such as podcasts or voice notes (WCAG 1.2.1). No transcript link was found near this player. A person should confirm whether a transcript exists elsewhere on the page.'
            : `No transcript link was found near this video${m.captions ? '' : ', and it has no captions track'}. A transcript (or an audio description) lets people who cannot see or hear the video get its content (WCAG 1.2.3). A person should confirm whether the video has speech or important visuals.` },
        { selector: m.selector, html: m.html, detail: m.detail, viewport: v.name, box: box(m.selector) });
      }
    }

    // ---- checks axe-core does not run (see EXTRA in scanner/inpage.ts) ----
    const x = h.extra;
    if (x) {
      const gate = (num: string, n: number) => { if (criterionInScope(num, std)) return n > 0; outOfScope += n; return false; };
      const inst = (n: { selector: string; html: string; detail?: string }) => ({ ...n, viewport: v.name, box: box(n.selector) });
      if (gate('1.4.11', x.nonTextContrast.length)) for (const n of x.nonTextContrast)
        c.add({ ruleId: 'sugam/non-text-contrast', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Form field outline is hard to see', wcag: sc('1.4.11'), impactGroups: ['visual'], roleTag: 'design', groupBy: signature(n.html),
          whatToChange: 'The border or background that shows where this field is has less than 3:1 contrast against what is behind it. People with low vision may not see where to click or type. A person should confirm that nothing else (a label box, an underline) marks the field.' }, inst(n));
      if (gate('1.4.12', x.textSpacing.length)) for (const n of x.textSpacing)
        c.add({ ruleId: 'sugam/text-spacing', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Text is cut off when spacing is increased', wcag: sc('1.4.12'), impactGroups: ['visual', 'cognitive'], roleTag: 'design', groupBy: signature(n.html),
          whatToChange: 'People with dyslexia or low vision often widen letter, word and line spacing. When the WCAG test values were applied (line height 1.5, letter spacing 0.12em, word spacing 0.16em), text inside this box was cut off because the box has a fixed height or width.' }, inst(n));
      if (gate('2.5.7', x.dragging.length)) for (const n of x.dragging)
        c.add({ ruleId: 'sugam/dragging-alternative', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Drag-only control may need a click alternative', wcag: sc('2.5.7'), impactGroups: ['motor', 'keyboard'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'This element looks like drag and drop. Anything done by dragging also needs a way to do it with single clicks or taps, such as "move up / move down" buttons. A person should confirm whether one exists.' }, inst(n));
      if (gate('2.4.3', x.positiveTabindex.length)) for (const n of x.positiveTabindex)
        c.add({ ruleId: 'sugam/positive-tabindex', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Keyboard order forced with a positive tabindex', wcag: sc('2.4.3'), impactGroups: ['keyboard'], roleTag: 'dev', groupBy: 'page',
          whatToChange: 'A tabindex above 0 pulls this element to the front of the Tab order, ahead of everything else, so the order stops matching the page. Use tabindex="0" or no tabindex and put the element in the right place in the markup.' }, inst(n));
      // ---- checks aimed at sites built with AI builders ----
      if (gate('1.4.4', x.smallText.length)) for (const n of x.smallText)
        c.add({ ruleId: 'sugam/small-text', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Very small text', wcag: sc('1.4.4'), impactGroups: ['visual'], roleTag: 'design', groupBy: signature(n.html),
          whatToChange: 'This text is smaller than 12px. WCAG sets no minimum size, but tiny text is the first thing people with low vision or a phone in sunlight cannot read, and it leaves no room when they zoom. Use 14px or larger for anything people need to read.' }, inst(n));
      if (gate('2.4.3', x.autofocus.length)) for (const n of x.autofocus)
        c.add({ ruleId: 'sugam/autofocus', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Page moves keyboard focus on load', wcag: sc('2.4.3'), impactGroups: ['keyboard', 'screen_reader'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'autofocus jumps keyboard focus (and a screen reader) to this field as the page opens, skipping the page title and navigation. It is fine inside a dialog the person just opened; on a normal page, remove it.' }, inst(n));
      if (gate('3.2.5', x.newTab.length)) for (const n of x.newTab)
        c.add({ ruleId: 'sugam/new-tab-warning', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Link opens a new tab without saying so', wcag: sc('3.2.5'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'This link opens in a new tab or window but nothing in its text says so. People using screen readers or magnifiers can get lost when the Back button stops working. Add "(opens in a new tab)" to the link text, or avoid opening a new tab. This is advisory (WCAG AAA technique G201).' }, inst(n));
      const hKinds = { 'no-h1': 'The page has no main heading', 'many-h1': 'More than one main (h1) heading', skipped: 'Heading levels skipped', empty: 'Empty heading' } as const;
      if (gate('1.3.1', x.headings.length)) for (const n of x.headings)
        c.add({ ruleId: 'sugam/heading-structure', source: 'heuristic', bucket: 'needs_review', severity: n.kind === 'empty' ? 'moderate' : 'minor', title: hKinds[n.kind], wcag: sc('1.3.1', '2.4.6'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: n.kind,
          whatToChange: 'Screen-reader users jump between headings to scan a page, like a table of contents. ' + (n.kind === 'no-h1' ? 'Give the page one h1 that names it.' : n.kind === 'many-h1' ? 'Use a single h1 for the page title and h2 and below for sections.' : n.kind === 'skipped' ? 'Go down one level at a time (h2, then h3), not h2 to h4. Pick the level by structure, not by how big it looks.' : 'Remove the empty heading, or give it text.') }, inst(n));
      if (gate('2.4.1', x.noMain.length)) for (const n of x.noMain)
        c.add({ ruleId: 'sugam/no-main-landmark', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'No main content area marked', wcag: sc('2.4.1', '1.3.1'), impactGroups: ['screen_reader', 'keyboard'], roleTag: 'dev', groupBy: 'page',
          whatToChange: 'The page has no <main> element. Screen-reader users use it to jump past the header and menu straight to the content. Wrap the page content (not the header or footer) in <main>. AI builders often produce only <div>s.' }, inst(n));
      if (gate('2.4.4', x.vagueLinks.length)) for (const n of x.vagueLinks)
        c.add({ ruleId: 'sugam/vague-link-text', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Link text does not say where it goes', wcag: sc('2.4.4'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Screen-reader users often browse a list of all the links on a page, where "click here" or "more" means nothing. Make the link text say where it goes, e.g. "Read the pricing guide".' }, inst(n));
      if (gate('3.3.2', x.placeholderOnly.length)) for (const n of x.placeholderOnly)
        c.add({ ruleId: 'sugam/placeholder-only-label', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Field has only a placeholder, no label', wcag: sc('3.3.2'), impactGroups: ['cognitive', 'screen_reader', 'visual'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'A placeholder disappears as soon as someone starts typing, is often pale grey, and is not reliably read out. Add a visible label above the field (or at minimum an aria-label) and keep the placeholder as an example only.' }, inst(n));
      if (gate('2.2.2', x.autoplayVideo.length)) for (const n of x.autoplayVideo)
        c.add({ ruleId: 'sugam/autoplay-no-pause', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Autoplaying video cannot be paused', wcag: sc('2.2.2'), impactGroups: ['cognitive', 'visual'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'Moving content that starts by itself and lasts more than five seconds needs a way to pause it. Add the controls attribute or a visible Pause button, or stop it after a few seconds.' }, inst(n));
      if (gate('2.5.3', x.voiceNameNotFirst.length)) for (const n of x.voiceNameNotFirst)
        c.add({ ruleId: 'sugam/voice-name-not-first', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Spoken name does not start with the visible words', wcag: sc('2.5.3'), impactGroups: ['speech'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'The name read out contains the visible words, which meets WCAG 2.5.3, but not at the start. Voice-control tools such as Apple Voice Control match from the start, so saying "click Learn more" may not work. Begin the aria-label with the visible text. This is a best practice, not a WCAG failure.' }, inst(n));
      if (gate('1.4.11', x.forcedColorsOptOut.length)) for (const n of x.forcedColorsOptOut)
        c.add({ ruleId: 'sugam/forced-colors-optout', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Ignores high-contrast mode', wcag: sc('1.4.11'), impactGroups: ['visual'], roleTag: 'design', groupBy: signature(n.html),
          whatToChange: 'forced-color-adjust: none stops this element from using the high-contrast colours people choose in Windows. Remove it unless the element is a colour swatch or similar, and make sure it still has a visible edge and readable text.' }, inst(n));
      // ---- images of text and form fields ----
      if (gate('1.4.5', x.imageOfText.length)) for (const n of x.imageOfText)
        c.add({ ruleId: 'sugam/image-of-text', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Text may be baked into an image', wcag: sc('1.4.5'), impactGroups: ['visual', 'screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Text inside a picture cannot be enlarged without blurring, cannot take the visitor\'s own colours or high-contrast mode, and is skipped by translation tools. Sugam cannot read the pixels, so a person should look at this image. If it holds real words (a headline, a button label), rebuild it as live text styled with CSS in your builder (W3C technique C22). If an image of text truly cannot be avoided, its alt text must repeat the same words. Logos are exempt: give them the organisation\'s name as alt text.' }, inst(n));
      if (gate('1.3.5', x.autocompleteMissing.length)) for (const n of x.autocompleteMissing)
        c.add({ ruleId: 'sugam/form-autocomplete-missing', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Field does not say what personal detail it asks for', wcag: sc('1.3.5'), impactGroups: ['cognitive', 'motor'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Adding the matching autocomplete value lets browsers and password managers fill the field, which helps people with memory, motor or cognitive disabilities. Skip it only if the field is about someone else (a friend\'s email, say).' }, inst(n));
      if (gate('3.3.2', x.inputTypeMismatch.length)) for (const n of x.inputTypeMismatch)
        c.add({ ruleId: 'sugam/form-input-type', source: 'heuristic', bucket: 'needs_review', severity: 'minor', title: 'Field uses the wrong input type', wcag: sc('3.3.2'), impactGroups: ['cognitive', 'motor'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Using type="email" or type="tel" brings up the right keyboard on phones and gives built-in checking. Plain text fields make people hunt for the @ or digits.' }, inst(n));
      if (gate('3.3.2', x.requiredNotMarked.length)) for (const n of x.requiredNotMarked)
        c.add({ ruleId: 'sugam/form-required-not-marked', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Required field is only marked with a star', wcag: sc('3.3.2'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'A star is a visual cue. Add the required attribute so screen readers announce "required" and the browser checks it, and say what the star means near the top of the form.' }, inst(n));
      if (gate('3.3.1', x.invalidNoMessage.length)) for (const n of x.invalidNoMessage)
        c.add({ ruleId: 'sugam/form-error-not-linked', source: 'heuristic', bucket: 'needs_review', severity: 'serious', title: 'Field is marked invalid but its error is not connected', wcag: sc('3.3.1'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'dev', groupBy: signature(n.html),
          whatToChange: 'The field says it is invalid, but nothing links it to an error message, so a screen reader announces "invalid" and no reason. Give the error text an id and point aria-describedby at it.' }, inst(n));
      if (gate('2.4.6', x.labelNotVisible.length)) for (const n of x.labelNotVisible)
        c.add({ ruleId: 'sugam/form-label-not-visible', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Field has no visible label', wcag: sc('2.4.6', '3.3.2'), impactGroups: ['speech', 'cognitive', 'screen_reader'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Only assistive technology can tell what this field is. Sighted people, and voice-control users who say the label to reach the field, get nothing. Add a visible <label> tied to the field.' }, inst(n));
      if (gate('1.3.1', x.radioGroups.length)) for (const n of x.radioGroups)
        c.add({ ruleId: 'sugam/form-group-name', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Options are not grouped under a question', wcag: sc('1.3.1'), impactGroups: ['screen_reader', 'cognitive'], roleTag: 'no_code', groupBy: signature(n.html),
          whatToChange: 'Radio buttons and related checkboxes need to be wrapped in a <fieldset> with a <legend> that holds the question. Without it, a screen reader reads "Yes, radio button" with no hint what is being asked.' }, inst(n));
      if (x.authentication.passwordFields > 0 && criterionInScope('3.3.8', std)) {
        for (const n of x.authentication.pasteBlocked)
          c.add({ ruleId: 'sugam/auth-paste-blocked', source: 'heuristic', bucket: 'confirmed_failure', severity: 'serious', title: 'Sign-in field blocks pasting', wcag: sc('3.3.8'), impactGroups: ['cognitive', 'motor'], roleTag: 'dev', groupBy: signature(n.html),
            whatToChange: 'A script cancels pasting into this sign-in field. People who cannot remember or retype a password rely on pasting from a password manager. Remove the paste handler.' }, inst(n));
        for (const n of x.authentication.autocompleteOff)
          c.add({ ruleId: 'sugam/auth-autocomplete-off', source: 'heuristic', bucket: 'needs_review', severity: 'moderate', title: 'Sign-in field asks browsers not to fill it', wcag: sc('3.3.8'), impactGroups: ['cognitive', 'motor'], roleTag: 'dev', groupBy: signature(n.html),
            whatToChange: 'autocomplete="off" on a sign-in field can stop password managers from filling it. Use autocomplete="username" or "current-password" (or "new-password" on sign-up) instead.' }, inst(n));
        for (const n of x.authentication.captcha)
          c.add({ ruleId: 'sugam/auth-captcha', source: 'heuristic', bucket: 'needs_review', severity: 'serious', title: 'Sign-in page has a CAPTCHA', wcag: sc('3.3.8'), impactGroups: ['cognitive', 'visual'], roleTag: 'dev', groupBy: 'captcha',
            whatToChange: 'A puzzle that asks people to recognise images or characters is a cognitive test at sign-in. WCAG 3.3.8 needs another way in (a passkey, an email link, or a challenge that needs no puzzle). A person should confirm which kind of CAPTCHA this is.' }, inst(n));
      } else if (x.authentication.passwordFields > 0) outOfScope += x.authentication.pasteBlocked.length + x.authentication.autocompleteOff.length + x.authentication.captcha.length;
    }

    keyboardFindings(c, v.name, v.keyboard);
  }

  // ---- verified passes (rule level) ----
  const failedRules = new Set([...c.issues.values()].map((i) => i.ruleId));
  const passes: DraftIssue[] = [];
  const desktop = scan.viewports.find((v) => v.name === 'desktop');
  for (const p of desktop?.axe.passes ?? []) {
    if (failedRules.has(p.id)) continue;
    const wcag = wcagFromTags(p.tags);
    if (!inScope(wcag)) continue;
    passes.push({ ruleId: p.id, source: 'axe', bucket: 'verified_pass', severity: 'minor', title: p.help, wcag, impactGroups: impactFor(wcag.map((w) => w.sc)), roleTag: roleFor(p.id), componentKey: `${p.id}|pass`, whatToChange: 'Tested automatically and passed on every element it applies to.', instances: [] });
  }
  const steps = scan.viewports.flatMap((v) => v.keyboard.filter((s) => s.selector && s.inView));
  if (steps.length >= 5 && !failedRules.has('sugam/focus-not-visible'))
    passes.push({ ruleId: 'sugam/focus-not-visible', source: 'keyboard', bucket: 'verified_pass', severity: 'minor', title: 'Focus indicator visible', wcag: sc('2.4.7'), impactGroups: ['keyboard'], roleTag: 'design', componentKey: 'focus|pass', whatToChange: `Every one of the ${steps.length} elements reached with Tab showed a visible change when focused.`, instances: [] });
  if (scan.viewports.some((v) => v.name === 'mobile') && !scan.viewports.some((v) => v.heuristics.reflow) && criterionInScope('1.4.10', std))
    passes.push({ ruleId: 'sugam/reflow-320', source: 'heuristic', bucket: 'verified_pass', severity: 'minor', title: 'Reflows at 320 CSS pixels', wcag: sc('1.4.10'), impactGroups: ['visual'], roleTag: 'design', componentKey: 'reflow|pass', whatToChange: 'At 320px wide the page did not scroll sideways.', instances: [] });

  // ---- order, fixes, score ----
  const issues = [...c.issues.values()].sort((a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] || SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.instances.length - a.instances.length);
  for (const i of issues) {
    const first = i.instances[0];
    i.fixes = buildFixes({ ruleId: i.ruleId, title: i.title, whatToChange: i.whatToChange, wcagText: i.wcag.map((w) => `WCAG ${w.sc} ${w.name}`).join(', ') || 'best practice', pageUrl: scan.finalUrl, selector: first.selector, html: first.html, instanceCount: i.instances.length, detail: first.detail, data: i.data });
  }
  const W: Record<Severity, number> = { critical: 12, serious: 7, moderate: 3, minor: 1 };
  const penalty = issues.filter((i) => i.bucket === 'confirmed_failure').reduce((s, i) => s + W[i.severity] * Math.min(2, 1 + 0.15 * (i.instances.length - 1)), 0);
  // Diminishing scale so large sites still show movement between scans; 100 = no confirmed failures.
  return { issues: [...issues, ...passes], score: Math.round(100 * Math.exp(-penalty / 80)), outOfScope };
}
export { SC_NAMES, STANDARDS };
