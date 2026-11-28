// Every builder fix is three short parts, each fact in one place:
//   Element: the exact element (visible label or asset name, section, viewport) and what was measured or is missing.
//   Change:  the smallest edit that addresses that evidence, naming the property or layer; what to inspect first when the right fix depends
//            on meaning; code only when it is safe to apply as written.
//   Verify:  recheck the same element in the same state and viewport: what Avara can confirm on a rescan, plus one manual check when
//            meaning or interaction needs a person.
// No placeholder values, no long generated selectors, no business-impact guesses, no compliance claims. The AI fix writer may reword the
// Change sentence only (analysis/claude.ts); the Element, the code and the Verify line stay as written here.
/** code.label says what Avara did with the code: "Suggested CSS" (not tested), "Verified at 320px and 390px" (applied and remeasured at both
 *  phone widths), or a tested-on-a-copy note for an attribute removal. It is generated from actual results, never assumed. */
export type FixParts = { element: string; change: string; code?: { language: string; text: string; label?: string } | null; verify: string; manual?: string | null };
export const defaultLabel = (language: string) => (language === 'css' ? 'Suggested CSS' : language === 'html' ? 'Suggested HTML' : 'Suggested code');

export function formatFix(p: FixParts): string {
  return [
    `Element: ${oneLine(p.element)}`,
    `Change: ${oneLine(p.change)}`,
    ...(p.code ? [`${oneLine(p.code.label ?? defaultLabel(p.code.language))}:`, '```' + p.code.language, p.code.text, '```'] : []),
    `Verify: ${oneLine(p.verify)}${p.manual ? ` Manual check: ${oneLine(p.manual)}` : ''}`,
  ].join('\n');
}
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Code goes into a fix only when a builder can apply it as written: no [bracketed] or … placeholders, short, and no long selector. */
export function safeCode(text: string | undefined | null, max = 280): boolean {
  if (!text || !text.trim()) return false;
  if (/\[[^\]\n]*\]|…|\.\.\.|<!--/.test(text)) return false;
  if (text.length > max) return false;
  return !text.split('\n').some((l) => /(?:nth-child|>\s*\S+\s*>\s*\S+\s*>)/.test(l));
}

export type Viewport = 'desktop' | 'mobile';
// The phone (mobile) is 390px wide; the focused reflow pass (narrow) is 320px wide.
export const VIEWPORT_WIDTH: Record<string, number> = { desktop: 1280, mobile: 390, narrow: 320 };
const phoneWidths = (vps: readonly string[] | undefined) => (vps ?? []).filter((v) => v !== 'desktop').map((v) => VIEWPORT_WIDTH[v] ?? 390).sort((a, b) => b - a);
/** "on desktop (1280px wide)", "on a phone (390px wide)", "on a phone (390px and 320px wide)" or desktop and phone. */
export function viewportText(vps: readonly string[] | undefined, width?: number): string {
  if (width) return width <= 480 ? `on a phone (${width}px wide)` : `on desktop (${width}px wide)`;
  const d = !!vps?.includes('desktop'), ph = phoneWidths(vps);
  const phone = ph.length ? `on a phone (${ph.join('px and ')}px wide)` : '';
  return d && phone ? `on desktop (1280px wide) and ${phone}` : phone || 'on desktop (1280px wide)';
}
/** The same place, as a Verify instruction: "at 1280px wide", "at 390px wide", or several widths. */
export function viewportAt(vps: readonly string[] | undefined, width?: number): string {
  if (width) return `at ${width}px wide`;
  const ws = [...(vps?.includes('desktop') ? [1280] : []), ...phoneWidths(vps)];
  return ws.length ? `at ${ws.join('px and ')}px wide` : 'at 1280px wide';
}

