// Re-checks earlier findings on a fresh load of the page. A finding is marked FIXED only when a check comparable to the original one positively
// confirms it (the same rule on the same element now passes, the same action is now usable, the same workflow now completes, a measurement is
// better by more than its normal variation). An element that cannot be found, a rule that no longer applies, or a result inside the noise is
// "could not verify", never "fixed".
import { chromium, type Browser, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startEgressProxy } from './egress-proxy.ts';
import { probeActions, runWorkflow, type Candidate } from './avara.ts';
import { THRESHOLDS, type PerfResult } from './perf.ts';

export type Outcome = 'fixed' | 'still_present' | 'could_not_verify';
export type VerifyResult = { outcome: Outcome; comparable: boolean; reason: string; after: Record<string, unknown> };
export type Probe = Record<string, unknown> & { kind: string };
// A rescan re-checks at the width the finding was measured at. New probes record it (width, and widths for a finding shared by both phone
// widths); probes from earlier reports have none, and their phone pass was 320px wide, so they are re-checked at 320px.
type Size = { width: number; height: number };
const heightFor = (w: number) => (w <= 320 ? 640 : w <= 480 ? 844 : 800);
const widthsOf = (p: Probe): number[] => { const ws = Array.isArray(p.widths) ? (p.widths as unknown[]).map(Number).filter((n) => n > 0) : []; if (ws.length) return ws; const w = Number(p.width); return [w > 0 ? w : p.viewport === 'desktop' ? 1280 : 320]; };
const sizeOf = (w: number): Size => ({ width: w, height: heightFor(w) });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function openPage(browser: Browser, proxy: string, url: string, size: Size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false, proxy: { server: proxy } });
  const page = await ctx.newPage(); page.setDefaultTimeout(20_000);
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  return { page, close: () => ctx.close() };
}

async function checkAxe(page: Page, p: Probe): Promise<VerifyResult> {
  const sel = String(p.selector), rule = String(p.ruleId);
  if (!(await page.$(sel).catch(() => null))) return { outcome: 'could_not_verify', comparable: false, reason: 'The element could not be found on the rescanned page. It may have been renamed or removed, and a missing element is not proof the problem is fixed.', after: { found: false } };
  const r = await new AxeBuilder({ page }).include(sel).withRules([rule]).analyze();
  if (r.violations.some((v) => v.id === rule)) return { outcome: 'still_present', comparable: true, reason: `The same axe-core rule (${rule}) still fails on the same element.`, after: { rule, result: 'violation', detail: r.violations.find((v) => v.id === rule)?.nodes[0]?.failureSummary?.slice(0, 200) } };
  if (r.passes.some((v) => v.id === rule)) return { outcome: 'fixed', comparable: true, reason: `The same axe-core rule (${rule}) now passes on the same element.`, after: { rule, result: 'pass' } };
  return { outcome: 'could_not_verify', comparable: false, reason: `axe-core did not give a pass or a failure for ${rule} on this element now (it may no longer apply), so the fix could not be confirmed.`, after: { rule, result: r.incomplete.some((v) => v.id === rule) ? 'needs review' : 'not applicable' } };
}

