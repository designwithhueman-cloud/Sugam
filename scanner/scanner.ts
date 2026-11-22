// Sugam scanner worker. Loads a public page in headless Chrome at two viewports and extracts:
//  - axe-core violations AND incomplete results (incl. label-content-name-mismatch, WCAG 2.5.3)
//  - custom heuristics for AI-built / no-code sites (repeated CTA labels, clickable divs,
//    reduced-motion handling, ARIA tablist structure and keyboard behaviour, 320px reflow)
//  - a 25-press Tab trace with focus-indicator CSS, 2.4.11 obscured-focus detection and 3.2.1 context-change detection
//  - WCAG checks axe-core does not run (EXTRA in inpage.ts): non-text contrast 1.4.11, text spacing 1.4.12,
//    drag-only controls 2.5.7, accessible authentication 3.3.8 (blocked paste, autofill off, CAPTCHA), positive tabindex 2.4.3,
//    plus checks aimed at AI-built sites: tiny text, autofocus, new-tab links, heading structure, missing <main>, vague link text,
//    placeholder-only fields, autoplay video with no controls, voice-control name order, forced-color-adjust opt-out
//  - full-page screenshots and document-coordinate bounding boxes for every flagged element
import { chromium, type Browser, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults, Result as AxeResult } from 'axe-core';
import { startEgressProxy } from './egress-proxy.ts';
import { BOXES, PAGE_METRICS, HEURISTICS, EXTRA, FOCUS_SNAPSHOT, MOTION } from './inpage.ts';
import { STANDARDS, type StandardId } from '../lib/standards.ts';
import { checkUrl, BlockedUrlError } from '../lib/net/guard.ts';
import { probeActions, runWorkflow, type ActionProbe } from './avara.ts';
import { PAGE_CONTEXT, MOBILE_PROBE, TEXT_RESIZE, STRUCTURE_CONTEXT, VALIDATION_PROBE, FRAGMENT_PROBE, SIGNALS_PROBE } from './avara-inpage.ts';
import { HERO_PROBE } from './hero-probe.ts';
import { runLighthouse, type PerfResult } from './perf.ts';

export type ViewportId = 'desktop' | 'mobile';
export const VIEWPORTS: { name: ViewportId; width: number; height: number }[] = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 320, height: 640 },
];
const TAB_PRESSES = 25;
const MAX_SHOT_HEIGHT = 12_000;

