// Detectors that read what the scan already measured and report on one rule each. Every function is a pure read of the scan output; the thresholds are
// written next to the code that uses them. A detector returns one of: ran with hits (failures or items for a person), ran with none (pass),
// ran but the rule does not apply (notApplicable), or did not run (the measurement is missing). Each detector id appears in exactly one rule's JSON.
import type { ScanOutput, ViewportResult } from '../../../scanner/scanner.ts';
import type { PerfAudit } from '../../../scanner/perf.ts';
import type { DetectorHit, DetectorReport } from '../../engines/rule-engine/RuleTypes.ts';
import { ruleLoader } from '../../engines/rule-engine/RuleLoader.ts';
import { heroMatchReport } from '../vision/hero-detector.ts';
import type { HeroMatch } from '../vision/hero-layout.ts';

const short = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const ran = (hits: DetectorHit[] = []): DetectorReport => ({ ran: true, hits });
const na = (why: string): DetectorReport => ({ ran: true, hits: [], notApplicable: why });
const off = (why: string): DetectorReport => ({ ran: false, hits: [], note: why });
const fail = (title: string, summary: string, evidence: string[]): DetectorHit => ({ bucket: 'confirmed_failure', title, summary, evidence: evidence.map((e) => short(e)) });
const review = (title: string, summary: string, evidence: string[]): DetectorHit => ({ bucket: 'needs_review', title, summary, evidence: evidence.map((e) => short(e)) });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

type Link = { text: string; href: string | null };
type Cta = { text: string; href: string | null; style?: { bg: string; fontSize: number; fontWeight: string; radius: number; width: number; height: number; filled: boolean } };
type PageCtx = {
  headings?: { level: number; text: string }[]; ctas?: Cta[]; forms?: { fields: { type: string; label: string; required: boolean; name: string | null }[]; submit: string }[];
  contact?: { mailto: string[]; tel: string[]; contactLinks: Link[]; emailInText: string | null }; legalLinks?: { privacy: Link[]; terms: Link[] };
  linkTargets?: { contact: Link[]; support: Link[]; reviews: Link[]; trial: Link[] }; trialMentions?: string[]; reviewClaims?: string[]; agreeMentions?: string[]; personalDataForms?: number;
  reading?: { totalWords: number; longestRunWords: number; underHeading: string | null }; typography?: { role: string; fontSize: string }[]; linkChecks?: Record<string, number | string>;
};
const vp = (out: ScanOutput, n: 'desktop' | 'mobile') => out.viewports.find((v) => v.name === n);

// ---- link outcome: did the address open? ----
function linkState(pc: PageCtx, l: Link | undefined): 'missing' | 'ok' | 'broken' | 'unchecked' {
  if (!l?.href) return 'missing';
  const s = pc.linkChecks?.[l.href];
  if (s === undefined) return 'unchecked';
  return typeof s === 'number' && s < 400 ? 'ok' : 'broken';
}
const linkEvidence = (pc: PageCtx, l: Link) => `${l.text} -> ${l.href} (${pc.linkChecks?.[l.href ?? ''] ?? 'not checked'})`;

// ---- main action ----
function mainAction(v: ViewportResult | undefined) {
  const c = v?.avara?.candidates[0]; return c ? { text: c.candidate.text, selector: c.candidate.selector, m: c.measurement, cls: c.classification } : null;
}
function primaryTaskVisible(out: ScanOutput): DetectorReport {
  const vs = (['desktop', 'mobile'] as const).map((n) => [n, vp(out, n)] as const).filter(([, v]) => v?.avara);
  if (!vs.length) return off('The main-action check did not run.');
  const hits: DetectorHit[] = []; let seen = 0;
  for (const [n, v] of vs) { const a = mainAction(v); if (!a?.m) continue; seen++; if (a.m.belowFirstScreen) hits.push(fail(`“${a.text}” is below the first screen on ${n}`, `On ${n}, the main action “${a.text}” starts ${Math.round(a.m.box.y)}px down, below the first screen.`, [`${a.selector}  top ${Math.round(a.m.box.y)}px, screen ${n === 'mobile' ? 640 : 800}px tall`])); }
  return seen ? ran(hits) : ran([review('No main action found', 'Sugam could not identify a main action to check. Confirm the goal when you scan.', ['looked for buttons and links that look like the main action; none scored high enough'])]);
}
function ctaVisible(out: ScanOutput): DetectorReport {
  const v = vp(out, 'desktop'); if (!v?.avara) return off('The main-action check did not run.');
  const a = mainAction(v); if (!a?.m || !a.cls) return ran([review('No main action found', 'Sugam could not identify the conversion entry point on desktop.', ['looked for buttons and links that look like the main action; none scored high enough'])]);
  return ran(a.cls.level === 'ok' ? [] : [fail(`“${a.text}” is not available on desktop`, `On desktop, “${a.text}” ${a.cls.reasons[0] ?? 'cannot be used'}`.trim(), [`${a.selector}  visible ${Math.round(a.m.visibleRatio * 100)}%, ${a.m.width} by ${a.m.height} px`])]);
}

// ---- 320px page observations ----
type MP = { images: { selector: string; nw: number; nh: number; rw: number; rh: number; fit: string; right: number; svg: boolean; loaded: boolean }[]; viewportMeta: string | null; innerWidth: number; textCount: number; smallCount: number; smallSamples: { selector: string; px: number; text: string }[]; inputs: { selector: string; px: number; right: number }[] };
type TR = { baselineClipped: { selector: string; kind: string; by: number; text: string }[]; newlyClipped: { selector: string; kind: string; by: number; text: string }[]; scaled: number };
function contentScaling(out: ScanOutput): DetectorReport {
  const tr = vp(out, 'mobile')?.textResize as TR | null | undefined; if (!tr) return off('The text-size check did not run.');
  return ran(tr.newlyClipped.length ? [fail('Text clips when it is made 200% larger', `${tr.newlyClipped.length} element${tr.newlyClipped.length === 1 ? '' : 's'} lose text or controls when text is doubled at 320px wide.`, tr.newlyClipped.map((x) => `${x.selector}  clipped by ${x.by}px (${x.kind})  "${x.text}"`))] : []);
}
function layoutIntegrity(out: ScanOutput): DetectorReport {
  const tr = vp(out, 'mobile')?.textResize as TR | null | undefined; if (!tr) return off('The 320px layout check did not run.');
  return ran(tr.baselineClipped.length ? [review('Content is clipped at 320px wide', `${tr.baselineClipped.length} element${tr.baselineClipped.length === 1 ? ' is' : 's are'} clipped by their container at 320px. It may be intended (a carousel); a person should confirm.`, tr.baselineClipped.map((x) => `${x.selector}  clipped by ${x.by}px (${x.kind})  "${x.text}"`))] : []);
}
function orientation(out: ScanOutput): DetectorReport {
  const m = vp(out, 'mobile'); const o = m?.orientation; const mp = m?.mobileProbe as MP | null | undefined;
  if (!m || (o === undefined && !mp)) return off('The phone-width pass did not run.');
  const hits: DetectorHit[] = [];
  if (mp && mp.viewportMeta == null) hits.push(fail('The page has no viewport tag', 'Without <meta name="viewport"> phones show the page at desktop width and shrink it.', ['<head> has no meta name="viewport"']));
  if (o) {
    if (o.docW > o.vw + 1) hits.push(fail('The page scrolls sideways when the phone is turned', `In landscape (640px wide) the page is ${o.docW}px wide.`, [`document width ${o.docW}px, screen ${o.vw}px`]));
    if (o.action && o.action.level !== 'ok') hits.push(fail(`“${o.action.text}” stops working in landscape`, `In landscape “${o.action.text}” ${o.action.reasons[0] ?? 'is not usable'}`, [`level ${o.action.level}`]));
  } else if (!mp) return off('The landscape check did not run.');
  return ran(hits);
}
function mobileTypography(out: ScanOutput): DetectorReport {
  const mp = vp(out, 'mobile')?.mobileProbe as MP | null | undefined; if (!mp) return off('The 320px text check did not run.');
  return ran(mp.smallCount ? [review('Some text is smaller than 12px on a phone', `${mp.smallCount} of ${mp.textCount} text elements are under 12px at 320px. Whether that hurts reading is a judgement.`, mp.smallSamples.map((s) => `${s.selector}  ${s.px}px  "${s.text}"`))] : []);
}
function mobileForm(out: ScanOutput): DetectorReport {
  const mp = vp(out, 'mobile')?.mobileProbe as MP | null | undefined; if (!mp) return off('The 320px form check did not run.');
  if (!mp.inputs.length) return na('No form fields on this page.');
  const hits: DetectorHit[] = []; const out_ = mp.inputs.filter((i) => i.right > mp.innerWidth + 1); const small = mp.inputs.filter((i) => i.px < 16);
  if (out_.length) hits.push(fail('A form field runs past the edge of the phone screen', `${out_.length} field${out_.length === 1 ? '' : 's'} extend beyond 320px.`, out_.map((i) => `${i.selector}  right edge ${i.right}px`)));
  if (small.length) hits.push(review('Form text is under 16px, which can make phones zoom in', `${small.length} field${small.length === 1 ? '' : 's'} use text under 16px; some phones zoom the page when such a field is focused.`, small.map((i) => `${i.selector}  ${i.px}px`)));
  return ran(hits);
}
function imageResponsiveness(out: ScanOutput): DetectorReport {
  const mp = vp(out, 'mobile')?.mobileProbe as MP | null | undefined; if (!mp) return off('The 320px image check did not run.');
  const imgs = mp.images.filter((i) => i.loaded); if (!imgs.length) return na('No loaded images on this page.');
  const hits: DetectorHit[] = []; const over = imgs.filter((i) => i.rw > mp.innerWidth + 1 || i.right > mp.innerWidth + 1);
  const bent = imgs.filter((i) => !i.svg && (i.fit === 'fill' || i.fit === '') && i.nw > 0 && i.nh > 0 && i.rw > 40 && i.rh > 40 && Math.abs((i.rw / i.rh) / (i.nw / i.nh) - 1) > 0.08);
  if (over.length) hits.push(fail('An image is wider than the phone screen', `${over.length} image${over.length === 1 ? '' : 's'} overflow at 320px.`, over.map((i) => `${i.selector}  ${i.rw}px wide, right edge ${i.right}px`)));
  if (bent.length) hits.push(fail('An image is stretched out of proportion', `${bent.length} image${bent.length === 1 ? ' is' : 's are'} shown at a different shape than the file (more than 8% off).`, bent.map((i) => `${i.selector}  file ${i.nw}x${i.nh}, shown ${i.rw}x${i.rh}`)));
  return ran(hits);
}

