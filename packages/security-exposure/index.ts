// Exposure checks for sites built with AI builders: secrets shipped in the page's code, private files and source maps left public, and
// database tables anyone can read. Written for people who cannot read code: every result carries a plain explanation and a fix message.
//   - passive (secrets in code): reads only the page and the scripts it loads, which every visitor already receives.
//   - active (files, source maps, open tables): extra GET requests. Only run when the caller says the site's owner is verified (`active`).
//   - read-only, always: GET requests only. Table checks use the public (anon) key and keep names and column names, never row values.
//   - a leaked service key is reported and never used.
import { checkUrl } from '../../lib/net/guard.ts';
import { KINDS, PRIVATE_KEY, PRIVATE_KEY_MASK, JWT, jwtKind, maskedForm, maskedJwt } from './patterns.ts';
export { jwtPayload } from './patterns.ts';

export type Severity = 'critical' | 'high' | 'medium';
export type ExposureResult = { id: 'SEC-011' | 'SEC-012' | 'SEC-013' | 'SEC-014'; title: string; status: 'pass' | 'flag' | 'unverified'; severity: Severity | null; active: boolean; plain: string; fix: string; yourself?: string; evidence: string[] };   // fix: a message to paste into the AI builder; yourself: what only the owner can do
export type AuditOptions = { active: boolean; fetchImpl?: typeof fetch; supabaseBaseFor?: (ref: string) => string | null };   // supabaseBaseFor: tests only

const MAX_BODY = 3_000_000, TIMEOUT = 6000;
const text = (b: Buffer) => b.toString('utf8');
const mask = (s: string) => `${s.slice(0, 5)}… (${s.length} characters)`;   // never keep a whole secret

/** GET with the scanner's address guard on every hop. Returns null when blocked or unreachable. */
export async function guardedGet(url: string, init: { headers?: Record<string, string> } = {}, f: typeof fetch = fetch): Promise<{ status: number; type: string; body: string; url: string } | null> {
  let cur = url;
  for (let hop = 0; hop < 3; hop++) {
    try {
      await checkUrl(cur);
      const r = await f(cur, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'AvaraCheck/1.0', accept: '*/*', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT) });
      if ([301, 302, 303, 307, 308].includes(r.status)) { const loc = r.headers.get('location'); if (!loc) return null; cur = new URL(loc, cur).toString(); continue; }
      const chunks: Buffer[] = []; let n = 0; const reader = r.body?.getReader();
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > MAX_BODY) { await reader.cancel(); break; } chunks.push(Buffer.from(value)); }
      return { status: r.status, type: r.headers.get('content-type') ?? '', body: text(Buffer.concat(chunks)), url: cur };
    } catch { return null; }
  }
  return null;
}

// ---- secrets in code ----
export type Secret = { kind: string; severity: Severity; preview: string; location: string };
export type Keys = { secrets: Secret[]; anon: { token: string; ref: string }[] };
/** Finds leaked secrets and the public database key in code text, on the RAW text (classification comes before masking). A result carries the
 *  kind, where it was found and a masked form (well-known prefix only), never the value. A service key is classified and never returned whole. */
export function scanCode(code: string, location = 'the page'): Keys {
  const secrets: Secret[] = []; const anon: Keys['anon'] = []; const seen = new Set<string>();
  const add = (kind: string, severity: Severity, preview: string) => secrets.push({ kind, severity, preview, location });
  for (const k of KINDS) if (k.leak) for (const m of code.matchAll(k.re)) if (!seen.has(m[0])) { seen.add(m[0]); add(k.name, k.severity, maskedForm(k, m[0])); }
  for (const m of code.matchAll(PRIVATE_KEY)) if (!seen.has(m[0])) { seen.add(m[0]); add('Private key', 'critical', PRIVATE_KEY_MASK); }
  for (const m of code.matchAll(JWT)) {
    if (seen.has(m[0])) continue; seen.add(m[0]); const j = jwtKind(m[0]);
    if (j.id === 'jwt_service') add(j.name, 'critical', maskedJwt());
    else if (j.id === 'jwt_anon' && j.ref) anon.push({ token: m[0], ref: j.ref });
  }
  return { secrets, anon };
}
const tablesIn = (code: string) => [...new Set([...code.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]{0,62})["'`]\s*\)/g)].map((m) => m[1]))];

// ---- the audit ----
const scriptSrcs = (html: string, base: string) => [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1], base); } catch { return null; } }).filter((u): u is URL => !!u && u.origin === new URL(base).origin).map((u) => u.toString());
const isHtml = (r: { type: string; body: string }) => /html/i.test(r.type) || /^\s*<(!doctype|html)/i.test(r.body);

