// Pure rules for journey discovery (no browser, no I/O): which links may be followed, how paths are de-duplicated, what a journey is for, how to
// select a link, and what success could look like. The browser part is packages/flow-engine/discover.ts.
import { DESTRUCTIVE_PATH, DESTRUCTIVE_WORDS } from '../policy-engine/index.ts';
import type { Assertion, Journey, JourneyPurpose, Step } from '../contracts/index.ts';

export const LIMITS = { pages: 8, depth: 2, linksPerPage: 25, totalMs: 45_000, navMs: 8_000 } as const;

/** One address with the parts that do not identify a page removed: query, fragment, trailing slash, and id-like path segments. */
export function normKey(url: string): string {
  try {
    const u = new URL(url); const segs = u.pathname.toLowerCase().split('/').filter(Boolean).map((s) => (/^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s) || /^[0-9a-f]{16,}$/.test(s) ? ':id' : s));
    return `${u.origin}/${segs.join('/')}`;
  } catch { return url; }
}
export const pathOf = (url: string) => { try { const u = new URL(url); return u.pathname || '/'; } catch { return '/'; } };

export type RawLink = { text: string; href: string; attrHref: string; id: string; testId: string; aria: string; targetBlank: boolean; visible: boolean; idCount: number; hrefCount: number };
/** Why a link must not be followed, or null when it may be. Mirrors the safety rules a saved flow runs under. */
export function skipReason(l: RawLink, origin: string): string | null {
  if (!l.visible) return 'hidden link';
  let u: URL; try { u = new URL(l.href); } catch { return 'not a web address'; }
  if (!/^https?:$/.test(u.protocol)) return 'not a web page (mail, phone or script)';
  if (u.origin !== origin) return 'leaves the site';
  if (l.targetBlank) return 'opens a new tab';
  if (/^#/.test(l.attrHref) || (u.pathname === '/' && !u.search && l.attrHref.startsWith('#'))) return 'same-page anchor';
  if (DESTRUCTIVE_WORDS.test(l.text) || DESTRUCTIVE_WORDS.test(l.aria)) return 'looks like an action that changes something';
  if (DESTRUCTIVE_PATH.test(u.pathname + u.search)) return 'looks like a state-changing address';
  if (/\.(pdf|zip|docx?|xlsx?|png|jpe?g|gif|svg|mp4|mp3)$/i.test(u.pathname)) return 'a file, not a page';
  return null;
}

/** A CSS selector for a link, in order of stability: id, test id, aria-label, exact href. */
export function selectorFor(l: RawLink): string | null {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (l.id && /^[A-Za-z][\w-]*$/.test(l.id) && l.idCount === 1) return `#${l.id}`;
  if (l.testId) return `a[data-testid="${esc(l.testId)}"]`;
  if (l.aria && !l.id) return `a[aria-label="${esc(l.aria)}"]`;
  if (l.attrHref && !/^javascript:/i.test(l.attrHref)) return `a[href="${esc(l.attrHref)}"]`;
  return null;
}

const RULES: [JourneyPurpose, RegExp][] = [
  ['booking', /\b(book(ing)?|schedule|appointment|reserve|reservation|calendar|demo|consult(ation)?|call)\b/i],
  ['signup', /\b(sign ?up|register|get started|create (an )?account|join|start (free|now)|free trial|trial)\b/i],
  ['pricing', /\b(pricing|plans?|prices?)\b/i],
  ['contact', /\b(contact|get in touch|support|talk to)\b/i],
  ['login', /\b(log ?in|sign ?in)\b/i],
];
/** What a journey is for, from the link text and address first (the visitor's own words), then the page's title and heading. */
export function purposeOf(parts: { linkText: string; path: string; title: string; h1: string }): JourneyPurpose {
  for (const text of [`${parts.linkText} ${parts.path.replace(/[/_-]+/g, ' ')}`, `${parts.title} ${parts.h1}`]) for (const [p, re] of RULES) if (re.test(text)) return p;
  return 'other';
}

export type PageSnapshot = { url: string; title: string; h1: string; keyElement: { selector: string; label: string } | null };
/** Success conditions a visitor would notice: the address, the main heading, and a key element such as a calendar or form. At most three. */
export function suggestSuccess(page: PageSnapshot): Assertion[] {
  const out: Assertion[] = []; const p = pathOf(page.url);
  if (p !== '/') out.push({ type: 'url_contains', value: p.slice(0, 280) });
  if (page.h1) out.push({ type: 'text_contains', text: page.h1.slice(0, 120) });
  if (page.keyElement) out.push({ type: 'visible', selector: page.keyElement.selector.slice(0, 280) });
  return out.slice(0, 3);
}

/** Plain-words description of one success condition, for the owner to read and edit. */
export function describeAssertion(a: Assertion): string {
  const nice = (s: string) => s.replace(/^[#.]|\[|\]|"|'|data-testid=|id\*?=|\*=/g, ' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (a.type === 'visible') return `The ${nice(a.selector)} appears`;
  if (a.type === 'hidden') return `The ${nice(a.selector)} is gone`;
  if (a.type === 'text_contains') return `The page says “${a.text}”`;
  if (a.type === 'url_contains') return `The address contains “${a.value}”`;
  return `The page title contains “${a.value}”`;
}

export type FoundPage = { snapshot: PageSnapshot; linkText: string; steps: Step[]; depth: number };
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

/** Turns the pages the browser reached into journeys: one per distinct final page, the shortest path kept, and a journey that is only the first
 *  part of a longer one with the same purpose dropped. Most useful purposes first. */
export function buildJourneys(pages: FoundPage[], startUrl: string): Journey[] {
  const byKey = new Map<string, FoundPage>();
  for (const p of pages) { const k = normKey(p.snapshot.url); const have = byKey.get(k); if (!have || p.steps.length < have.steps.length) byKey.set(k, p); }
  const rows = [...byKey.values()].map((p) => ({ p, purpose: purposeOf({ linkText: p.linkText, path: pathOf(p.snapshot.url), title: p.snapshot.title, h1: p.snapshot.h1 }) }));
  const prefixOf = (a: typeof rows[number], b: typeof rows[number]) => a !== b && a.purpose === b.purpose && b.p.steps.length > a.p.steps.length && a.p.steps.every((s, i) => JSON.stringify([s.action, (s as { selector?: string }).selector]) === JSON.stringify([b.p.steps[i].action, (b.p.steps[i] as { selector?: string }).selector]));
  const kept = rows.filter((r) => !rows.some((o) => prefixOf(r, o)));
  const rank: Record<JourneyPurpose, number> = { booking: 0, signup: 1, pricing: 2, contact: 3, login: 4, other: 5 };
  kept.sort((a, b) => rank[a.purpose] - rank[b.purpose]);
  return kept.slice(0, 12).map(({ p, purpose }): Journey => {
    const suggested = suggestSuccess(p.snapshot);
    const steps = p.steps.map((s, i) => ({ ...s, expect: i === p.steps.length - 1 ? suggested : s.expect })) as Step[];
    const key = `${purpose}|${normKey(p.snapshot.url)}`;
    const title = purpose === 'other' ? (p.snapshot.h1 || p.snapshot.title || pathOf(p.snapshot.url)).slice(0, 80) : ({ booking: 'Book a call or appointment', signup: 'Sign up', pricing: 'See pricing', contact: 'Contact', login: 'Open the sign-in page', other: '' })[purpose];
    const observed = [`Open ${pathOf(startUrl) === '/' ? 'the home page' : pathOf(startUrl)}`, ...p.steps.map((s) => `Click ‘${(s.label ?? '').replace(/^Click ‘?|’$/g, '') || (s as { selector?: string }).selector}’`)];
    return { id: hash(key), key, purpose, title, steps, observed: [...observed, `Land on ${pathOf(p.snapshot.url)}${p.snapshot.h1 ? ` (“${p.snapshot.h1.slice(0, 50)}”)` : ''}`], finalUrl: p.snapshot.url, finalTitle: p.snapshot.title };
  });
}

/** The click path of a journey, for deciding whether a rediscovered journey differs from the saved one. */
export const pathSignature = (steps: { action: string; selector?: string }[]) => steps.map((s) => `${s.action}:${s.selector ?? ''}`).join('>');