// ---- trust: what the page offers, and whether it opens ----
function statusHit(pc: PageCtx, what: string, l: Link | undefined, mustHave: boolean): DetectorHit | null {
  const st = linkState(pc, l);
  if (st === 'missing') return mustHave ? fail(`${what} link is missing`, `${what} is needed here and no link to it was found on the page.`, [`looked for a link whose text or address mentions ${what.toLowerCase().split(' ')[0]}; none found`]) : null;
  if (st === 'broken') return fail(`${what} link does not open`, `The ${what.toLowerCase()} link “${l!.text}” did not open (${pc.linkChecks?.[l!.href ?? '']}).`, [linkEvidence(pc, l!)]);
  if (st === 'unchecked') return review(`${what} link not checked`, `A ${what.toLowerCase()} link exists but Sugam could not confirm it opens.`, [linkEvidence(pc, l!)]);
  return null;
}
function privacy(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  if (!pc.personalDataForms) return na('No form asks for personal information.');
  const h = statusHit(pc, 'Privacy policy', pc.legalLinks?.privacy[0], true); return ran(h ? [h] : []);
}
function terms(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  const referenced = (pc.legalLinks?.terms.length ?? 0) > 0 || (pc.agreeMentions?.length ?? 0) > 0;
  if (!referenced) return na('The page does not reference terms. (Whether terms are required is a legal question for the owner.)');
  const h = statusHit(pc, 'Terms', pc.legalLinks?.terms[0], true); return ran(h ? [h] : []);
}
function contact(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  const c = pc.contact; const route = (c?.mailto.length ?? 0) + (c?.tel.length ?? 0) + (c?.contactLinks.length ?? 0) + (c?.emailInText ? 1 : 0);
  return ran(route ? [] : [review('No contact route found on this page', 'No email, phone, contact link or address was found on this page. A route may exist on another page; a person should confirm.', ['looked for: mailto links, tel links, links named contact / get in touch / email us, and an email address in the text'])]);
}
function reviewRoute(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  if (!pc.reviewClaims?.length) return na('The page makes no review or rating claims. (Absence is neutral.)');
  const l = pc.linkTargets?.reviews[0]; const st = linkState(pc, l);
  if (st === 'ok') return ran([]);
  return ran([review(st === 'missing' ? 'Reviews are claimed with no route to them' : 'The route to the reviews did not open', `The page says “${short(pc.reviewClaims[0], 80)}” but ${st === 'missing' ? 'links to no source' : 'the link did not open'}.`, [pc.reviewClaims[0], ...(l ? [linkEvidence(pc, l)] : [])])]);
}
function supportRoute(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  const l = pc.linkTargets?.support[0] ?? pc.linkTargets?.contact[0]; const st = linkState(pc, l);
  if (st === 'missing') return ran(pc.contact && (pc.contact.mailto.length || pc.contact.tel.length) ? [] : [review('No way to get support was found', 'No support, help or contact link was found. Support may live in the product.', ['looked for: links named support / help / FAQ / customer service / contact, mailto and tel links'])]);
  const h = statusHit(pc, 'Support', l, false); return ran(h ? [h] : []);
}