async function checkAction(page: Page, width: number, p: Probe, workflow: boolean): Promise<VerifyResult> {
  const vp = width >= 1024 ? 'desktop' : 'mobile';
  const probe = await probeActions(page, vp, width, (p.goal as string | null) ?? null, false);
  const hit = probe.candidates.find((c) => norm(c.candidate.text) === norm(String(p.text)));
  if (!hit || !hit.measurement || !hit.classification) return { outcome: 'could_not_verify', comparable: false, reason: `“${p.text}” was not found among the page's main actions on the rescanned page, so the same action could not be re-checked. A missing action is not proof of a fix.`, after: { found: false, candidates: probe.candidates.map((c) => c.candidate.text) } };
  const c = hit.classification, m = hit.measurement;
  const after = { level: c.level, reasons: c.reasons, width: m.width, height: m.height, visibleRatio: m.visibleRatio, clippedBy: m.clippedBy, cover: m.cover };
  if (!workflow) return c.level === 'ok' ? { outcome: 'fixed', comparable: true, reason: `At ${width}px wide “${p.text}” is now fully on screen, not covered, and large enough (${m.width} by ${m.height} px).`, after }
    : { outcome: 'still_present', comparable: true, reason: `At ${width}px wide “${p.text}” is still ${c.level === 'unusable' ? 'unusable' : 'hard to use'}: ${c.reasons[0]}`, after };
  const wf = await runWorkflow(page, hit.candidate as Candidate, c);
  const wafter = { ...after, outcome: wf.outcome, steps: wf.steps };
  if (wf.outcome === 'form_reached') return { outcome: 'fixed', comparable: true, reason: `Activating “${p.text}” now reaches the first field. ${wf.steps.at(-1) ?? ''}`, after: wafter };
  if (wf.outcome === 'form_not_reached' || wf.outcome === 'could_not_activate' || wf.outcome === 'no_visible_change') return { outcome: 'still_present', comparable: true, reason: `The workflow still fails: ${wf.reason}`, after: wafter };
  return { outcome: 'could_not_verify', comparable: false, reason: `The workflow ended differently this time (${wf.reason}), so it is not comparable.`, after: wafter };
}

// A measurement is only "better" if it beats the normal variation between runs of the same test.
export function judgePerf(metric: 'lcp' | 'cls', before: number, afterMedian: number | null, afterRange: [number, number] | null, runs: number): VerifyResult {
  if (afterMedian == null) return { outcome: 'could_not_verify', comparable: false, reason: 'The rescan has no measurement for this metric (the performance check did not complete).', after: { metric } };
  const good = THRESHOLDS[metric].good; const noise = metric === 'lcp' ? Math.max(before * 0.15, 300) : Math.max(before * 0.2, 0.03);
  const after = { metric, median: afterMedian, range: afterRange, runs, before, noise: Math.round(noise * 1000) / 1000, guideline: good };
  if (afterMedian <= good && afterMedian <= before - noise) return { outcome: 'fixed', comparable: true, reason: `Lab ${metric.toUpperCase()} is now ${fmt(metric, afterMedian)} (median of ${runs} runs), down from ${fmt(metric, before)} and inside the ${fmt(metric, good)} guideline. The drop is larger than the ${fmt(metric, noise)} of normal variation.`, after };
  if (afterMedian > good && afterMedian >= before - noise) return { outcome: 'still_present', comparable: true, reason: `Lab ${metric.toUpperCase()} is ${fmt(metric, afterMedian)} (median of ${runs} runs), not meaningfully better than ${fmt(metric, before)} (normal variation is about ${fmt(metric, noise)}), and above the ${fmt(metric, good)} guideline.`, after };
  if (afterMedian > good) return { outcome: 'still_present', comparable: true, reason: `Lab ${metric.toUpperCase()} improved from ${fmt(metric, before)} to ${fmt(metric, afterMedian)} (median of ${runs} runs) but is still above the ${fmt(metric, good)} guideline.`, after };
  return { outcome: 'could_not_verify', comparable: false, reason: `Lab ${metric.toUpperCase()} is ${fmt(metric, afterMedian)}, within the guideline, but the change from ${fmt(metric, before)} is inside the ${fmt(metric, noise)} of normal variation, so it cannot be told apart from a different run of the same page.`, after };
}
const fmt = (m: string, v: number) => (m === 'lcp' ? `${Math.round(v / 100) / 10} s` : `${Math.round(v * 1000) / 1000}`);

function combine(parts: VerifyResult[]): VerifyResult {
  if (parts.length === 1) return parts[0];
  const reason = parts.map((x) => x.reason).join(' ');
  if (parts.some((x) => x.outcome === 'still_present')) return { outcome: 'still_present', comparable: true, reason, after: { widths: parts.map((x) => x.after) } };
  if (parts.every((x) => x.outcome === 'fixed')) return { outcome: 'fixed', comparable: true, reason, after: { widths: parts.map((x) => x.after) } };
  return { outcome: 'could_not_verify', comparable: false, reason, after: { widths: parts.map((x) => x.after) } };
}