export type Box = { x: number; y: number; width: number; height: number; visible: boolean };
export type NodeRef = { selector: string; html: string; detail?: string };
export type FocusStep = {
  press: number; none?: boolean; iframe?: boolean; selector?: string; tag?: string; role?: string | null; name?: string; html?: string;
  box?: Box; inView?: boolean; indicator?: boolean; changed?: string[]; focusStyle?: Record<string, string>;
  contextChange?: string; // Tab alone changed the URL or opened a window (WCAG 3.2.1)
  obscured?: 'none' | 'partial' | 'full' | 'offscreen'; obscuredBy?: { selector: string; html: string; box: Box; position: string } | null;
};
export type Heuristics = {
  duplicateCtas: { name: string; nodes: NodeRef[] }[];
  clickables: (NodeRef & { confirmed: boolean })[];
  tablists: { selector: string; html: string; problems: string[]; tabSelectors: string[]; selectedSelector: string | null; keyboard?: { arrowMovesFocus: boolean; tabLeavesTablist: boolean } }[];
  reflow: { overflow: number; viewport: number; offenders: (NodeRef & { exempt: boolean })[] } | null;
  media?: (NodeRef & { kind: 'audio' | 'video' | 'embed'; captions: boolean | null; transcript: boolean })[];
  extra?: Extra;
};
// Checks axe-core does not run (see EXTRA in inpage.ts).
export type Extra = {
  nonTextContrast: NodeRef[]; textSpacing: NodeRef[]; dragging: NodeRef[]; positiveTabindex: NodeRef[];
  smallText: NodeRef[]; autofocus: NodeRef[]; newTab: NodeRef[]; vagueLinks: NodeRef[]; placeholderOnly: NodeRef[]; noMain: NodeRef[];
  autoplayVideo: NodeRef[]; voiceNameNotFirst: NodeRef[]; forcedColorsOptOut: NodeRef[];
  imageOfText: NodeRef[]; autocompleteMissing: NodeRef[]; requiredNotMarked: NodeRef[]; radioGroups: NodeRef[]; invalidNoMessage: NodeRef[]; invalidMessages?: (NodeRef & { message: string })[]; labelNotVisible: NodeRef[]; inputTypeMismatch: NodeRef[];
  headings: (NodeRef & { kind: 'no-h1' | 'many-h1' | 'skipped' | 'empty' })[];
  authentication: { passwordFields: number; pasteBlocked: NodeRef[]; autocompleteOff: NodeRef[]; captcha: NodeRef[] };
};
export type Motion = { hasReducedMotionRule: boolean; readableSheets: number; unreadableSheets: number; running: (NodeRef & { changed?: string[] })[]; still?: number; unsampled?: number };
export type ViewportResult = {
  name: ViewportId; width: number; height: number; pageWidth: number; pageHeight: number;
  screenshot: Buffer; viewportShot: Buffer; truncated: boolean;
  axe: { violations: AxeResult[]; incomplete: AxeResult[]; passes: { id: string; help: string; tags: string[] }[] };
  heuristics: Heuristics; keyboard: FocusStep[]; motion: Motion | null; boxes: Record<string, Box | null>;
  avara: ActionProbe | null; avaraError?: string;   // the main-action probe for this screen size
  signals?: Record<string, unknown> | null;   // desktop: passive head, header and file signals for the separate AEO and security tracks
  fragments?: { id: string; label: string; found: boolean }[] | null;   // desktop: same-page links and whether their target exists
  validation?: Record<string, unknown>[] | null;   // desktop: what the browser's own form validation did (never submits)
  mobileProbe?: Record<string, unknown> | null; orientation?: { docW: number; vw: number; action: { text: string; level: string; reasons: string[] } | null } | null; textResize?: Record<string, unknown> | null;   // 320px-only observations
  pageContext?: Record<string, unknown> | null;    // what a reviewer reads on the page (desktop pass), as data for the rule engine
};
export type ScanOutput = {
  url: string; finalUrl: string; title: string; standard: StandardId;
  engine: { axe: string; browser: string; viewports: string[] };
  viewports: ViewportResult[]; limitations: string[];
  // Avara: lab performance (null if it did not run) and how each analyzer fared, so one failure never costs the rest of the report.
  perf: PerfResult | null; analyzers: Record<string, { status: 'ok' | 'failed' | 'skipped'; message?: string; ms?: number }>;
  goal: string | null;
};
export class ScanError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

const axeTarget = (n: { target: unknown[] }) => (n.target.length === 1 && typeof n.target[0] === 'string' ? (n.target[0] as string) : null);

export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  // Scroll through the page so lazy-loaded content renders, then return to the top.
  await page.evaluate(async () => {
    const step = Math.max(200, innerHeight * 0.9);
    for (let i = 0; i < 30 && scrollY + innerHeight < document.documentElement.scrollHeight; i++) { scrollBy(0, step); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo({ top: 0, left: 0, behavior: 'instant' });   // instant: a page with scroll-behavior: smooth would otherwise still be scrolling
  });
  await page.waitForTimeout(400);
}

async function keyboardTrace(page: Page): Promise<FocusStep[]> {
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo(0, 0); });
  const steps: FocusStep[] = [];
  // WCAG 3.2.1: moving focus alone must not change the page or open a window.
  const noHash = (u: string) => u.split('#')[0];
  const startUrl = noHash(page.url());
  const popups: Page[] = []; const onPage = (p: Page) => popups.push(p);
  page.context().on('page', onPage);
  try {
    for (let i = 1; i <= TAB_PRESSES; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(90);
      if (noHash(page.url()) !== startUrl) {
        const to = page.url();
        steps.push({ press: i, contextChange: `Pressing Tab navigated to ${to}`, selector: steps.at(-1)?.selector, html: steps.at(-1)?.html, none: true });
        await page.goBack({ timeout: 5000 }).catch(() => {}); // keep scanning the original page
        break;
      }
      const snap = await page.evaluate(`${FOCUS_SNAPSHOT}()`) as FocusStep;
      if (popups.length) { snap.contextChange = 'Pressing Tab opened a new window or tab.'; for (const p of popups.splice(0)) await p.close().catch(() => {}); }
      steps.push({ ...snap, press: i });
    }
  } finally { page.context().off('page', onPage); }
  return steps;
}

