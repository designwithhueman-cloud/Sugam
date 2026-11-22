// Pure helpers for DIFF-002's hero comparison: the shapes of the stored data and the plain-language layout comparison. No fs, no child processes,
// so the rule engine's detectors (src/services/scan-service/derived.ts) and the report can import it anywhere.

export type Box = { x: number; y: number; w: number; h: number };
/** What scanner/hero-probe.ts measures on a first screen. */
export type HeroLayout = {
  viewport: { width: number; height: number }; layout: string;
  headline: { align: 'left' | 'centre' | 'right' | 'none'; box: Box; fontSize: number; lines: number; words: number } | null;
  ctas: { count: number; row: boolean; position: string; boxes: Box[] }; media: { position: string; box: Box | null }; pill: boolean; tone: 'light' | 'dark' | 'gradient' | 'photo';
  nav: { present: boolean; links: number; cta: boolean };
};
export type ReferenceInfo = { id: string; name: string; kind: 'template' | 'fixture'; origin: string; license: string; ownership: string; viewport: { width: number; height: number }; screenshot: string; sha256: string; layout: HeroLayout };
export type Candidate = { id: string; name: string; kind: 'template' | 'fixture'; origin: string; license: string; similarity: number; shared: string[]; differs: string[] };
export type HeroSkip = 'disabled' | 'no_capture' | 'no_layout' | 'no_references' | 'model_unavailable' | 'model_failed' | 'model_mismatch' | 'viewport_mismatch';
export type HeroMatch =
  | { status: 'ok'; model: string; referenceSet: string; references: number; candidates: Candidate[]; threshold: { minSimilarity: number; minShared: number; validated: boolean } | null; surfaced: boolean; reason: string }
  | { status: 'skipped'; skip: HeroSkip; reason: string; model?: string; referenceSet?: string };

const LAYOUT_WORDS: Record<string, string> = {
  'centred stack': 'a centred stack (headline, line of text and buttons one above the other in the middle)', 'left-aligned stack': 'a left-aligned stack with no main image beside it',
  'split: text left, image right': 'a split layout with the text on the left and the main image on the right', 'split: image left, text right': 'a split layout with the main image on the left and the text on the right',
  'headline over a full-bleed image': 'the headline laid over a full-width background image',
};
const n = (k: number) => (['no', 'one', 'two', 'three', 'four', 'five', 'six'][k] ?? String(k));
const ctaWords = (l: HeroLayout) => `${n(Math.min(l.ctas.count, 6))} button${l.ctas.count === 1 ? '' : 's'}${l.ctas.count >= 2 ? (l.ctas.row ? ' side by side' : ' stacked') : ''}${l.ctas.position !== 'none' ? `, ${l.ctas.position}` : ''}`;
const TONE: Record<string, string> = { light: 'a light background', dark: 'a dark background', gradient: 'a gradient background', photo: 'a photograph' };

/** Which observable features two first screens share, in plain language. Section order is never compared here: DIFF-001 owns it. */
export function compareLayouts(a: HeroLayout, b: HeroLayout): { shared: string[]; differs: string[] } {
  const shared: string[] = [], differs: string[] = [];
  const both = (ok: boolean, yes: string, no: string) => (ok ? shared : differs).push(ok ? yes : no);
  if (a.layout !== 'no headline' && b.layout !== 'no headline') both(a.layout === b.layout, `Both first screens use ${LAYOUT_WORDS[a.layout] ?? a.layout}.`, `The layouts differ: this page uses ${LAYOUT_WORDS[a.layout] ?? a.layout}; the reference uses ${LAYOUT_WORDS[b.layout] ?? b.layout}.`);
  if (a.headline && b.headline) {
    both(a.headline.align === b.headline.align, `Both ${a.headline.align === 'centre' ? 'centre' : a.headline.align === 'left' ? 'left-align' : 'right-align'} the headline.`, `The headline is ${a.headline.align === 'centre' ? 'centred' : `${a.headline.align}-aligned`} here and ${b.headline.align === 'centre' ? 'centred' : `${b.headline.align}-aligned`} in the reference.`);
    const ra = a.headline.fontSize / b.headline.fontSize; const close = ra > 0.8 && ra < 1.25 && Math.abs(a.headline.lines - b.headline.lines) <= 1;
    both(close, `Both headlines are set large (${a.headline.fontSize}px and ${b.headline.fontSize}px) over ${a.headline.lines === b.headline.lines ? `${n(a.headline.lines)} line${a.headline.lines === 1 ? '' : 's'}` : 'a similar number of lines'}.`, a.headline.fontSize === b.headline.fontSize ? `The headline runs to ${a.headline.lines} line${a.headline.lines === 1 ? '' : 's'} here and ${b.headline.lines} in the reference.` : `The headline sizes differ (${a.headline.fontSize}px here, ${b.headline.fontSize}px in the reference).`);
    const ya = a.headline.box.y / a.viewport.height, yb = b.headline.box.y / b.viewport.height; both(Math.abs(ya - yb) < 0.12, `Both start the headline about ${Math.round(((ya + yb) / 2) * 100)}% of the way down the screen.`, `The headline starts ${Math.round(ya * 100)}% down here and ${Math.round(yb * 100)}% down in the reference.`);
  }
  const ca = Math.min(a.ctas.count, 2), cb = Math.min(b.ctas.count, 2);
  both(ca === cb && a.ctas.position === b.ctas.position && (ca < 2 || a.ctas.row === b.ctas.row), `Both put ${ctaWords(a)}.`, `The buttons differ: ${ctaWords(a)} here; ${ctaWords(b)} in the reference.`);
  if (a.media.position !== 'none' || b.media.position !== 'none') both(a.media.position === b.media.position, `Both put the main image ${a.media.position === 'full-bleed behind text' ? 'full-width behind the text' : a.media.position}.`, `The main image is ${a.media.position === 'none' ? 'absent' : a.media.position} here and ${b.media.position === 'none' ? 'absent' : b.media.position} in the reference.`);
  if (a.pill || b.pill) both(a.pill && b.pill, 'Both have a small rounded label above the headline.', `${a.pill ? 'This page' : 'The reference'} has a small rounded label above the headline; ${a.pill ? 'the reference' : 'this page'} does not.`);
  both(a.tone === b.tone, `Both set the headline on ${TONE[a.tone]}.`, `The headline sits on ${TONE[a.tone]} here and on ${TONE[b.tone]} in the reference.`);
  if (a.nav.present && b.nav.present) both(Math.abs(a.nav.links - b.nav.links) <= 2 && a.nav.cta === b.nav.cta, `Both have a top bar with about ${Math.round((a.nav.links + b.nav.links) / 2)} links${a.nav.cta ? ' and a filled button' : ''}.`, `The top bars differ (${a.nav.links} links here, ${b.nav.links} in the reference).`);
  return { shared, differs };
}

/** A reference id that the report can turn into the side-by-side view. Kept in the finding's evidence so it survives storage unchanged. */
export const refTag = (id: string) => `[ref:${id}]`;
export const refFromEvidence = (ev: string[]) => { for (const e of ev) { const m = /\[ref:([a-z0-9-]+)\]/.exec(e); if (m) return m[1]; } return null; };
