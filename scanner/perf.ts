// Performance: a mobile Lighthouse run in a real Chrome, with the numbers a person needs to judge it (lab LCP and CLS, how the test was run,
// what Lighthouse says caused it). These are LAB numbers from one simulated phone on a simulated slow connection. They are not what real
// visitors measured. Real-visitor (field) numbers, including INP, come separately from Google's Chrome UX Report via PageSpeed Insights
// (scanner/psi.ts), are kept in `field`, and are reported only when Google actually has them.
// Avara's own run goes through the same egress proxy as the rest of the scan. If it fails and PageSpeed Insights returned a lab run,
// that run is used instead and labelled as run by Google (`conditions.runBy`). If neither works, the caller records that and the rest
// of the report stands.
import net from 'node:net';
import { chromium } from 'playwright';
import { startEgressProxy } from './egress-proxy.ts';
import { fetchPsi, type FieldData, type Lhr } from './psi.ts';

export type { FieldData, FieldMetric } from './psi.ts';
export type PerfRun = { lcp: number | null; cls: number | null; tbt: number | null; fcp: number | null; speedIndex: number | null; score: number | null };
export type PerfDiagnostics = {
  lcpElement: { selector: string; snippet: string } | null; lcpLazyLoaded: boolean; lcpNotPrioritized: boolean;
  unsizedImages: { selector: string; snippet: string }[]; renderBlocking: { url: string; wastedMs: number }[]; largestShiftSources: { selector: string; snippet: string }[];
};
// What Lighthouse measured about resources, kept as small summaries so the engine can point at the file that costs the most.
export type PerfAudit = { score: number | null; display: string | null; wastedBytes: number; wastedMs: number; items: { url: string; totalBytes?: number; wastedBytes?: number; wastedMs?: number; entity?: string; blockingMs?: number; transferBytes?: number; mainThreadMs?: number }[] };
export const AUDIT_IDS = ['uses-optimized-images', 'modern-image-formats', 'uses-responsive-images', 'offscreen-images', 'efficient-animated-content', 'font-display', 'unused-javascript', 'legacy-javascript', 'bootup-time', 'mainthread-work-breakdown', 'render-blocking-resources', 'third-party-summary', 'unused-css-rules',
  // Lighthouse 12+ reports most resource findings as "insights"; the older audit ids above are kept for older versions.
  'image-delivery-insight', 'font-display-insight', 'render-blocking-insight', 'third-parties-insight'];
export type PerfResult = {
  // runs, median and range are always LAB numbers.
  runs: PerfRun[]; median: PerfRun; range: { lcp: [number, number] | null; cls: [number, number] | null };
  // runBy: 'avara' is Avara's own Lighthouse run; 'google' is Lighthouse run by Google PageSpeed Insights, used only when Avara's run failed.
  conditions: { tool: string; version: string; runBy: 'avara' | 'google'; formFactor: 'mobile'; emulatedDevice: string; network: string; cpuSlowdown: string; runs: number; date: string };
  diagnostics: PerfDiagnostics;
  audits: Record<string, PerfAudit>;
  // Real-visitor data. Never mixed into runs/median/range.
  field: FieldData;
  // Set when Avara's own Lighthouse run failed and Google's lab run is shown instead.
  localError?: string;
};