async function tablistKeyboard(page: Page, h: Heuristics) {
  for (const t of h.tablists.slice(0, 3)) {
    if (!t.selectedSelector || t.tabSelectors.length < 2) continue;
    try {
      await page.focus(t.selectedSelector);
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
      const arrowSel = await page.evaluate((sels: string[]) => { const a = document.activeElement; return sels.findIndex((s) => document.querySelector(s) === a); }, t.tabSelectors);
      const startIdx = t.tabSelectors.indexOf(t.selectedSelector);
      await page.focus(t.selectedSelector);
      await page.keyboard.press('Tab'); await page.waitForTimeout(120);
      const tabSel = await page.evaluate((sels: string[]) => { const a = document.activeElement; return sels.findIndex((s) => document.querySelector(s) === a); }, t.tabSelectors);
      t.keyboard = { arrowMovesFocus: arrowSel >= 0 && arrowSel !== startIdx, tabLeavesTablist: tabSel < 0 };
    } catch { /* tab not focusable: structure problems already describe it */ }
  }
}

async function runViewport(browser: Browser, proxyUrl: string, url: string, vp: typeof VIEWPORTS[number], std: StandardId, limitations: string[], goal: string | null): Promise<{ result: ViewportResult; finalUrl: string; title: string; axeVersion: string }> {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: false,
    reducedMotion: 'no-preference', serviceWorkers: 'block', acceptDownloads: false, proxy: { server: proxyUrl },
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    let res;
    try { res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 }); }
    catch (e) { throw new ScanError('navigation_failed', `The page did not load (${(e as Error).message.split('\n')[0].replace(/^page\.goto: /, '')}).`); }
    if (!res) throw new ScanError('navigation_failed', 'The page did not load.');
    if (res.status() === 403 && (await res.text().catch(() => '')).includes('Sugam egress policy')) throw new ScanError('blocked', 'The page redirected to a private or internal address, which Sugam does not scan.');
    if (res.status() >= 400) {
      const st = res.status();
      const hint = st === 401 || st === 403 || st === 429 ? ' Some sites refuse automated browsers or need a sign-in; Sugam can only scan pages that open for anyone.' : st >= 500 ? ' The site reported a server error; try again in a few minutes.' : ' Check the address.';
      throw new ScanError('http_error', `The page answered with HTTP ${st}.${hint}`);
    }
    await settle(page);

    // Measure the main action first, on the page exactly as a visitor first sees it: Tab and clicks would scroll hidden containers and hide the problem.
    let avara: ActionProbe | null = null; let avaraError: string | undefined;
    try {
      if (process.env.AVARA_FAIL_ANALYZER === 'action') throw new Error('Main-action check disabled for this test.');
      avara = await probeActions(page, vp.name, vp.width, goal, false);
    } catch (e) { avaraError = (e as Error).message.split('\n')[0]; }

    let pageContext: Record<string, unknown> | null = null;
    if (vp.name === 'desktop') {
      try { pageContext = (await page.evaluate(`(${PAGE_CONTEXT})()`)) as Record<string, unknown>; } catch { pageContext = null; }
      if (pageContext) { try { (pageContext as Record<string, unknown>).structure = await page.evaluate(`(${STRUCTURE_CONTEXT})()`); } catch { /* structure is optional */ } }
      // Do the legal, contact, support and review links the page offers actually open? Each address passes the same public-address check as the scan itself.
      if (pageContext) {
        const pc = pageContext as { legalLinks?: Record<string, { href: string | null }[]>; linkTargets?: Record<string, { href: string | null }[]> };
        const urls = [...new Set([...Object.values(pc.legalLinks ?? {}), ...Object.values(pc.linkTargets ?? {})].flatMap((l) => l.slice(0, 1).map((x) => x.href)).filter((h): h is string => !!h && /^https?:/i.test(h)))].slice(0, 8);
        const checks: Record<string, number | string> = {};
        await Promise.all(urls.map(async (u) => { try { await checkUrl(u); const r = await context.request.get(u, { timeout: 8000, maxRedirects: 3, failOnStatusCode: false }); checks[u] = r.status(); } catch (e) { checks[u] = e instanceof BlockedUrlError ? 'blocked' : 'error'; } }));
        (pageContext as Record<string, unknown>).linkChecks = checks;
      }
    }
    let mobileProbe: Record<string, unknown> | null = null;
    if (vp.name === 'mobile') { try { mobileProbe = (await page.evaluate(`(${MOBILE_PROBE})()`)) as Record<string, unknown>; } catch { mobileProbe = null; } }
    const metrics = await page.evaluate(`${PAGE_METRICS}()`) as { width: number; height: number; title: string };
    const shotHeight = Math.min(metrics.height, MAX_SHOT_HEIGHT);
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: 0, width: Math.max(vp.width, metrics.width), height: shotHeight } });
    const viewportShot = await page.screenshot({ type: 'jpeg', quality: 70 });
    // DIFF-002 compares this first-screen image with reference templates; record its layout at the same moment, from the same scroll position.
    if (pageContext) { try { pageContext.heroLayout = await page.evaluate(`(${HERO_PROBE})()`); } catch { /* the hero comparison reports its own skip reason */ } }

    const axe: AxeResults = await new AxeBuilder({ page }).withTags(STANDARDS[std].axeTags).analyze();
    const heuristics = await page.evaluate(`${HEURISTICS}(${JSON.stringify({ reflow: vp.name === 'mobile' })})`) as Heuristics;
    heuristics.extra = await page.evaluate(`${EXTRA}(${JSON.stringify({ textSpacing: vp.name === 'desktop' })})`).catch(() => undefined) as Extra | undefined;

    const selectors = new Set<string>();
    for (const r of [...axe.violations, ...axe.incomplete]) for (const n of r.nodes) { const s = axeTarget(n); if (s) selectors.add(s); }
    heuristics.duplicateCtas.forEach((g) => g.nodes.forEach((n) => selectors.add(n.selector)));
    heuristics.clickables.forEach((n) => selectors.add(n.selector));
    heuristics.tablists.forEach((t) => selectors.add(t.selector));
    (heuristics.media ?? []).forEach((m) => selectors.add(m.selector));
    heuristics.reflow?.offenders.forEach((n) => selectors.add(n.selector));
    const ex = heuristics.extra;
    if (ex) for (const n of [...ex.nonTextContrast, ...ex.textSpacing, ...ex.dragging, ...ex.positiveTabindex, ...ex.smallText, ...ex.autofocus, ...ex.newTab, ...ex.vagueLinks, ...ex.placeholderOnly, ...ex.autoplayVideo, ...ex.voiceNameNotFirst, ...ex.forcedColorsOptOut, ...ex.imageOfText, ...ex.autocompleteMissing, ...ex.requiredNotMarked, ...ex.radioGroups, ...ex.invalidNoMessage, ...ex.labelNotVisible, ...ex.inputTypeMismatch, ...ex.headings, ...ex.authentication.pasteBlocked, ...ex.authentication.autocompleteOff, ...ex.authentication.captcha]) selectors.add(n.selector);
    const boxes = await page.evaluate(`${BOXES}(${JSON.stringify([...selectors])})`) as Record<string, Box | null>;

    const keyboard = await keyboardTrace(page);
    let motion: Motion | null = null;
    if (vp.name === 'desktop') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(600);
      motion = await page.evaluate(`${MOTION}()`) as Motion;
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const m of motion.running) if (!(m.selector in boxes)) Object.assign(boxes, await page.evaluate(`${BOXES}(${JSON.stringify([m.selector])})`));
      await tablistKeyboard(page, heuristics);
    }
    for (const s of keyboard) if (s.box && s.selector) boxes[s.selector] = boxes[s.selector] ?? s.box;
    let validation: Record<string, unknown>[] | null = null;
    let fragments: { id: string; label: string; found: boolean }[] | null = null;
    let signals: Record<string, unknown> | null = null;
    if (vp.name === 'desktop') {
      try {
        signals = (await page.evaluate(`(${SIGNALS_PROBE})()`)) as Record<string, unknown>;
        const h = res.headers(); const pick = (k: string) => h[k] ?? null;
        signals.headers = { csp: pick('content-security-policy'), hsts: pick('strict-transport-security'), contentTypeOptions: pick('x-content-type-options'), frameOptions: pick('x-frame-options'), referrerPolicy: pick('referrer-policy'), xRobotsTag: pick('x-robots-tag') };
        const origin = new URL(page.url()).origin;
        const get = async (p: string) => { try { const u = origin + p; await checkUrl(u); const r = await context.request.get(u, { timeout: 6000, maxRedirects: 2, failOnStatusCode: false }); const ct = r.headers()['content-type'] ?? ''; return { status: r.status(), text: r.ok() && /text|xml|json/i.test(ct) ? (await r.text()).slice(0, 20000) : null }; } catch { return null; } };
        signals.files = { robots: await get('/robots.txt'), llms: await get('/llms.txt'), sitemap: await get('/sitemap.xml') };
      } catch { signals = null; }
    }
    if (vp.name === 'desktop') { try { fragments = (await page.evaluate(`(${FRAGMENT_PROBE})()`)) as typeof fragments; } catch { fragments = null; } }
    if (vp.name === 'desktop') { try { validation = (await page.evaluate(`(${VALIDATION_PROBE})()`)) as Record<string, unknown>[]; } catch { validation = null; } }
    // Landscape: does the page still fit and the main action still work when a phone is turned on its side?
    let orientation: ViewportResult['orientation'] = null;
    if (vp.name === 'mobile') {
      try {
        await page.setViewportSize({ width: 640, height: 320 }); await page.waitForTimeout(250);
        const dims = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth }));
        let action: NonNullable<ViewportResult['orientation']>['action'] = null;
        const first = avara?.candidates[0]?.candidate.text;
        if (first) { const pr = await probeActions(page, 'mobile', 640, goal, false); const hit = pr.candidates.find((c) => c.candidate.text === first); action = hit?.classification ? { text: first, level: hit.classification.level, reasons: hit.classification.reasons } : null; }
        orientation = { ...dims, action };
      } catch { orientation = null; }
      finally { await page.setViewportSize({ width: vp.width, height: vp.height }).catch(() => {}); await page.waitForTimeout(150).catch(() => {}); }
    }
    // Activating the main action changes the page, so it is the last thing done (and never submits anything).
    if (avara && avara.candidates[0] && process.env.AVARA_FAIL_ANALYZER !== 'workflow') {
      const c = avara.candidates[0];
      try { avara.workflow = await runWorkflow(page, c.candidate, c.classification); }
      catch (e) { avaraError = avaraError ?? (e as Error).message.split('\n')[0]; }
    }
    // Text at 200% changes every text size on the page, so it is the very last thing done.
    let textResize: Record<string, unknown> | null = null;
    if (vp.name === 'mobile') { try { textResize = (await page.evaluate(`(${TEXT_RESIZE})()`)) as Record<string, unknown>; } catch { textResize = null; } }
    for (const b of Object.values(boxes)) if (b && b.y + b.height > shotHeight) b.visible = false;
    if (metrics.height > MAX_SHOT_HEIGHT) limitations.push(`The ${vp.name} page is ${metrics.height}px tall; the screenshot stops at ${MAX_SHOT_HEIGHT}px, so pins below that are listed without a highlight.`);

    return {
      finalUrl: page.url(), title: metrics.title, axeVersion: axe.testEngine.version,
      result: {
        name: vp.name, width: vp.width, height: vp.height, pageWidth: Math.max(vp.width, metrics.width), pageHeight: shotHeight,
        screenshot, viewportShot, truncated: metrics.height > MAX_SHOT_HEIGHT,
        axe: { violations: axe.violations, incomplete: axe.incomplete, passes: axe.passes.map((p) => ({ id: p.id, help: p.help, tags: p.tags })) },
        heuristics, keyboard, motion, boxes, avara, avaraError, pageContext, mobileProbe, orientation, textResize, validation, fragments, signals,
      },
    };
  } finally { await context.close(); }
}

