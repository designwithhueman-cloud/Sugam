// Google PageSpeed Insights (PSI v5) client. It gives Avara two things the local Lighthouse run cannot:
//  1. Field data: what real Chrome users measured on this URL (or, failing that, this origin), from the Chrome UX Report (CrUX).
//     This is the only source of INP, and the only honest source of "real visitors" LCP and CLS.
//  2. A fallback lab run: Lighthouse run on Google's servers. Used only when Avara's own Lighthouse run fails, and always labelled as Google's.
// PSI means Google fetches the URL, so it is only ever called for public addresses. It never fails a scan: every problem comes back as a reason.
// PAGESPEED_API_KEY is optional in principle, but keyless calls share one anonymous daily quota that is often exhausted (HTTP 429).
import dns from 'node:dns/promises';
import net from 'node:net';
import { isBlockedIp } from '../lib/net/guard.ts';

export type FieldCategory = 'good' | 'needs improvement' | 'poor';
export type FieldMetric = { p75: number; category: FieldCategory; unit: 'ms' | 'score' };
export type FieldData =
  | { available: true; source: 'Chrome UX Report (via Google PageSpeed Insights)'; scope: 'url' | 'origin'; scopeId: string; formFactor: 'phone';
      period: { first: string; last: string } | null; periodNote: string; overall: FieldCategory | null;
      metrics: { lcp: FieldMetric | null; inp: FieldMetric | null; cls: FieldMetric | null }; note: string }
  | { available: false; reason: string; metrics: string[] };

// What PSI returns for lab data; the same shape as a local Lighthouse result.
export type Lhr = { audits: Record<string, { numericValue?: number; score?: number | null; displayValue?: string; details?: Record<string, unknown> & { items?: Record<string, unknown>[] } }>; lighthouseVersion: string; fetchTime?: string;
  configSettings?: { throttling?: { cpuSlowdownMultiplier?: number; rttMs?: number; throughputKbps?: number } } };
export type PsiResult = { field: FieldData; lab: Lhr | null; labError: string | null };

type CruxMetric = { percentile?: number; category?: string };
type CruxDate = { year: number; month: number; day: number };
type LoadingExperience = { id?: string; initial_url?: string; origin_fallback?: boolean; overall_category?: string; metrics?: Record<string, CruxMetric>; collectionPeriod?: { firstDate?: CruxDate; lastDate?: CruxDate } };
type PsiResponse = { loadingExperience?: LoadingExperience; originLoadingExperience?: LoadingExperience; lighthouseResult?: Lhr & { runtimeError?: { code?: string; message?: string } }; error?: { code?: number; message?: string; status?: string } };

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const FIELD_METRICS = ['INP', 'field LCP', 'field CLS'];
const none = (reason: string): FieldData => ({ available: false, reason, metrics: FIELD_METRICS });
const CAT: Record<string, FieldCategory> = { FAST: 'good', AVERAGE: 'needs improvement', SLOW: 'poor' };
const day = (d?: CruxDate) => (d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);
const sec = (ms: number) => `${Math.round(ms / 100) / 10} s`;

function metric(m: CruxMetric | undefined, unit: 'ms' | 'score'): FieldMetric | null {
  if (!m || typeof m.percentile !== 'number' || !CAT[m.category ?? '']) return null;
  // PSI reports the CLS 75th percentile multiplied by 100 (5 means 0.05).
  return { p75: unit === 'score' ? m.percentile / 100 : m.percentile, category: CAT[m.category as string], unit };
}