// ---- conversion ----
function trial(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  if (!pc.trialMentions?.length) return na('No trial is offered on this page.');
  const entry = pc.linkTargets?.trial[0] ?? pc.ctas?.find((c) => /trial|try .*free|start free/i.test(c.text));
  return ran(entry ? [] : [review('A trial is mentioned but no entry point was found', `The page says “${short(pc.trialMentions[0], 80)}” and no trial button or link was found.`, [pc.trialMentions[0]])]);
}
function ctaConsistency(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  const withHref = (pc.ctas ?? []).filter((c) => c.href && !/#$/.test(c.href)); if (withHref.length < 2) return na('Fewer than two calls to action with a destination.');
  const by = new Map<string, Set<string>>(); for (const c of withHref) by.set(c.href!, (by.get(c.href!) ?? new Set()).add(norm(c.text)));
  const bad = [...by.entries()].filter(([, labels]) => labels.size > 1);
  return ran(bad.length ? [review('The same destination is offered under different labels', `${bad.length} destination${bad.length === 1 ? ' is' : 's are'} reached by buttons that say different things. Check the wording is deliberate.`, bad.map(([h, l]) => `${[...l].map((x) => `“${x}”`).join(' / ')} -> ${h}`))] : []);
}
function fieldCount(pc: PageCtx | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.');
  const forms = (pc.forms ?? []).filter((f) => f.fields.length > 1); if (!forms.length) return na('No form with more than one field.');
  const big = forms.map((f) => ({ f, n: f.fields.filter((x) => !/^(checkbox|radio|submit|button)$/.test(x.type)).length })).filter((x) => x.n > 5);
  return ran(big.length ? [review('A form asks for many fields', `${big.length} form${big.length === 1 ? ' has' : 's have'} more than 5 fields. Each may be needed; the owner has to confirm.`, big.map((x) => `${x.n} fields: ${x.f.fields.map((y) => y.label || y.name || y.type).slice(0, 8).join(', ')}`))] : []);
}

// ---- scannability ----
function scannability(pc: PageCtx | undefined): DetectorReport {
  if (!pc?.reading) return off('The page context was not captured.');
  const r = pc.reading; if (r.totalWords < 150) return na('The page has too little text to need headings.');
  return ran(r.longestRunWords >= 350 ? [review('A long stretch of text has no heading to break it up', `${r.longestRunWords} words run without a heading${r.underHeading ? `, after “${r.underHeading}”` : ' from the top of the page'}.`, [`${r.longestRunWords} words in a row of ${r.totalWords} on the page`])] : []);
}

// ---- design ----
const px = (s: string | undefined) => (s ? parseFloat(s) : NaN);
function typographyHierarchy(pc: PageCtx | undefined): DetectorReport {
  if (!pc?.typography) return off('The page context was not captured.');
  const g = (r: string) => px(pc.typography!.find((t) => t.role === r)?.fontSize); const h1 = g('h1'), h2 = g('h2'), body = g('body');
  if (!(h1 > 0) || !(body > 0)) return na('No heading or body text sample to compare.');
  const hits: DetectorHit[] = [];
  if (h2 > 0 && h1 <= h2) hits.push(fail('The main heading is not larger than the next heading', `The h1 is ${h1}px and the first h2 is ${h2}px.`, [`h1 ${h1}px, h2 ${h2}px, body ${body}px`]));
  else if (h1 / body < 1.25) hits.push(review('The main heading is barely larger than body text', `The h1 is ${h1}px against ${body}px body text (${(h1 / body).toFixed(2)} times).`, [`h1 ${h1}px, body ${body}px`]));
  return ran(hits);
}
function ctaEmphasis(out: ScanOutput, pc: PageCtx | undefined): DetectorReport {
  if (!pc?.ctas) return off('The page context was not captured.');
  const main = mainAction(vp(out, 'desktop')); const all = pc.ctas.filter((c) => c.style && c.style.height >= 24); if (!main || all.length < 2) return na('Fewer than two calls to action, or no main action identified.');
  const primary = all.find((c) => norm(c.text) === norm(main.text)); if (!primary?.style) return na('The main action was not among the sampled buttons.');
  const area = (c: Cta) => c.style!.width * c.style!.height; const hits: DetectorHit[] = [];
  for (const c of all) { if (c === primary || norm(c.text) === norm(primary.text)) continue;
    if (c.style!.filled && !primary.style.filled) hits.push(fail(`“${c.text}” is more emphasised than the main action`, `“${c.text}” is a filled button while “${primary.text}” is not.`, [`${c.text}: filled, ${c.style!.width}x${c.style!.height}`, `${primary.text}: not filled, ${primary.style.width}x${primary.style.height}`]));
    else if (c.style!.filled && primary.style.filled && area(c) > area(primary) * 1.5) hits.push(review(`“${c.text}” is much larger than the main action`, `“${c.text}” covers ${Math.round(area(c) / area(primary) * 10) / 10} times the area of “${primary.text}”.`, [`${c.text}: ${c.style!.width}x${c.style!.height}`, `${primary.text}: ${primary.style.width}x${primary.style.height}`])); }
  return ran(hits.slice(0, 3));
}
function componentConsistency(pc: PageCtx | undefined): DetectorReport {
  if (!pc?.ctas) return off('The page context was not captured.');
  const f = pc.ctas.filter((c) => c.style?.filled && c.style.height >= 30 && c.style.width >= 60); if (f.length < 2) return na('Fewer than two comparable filled buttons.');
  const hits: DetectorHit[] = [];
  for (let i = 1; i < f.length; i++) { const a = f[0].style!, b = f[i].style!; if (a.bg === b.bg && (Math.abs(a.radius - b.radius) >= 4 || Math.abs(a.fontSize - b.fontSize) >= 2)) hits.push(review('Buttons that look alike are styled differently', `“${f[0].text}” and “${f[i].text}” share a colour but differ in ${Math.abs(a.radius - b.radius) >= 4 ? 'corner radius' : 'text size'}.`, [`${f[0].text}: radius ${a.radius}px, text ${a.fontSize}px`, `${f[i].text}: radius ${b.radius}px, text ${b.fontSize}px`])); }
  return ran(hits.slice(0, 2));
}

// ---- performance: Lighthouse's resource audits ----
const A = (out: ScanOutput, id: string): PerfAudit | undefined => out.perf?.audits?.[id];
const items = (a: PerfAudit | undefined, n = 4) => (a?.items ?? []).slice(0, n);
function perfImages(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.');
  const ids = ['image-delivery-insight', 'uses-optimized-images', 'modern-image-formats', 'uses-responsive-images', 'offscreen-images', 'efficient-animated-content']; const au = ids.map((i) => [i, A(out, i)] as const).filter(([, a]) => a);
  const total = au.reduce((n, [, a]) => n + (a as PerfAudit).wastedBytes, 0);
  return ran(total >= 51200 ? [fail('Images could be much smaller', `Lighthouse found about ${kb(total)} that images could save (${au.filter(([, a]) => (a as PerfAudit).wastedBytes > 0).map(([i]) => i).join(', ')}).`, au.flatMap(([i, a]) => items(a as PerfAudit, 2).filter((x) => (x.wastedBytes ?? 0) > 0).map((x) => `${x.url}  could save ${kb(x.wastedBytes ?? 0)} (${i})`)).slice(0, 6))] : []);
}
function perfFonts(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.'); const a = A(out, 'font-display-insight') ?? A(out, 'font-display'); if (!a) return na('Lighthouse found no web fonts to assess.');
  return ran((a.score !== null && a.score < 1) || a.wastedMs > 0 ? [fail('Web fonts can hide text while they load', `Lighthouse reports text may stay invisible while ${items(a).length || 'some'} font file(s) load${a.wastedMs ? ` (about ${Math.round(a.wastedMs)} ms)` : ''}.`, items(a).map((x) => `${x.url}  ${Math.round(x.wastedMs ?? 0)} ms`))] : []);
}
function perfJs(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.'); const u = A(out, 'unused-javascript'), b = A(out, 'bootup-time'); if (!u && !b) return na('No script cost reported.');
  const hits: DetectorHit[] = [];
  if (u && u.wastedBytes >= 153600) hits.push(fail('A lot of JavaScript is never used on this page', `About ${kb(u.wastedBytes)} of JavaScript is downloaded and not used.`, items(u).map((x) => `${x.url}  unused ${kb(x.wastedBytes ?? 0)} of ${kb(x.totalBytes ?? 0)}`)));
  if (b && b.score !== null && b.score < 0.5) hits.push(fail('Scripts take a long time to run', `Lighthouse rates JavaScript execution time as poor (${b.display ?? 'slow'}).`, items(b).map((x) => `${x.url}  ${Math.round(x.mainThreadMs ?? 0)} ms`)));
  return ran(hits);
}
function perfCss(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.'); const a = A(out, 'unused-css-rules'); if (!a) return na('No stylesheet cost reported.');
  return ran(a.wastedBytes >= 51200 ? [review('A lot of CSS is not used on this page', `About ${kb(a.wastedBytes)} of CSS is not used here. One page cannot prove it is safe to remove everywhere.`, items(a).map((x) => `${x.url}  unused ${kb(x.wastedBytes ?? 0)}`))] : []);
}
function perfBlocking(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.'); const a = A(out, 'render-blocking-insight') ?? A(out, 'render-blocking-resources'); if (!a) return na('No render-blocking resources reported.');
  return ran(a.wastedMs >= 300 ? [fail('Files block the page from appearing', `Lighthouse says ${a.items.length} file(s) delay first paint by up to ${Math.round(a.wastedMs)} ms.`, items(a).map((x) => `${x.url}  ${Math.round(x.wastedMs ?? 0)} ms`))] : []);
}
function perfThirdParty(out: ScanOutput): DetectorReport {
  if (!out.perf) return off('Lighthouse did not run.'); const a = A(out, 'third-parties-insight') ?? A(out, 'third-party-summary'); if (!a) return na('No third-party code was reported.');
  const block = a.items.reduce((n, x) => n + (x.blockingMs || x.mainThreadMs || 0), 0), bytes = a.items.reduce((n, x) => n + (x.transferBytes ?? 0), 0);
  return ran(block >= 250 || bytes >= 256000 ? [fail('Third-party code adds noticeable cost', `Other origins' scripts use the main thread for about ${Math.round(block)} ms and transfer ${kb(bytes)}.`, items(a, 5).map((x) => `${x.entity || x.url}  ${Math.round(x.blockingMs || x.mainThreadMs || 0)} ms on the main thread, ${kb(x.transferBytes ?? 0)}`))] : []);
}

/** Every derived detector id. The ids are written into src/rules/*.json under the one rule that owns each. */
export function derivedReports(out: ScanOutput): Record<string, DetectorReport> {
  const pc = vp(out, 'desktop')?.pageContext as PageCtx | undefined; const vc = pc as VPC | undefined;
  return {
    'pc/hero-statement': heroStatement(vc), 'pc/audience-cue': audienceCue(vc), 'pc/feature-first': featureFirst(vc), 'pc/unsupported-superlatives': superlatives(vc), 'pc/headline-form': headlineForm(vc), 'pc/subheadline': subheadline(vc),
    'pc/problem-signal': problemSignal(vc), 'pc/outcome-language': outcomeLanguage(vc), 'pc/buzzwords': buzzwords(vc), 'pc/first-screen': firstScreen(vc), 'pc/offer-before-action': offerBeforeAction(vc), 'pc/cta-context': ctaContext(vc),
    'pc/claim-consistency': claimConsistency(vc), 'conv/cta-saturation': ctaSaturation(vc),
    'diff/template-sequence': templateSequence(vc), 'diff/default-styling': defaultStyling(vc), 'diff/hero-match': heroMatchReport((vc as { heroMatch?: HeroMatch } | undefined)?.heroMatch), 'diff/brand-assets': brandAssets(vc), 'diff/dashboard-pattern': dashboardPattern(vc), 'diff/layout-archetypes': layoutArchetypes(vc),
    'diff/shape-and-icon-language': shapeIconLanguage(vc), 'diff/section-rhythm': sectionRhythm(vc), 'diff/trust-pattern': trustPattern(vc), 'diff/feature-grid-saturation': featureGridSaturation(vc),
    'ux/primary-task-visible': primaryTaskVisible(out), 'conv/cta-visible': ctaVisible(out), 'mobile/content-scaling': contentScaling(out), 'mobile/layout-integrity': layoutIntegrity(out), 'mobile/orientation': orientation(out),
    'mobile/typography': mobileTypography(out), 'mobile/form-usability': mobileForm(out), 'mobile/image-responsiveness': imageResponsiveness(out),
    'trust/privacy-link': privacy(pc), 'trust/terms-link': terms(pc), 'trust/contact-route': contact(pc), 'trust/review-route': reviewRoute(pc), 'trust/support-route': supportRoute(pc),
    'conv/trial-visibility': trial(pc), 'conv/cta-consistency': ctaConsistency(pc), 'conv/field-count': fieldCount(pc),
    'ux/scannability': scannability(pc), 'design/visual-hierarchy': visualHierarchy(out, vc), 'design/spacing-rhythm': spacingRhythm(vc), 'ux/error-recovery': errorRecovery(out), 'ux/generic-error-message': genericErrorMessage(out), 'nav/fragment-target': fragmentTarget(out), 'a11y/reading-order': readingOrder(out), 'design/font-families': fontFamilies(out), 'conv/generic-primary-action': genericPrimaryAction(out), 'trust/unfinished-proof': unfinishedProof(vc), 'design/typography-hierarchy': typographyHierarchy(pc), 'design/cta-emphasis': ctaEmphasis(out, pc), 'design/component-consistency': componentConsistency(pc),
    'perf/image-optimization': perfImages(out), 'perf/font-optimization': perfFonts(out), 'perf/javascript-efficiency': perfJs(out), 'perf/css-efficiency': perfCss(out), 'perf/render-blocking': perfBlocking(out), 'perf/third-party': perfThirdParty(out),
  };
}

// =====================================================================================================================================
// Customer-value detectors: Product Clarity, call-to-action saturation, and the Differentiation & Design Maturity patterns.
// Thresholds and word lists are NOT in this file: each rule keeps them in its own `parameters` (src/rules/*.json), so they can be tuned as data.
// Every result cites what it read (a quote, a count or a selector). Subjective calls are returned as "needs a person", never as a failure.
// =====================================================================================================================================
const param = <T,>(ruleId: string, key: string, fb: T): T => { const v = (ruleLoader().getRuleById(ruleId)?.parameters as Record<string, unknown> | undefined)?.[key]; return (v ?? fb) as T; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const quote = (s: string, n = 140) => `“${short(s.replace(/\s+/g, ' ').trim(), n)}”`;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const termRe = (t: string) => new RegExp(`(?<![\\w-])${esc(t.toLowerCase())}(?![\\w-])`, 'g');

type Sec = { index: number; tag: string; selector: string; top: number; height: number; headings: { level: number; text: string }[]; words: number; ctas: number; bigMedia: number; icons: number; prices: number; faqMarks: number; quotes: number; quoteChars: number; stars: number; avatars: number; logos: number; linkedLogos: number; centered: boolean; gradient: boolean | null; columns: number; links: number; group: { count: number; icons: number; headings: number; paragraphs: number; columns: number; selector: string; titles: string[] } | null };
type Struct = {
  emphasis?: Em[]; gaps?: Record<string, number>;
  hero: { h1: { text: string; words: number; top: number; inViewport: boolean } | null; subheadline: { text: string; words: number } | null }; sections: Sec[];
  app: { sidebar: { selector: string; width: number; links: number } | null; statCards: { count: number; selector: string | null }; charts: number; chartSelectors: string[]; tables: number; topbar: boolean };
  design: { fonts: { family: string; share: number }[]; headingFont: string | null; gradients: number; textGradients: number; cards: number; cardRadii: number[]; cardShadows: number; icons: number; iconLibraryLike: number; emojiIcons: number; buttonColors: string[] };
  brand: { logo: boolean; favicon: boolean; title: string; bigImages: number }; firstCtas: { text: string; filled: boolean; href: string | null; top: number; context: number }[]; ctaCounts: { total: number; top: { text: string; count: number } | null }; viewportHeight: number; words: number;
};
type Em = { kind: 'h1' | 'heading' | 'cta' | 'media'; selector: string; text: string; area: number; weight: number; top: number };
type VPC = PageCtx & { structure?: Struct; bodyText?: string; firstViewportText?: string };
const S_ = (pc: PageCtx | undefined) => (pc as VPC | undefined)?.structure;
const openingOf = (pc: VPC, S: Struct) => `${S.hero.h1?.text ?? ''}. ${S.hero.subheadline?.text ?? ''}`.trim();

function heroStatement(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.');
  const h = S.hero; if (!h.h1) return ran([fail('The page has no main heading', 'No visible h1 was found, so the opening cannot be read.', [])]);
  const text = openingOf(pc, S); const pats = param<string[]>('PC-001', 'offerPatterns', []).map((p) => new RegExp(p, 'i'));
  if (pats.some((r) => r.test(text))) return ran([]);
  return ran([review('The opening does not say what the product does or is for', `The opening reads as a slogan with no descriptor of what the product does or who it is for: ${quote(text)}.`, [`h1: ${quote(h.h1.text)}`, h.subheadline ? `line under it: ${quote(h.subheadline.text)}` : 'no line under the h1'])]);
}
function audienceCue(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.');
  const text = `${openingOf(pc, S)} ${pc.firstViewportText ?? ''}`.toLowerCase(); if (!S.hero.h1 && !text.trim()) return na('There is no opening to read.');
  const nouns = param<string[]>('PC-002', 'audienceNouns', []); const found = nouns.filter((n) => termRe(n).test(text));
  return ran(found.length ? [] : [review('The opening does not name who it is for', `None of ${nouns.length} audience terms (roles, team types, business types) appears in the opening.`, [`read: ${quote(text, 200)}`])]);
}
function featureFirst(pc: VPC | undefined): DetectorReport {
  if (!pc?.headings) return off('The page context was not captured.');
  const heads = pc.headings.filter((h) => h.level === 2 || h.level === 3).slice(0, 14).map((h) => h.text).filter(Boolean); const minH = param('PC-003', 'minHeadings', 3);
  if (heads.length < minH) return na(`Fewer than ${minH} section headings to compare.`);
  const verbs = param<string[]>('PC-003', 'outcomeVerbs', []), feats = param<string[]>('PC-003', 'featureNouns', []);
  const outcome = (h: string) => /\b\d[\d,.]*\s?(x|×|%|minutes?|mins?|hours?|days?|weeks?|seconds?)/i.test(h) || verbs.some((v) => termRe(v).test(h.toLowerCase()));
  const feature = (h: string) => feats.some((f) => termRe(f).test(h.toLowerCase()));
  const cls = heads.map((h) => ({ h, c: outcome(h) ? 'outcome' : feature(h) ? 'feature' : 'neutral' }));
  const nf = cls.filter((x) => x.c === 'feature').length, no = cls.filter((x) => x.c === 'outcome').length; const share = nf / heads.length;
  return ran(no === 0 && share >= param('PC-003', 'featureShare', 0.6) ? [review('Section headings describe features, not results', `${nf} of ${heads.length} section headings are feature-led and none promises a result.`, cls.map((x) => `${x.c}: ${quote(x.h, 70)}`))] : []);
}
function superlatives(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.');
  const terms = param<string[]>('PC-004', 'superlatives', []); const bad: string[] = [];
  for (const s of sentences(`${openingOf(pc, S)} ${pc.firstViewportText ?? ''}`)) { const l = s.toLowerCase(); if (terms.some((t) => (t.startsWith('#') ? l.includes(t) : termRe(t).test(l))) && !/\d/.test(l) && !/customers|users|teams|reviews|according|source|study|rated|compared/.test(l)) bad.push(s); }
  return ran(bad.length ? [review('Claims of being the best have nothing behind them', `${bad.length} sentence${bad.length === 1 ? ' makes' : 's make'} a superlative claim with no number, customer or source beside it.`, [...new Set(bad)].slice(0, 4).map((x) => quote(x)))] : []);
}
function headlineForm(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); if (!S.hero.h1) return na('No h1 to measure. (PC-001 reports the missing heading.)');
  const n = S.hero.h1.words; const min = param('PC-005', 'min', 4), max = param('PC-005', 'max', 14), over = param('PC-005', 'failOver', 24), under = param('PC-005', 'failUnder', 2);
  const ev = [`h1 ${quote(S.hero.h1.text)} (${n} words)`];
  if (n > over || n < under) return ran([fail(n > over ? 'The headline is too long to read at a glance' : 'The headline is a single word', `The h1 has ${n} word${n === 1 ? '' : 's'}; ${min} to ${max} is the readable range.`, ev)]);
  if (n > max || n < min) return ran([review(n > max ? 'The headline is long' : 'The headline is very short', `The h1 has ${n} words; ${min} to ${max} is the readable range.`, ev)]);
  return ran([]);
}
function subheadline(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); const sub = S.hero.subheadline; if (!sub || !S.hero.h1) return na('There is no supporting line under the headline.');
  const min = param('PC-006', 'min', 8), max = param('PC-006', 'max', 35), ov = param('PC-006', 'maxOverlap', 0.7);
  const a = new Set(S.hero.h1.text.toLowerCase().match(/[a-z0-9']+/g) ?? []), b = new Set(sub.text.toLowerCase().match(/[a-z0-9']+/g) ?? []); const overlap = a.size ? [...a].filter((x) => b.has(x)).length / a.size : 0;
  const ev = [`h1 ${quote(S.hero.h1.text)}`, `line under it ${quote(sub.text)} (${sub.words} words)`];
  if (overlap >= ov) return ran([fail('The supporting line repeats the headline', `${Math.round(overlap * 100)}% of the headline's words reappear in the line under it.`, ev)]);
  if (sub.words < min || sub.words > max) return ran([review(sub.words < min ? 'The supporting line is too short to explain anything' : 'The supporting line is too long', `It has ${sub.words} words; ${min} to ${max} is the range that explains without a wall of text.`, ev)]);
  return ran([]);
}
function problemSignal(pc: VPC | undefined): DetectorReport {
  if (!pc) return off('The page context was not captured.'); const text = `${pc.firstViewportText ?? ''} ${(pc.bodyText ?? '').slice(0, 1200)}`.toLowerCase();
  if (wc(text) < 80) return na('Too little text to look for a problem statement.');
  const found = param<string[]>('PC-007', 'problemWords', []).filter((w) => text.includes(w));
  return ran(found.length ? [] : [review('No problem the visitor recognises is named', 'Neither the first screen nor the next section uses words that describe a problem (struggle, manual, wasted, without …).', [`read the first ${Math.min(wc(text), 400)} words`])]);
}
function outcomeLanguage(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.');
  const scope = [openingOf(pc, S), pc.firstViewportText ?? '', ...(pc.headings ?? []).filter((h) => h.level >= 2).map((h) => h.text)].join(' . ');
  const q = scope.match(/\b\d[\d,.]*\s?(x|×|%|minutes?|mins?|hours?|days?|weeks?|seconds?)\b/i); if (q) return ran([]);
  const verb = param<string[]>('PC-008', 'outcomeVerbs', []).find((v) => termRe(v).test(scope.toLowerCase())); if (verb) return ran([]);
  return ran([review('No concrete result is promised', 'No number with a unit (2x, 10 minutes, 40%) and no result verb (save, cut, ship, grow) appears in the opening or the section headings.', [`read: ${quote(scope, 200)}`])]);
}
function buzzwords(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.');
  const first = `${openingOf(pc, S)} ${pc.firstViewportText ?? ''}`; const text = `${first} ${(pc.headings ?? []).map((h) => h.text).join(' ')}`; if (!text.trim()) return na('There is no opening to read.');
  const lex = param<string[]>('PC-009', 'buzzwords', []); const hits: { t: string; n: number }[] = [];
  for (const t of lex) { const n = (text.toLowerCase().match(termRe(t)) ?? []).length; if (n) hits.push({ t, n }); }
  const wordsHit = hits.reduce((n, h) => n + h.n * wc(h.t.replace(/-/g, ' ')), 0); const share = (100 * wordsHit) / Math.max(1, wc(first)); const ss = sentences(text);
  if (hits.length >= param('PC-009', 'minDistinct', 3) || share >= param('PC-009', 'minSharePct', 6)) return ran([review('The copy leans on vague buzzwords', `${hits.length} distinct buzzwords (${hits.map((h) => h.t).join(', ')}) make up about ${Math.round(share)}% of the first-screen words.`, hits.slice(0, 4).map((h) => `${h.t}: ${quote(ss.find((s) => termRe(h.t).test(s.toLowerCase())) ?? h.t, 110)}`))]);
  return ran([]);
}
function firstScreen(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); if (!S.hero.h1) return na('No h1 to place. (PC-001 reports the missing heading.)');
  const hits: DetectorHit[] = []; const minW = param('PC-010', 'minWords', 15); const w = wc(pc.firstViewportText ?? '');
  if (!S.hero.h1.inViewport) hits.push(fail('The main heading is below the first screen', `The h1 starts ${S.hero.h1.top}px down on a ${S.viewportHeight}px-tall screen.`, [`h1 ${quote(S.hero.h1.text)} at ${S.hero.h1.top}px`]));
  else { if (!S.hero.subheadline) hits.push(review('The first screen has a heading but no supporting line', 'Nothing under the h1 explains the offer.', [`h1 ${quote(S.hero.h1.text)}`])); if (w < minW) hits.push(review('The first screen has very little text', `Only ${w} words are visible without scrolling; ${minW} or more are needed to explain an offer.`, [`${w} words in the first screen`])); }
  return ran(hits);
}
function offerBeforeAction(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); if (!S.hero.h1 || !S.firstCtas.length) return na('No heading, or no call to action in the first screen.');
  const early = S.firstCtas.filter((c) => c.top < S.hero.h1!.top - 5);
  return ran(early.length ? [fail('A button appears above the main heading', `${early.length} call${early.length === 1 ? '' : 's'} to action sit above the h1, so the page asks before it explains.`, early.map((c) => `${quote(c.text, 40)} at ${c.top}px, h1 at ${S.hero.h1!.top}px`))] : []);
}
function ctaContext(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); if (!S.firstCtas.length) return na('No call to action in the first screen.');
  const min = param('PC-012', 'minWords', 6); const bare = S.firstCtas.filter((c) => c.context < min);
  return ran(bare.length ? [review('A button has nothing explaining it nearby', `${bare.length} first-screen button${bare.length === 1 ? ' has' : 's have'} fewer than ${min} words of explanation around ${bare.length === 1 ? 'it' : 'them'}.`, bare.map((c) => `${quote(c.text, 40)}: ${c.context} words nearby`))] : []);
}
function claimConsistency(pc: VPC | undefined): DetectorReport {
  if (!pc?.bodyText) return off('The page text was not captured.');
  const nouns = param<string[]>('PC-013', 'nouns', []); const tol = param('PC-013', 'tolerancePct', 10) / 100; const claims: Record<string, { v: number; snip: string }[]> = {};
  for (const n of nouns) { const re = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|m)?\\+?\\s+${esc(n)}`, 'gi'); let m: RegExpExecArray | null; while ((m = re.exec(pc.bodyText))) { const v = parseFloat(m[1].replace(/,/g, '')) * (/k/i.test(m[2] ?? '') ? 1e3 : /m/i.test(m[2] ?? '') ? 1e6 : 1); (claims[n] ??= []).push({ v, snip: pc.bodyText.slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).replace(/\s+/g, ' ') }); } }
  const all = Object.entries(claims); if (!all.length) return na('The page makes no numeric claims to compare.');
  const bad = all.filter(([, c]) => { const vs = c.map((x) => x.v); return Math.max(...vs) > Math.min(...vs) * (1 + tol); });
  return ran(bad.length ? [fail('The page gives two different numbers for the same thing', `${bad.map(([n]) => n).join(', ')} ${bad.length === 1 ? 'is' : 'are'} stated with different values.`, bad.flatMap(([, c]) => c.slice(0, 2).map((x) => quote(x.snip, 100))))] : []);
}
function ctaSaturation(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!pc || !S) return off('The page structure was not captured.'); if (S.ctaCounts.total < 2) return na('Fewer than two calls to action.');
  const filled = [...new Set(S.firstCtas.filter((c) => c.filled).map((c) => c.text.toLowerCase()))]; const maxF = param('CONV-004', 'maxFilledDistinct', 3), lim = param('CONV-004', 'repeatedLabelLimit', 6); const hits: DetectorHit[] = [];
  if (filled.length > maxF) hits.push(review('The first screen has many competing buttons', `${filled.length} different filled buttons compete in the first screen.`, filled.map((x) => quote(x, 40))));
  if (S.ctaCounts.top && S.ctaCounts.top.count >= lim) hits.push(review('The same button is repeated many times', `${quote(S.ctaCounts.top.text, 40)} appears ${S.ctaCounts.top.count} times on the page.`, [`${S.ctaCounts.top.count} of ${S.ctaCounts.total} calls to action share one label`]));
  return ran(hits);
}

// ---- Differentiation & Design Maturity ----
const rx = (s: string) => new RegExp(s, 'i');
function sectionKinds(S: Struct): { kind: string; sec: Sec }[] {
  const hints = param<Record<string, string>>('DIFF-001', 'kindHints', {}); const n = S.sections.length;
  return S.sections.map((sec, i) => {
    const h = sec.headings.map((x) => x.text).join(' ').toLowerCase(); const g = sec.group; const has = (k: string) => !!hints[k] && rx(hints[k]).test(h);
    const kind = sec.tag === 'footer' ? 'footer' : i === 0 || sec.headings.some((x) => x.level === 1) ? 'hero' : sec.prices >= 2 || has('pricing') ? 'pricing' : sec.faqMarks >= 3 || has('faq') ? 'faq'
      : sec.quotes >= 2 || sec.quoteChars >= 4 || sec.stars >= 3 || has('testimonials') ? 'testimonials' : (sec.logos >= 4 && sec.words < 60) || (has('logoCloud') && sec.logos >= 3) ? 'logo-cloud'
      : g && g.count >= 3 && (g.icons >= 2 || (g.headings >= 2 && g.paragraphs >= 2)) ? 'feature-grid' : sec.words < 45 && sec.ctas >= 1 && i >= n - 3 ? 'cta-band' : 'content';
    return { kind, sec };
  });
}
const KIND_LABEL: Record<string, string> = { hero: 'Hero', 'feature-grid': 'Feature grid', 'logo-cloud': 'Logo cloud', testimonials: 'Testimonials', pricing: 'Pricing', faq: 'FAQ', 'cta-band': 'Call-to-action band', content: 'Content', footer: 'Footer' };
const lcs = (a: string[], b: string[]) => { const m = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i - 1][j], m[i][j - 1]); return m[a.length][b.length]; };
function templateSequence(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.');
  const ks = sectionKinds(S); const seq = ks.map((k) => k.kind).filter((k) => k !== 'content' && k !== 'footer').filter((k, i, a) => k !== a[i - 1]);
  const tpl = param<string[]>('DIFF-001', 'templateSequence', []); if (S.sections.length < param('DIFF-001', 'minSections', 4)) return na('Too few sections to compare with a template.');
  const matched = lcs(seq, tpl); const label = seq.map((k) => KIND_LABEL[k] ?? k).join(' → ');
  const ev = [`sections in order: ${label}`, `template order: ${tpl.map((k) => KIND_LABEL[k] ?? k).join(' → ')}`, ...ks.filter((k) => k.kind !== 'content' && k.kind !== 'footer').slice(0, 7).map((k) => `${KIND_LABEL[k.kind]}: ${quote(k.sec.headings[0]?.text ?? k.sec.selector, 50)} (${k.sec.selector})`)];
  const summary = `${label}, which matches ${matched} of the ${tpl.length} sections of the common AI-SaaS landing template in the same order.`;
  if (matched >= param('DIFF-001', 'failMatched', 5)) return ran([fail('The page follows the common AI-SaaS landing template', summary, ev)]);
  if (matched >= param('DIFF-001', 'reviewMatched', 4)) return ran([review('The page is close to the common AI-SaaS landing template', summary, ev)]);
  return ran([]);
}
const hueOf = (rgb: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb); if (!m) return null; const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return null; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round((h * 60 + 360) % 360); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function defaultStyling(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const D = S.design; const sig: string[] = [];
  const defaults = param<string[]>('DIFF-002', 'defaultFonts', []); const f = D.fonts[0];
  if (f && defaults.some((d) => f.family.includes(d))) sig.push(`main font is a default sans (${f.family}, ${f.share}% of text)`);
  const hmin = param('DIFF-002', 'hueMin', 235), hmax = param('DIFF-002', 'hueMax', 290); const hue = D.buttonColors.map(hueOf).find((h) => h != null) ?? null;
  if (hue != null && hue >= hmin && hue <= hmax) sig.push(`primary colour is violet or indigo (hue ${hue}°)`);
  if (D.gradients >= 2 || D.textGradients >= 1) sig.push(`gradients are used (${D.gradients} backgrounds, ${D.textGradients} text)`);
  if (D.cardRadii.length >= 3 && median(D.cardRadii) >= param('DIFF-002', 'minRadius', 12)) sig.push(`cards are rounded to ${median(D.cardRadii)}px`);
  return ran(sig.length >= param('DIFF-002', 'minSignals', 3) ? [review('The visual style matches the default look of many generated sites', `${sig.length} of 4 default-style signals are present: ${sig.join('; ')}.`, sig)] : []);
}
function brandAssets(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S?.brand) return off('The page structure was not captured.'); const B = { ...S.brand, title: S.brand.title ?? '' }; const gaps: string[] = [];
  if (!B.logo) gaps.push('no logo mark (image or SVG) in the header'); if (!B.favicon) gaps.push('no favicon'); if (!B.bigImages) gaps.push('no imagery beyond small icons');
  if (param<string[]>('DIFF-003', 'genericTitles', []).includes(B.title.toLowerCase().trim()) || B.title.trim().length < 8) gaps.push(`generic page title (${quote(B.title, 40)})`);
  return ran(gaps.length >= param('DIFF-003', 'minGaps', 3) ? [review('Few recognisable brand assets', `The page has ${gaps.length} of 4 gaps: ${gaps.join('; ')}.`, gaps)] : []);
}
function dashboardPattern(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const A = S.app;
  const side = !!A.sidebar && A.sidebar.links >= param('DIFF-004', 'minSidebarLinks', 5), stat = A.statCards.count >= param('DIFF-004', 'minStatCards', 3), chart = A.charts >= 1;
  if (!A.sidebar && !stat && !chart) return na('No app or dashboard layout on this page.');
  const have = [side && `left sidebar (${A.sidebar?.links} links, ${A.sidebar?.width}px)`, stat && `${A.statCards.count} stat cards (${A.statCards.selector})`, chart && `${A.charts} chart${A.charts === 1 ? '' : 's'} (${A.chartSelectors[0]})`].filter(Boolean) as string[];
  const ev = [...have, A.tables ? `${A.tables} data table${A.tables === 1 ? '' : 's'}` : 'no data table'];
  if (side && stat && chart) return ran([fail('The dashboard follows the stock analytics layout', `It combines ${have.join(', ')}, the standard dashboard arrangement.`, ev)]);
  if (have.length >= 2) return ran([review('The dashboard shares most of the stock layout', `It has ${have.join(' and ')}.`, ev)]);
  return ran([]);
}
function layoutOf(s: Sec) { return s.group && s.group.count >= 3 && (s.group.headings >= s.group.count / 2 || s.group.icons >= s.group.count / 2) ? `${Math.min(s.group.columns, 4)}-column grid` : s.columns >= 2 ? '2-column split' : s.centered ? 'centred stack' : 'left-aligned stack'; }
function layoutArchetypes(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const secs = S.sections.filter((s) => s.tag !== 'footer');
  if (secs.length < param('DIFF-005', 'minSections', 5)) return na('Too few sections to judge variety.');
  const lays = secs.map(layoutOf); const distinct = [...new Set(lays)];
  return ran(distinct.length <= param('DIFF-005', 'maxDistinct', 2) ? [review('Every section uses the same few layouts', `${secs.length} sections use only ${distinct.length} layout${distinct.length === 1 ? '' : 's'}: ${distinct.join(' and ')}.`, secs.map((s, i) => `${i + 1}. ${quote(s.headings[0]?.text ?? s.selector, 40)}: ${lays[i]}`))] : []);
}
function shapeIconLanguage(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const D = S.design; const sig: string[] = []; const minR = param('DIFF-006', 'minRadius', 12);
  if (D.cards < 3 && D.icons < 3) return na('Too few cards or icons to judge a visual language.');
  if (D.cardRadii.length >= 3 && new Set(D.cardRadii).size === 1 && D.cardRadii[0] >= minR) sig.push(`every card shares one ${D.cardRadii[0]}px radius`);
  if (D.cards >= 3 && D.cardShadows / D.cards >= param('DIFF-006', 'shadowShare', 0.8)) sig.push(`${D.cardShadows} of ${D.cards} cards carry a shadow`);
  if (D.iconLibraryLike >= param('DIFF-006', 'minIcons', 3) || D.emojiIcons >= 3) sig.push(`icons look like a stock set (${D.iconLibraryLike} of ${D.icons} match a 24px outline set, ${D.emojiIcons} emoji)`);
  return ran(sig.length >= param('DIFF-006', 'minSignals', 2) ? [review('The shape and icon language is the default', `${sig.length} of 3 default signals: ${sig.join('; ')}.`, sig)] : []);
}
function sectionRhythm(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const secs = S.sections.filter((s) => s.tag !== 'footer');
  if (secs.length < param('DIFF-007', 'minSections', 5)) return na('Too few sections to judge rhythm.');
  const fp = secs.map((s) => [s.centered ? 'centred' : 'left', s.ctas ? 'cta' : 'no-cta', s.bigMedia ? 'media' : 'no-media', s.group ? 'cards' : 'no-cards', s.words < 40 ? 'short' : 'long'].join(' · '));
  const counts = fp.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}); const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; const pct = Math.round((100 * n) / secs.length);
  return ran(pct >= param('DIFF-007', 'sharePct', 80) ? [review('Every section is presented the same way', `${n} of ${secs.length} sections (${pct}%) share one structure (${top}), so nothing signals what to read first.`, secs.map((s, i) => `${i + 1}. ${quote(s.headings[0]?.text ?? s.selector, 40)}: ${fp[i]}`))] : []);
}
function trustPattern(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.'); const ks = sectionKinds(S);
  const logos = ks.filter((k) => k.kind === 'logo-cloud'), quotes = ks.filter((k) => k.kind === 'testimonials');
  if (!logos.length && !quotes.length) return na('No logo band or testimonial section on this page. (Absence is neutral.)');
  const lu = logos.filter((k) => k.sec.logos >= param('DIFF-008', 'minLogos', 4) && k.sec.linkedLogos === 0), qu = quotes.filter((k) => k.sec.links === 0 && (k.sec.quotes >= param('DIFF-008', 'minQuotes', 2) || k.sec.quoteChars >= 4 || k.sec.stars >= 3));
  const ev = [...lu.map((k) => `logo band ${k.sec.selector}: ${k.sec.logos} logos, ${k.sec.linkedLogos} linked`), ...qu.map((k) => `testimonials ${k.sec.selector}: ${k.sec.quotes || '-'} quote blocks, ${k.sec.stars} stars, ${k.sec.avatars} avatars, ${k.sec.links} links`)];
  return ran(lu.length && qu.length ? [review('The trust section is a logo row and quote cards that cannot be checked', `${lu[0].sec.logos} logos none of which link anywhere, and testimonials with no link to a source or case study.`, ev)] : []);
}
function featureGridSaturation(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S) return off('The page structure was not captured.');
  const skip = new Set(['pricing', 'testimonials', 'faq', 'logo-cloud']); const grids = sectionKinds(S).filter(({ kind, sec }) => !skip.has(kind) && sec.group && sec.group.count >= param('DIFF-009', 'minCards', 3) && (sec.group.headings >= sec.group.count / 2 && sec.group.paragraphs >= sec.group.count / 2));
  const icon = grids.filter((g) => (g.sec.group?.icons ?? 0) >= Math.ceil((g.sec.group?.count ?? 0) / 2)).length; const cards = grids.reduce((n, g) => n + (g.sec.group?.count ?? 0), 0);
  const ev = grids.map((g) => `${g.sec.group!.selector}: ${g.sec.group!.count} cards${g.sec.group!.icons ? ` (${g.sec.group!.icons} with icons)` : ''}: ${g.sec.group!.titles.map((t) => quote(t, 28)).join(', ')}`);
  const summary = `${grids.length} grids of repeated cards (${cards} cards, ${icon} grids with icons)`;
  if (grids.length >= param('DIFF-009', 'failGrids', 3)) return ran([fail('The page is made of repeated card grids', summary + ' make up the page.', ev)]);
  if (grids.length >= param('DIFF-009', 'reviewGrids', 2)) return ran([review('The page leans on repeated card grids', summary + '.', ev)]);
  return ran([]);
}


// ---- Design: where the eye lands, and whether spacing follows a scale ----
function visualHierarchy(out: ScanOutput, pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S?.emphasis) return off('The page structure was not captured.');
  const em = S.emphasis; const h1 = em.filter((e) => e.kind === 'h1'); if (!h1.length) return na('No visible h1 in the first screen. (PC-001 reports a missing heading.)');
  const main = mainAction(vp(out, 'desktop')); const ctas = em.filter((e) => e.kind === 'cta'); const mainEm = main ? ctas.find((c) => norm(c.text) === norm(main.text)) : undefined;
  const total = em.reduce((n, e) => n + e.weight, 0); if (!total) return na('Nothing weighted in the first screen.');
  const focal = [...h1, ...(mainEm ? [mainEm] : [])]; const share = focal.reduce((n, e) => n + e.weight, 0) / total; const min = param('DESIGN-004', 'minShare', 0.25);
  const top = [...em].sort((a, b) => b.weight - a.weight).slice(0, 4);
  const ev = top.map((e) => `${e.kind}: ${quote(e.text || e.selector, 40)} (${e.selector}) weight ${Math.round(e.weight / 1000)}k`);
  return ran(share < min ? [review('The eye lands on something other than the headline or the main action', `The headline${mainEm ? ' and the main action' : ''} hold ${Math.round(share * 100)}% of the first screen's visual weight; ${Math.round(min * 100)}% or more is expected. The heaviest element is ${top[0].kind} ${quote(top[0].text || top[0].selector, 40)}.`, [...ev, `headline and main action share: ${Math.round(share * 100)}%`])] : []);
}
function spacingRhythm(pc: VPC | undefined): DetectorReport {
  const S = S_(pc); if (!S?.gaps) return off('The page structure was not captured.');
  const g = Object.entries(S.gaps).map(([k, n]) => [Number(k), n] as const); const n = g.reduce((a, [, c]) => a + c, 0); const minGaps = param('DESIGN-010', 'minGaps', 20);
  if (n < minGaps) return na(`Fewer than ${minGaps} stacked gaps to measure.`);
  const on = g.filter(([v]) => v % 4 === 0).reduce((a, [, c]) => a + c, 0) / n; const distinct = g.length;
  const top = [...g].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, c]) => `${v}px x${c}`);
  return ran(on < param('DESIGN-010', 'onGridShare', 0.5) && distinct >= param('DESIGN-010', 'minDistinct', 10) ? [review('Spacing does not follow a scale', `${Math.round(on * 100)}% of ${n} gaps between stacked blocks sit on a 4px grid, and ${distinct} different gap sizes are used. A consistent scale would use a few sizes.`, [`most common gaps: ${top.join(', ')}`, `${distinct} distinct sizes in ${n} gaps`])] : []);
}