export async function scanUrl(url: string, standard: StandardId, onProgress?: (step: string, percent: number) => void, opts: { goal?: string | null; perfRuns?: number; perf?: boolean } = {}): Promise<ScanOutput> {
  await checkUrl(url);
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({
    channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true,
    // Send loopback traffic through the proxy too, so it is checked like everything else.
    args: ['--proxy-bypass-list=<-loopback>', '--disable-extensions'],
  });
  const limitations: string[] = [];
  try {
    const out: ViewportResult[] = [];
    let finalUrl = url, title = '', axeVersion = '';
    // The two passes use separate browser contexts, so they run side by side (about 40% faster).
    onProgress?.('Scanning desktop and mobile', 10);
    const settled = await Promise.allSettled(VIEWPORTS.map((vp) => runViewport(browser, proxy.url, url, vp, standard, limitations, opts.goal ?? null)));
    onProgress?.('Collecting results', 80);
    settled.forEach((r, i) => {
      const vp = VIEWPORTS[i];
      if (r.status === 'fulfilled') {
        out.push(r.value.result);
        if (vp.name === 'desktop') { finalUrl = r.value.finalUrl; title = r.value.title; axeVersion = r.value.axeVersion; }
      } else if (vp.name === 'desktop') throw r.reason;
      else limitations.push(`The ${vp.name} pass did not complete: ${(r.reason as Error).message}`);
    });
    if (proxy.stats.blocked.length) limitations.push(`Sugam blocked ${proxy.stats.blocked.length} request destination(s) on private or internal networks (${proxy.stats.blocked.slice(0, 3).join(', ')}${proxy.stats.blocked.length > 3 ? ', …' : ''}).`);
    if (proxy.stats.capped) limitations.push(`The page made more than 800 network requests; ${proxy.stats.capped} were not loaded.`);
    const analyzers: ScanOutput['analyzers'] = {};
    const probes = out.map((v) => v.avara).filter(Boolean);
    const probeErr = out.find((v) => v.avaraError)?.avaraError;
    analyzers.mobile = probes.length === out.length && probes.length === 2 ? { status: 'ok' } : { status: 'failed', message: probeErr || 'The main-action check did not complete at both screen sizes.' };
    analyzers.workflow = out.some((v) => v.avara?.workflow) ? { status: 'ok' } : { status: 'failed', message: probeErr || 'The workflow check did not run.' };
    let perf: PerfResult | null = null;
    if (opts.perf === false || process.env.AVARA_PERF === 'off') analyzers.performance = { status: 'skipped', message: 'Performance was not requested for this scan.' };
    else {
      onProgress?.('Measuring mobile performance with Lighthouse', 88); const t0 = Date.now();
      try { perf = await runLighthouse(finalUrl, opts.perfRuns ?? 1); analyzers.performance = { status: 'ok', ms: Date.now() - t0 }; }
      catch (e) { analyzers.performance = { status: 'failed', message: `Lighthouse did not complete: ${(e as Error).message.split('\n')[0].slice(0, 160)}` }; limitations.push('The performance check did not complete, so this report has no performance findings.'); }
    }
    return { url, finalUrl, title, standard, engine: { axe: axeVersion, browser: `Chrome ${browser.version()}`, viewports: VIEWPORTS.map((v) => `${v.name} ${v.width}x${v.height}`) }, viewports: out, limitations, perf, analyzers, goal: opts.goal ?? null };
  } finally {
    await browser.close().catch(() => {});
    await proxy.close();
  }
}