/** Turns PSI's loadingExperience blocks into Avara's field data, or the honest reason there is none. Exported for tests. */
export function parseField(r: PsiResponse): FieldData {
  const page = r.loadingExperience, origin = r.originLoadingExperience;
  const hasMetrics = (le?: LoadingExperience) => !!le?.metrics && Object.keys(le.metrics).length > 0;
  // PSI fills loadingExperience with origin data and sets origin_fallback when the URL itself has too little traffic.
  const useUrl = hasMetrics(page) && !page?.origin_fallback;
  const le = useUrl ? page : hasMetrics(origin) ? origin : hasMetrics(page) ? page : null;
  if (!le) return none('Google has no real-visitor data for this page or its site (the Chrome UX Report needs enough Chrome users visiting over 28 days), so INP and real-visitor LCP and CLS cannot be reported. Avara\'s performance numbers are lab measurements only.');
  const scope: 'url' | 'origin' = useUrl ? 'url' : 'origin';
  const ms = le.metrics ?? {};
  const metrics = { lcp: metric(ms.LARGEST_CONTENTFUL_PAINT_MS, 'ms'), inp: metric(ms.INTERACTION_TO_NEXT_PAINT, 'ms'), cls: metric(ms.CUMULATIVE_LAYOUT_SHIFT_SCORE, 'score') };
  if (!metrics.lcp && !metrics.inp && !metrics.cls) return none('Google returned real-visitor data for this site, but not for LCP, INP or CLS, so none is reported.');
  const first = day(le.collectionPeriod?.firstDate), last = day(le.collectionPeriod?.lastDate);
  const period = first && last ? { first, last } : null;
  const periodNote = period ? `${period.first} to ${period.last}` : 'the most recent 28 days Google had collected';
  const where = scope === 'url' ? 'this page' : `the whole site (${le.id ?? 'this origin'}), because this page alone has too few visits`;
  const parts = [metrics.lcp && `LCP ${sec(metrics.lcp.p75)} (${metrics.lcp.category})`, metrics.inp && `INP ${Math.round(metrics.inp.p75)} ms (${metrics.inp.category})`, metrics.cls && `CLS ${Math.round(metrics.cls.p75 * 100) / 100} (${metrics.cls.category})`].filter(Boolean);
  return {
    available: true, source: 'Chrome UX Report (via Google PageSpeed Insights)', scope, scopeId: le.id ?? le.initial_url ?? '', formFactor: 'phone', period, periodNote,
    overall: CAT[le.overall_category ?? ''] ?? null, metrics,
    note: `Real visitors on phones (Chrome UX Report, ${where}, ${periodNote}), 75th percentile: ${parts.join(', ')}. These are separate from Avara's lab numbers.`,
  };
}

/** True only for addresses Google can reach and that we are willing to tell Google about. */
async function isPublic(url: URL): Promise<boolean> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|test|internal|lan|home)$/.test(host)) return false;
  if (net.isIP(host)) return !isBlockedIp(host);
  try { const addrs = await dns.lookup(host, { all: true }); return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address)); } catch { return false; }
}

/** Calls PSI once (mobile, performance only). Never throws. */
export async function fetchPsi(rawUrl: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<PsiResult> {
  const fail = (reason: string, labError = reason): PsiResult => ({ field: none(reason), lab: null, labError });
  if (process.env.AVARA_PSI === 'off') return fail('Real-visitor data was not requested for this scan (Google PageSpeed Insights is turned off).');
  let url: URL; try { url = new URL(rawUrl); } catch { return fail('Real-visitor data was not looked up: the address could not be read.'); }
  if (!(await isPublic(url))) return fail('Real-visitor data was not looked up because this address is not public, so Google cannot see it.');
  url.hash = '';
  const q = new URLSearchParams({ url: url.toString(), strategy: 'mobile', category: 'performance' });
  const key = process.env.PAGESPEED_API_KEY?.trim(); if (key) q.set('key', key);
  const timeoutMs = opts.timeoutMs ?? Number(process.env.PAGESPEED_TIMEOUT_MS || 60_000);
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(opts.signal ? [opts.signal] : [])]);
  let body: PsiResponse;
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, { signal, headers: { accept: 'application/json' } });
    body = (await res.json().catch(() => ({}))) as PsiResponse;
    if (!res.ok || body.error) {
      // Keep Google's error code and its first sentence, e.g. "FAILED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested".
      const msg = (body.error?.message ?? `HTTP ${res.status}`).replace(/^Lighthouse returned error:\s*/, '').split(/(?<=\.)\s/).slice(0, 2).join(' ').replace(/\.$/, '');
      if (res.status === 429) return fail(`Real-visitor data could not be looked up: Google's PageSpeed Insights quota is used up${key ? '' : ' (no PAGESPEED_API_KEY is set, so the shared anonymous quota applies)'}. Try again later.`);
      if (res.status === 400 || res.status === 500) return fail(`Real-visitor data could not be looked up: Google's own test could not load the page, and Google then returns no real-visitor data either (${msg.split('\n')[0].slice(0, 200)}).`);
      return fail(`Real-visitor data could not be looked up: Google PageSpeed Insights returned an error (${msg.split('\n')[0].slice(0, 160)}).`);
    }
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
    return fail(timedOut ? `Real-visitor data could not be looked up: Google PageSpeed Insights did not answer within ${Math.round(timeoutMs / 1000)} s.` : 'Real-visitor data could not be looked up: Google PageSpeed Insights could not be reached.');
  }
  const lhr = body.lighthouseResult;
  const labOk = !!lhr?.audits && !lhr.runtimeError?.code && typeof lhr.audits['largest-contentful-paint']?.numericValue === 'number';
  return { field: parseField(body), lab: labOk ? (lhr as Lhr) : null, labError: labOk ? null : (lhr?.runtimeError?.message ?? 'Google returned no lab result.') };
}