// ---- UX: error recovery, from the browser's own validation (the form is never submitted) ----
type Val = { selector: string; fields: number; constrained: number; prefilled: boolean; novalidate: boolean; valid: boolean | null; focusOK: boolean | null; msg: string; describedby: number; live: boolean };
function errorRecovery(out: ScanOutput): DetectorReport {
  const d = vp(out, 'desktop'); if (!d || d.validation === undefined) return off('The form check did not run.');
  const forms = (d.validation ?? []) as unknown as Val[]; if (!forms.length) return na('No form that takes input on this page.');
  const hits: DetectorHit[] = []; let tested = 0;
  for (const f of forms) {
    if (f.novalidate) hits.push(review('A form checks its own input in script', `${f.selector} turns off the browser's checks, so what a visitor sees after a mistake depends on script that Avara does not run (it never submits forms).`, [`${f.selector}: ${f.fields} fields, novalidate`]));
    else if (!f.constrained) hits.push(review('A form tells the visitor nothing about mistakes before they submit', `${f.selector} has ${f.fields} fields and none is required or typed (email, number, pattern), so a mistake can only be reported after submitting. Recovery cannot be tested without submitting.`, [`${f.selector}: ${f.fields} fields, 0 constrained`]));
    else if (f.valid === false) { tested++; if (!f.focusOK || !f.msg) hits.push(fail('The browser could not take the visitor to the field that needs fixing', `${f.selector} is invalid when empty but focus did not move to an invalid field with a message.`, [`${f.selector}: focus moved ${f.focusOK ? 'yes' : 'no'}, message “${f.msg}”`])); }
  }
  if (!hits.length && !tested) return na('Every form was pre-filled or valid when empty, so no invalid state could be produced without submitting.');
  return ran(hits);
}