export const THRESHOLDS = { lcp: { good: 2500, poor: 4000 }, cls: { good: 0.1, poor: 0.25 }, inp: { good: 200, poor: 500 } };
const med = (a: (number | null)[]) => { const v = a.filter((x): x is number => typeof x === 'number').sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const span = (a: (number | null)[]): [number, number] | null => { const v = a.filter((x): x is number => typeof x === 'number'); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
const freePort = () => new Promise<number>((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); s.on('error', rej); });

type Audit = Lhr['audits'][string];
const node = (n: unknown) => { const o = n as { selector?: string; snippet?: string; nodeLabel?: string } | undefined; return o ? { selector: o.selector || '', snippet: (o.snippet || o.nodeLabel || '').slice(0, 220) } : null; };
const runOf = (a: Record<string, Audit>): PerfRun => ({ lcp: a['largest-contentful-paint']?.numericValue ?? null, cls: a['cumulative-layout-shift']?.numericValue ?? null, tbt: a['total-blocking-time']?.numericValue ?? null, fcp: a['first-contentful-paint']?.numericValue ?? null, speedIndex: a['speed-index']?.numericValue ?? null, score: null });

/** Summarises one or more Lighthouse results (Avara's, or Google's from PageSpeed Insights) into lab numbers, diagnostics and audits. */
export function summarise(lhrs: Lhr[], runBy: 'avara' | 'google', field: FieldData): PerfResult {
  const last = lhrs[lhrs.length - 1]; if (!last) throw new Error('Lighthouse did not run.');
  const runs = lhrs.map((l) => runOf(l.audits));
  const a = last.audits;
  const lcpEl = (a['largest-contentful-paint-element']?.details?.items?.[0] as { items?: { node?: unknown }[] } | undefined)?.items?.[0]?.node;
  const shiftItems = (a['layout-shifts']?.details?.items ?? []) as { node?: unknown }[];
  const th = last.configSettings?.throttling;
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const audits: Record<string, PerfAudit> = {};
  for (const id of AUDIT_IDS) {
    const au = a[id] as (Audit & { details?: { overallSavingsBytes?: number; overallSavingsMs?: number; items?: Record<string, unknown>[] } }) | undefined; if (!au || au.score === undefined) continue;
    const items = (au.details?.items ?? []).slice(0, 5).map((i) => ({ url: String(i.url ?? i.label ?? (i.entity as { text?: string } | undefined)?.text ?? i.entity ?? ''), totalBytes: num(i.totalBytes), wastedBytes: num(i.wastedBytes), wastedMs: num(i.wastedMs), entity: typeof i.entity === 'string' ? i.entity : (i.entity as { text?: string } | undefined)?.text, blockingMs: num(i.blockingTime), transferBytes: num(i.transferSize), mainThreadMs: num(i.mainThreadTime ?? i.total) }));
    const raw = au.details?.items ?? [];
    const sumBytes = raw.reduce((n, i) => n + num(i.wastedBytes), 0), sumMs = raw.reduce((n, i) => n + num(i.wastedMs), 0);
    const fcp = num((au as { metricSavings?: { FCP?: number } }).metricSavings?.FCP);
    audits[id] = { score: au.score ?? null, display: au.displayValue ?? null, wastedBytes: num(au.details?.overallSavingsBytes) || sumBytes, wastedMs: num(au.details?.overallSavingsMs) || (id === 'render-blocking-insight' ? fcp : id === 'font-display-insight' ? sumMs : 0), items };
  }
  return {
    audits, runs, median: { lcp: med(runs.map((r) => r.lcp)), cls: med(runs.map((r) => r.cls)), tbt: med(runs.map((r) => r.tbt)), fcp: med(runs.map((r) => r.fcp)), speedIndex: med(runs.map((r) => r.speedIndex)), score: null },
    range: { lcp: span(runs.map((r) => r.lcp)), cls: span(runs.map((r) => r.cls)) },
    conditions: { tool: runBy === 'google' ? 'Lighthouse, run by Google PageSpeed Insights (not by Avara)' : 'Lighthouse', version: last.lighthouseVersion, runBy, formFactor: 'mobile', emulatedDevice: 'Moto G Power class phone (Lighthouse mobile default)', network: th ? `simulated slow 4G (${th.rttMs} ms round trip, ${Math.round((th.throughputKbps ?? 0) / 100) / 10} Mbps)` : 'simulated slow 4G', cpuSlowdown: th ? `${th.cpuSlowdownMultiplier}x CPU slowdown` : '4x CPU slowdown', runs: runs.length, date: (runBy === 'google' && last.fetchTime) || new Date().toISOString() },
    diagnostics: {
      lcpElement: node(lcpEl), lcpLazyLoaded: a['lcp-lazy-loaded']?.score === 0, lcpNotPrioritized: a['prioritize-lcp-image']?.score === 0,
      unsizedImages: ((a['unsized-images']?.details?.items ?? []) as { node?: unknown }[]).map((i) => node(i.node)).filter((x): x is { selector: string; snippet: string } => !!x).slice(0, 5),
      renderBlocking: ((a['render-blocking-resources']?.details?.items ?? []) as { url?: string; wastedMs?: number }[]).map((i) => ({ url: String(i.url || ''), wastedMs: Math.round(i.wastedMs || 0) })).slice(0, 5),
      largestShiftSources: shiftItems.map((i) => node(i.node)).filter((x): x is { selector: string; snippet: string } => !!x).slice(0, 3),
    },
    field,
  };
}

/** Avara's own Lighthouse run(s) in a real Chrome, through the egress proxy. */
async function runLocal(url: string, runsWanted: number): Promise<Lhr[]> {
  if (process.env.AVARA_FAIL_ANALYZER === 'perf-local') throw new Error('Avara\'s own Lighthouse run was disabled for this test.');
  const proxy = await startEgressProxy(); const port = await freePort();
  const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true, args: [`--remote-debugging-port=${port}`, `--proxy-server=${proxy.url}`, '--proxy-bypass-list=<-loopback>', '--disable-extensions'] });
  try {
    const { default: lighthouse } = await import('lighthouse') as unknown as { default: (u: string, f: Record<string, unknown>) => Promise<{ lhr: Lhr } | undefined> };
    const out: Lhr[] = [];
    for (let i = 0; i < runsWanted; i++) {
      const r = await lighthouse(url, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], formFactor: 'mobile', maxWaitForLoad: 45_000 });
      if (!r) throw new Error('Lighthouse returned no result.');
      out.push(r.lhr);
    }
    if (!out.length) throw new Error('Lighthouse did not run.');
    return out;
  } finally { await browser.close().catch(() => {}); await proxy.close(); }
}

/** Lab numbers from Avara's Lighthouse (or Google's, if Avara's fails) plus real-visitor data from PageSpeed Insights when Google has it. */
export async function runLighthouse(url: string, runsWanted = 1): Promise<PerfResult> {
  if (process.env.AVARA_FAIL_ANALYZER === 'perf') throw new Error('Performance check disabled for this test.');
  // PageSpeed Insights works on Google's side while the local run works here, so it adds little or no time. It never throws.
  const psi = fetchPsi(url);
  try {
    const lhrs = await runLocal(url, runsWanted);
    return summarise(lhrs, 'avara', (await psi).field);
  } catch (e) {
    const p = await psi;
    if (!p.lab) throw e;
    return { ...summarise([p.lab], 'google', p.field), localError: (e as Error).message.split('\n')[0].slice(0, 200) };
  }
}