const FILES: { path: string; label: string; sig: (b: string) => boolean }[] = [
  { path: '/.env', label: '.env settings file', sig: (b) => /^[A-Z][A-Z0-9_]{2,}=.+/m.test(b) },
  { path: '/.env.local', label: '.env.local settings file', sig: (b) => /^[A-Z][A-Z0-9_]{2,}=.+/m.test(b) },
  { path: '/.env.production', label: '.env.production settings file', sig: (b) => /^[A-Z][A-Z0-9_]{2,}=.+/m.test(b) },
  { path: '/.git/config', label: 'git repository settings', sig: (b) => /^\[core\]/m.test(b) },
  { path: '/.git/HEAD', label: 'git repository', sig: (b) => /^ref: refs\//.test(b.trim()) },
  { path: '/backup.sql', label: 'database backup', sig: (b) => /\b(CREATE TABLE|INSERT INTO)\b/i.test(b) },
  { path: '/database.sql', label: 'database backup', sig: (b) => /\b(CREATE TABLE|INSERT INTO)\b/i.test(b) },
  { path: '/dump.sql', label: 'database backup', sig: (b) => /\b(CREATE TABLE|INSERT INTO)\b/i.test(b) },
];

export async function auditSite(url: string, o: AuditOptions): Promise<ExposureResult[]> {
  const f = o.fetchImpl ?? fetch; const origin = new URL(url).origin;
  const home = await guardedGet(url, {}, f);
  const need = (id: ExposureResult['id'], title: string, active: boolean, why: string): ExposureResult => ({ id, title, status: 'unverified', severity: null, active, plain: why, fix: '', evidence: [] });
  if (!home || home.status >= 400) return [need('SEC-011', 'Secret keys in your site’s code', false, 'We could not load the page to read its code.'), need('SEC-012', 'Private files left public', true, 'We could not load the page.'), need('SEC-013', 'Your source code is public', true, 'We could not load the page.'), need('SEC-014', 'Database tables anyone can read', true, 'We could not load the page.')];

  const srcs = scriptSrcs(home.body, home.url).slice(0, 12); const code: { url: string; text: string }[] = [{ url: home.url, text: home.body }];
  for (const s of srcs) { const r = await guardedGet(s, {}, f); if (r && r.status === 200) code.push({ url: s, text: r.body }); }
  const all = code.map((c) => c.text).join('\n');
  const where = (u: string) => { try { return u === home.url ? 'the home page HTML' : new URL(u).pathname; } catch { return 'the page'; } };
  const keys: Keys = { secrets: [], anon: [] }; const seenSecret = new Set<string>();
  for (const c of code) { const k = scanCode(c.text, where(c.url)); for (const x of k.secrets) { const id = `${x.kind}|${x.preview}|${x.location}`; if (!seenSecret.has(id)) { seenSecret.add(id); keys.secrets.push(x); } } for (const a of k.anon) if (!keys.anon.some((y) => y.token === a.token)) keys.anon.push(a); }

  const out: ExposureResult[] = [];
  out.push(keys.secrets.length
    ? { id: 'SEC-011', title: 'Secret keys in your site’s code', status: 'flag', severity: keys.secrets.some((s) => s.severity === 'critical') ? 'critical' : 'high', active: false,
        plain: 'Anyone who opens your site can read these secret keys in its code and use them as if they were you. Treat them as already stolen.',
        fix: 'Remove every secret key from the frontend code. Keep secrets only on the server, using environment variables. Do not change anything else.',
        yourself: 'Replace (rotate) each exposed key in that provider’s dashboard. The old keys are compromised, so removing them from the code is not enough.',
        evidence: keys.secrets.map((s) => `${s.kind}: ${s.preview} (in ${s.location})`) }
    : { id: 'SEC-011', title: 'Secret keys in your site’s code', status: 'pass', severity: null, active: false, plain: 'No secret keys were found in your site’s code.', fix: '', evidence: [`Read ${code.length} file${code.length === 1 ? '' : 's'}.`] });

  if (!o.active) {
    const msg = 'Run this after you confirm you own the site. It makes a few extra read-only requests.';
    return [...out, need('SEC-012', 'Private files left public', true, msg), need('SEC-013', 'Your source code is public', true, msg), need('SEC-014', 'Database tables anyone can read', true, msg)];
  }

  // private files
  const found: string[] = [];
  for (const file of FILES) { const r = await guardedGet(origin + file.path, {}, f); if (r && r.status === 200 && !isHtml(r) && file.sig(r.body)) found.push(`${file.path} (${file.label})`); }
  out.push(found.length
    ? { id: 'SEC-012', title: 'Private files left public', status: 'flag', severity: 'critical', active: true, plain: 'Files that should be private can be downloaded by anyone. They often contain passwords and keys.', fix: 'Make sure .env files, the .git folder and database backups are never published. Delete them from the public folder and the deployed site. Do not change anything else.', yourself: 'Replace any password or key that was in those files.', evidence: found }
    : { id: 'SEC-012', title: 'Private files left public', status: 'pass', severity: null, active: true, plain: 'None of the commonly leaked private files could be downloaded.', fix: '', evidence: [`Checked ${FILES.length} common paths.`] });

  // source maps
  const maps: string[] = [];
  for (const c of code.slice(1, 6)) { const r = await guardedGet(c.url.split('?')[0] + '.map', {}, f); if (r && r.status === 200 && !isHtml(r)) { try { const j = JSON.parse(r.body); if (Array.isArray(j.sources) && (Array.isArray(j.sourcesContent) && j.sourcesContent.length)) maps.push(new URL(c.url).pathname + '.map'); } catch { /* not a source map */ } } }
  out.push(maps.length
    ? { id: 'SEC-013', title: 'Your source code is public', status: 'flag', severity: 'medium', active: true, plain: 'Your original code can be downloaded and read in full, which makes it easier to find weaknesses and to copy your product.', fix: 'Turn off public source maps for the production build. Do not change anything else.', evidence: maps }
    : { id: 'SEC-013', title: 'Your source code is public', status: 'pass', severity: null, active: true, plain: 'Your original source code is not published.', fix: '', evidence: [`Checked ${Math.min(5, Math.max(0, code.length - 1))} script file${code.length === 2 ? '' : 's'}.`] });

  // open tables
  if (!keys.anon.length) { out.push({ id: 'SEC-014', title: 'Database tables anyone can read', status: 'pass', severity: null, active: true, plain: 'No public Supabase database key was found, so there is nothing to test here.', fix: '', evidence: [] }); return out; }
  const open: string[] = [], closed: string[] = []; const { token, ref } = keys.anon[0];
  const base = (o.supabaseBaseFor ? o.supabaseBaseFor(ref) : `https://${ref}.supabase.co`);
  if (!base) { out.push(need('SEC-014', 'Database tables anyone can read', true, 'We could not work out where your database is.')); return out; }
  const h = { apikey: token, authorization: `Bearer ${token}` };
  const names = new Set(tablesIn(all));
  const spec = await guardedGet(`${base}/rest/v1/`, { headers: { ...h, accept: 'application/openapi+json' } }, f);
  if (spec && spec.status === 200) { try { const j = JSON.parse(spec.body); for (const p of Object.keys(j.paths ?? {})) if (/^\/[a-z_][a-z0-9_]*$/i.test(p)) names.add(p.slice(1)); } catch { /* no table list */ } }
  for (const t of [...names].slice(0, 15)) {
    const r = await guardedGet(`${base}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, { headers: h }, f);   // one row is enough to know; the values are dropped
    if (!r) continue;
    if (r.status === 200) { try { const rows = JSON.parse(r.body); if (Array.isArray(rows) && rows.length) open.push(`${t} (columns: ${Object.keys(rows[0]).slice(0, 8).join(', ')})`); else closed.push(t); } catch { closed.push(t); } } else closed.push(t);
  }
  out.push(open.length
    ? { id: 'SEC-014', title: 'Database tables anyone can read', status: 'flag', severity: 'critical', active: true, plain: 'Anyone on the internet can read the records in these tables without signing in, including your customers’ data. This is the most common serious mistake in AI-built apps.', fix: 'Turn on Row Level Security for every table and add policies so a signed-in user can only read and change their own rows. Block all access for signed-out visitors unless a table is meant to be public. Do not change anything else.', evidence: open }
    : { id: 'SEC-014', title: 'Database tables anyone can read', status: names.size ? 'pass' : 'unverified', severity: null, active: true, plain: names.size ? 'The tables we could find did not return any records to a signed-out visitor.' : 'We could not find any table names to test.', fix: '', evidence: closed.length ? [`Tested ${closed.length} table${closed.length === 1 ? '' : 's'}; none returned records.`] : [] });
  return out;
}

// ---- verdict and before/after ----
export type Verdict = { level: 'stop' | 'fix' | 'partial' | 'ok'; headline: string; detail: string };
/** One plain sentence a founder can act on. "ok" never says "safe": it says what was and was not checked. */
export function verdict(results: ExposureResult[]): Verdict {
  const flags = results.filter((r) => r.status === 'flag'); const unverified = results.filter((r) => r.status === 'unverified' && r.active);
  if (flags.some((r) => r.severity === 'critical')) return { level: 'stop', headline: 'Don’t launch yet', detail: `${flags.length} serious problem${flags.length === 1 ? '' : 's'} could expose your keys or your customers’ data. Fix ${flags.length === 1 ? 'it' : 'them'} first.` };
  if (flags.length) return { level: 'fix', headline: 'Fix these first', detail: `${flags.length} problem${flags.length === 1 ? '' : 's'} found. None exposes customer data directly, but they make an attack easier.` };
  if (unverified.length) return { level: 'partial', headline: 'Only partly checked', detail: 'We found nothing wrong in what we could check. Confirm you own the site to run the rest.' };
  return { level: 'ok', headline: 'No exposure problems found', detail: 'We checked for leaked keys, public private files, public source code and open database tables, and found none. This does not cover every possible weakness.' };
}

export type Change = { id: string; title: string; outcome: 'fixed' | 'still_open' | 'new' | 'newly_found' | 'could_not_check' };   // new = was fine before, now a problem; newly_found = not checked before
/** Compares two runs of the same checks. A check that was fine before and is flagged now is "new": something the last change broke. */
export function compareExposure(before: ExposureResult[], after: ExposureResult[]): Change[] {
  const was = new Map(before.map((r) => [r.id, r.status])); const out: Change[] = [];
  for (const r of after) {
    const w = was.get(r.id); if (!w) continue;
    if (w === 'flag' && r.status === 'pass') out.push({ id: r.id, title: r.title, outcome: 'fixed' });
    else if (w === 'flag' && r.status === 'flag') out.push({ id: r.id, title: r.title, outcome: 'still_open' });
    else if (w === 'pass' && r.status === 'flag') out.push({ id: r.id, title: r.title, outcome: 'new' });
    else if (w === 'unverified' && r.status === 'flag') out.push({ id: r.id, title: r.title, outcome: 'newly_found' });
    else if ((w === 'flag' && r.status === 'unverified') || (w === 'pass' && r.status === 'unverified' && r.active)) out.push({ id: r.id, title: r.title, outcome: 'could_not_check' });
  }
  return out;
}