// ---- Detector pack v3 (H9 lens): a field shown as invalid whose linked error only says "invalid". Advisory: help may sit elsewhere on the page.
// Reads only the error text already on the page in the captured state (aria-invalid + aria-errormessage). Never types, submits or stores a value.
function genericErrorMessage(out: ScanOutput): DetectorReport {
  const x = vp(out, 'desktop')?.heuristics?.extra; if (!x || !x.invalidMessages) return off('The form field check did not run.');
  if (!x.invalidMessages.length) return na('No visible error to inspect: no field was shown as invalid with a linked error message when the page was captured. Avara never submits a form to produce one.');
  const terms = param<string[]>('UX-017', 'genericErrorPhrases', []);
  const generic = x.invalidMessages.filter((m) => terms.includes(m.message.toLowerCase().trim().replace(/[.!]+$/, '')));
  if (!generic.length) { const n = x.invalidMessages.length; return { ...ran([]), passNote: `${n} visible linked error message${n === 1 ? ' was' : 's were'} inspected and ${n === 1 ? 'is' : 'are'} more than a generic “invalid” or “error”.` }; }
  return ran(generic.length ? [review('An error message does not say how to fix the field', `${generic.length} field${generic.length === 1 ? ' is' : 's are'} marked invalid with a message that only says it is wrong. Explain how to correct the value, using the format or limit for that field.`, generic.map((m) => `${m.selector}  error “${m.message}”`))] : []);
}