/** Applies a CSS patch to a fresh copy of the page at each width and remeasures the main action there. Nothing is written to the site. */
export async function remeasureWithCss(url: string, css: string, text: string, goal: string | null, widths: number[]): Promise<{ width: number; ok: boolean; detail: string }[]> {
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--proxy-bypass-list=<-loopback>', '--disable-extensions'] });
  try {
    const out: { width: number; ok: boolean; detail: string }[] = [];
    for (const w of widths) {
      const { page, close } = await openPage(browser, proxy.url, url, sizeOf(w));
      try {
        await page.addStyleTag({ content: css });
        await page.waitForTimeout(150);
        const r = await checkAction(page, w, { kind: 'action', text, goal }, false);
        out.push({ width: w, ok: r.outcome === 'fixed', detail: r.outcome === 'fixed' ? 'the button is fully on screen and not covered' : r.reason.replace(/^At \d+px wide /, '').slice(0, 160) });
      } finally { await close().catch(() => {}); }
    }
    return out;
  } finally { await browser.close().catch(() => {}); await proxy.close(); }
}

export async function verifyProbes(url: string, probes: (Probe | null)[], now: { perf: PerfResult | null; pageWidths: Record<number, number> }): Promise<VerifyResult[]> {
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--proxy-bypass-list=<-loopback>', '--disable-extensions'] });
  try {
    const out: VerifyResult[] = [];
    for (const p of probes) {
      if (!p) { out.push({ outcome: 'could_not_verify', comparable: false, reason: 'No comparable check exists for this finding yet, so a rescan cannot confirm a fix.', after: {} }); continue; }
      try {
        if (p.kind === 'perf') { const m = p.metric as 'lcp' | 'cls'; out.push(judgePerf(m, Number(p.before), now.perf?.median[m] ?? null, now.perf?.range[m] ?? null, now.perf?.runs.length ?? 0)); continue; }
        if (p.kind === 'hscroll') {
          const res = widthsOf(p).map((w) => { const pw = now.pageWidths[w]; return pw == null ? null : pw <= w + 1 ? { w, ok: true, pw } : { w, ok: false, pw }; });
          out.push(res.some((r) => r === null) ? { outcome: 'could_not_verify', comparable: false, reason: `The rescan has no ${widthsOf(p).filter((w, k) => !res[k]).join(' and ')}px pass to compare.`, after: {} }
            : res.every((r) => r!.ok) ? { outcome: 'fixed', comparable: true, reason: res.map((r) => `At ${r!.w}px wide the page is now ${r!.pw}px wide: no sideways scrolling.`).join(' '), after: { pageWidths: res } }
            : { outcome: 'still_present', comparable: true, reason: res.filter((r) => !r!.ok).map((r) => `At ${r!.w}px wide the page is still ${r!.pw}px wide.`).join(' '), after: { pageWidths: res } });
          continue;
        }
        // One fresh page per original width. A finding shared by both phone widths is Fixed only when it is fixed at every one of them.
        const parts: VerifyResult[] = [];
        for (const w of p.kind === 'axe' ? widthsOf(p).slice(0, 1) : widthsOf(p)) {
          const { page, close } = await openPage(browser, proxy.url, url, sizeOf(w));
          try { parts.push(p.kind === 'axe' ? await checkAxe(page, p) : p.kind === 'action' ? await checkAction(page, w, p, false) : p.kind === 'workflow' ? await checkAction(page, w, p, true) : { outcome: 'could_not_verify', comparable: false, reason: 'This kind of finding has no re-check yet.', after: {} }); }
          finally { await close().catch(() => {}); }
        }
        out.push(combine(parts));
      } catch (e) { out.push({ outcome: 'could_not_verify', comparable: false, reason: `The re-check failed to run (${(e as Error).message.split('\n')[0].slice(0, 120)}).`, after: {} }); }
    }
    return out;
  } finally { await browser.close().catch(() => {}); await proxy.close(); }
}