/** The page region a selector points into, from its landmarks. */
export function sectionOf(selector: string): string | null {
  const s = selector.toLowerCase();
  const hit = (re: RegExp) => re.test(s);
  if (hit(/(^|[\s>])(\[role="?dialog"?\]|dialog)\b/)) return 'dialog';
  if (hit(/(^|[\s>])nav\b|\[role="?navigation/)) return 'navigation';
  if (hit(/(^|[\s>])header\b|\[role="?banner/)) return 'header';
  if (hit(/(^|[\s>])footer\b|\[role="?contentinfo/)) return 'footer';
  if (hit(/(^|[\s>])form\b/)) return 'form';
  if (hit(/(^|[\s>])aside\b/)) return 'sidebar';
  if (hit(/(^|[\s>])main\b|\[role="?main/)) return 'main content';
  return null;
}

/** A selector worth showing: the last step only, when it has an id or class and is short. Long generated paths are never shown. */
export function shortSelector(selector: string): string | null {
  const last = selector.split(/\s*>\s*|\s+/).filter(Boolean).pop() ?? '';
  if (!last || last.length > 48 || /nth-child|nth-of-type/.test(last) || !/[#.\[]/.test(last)) return null;
  return last;
}

const attr = (html: string, name: string) => html.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((x) => x !== undefined) ?? null;
const text = (html: string) => html.replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** What a builder would call the element: its visible label, else its accessible name or alt, else its asset file name. */
export function elementName(html: string): string | null {
  const t = text(html); if (t) return t.length > 50 ? t.slice(0, 49) + '…' : t;
  const named = attr(html, 'aria-label') || attr(html, 'alt') || attr(html, 'title') || attr(html, 'placeholder') || attr(html, 'value');
  if (named && named.trim()) return named.trim().slice(0, 50);
  const src = attr(html, 'src'); if (src) { const f = src.split(/[?#]/)[0].split('/').pop(); if (f && f.length <= 60) return f; }
  return null;
}
export function roleWord(html: string): string {
  const tag = (html.match(/^<\s*([a-z0-9-]+)/i)?.[1] ?? '').toLowerCase(); const role = (attr(html, 'role') ?? '').toLowerCase();
  if (role === 'button' || tag === 'button' || (tag === 'input' && /^(button|submit|reset|image)$/i.test(attr(html, 'type') ?? ''))) return /<svg|<img/i.test(html) && !text(html) ? 'icon button' : 'button';
  if (role === 'link' || tag === 'a') return 'link';
  if (tag === 'img' || role === 'img') return 'image';
  if (tag === 'svg') return 'icon';
  if (['input', 'select', 'textarea'].includes(tag)) return 'field';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (role === 'tablist') return 'tab set';
  if (['p', 'span', 'li', 'label', 'strong', 'em', 'small'].includes(tag)) return 'text';
  return 'element';
}

/** "“Book a demo” button in the main content, on desktop (1280px wide)" with the count of further copies, if any. */
export function describeElement(o: { html: string; selector: string; viewports?: readonly string[]; width?: number; count?: number; name?: string | null }): { phrase: string; name: string | null; role: string } {
  const name = o.name !== undefined ? o.name : elementName(o.html); const role = roleWord(o.html); const section = sectionOf(o.selector);
  const sel = name ? null : shortSelector(o.selector);
  const who = name ? `“${name}” ${role}` : `The ${role}${sel ? ` (${sel})` : ''}`;
  const more = o.count && o.count > 1 ? `, and ${o.count - 1} more like it` : '';
  return { phrase: `${who}${section ? ` in the ${section}` : ''}, ${viewportText(o.viewports, o.width)}${more}`, name, role };
}

// ---------- When CSS is paste-ready ----------
// A CSS patch is emitted only when (1) a short selector was confirmed, in the captured state, to match exactly the measured element
// (scanner/code-evidence.ts), and (2) any breakpoint it uses is supported by evidence: either the problem was measured at every captured
// width (no breakpoint needed), or the page's own stylesheet sets this property on this element under an @media rule whose condition holds
// where the problem was seen and not where it was clear. Avara never guesses a breakpoint. Otherwise the fix is the plain Change sentence.
export type MediaRule = { media: string | null; prop: string; value: string };
export type CodeTarget = { found: boolean; stable: string | null; naive: { selector: string; count: number } | null; media: MediaRule[]; unreadableSheets: number };

type Cond = { min?: number; max?: number };
/** min-width / max-width in px, joined by "and", optionally after a media type. Anything else (em, orientation, hover, or, not) is unsupported. */
export function parseMedia(q: string): Cond | null {
  const s = q.trim().toLowerCase().replace(/^(only\s+)?(screen|all)\s+and\s+/, '');
  if (!s || /,|\bor\b|\bnot\b/.test(s)) return null;
  const c: Cond = {};
  for (const part of s.split(/\s+and\s+/)) {
    const m = part.match(/^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/); if (!m) return null;
    if (m[1] === 'min') c.min = Math.max(c.min ?? 0, Number(m[2])); else c.max = Math.min(c.max ?? Infinity, Number(m[2]));
  }
  return c;
}
const holds = (c: Cond, w: number) => (c.min == null || w >= c.min) && (c.max == null || w <= c.max);
const fmtPx = (n: number) => `${Number(n.toFixed(2))}px`;

export type Breakpoint = { query: string | null; because: string };
/** The media condition a fix may use, or null when no evidence supports one. query null = no breakpoint needed. */
export function breakpointFor(rules: MediaRule[], o: { prop: string; problem: RegExp; seenAt: number[]; clearAt: number[] }): Breakpoint | null {
  if (!o.seenAt.length) return null;
  if (!o.clearAt.length) return { query: null, because: `the problem was measured at every captured width (${o.seenAt.join(' and ')}px)` };
  for (const r of rules.filter((x) => x.prop === o.prop && x.media)) {
    const c = parseMedia(r.media!); if (!c) continue;
    const bad = o.problem.test(r.value);
    if (bad && o.seenAt.every((w) => holds(c, w)) && o.clearAt.every((w) => !holds(c, w))) return { query: `@media ${r.media!.trim()}`, because: `the page’s own @media ${r.media!.trim()} rule sets ${o.prop}: ${r.value} on it` };
    if (!bad && o.clearAt.every((w) => holds(c, w)) && o.seenAt.every((w) => !holds(c, w))) {
      if (c.min != null && c.max == null) return { query: `@media (max-width: ${fmtPx(c.min - 0.02)})`, because: `the page’s own @media ${r.media!.trim()} rule sets ${o.prop}: ${r.value} from ${c.min}px up` };
      if (c.max != null && c.min == null) return { query: `@media (min-width: ${fmtPx(c.max + 0.02)})`, because: `the page’s own @media ${r.media!.trim()} rule sets ${o.prop}: ${r.value} up to ${c.max}px` };
    }
  }
  return null;
}

/** Why no CSS was given, in the builder's terms; null when CSS was given. */
export function whyNoCss(t: CodeTarget | null | undefined, bp: Breakpoint | null | 'n/a'): string | null {
  if (!t || !t.found) return 'Avara could not re-find this element to confirm a selector, so no code is given.';
  if (!t.stable) return t.naive && t.naive.count > 1 ? `${t.naive.count} elements match ${t.naive.selector}, so a rule on it would change more than this one.` : 'No short selector matches only this element, so no code is given.';
  if (bp === null) return 'Avara saw the problem at some widths only and found no breakpoint in the page’s own CSS for it, so no code is given.';
  return null;
}

/** Paste-ready CSS: the confirmed selector, wrapped in the evidenced breakpoint when one is needed. */
export function cssPatch(selector: string, declarations: string, bp: Breakpoint): string {
  const rule = `${selector} { ${declarations} }`;
  return bp.query ? `${bp.query} {\n  ${rule}\n}` : rule;
}