// ---- Detector pack: three advisory reads. Each says what was observed and asks a person; none can fail a page. ----
// A same-page link whose target is missing from the DOM captured after load. Script routing or a deferred panel can mount it later.
function fragmentTarget(out: ScanOutput): DetectorReport {
  const d = vp(out, 'desktop'); if (!d || d.fragments === undefined || d.fragments === null) return off('The same-page link check did not run.');
  if (!d.fragments.length) return na('No visible same-page links.');
  const gone = d.fragments.filter((f) => !f.found);
  return ran(gone.length ? [review('A same-page link points to nothing in the page we captured', `${gone.length} same-page link${gone.length === 1 ? '' : 's'} had no element with the matching id when the page finished loading. If a script adds it later, check it in a browser.`, gone.map((f) => `“${f.label || f.id}” -> #${f.id}`))] : []);
}
// The selected main action is named with a generic label. Whether the surrounding context makes it clear is a person's call.
function genericPrimaryAction(out: ScanOutput): DetectorReport {
  const v = vp(out, 'desktop'); if (!v?.avara) return off('The main-action check did not run.');
  const a = mainAction(v); if (!a) return na('No single main action was identified.');
  const terms = param<string[]>('CONV-001', 'genericLabels', []); const label = norm(a.text);
  return ran(terms.includes(label) ? [review('The main button uses a generic label', `The main action is labelled “${a.text}”. Check whether the words around it say what happens next, and name the next step where helpful.`, [`${a.selector}  label “${a.text}”`])] : []);
}
// Visible copy that looks like an unfinished editorial placeholder. Only the matched excerpt is kept.
function unfinishedProof(pc: VPC | undefined): DetectorReport {
  if (!pc?.bodyText) return off('The page text was not captured.');
  const terms = param<string[]>('TRUST-005', 'placeholderTerms', []); const t = pc.bodyText.toLowerCase(); const hits: string[] = [];
  for (const term of terms) { const i = t.indexOf(term); if (i >= 0) hits.push(quote(pc.bodyText.slice(Math.max(0, i - 20), i + term.length + 40).replace(/\s+/g, ' '), 100)); }
  return ran(hits.length ? [review('Copy on the page looks unfinished', 'Text that looks like an editorial placeholder is visible. If it stands in for a testimonial or other proof, publish approved evidence or remove it.', hits)] : []);
}

