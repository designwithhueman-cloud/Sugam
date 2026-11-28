// Redaction: hides secret-shaped values before anything is stored, sent to a model, exported, logged or shown. Pattern-based only (see
// packages/security-exposure/patterns.ts). Pure and idempotent: masking masked text changes nothing, because every replacement ("sk_live_••••",
// "eyJ••••", "[removed]") is shorter than any pattern needs. Findings are classified on the RAW text first (the Launch check and the scanner do that);
// this module then replaces values in place, so a finding and its location survive and only the value is gone.
import { KINDS, PRIVATE_KEY, JWT, MASK, PRIVATE_KEY_MASK, maskedForm, maskedJwt, jwtKind } from '../../packages/security-exposure/patterns.ts';
import { isSecretParam, stripSecrets } from '../net/url-privacy.ts';

export type Hit = { kind: string; leak: boolean };
const QUICK = /sk[_-]|rk_live|AKIA|gh[pousr]_|xox[baprs]-|sb_secret_|AIza|eyJ|-----BEGIN|[?&]\w+=|&amp;\w+=/;
const PARAM = /(\?|&amp;|&)([A-Za-z0-9_.\-]{1,40})=(\[removed\]|[^&#\s"'<>)\]]+)/g;

/** Replaces every secret-shaped value in a string. onHit receives the kind of each one (never the value). */
export function redactText(s: string, onHit?: (h: Hit) => void): string {
  if (!s || s.length < 8 || !QUICK.test(s)) return s;
  let t = s;
  t = t.replace(PRIVATE_KEY, () => { onHit?.({ kind: 'Private key', leak: true }); return PRIVATE_KEY_MASK; });
  t = t.replace(JWT, (m) => { onHit?.({ kind: jwtKind(m).name, leak: jwtKind(m).leak }); return maskedJwt(); });   // every JWT, the public (anon) one too
  for (const k of KINDS) t = t.replace(k.re, (m) => { onHit?.({ kind: k.name, leak: k.leak }); return maskedForm(k, m); });
  t = t.replace(PARAM, (all, sep: string, name: string, value: string) => { if (!isSecretParam(name) || value === '[removed]') return all; onHit?.({ kind: `address parameter “${name}”`, leak: false }); return `${sep}${name}=[removed]`; });
  return t;
}

class Ctx { hits = new Map<string, { kind: string; leak: boolean; where: string; count: number }>(); seen = new WeakSet<object>(); }
const generalise = (path: string) => path.replace(/\[\d+\]/g, '[]').replace(/^\./, '');

function walk<T>(v: T, ctx: Ctx | undefined, path: string, c: Ctx): T {
  if (typeof v === 'string') return redactText(v, ctx ? (h) => { const k = `${h.kind}|${generalise(path)}`; const e = c.hits.get(k); if (e) e.count++; else c.hits.set(k, { ...h, where: generalise(path), count: 1 }); } : undefined) as T;
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Uint8Array || v instanceof Date || v instanceof RegExp) return v;
  if (c.seen.has(v as object)) return v; c.seen.add(v as object);
  if (Array.isArray(v)) { let out: unknown[] | null = null; v.forEach((x, i) => { const y = walk(x, ctx, `${path}[${i}]`, c); if (y !== x) { out ??= v.slice(); out[i] = y; } }); return (out ?? v) as T; }
  const proto = Object.getPrototypeOf(v); if (proto !== Object.prototype && proto !== null) return v;   // only plain data is walked
  let out: Record<string, unknown> | null = null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const y = walk(x, ctx, `${path}.${k}`, c); if (y !== x) { out ??= { ...(v as Record<string, unknown>) }; out[k] = y; } }
  return (out ?? v) as T;
}
/** Masks every string in plain data (objects, arrays), leaving numbers, images (Buffers) and everything else as they are. Returns the same object when nothing changed. */
export function redactDeep<T>(v: T): T { return walk(v, undefined, '', new Ctx()); }
/** As redactDeep, and also says what was hidden and where (kind, field, count): classification without values. */
export function redactDeepReport<T>(v: T): { value: T; hidden: { kind: string; leak: boolean; where: string; count: number }[] } { const c = new Ctx(); const value = walk(v, c, '', c); return { value, hidden: [...c.hits.values()] }; }

/** A web address with secret parameters removed and any secret-shaped value in its path, query or fragment masked. Never throws. */
export function redactUrl(input: string): string {
  try { return redactText(stripSecrets(input).toString()); } catch { return redactText(input); }
}

export const redactError = (e: unknown): string => redactText(String((e as Error)?.message ?? e ?? '')).split('\n')[0].slice(0, 300);
/** console.error for anything that might carry page content: the message and stack are masked. */
export function logError(label: string, e: unknown, extra?: unknown) {
  const err = e as Error; console.error(label, redactText(String(err?.message ?? e ?? '')), err?.stack ? redactText(err.stack.split('\n').slice(1, 4).join('\n')) : '', extra === undefined ? '' : redactDeep(extra));
}

/** The scan output with every secret-shaped string masked and the addresses cleaned. A one-line note says how many were hidden, never what they were. */
export function redactScanOutput<T extends { url: string; finalUrl: string; limitations: string[] }>(out: T): T {
  const { value, hidden } = redactDeepReport(out); const r = { ...value };
  r.url = redactUrl(out.url); r.finalUrl = redactUrl(out.finalUrl);
  if (hidden.length) {
    const n = hidden.reduce((a, h) => a + h.count, 0); const kinds = [...new Set(hidden.map((h) => h.kind))].slice(0, 5).join(', ');
    r.limitations = [...r.limitations, `${n} value${n === 1 ? '' : 's'} that look like secrets (${kinds}) ${n === 1 ? 'was' : 'were'} hidden in the stored evidence. Findings and their locations are unchanged.`];
  }
  return r;
}

// ---- saved flows: refuse sensitive literals before they are stored ----
const SENSITIVE_SELECTOR = /(passw|passcode|otp|one[-_]?time|\bcvv\b|\bcvc\b|\bssn\b|social[-_]?security|\biban\b|routing[-_]?number|card[-_]?(number|no)|credit[-_]?card|api[-_]?key|secret|access[-_]?token|auth[-_]?token|\btoken\b|type=["']?password)/i;
const luhn = (d: string) => { let sum = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; };
/** Why a fill value cannot be saved, or null. Ordinary inputs (names, emails, search terms, test data) are fine and stay replayable. */
export function sensitiveFillProblem(flow: { steps: { id: string; action: string; selector?: string; value?: string }[] }): { stepId: string; reason: string } | null {
  for (const s of flow.steps) {
    if (s.action !== 'fill' || !s.value) continue; const v = s.value; const digits = v.replace(/[\s-]/g, '');
    const secret = redactText(v) !== v;
    const card = /^\d{13,19}$/.test(digits) && luhn(digits); const ssn = /^\d{3}-\d{2}-\d{4}$/.test(v.trim());
    const field = SENSITIVE_SELECTOR.test(s.selector ?? '');
    if (secret || card || ssn || field) return { stepId: s.id, reason: `Step “${s.id}” fills ${secret ? 'a value that looks like a secret key' : card ? 'what looks like a card number' : ssn ? 'what looks like a national ID number' : 'a password, card or secret field'}. Saved flows cannot store credentials or sensitive values.` };
  }
  return null;
}
export { MASK };