// WCAG 1.3.2 / 2.4.3: does Tab move through the page in an order that follows how it reads? Counts focus moves that jump well back up the page.
// Order can be deliberate (a skip link, a dialog), so the result is for a person, with each jump named.
function readingOrder(out: ScanOutput): DetectorReport {
  const d = vp(out, 'desktop'); if (!d?.keyboard?.length) return off('The keyboard trace was not captured.');
  const back = param('A11Y-013', 'backJumpPx', 300), min = param('A11Y-013', 'minJumps', 2);
  const seen = new Set<string>(); const steps = d.keyboard.filter((s) => { if (!s.selector || !s.box?.visible || s.iframe || seen.has(s.selector)) return false; seen.add(s.selector); return true; });   // a repeat means focus wrapped round to the start if (steps.length < 6) return na('Too few focusable items to judge order.');
  const jumps: string[] = [];
  for (let i = 1; i < steps.length; i++) { const a = steps[i - 1].box!, b = steps[i].box!; if (b.y < a.y - back && steps[i].press > 1) jumps.push(`press ${steps[i].press}: ${steps[i].name || steps[i].selector} is ${Math.round(a.y - b.y)}px above the previous stop (${steps[i - 1].name || steps[i - 1].selector})`); }
  return ran(jumps.length >= min ? [review('Keyboard order jumps back up the page', `Tab moved back up the page ${jumps.length} times, which can disorient keyboard and screen-reader users. A person should confirm the order is intended.`, jumps.slice(0, 4))] : []);
}
// Typography consistency: how many font families carry the page text. Counted by characters so a one-off icon font does not count.
function fontFamilies(out: ScanOutput): DetectorReport {
  const g = vp(out, 'desktop')?.signals as { fontFamilies?: [string, number][] } | null | undefined; if (!g?.fontFamilies) return off('Font use was not captured.');
  const max = param('DESIGN-002', 'maxFamilies', 3), share = param('DESIGN-002', 'minShare', 0.05); const total = g.fontFamilies.reduce((n, [, c]) => n + c, 0); if (total < 200) return na('Too little text to judge type use.');
  const used = g.fontFamilies.filter(([, c]) => c / total >= share);
  return ran(used.length > max ? [review('The page uses many typefaces', `${used.length} font families each carry more than ${Math.round(share * 100)}% of the text; most brands settle on one or two.`, used.map(([f, c]) => `${f}: ${Math.round((c / total) * 100)}% of text`))] : []);
}
