// AEO and passive-security tracks. They read the same scan output as the rules but are reported beside the scores, never inside them: a result here
// changes no category score, the overall score, or any repair group. Criteria, parameters, sources and recommendations live in src/tracks/*.json.
import fs from 'node:fs';
import path from 'node:path';

export type TrackResult = { id: string; track: 'aeo' | 'security'; title: string; status: 'pass' | 'flag' | 'unverified'; evidence: string; recommendation: string; source: string; advisory: boolean };
type Spec = { id: string; title: string; check: string; parameters: Record<string, unknown>; recommendation: string; source: string };
type Signals = Record<string, any> | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

const specs = (track: 'aeo' | 'security'): Spec[] => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'tracks', `${track}.json`), 'utf8')).checks;
const p = <T>(s: Spec, k: string, d: T): T => (s.parameters?.[k] as T) ?? d;
type Out = { status: TrackResult['status']; evidence: string };
const pass = (evidence: string): Out => ({ status: 'pass', evidence });
const flag = (evidence: string): Out => ({ status: 'flag', evidence });
const unk = (evidence: string): Out => ({ status: 'unverified', evidence });

function robotsBlocked(text: string, bots: string[]): string[] {
  const blocked: string[] = []; let agents: string[] = []; let inGroup = false;
  const groups: { agents: string[]; disallowAll: boolean }[] = []; let cur: { agents: string[]; disallowAll: boolean } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!inGroup) { cur = { agents: [], disallowAll: false }; groups.push(cur); } cur!.agents.push(v.toLowerCase()); inGroup = true; }
    else { inGroup = false; if (k === 'disallow' && v === '/' && cur) cur.disallowAll = true; }
  }
  void agents;
  for (const b of bots) { const g = groups.find((x) => x.agents.includes(b.toLowerCase())) ?? groups.find((x) => x.agents.includes('*')); if (g?.disallowAll) blocked.push(b); }
  return blocked;
}

function run(s: Spec, g: Signals): Out {
  if (!g) return unk('The page signals were not captured in this scan.');
  const h = (g.headers ?? null) as Record<string, string | null> | null; const f = g.files ?? {};
  switch (s.check) {
    case 'title': { const t = (g.title ?? '').trim(); const [lo, hi] = [p(s, 'minChars', 10), p(s, 'maxChars', 70)]; return !t ? flag('No title.') : t.length < lo || t.length > hi ? flag(`Title is ${t.length} characters (“${t.slice(0, 80)}”); aim for ${lo}–${hi}.`) : pass(`“${t.slice(0, 80)}”`); }
    case 'description': { const d = (g.description ?? '').trim(); const [lo, hi] = [p(s, 'minChars', 50), p(s, 'maxChars', 170)]; return !d ? flag('No meta description.') : d.length < lo || d.length > hi ? flag(`Description is ${d.length} characters; aim for ${lo}–${hi}.`) : pass(`${d.length} characters`); }
    case 'lang': return g.lang ? pass(`lang="${g.lang}"`) : flag('The html element has no lang attribute.');
    case 'canonical': return g.canonical ? pass(String(g.canonical)) : flag('No canonical link.');
    case 'jsonld': { const want = p<string[]>(s, 'expectedTypes', []); const have = (g.jsonLdTypes ?? []) as string[]; return have.some((t) => want.includes(t)) ? pass(`Found ${have.join(', ')}`) : flag(have.length ? `Found only ${have.join(', ')}.` : 'No JSON-LD found.'); }
    case 'robots': { if (!f.robots) return unk('robots.txt could not be read.'); if (f.robots.status === 404) return pass('No robots.txt, so nothing is blocked.'); if (f.robots.text == null) return unk(`robots.txt answered ${f.robots.status}.`); const b = robotsBlocked(f.robots.text, p<string[]>(s, 'crawlers', [])); return b.length ? flag(`robots.txt disallows: ${b.join(', ')}.`) : pass('No listed crawler is disallowed.'); }
    case 'noindex': { const m = `${g.robotsMeta ?? ''} ${h?.xRobotsTag ?? ''}`; return /noindex/i.test(m) ? flag('The page is marked noindex.') : pass('Not marked noindex.'); }
    case 'llms': return !f.llms ? unk('/llms.txt could not be read.') : f.llms.status === 200 && f.llms.text ? pass('/llms.txt present') : flag('No /llms.txt (optional).');
    case 'h1': return g.h1Count === 1 ? pass('One h1.') : flag(`${g.h1Count} h1 headings.`);
    case 'text': return (g.textWords ?? 0) >= p(s, 'minWords', 120) ? pass(`${g.textWords} words`) : flag(`Only ${g.textWords} words of text.`);
    case 'og': { const o = g.og ?? {}; const miss = ['title', 'description', 'image'].filter((k) => !o[k]); return miss.length ? flag(`Missing og:${miss.join(', og:')}.`) : pass('og title, description and image set.'); }
    case 'https': return g.isHttps ? pass('HTTPS') : g.localHost ? unk('Local address; HTTPS is not expected.') : flag('The page was delivered over HTTP.');
    case 'hsts': { if (!h) return unk('Response headers not captured.'); if (!g.isHttps) return unk('Not served over HTTPS.'); const m = /max-age=(\d+)/i.exec(h.hsts ?? ''); return !h.hsts ? flag('No Strict-Transport-Security header.') : +(m?.[1] ?? 0) < p(s, 'minMaxAge', 15552000) ? flag(`HSTS max-age is ${m?.[1] ?? 'missing'}.`) : pass(h.hsts); }
    case 'csp': return !h ? unk('Response headers not captured.') : h.csp ? pass('CSP present') : flag('No Content-Security-Policy header.');
    case 'nosniff': return !h ? unk('Response headers not captured.') : /nosniff/i.test(h.contentTypeOptions ?? '') ? pass('nosniff') : flag('No X-Content-Type-Options: nosniff.');
    case 'frame': return !h ? unk('Response headers not captured.') : /frame-ancestors/i.test(h.csp ?? '') || h.frameOptions ? pass('Framing restricted.') : flag('Neither frame-ancestors nor X-Frame-Options is set.');
    case 'referrer': return !h ? unk('Response headers not captured.') : h.referrerPolicy ? pass(h.referrerPolicy) : flag('No Referrer-Policy header.');
    case 'mixed': return g.mixed?.length ? flag(`HTTP resources on the page: ${g.mixed.slice(0, 3).join(', ')}`) : g.isHttps ? pass('No HTTP resources.') : unk('Page is not HTTPS, so mixed content does not apply.');
    case 'sri': { const n = (g.extScriptsWithoutSri ?? []).length; return n > p(s, 'maxUnpinnedBeforeFlag', 1) ? flag(`${n} third-party scripts without integrity: ${g.extScriptsWithoutSri.slice(0, 2).join(', ')}`) : pass(`${g.extScriptCount ?? 0} third-party scripts; ${n} without integrity.`); }
    case 'noopener': return g.blankWithoutNoopener?.length ? flag(`${g.blankWithoutNoopener.length} external new-tab links lack rel=noopener: ${g.blankWithoutNoopener.slice(0, 2).join(', ')}`) : pass('No unprotected external new-tab links.');
    case 'insecureform': return g.insecureForms?.length ? flag(`Form posts to ${g.insecureForms[0]}`) : pass('No form posts over HTTP.');
    default: return unk(`Unknown check ${s.check}.`);
  }
}

export function trackReports(signals: Signals, localHost = false): { aeo: TrackResult[]; security: TrackResult[] } {
  const g = signals ? { ...signals, localHost } : signals;
  const build = (track: 'aeo' | 'security'): TrackResult[] => specs(track).map((s) => { const o = run(s, g); return { id: s.id, track, title: s.title, ...o, recommendation: s.recommendation, source: s.source, advisory: !!s.parameters?.advisory }; });
  return { aeo: build('aeo'), security: build('security') };
}

/** Rescan comparison for the tracks: which flagged checks are now fixed, still present, newly flagged, or cannot be compared. */
type TrackOutcome = { id: string; outcome: 'fixed' | 'still_present' | 'new' | 'unverified' };
export function compareTracks(before: TrackResult[], after: TrackResult[]): TrackOutcome[] {
  const prior = new Map(before.map((r) => [r.id, r.status]));
  return after.flatMap((r): TrackOutcome[] => {
    const was = prior.get(r.id);
    if (r.status === 'unverified' || was === 'unverified') return was === 'flag' || r.status === 'flag' ? [{ id: r.id, outcome: 'unverified' as const }] : [];
    if (was === 'flag') return [{ id: r.id, outcome: r.status === 'pass' ? 'fixed' as const : 'still_present' as const }];
    return r.status === 'flag' ? [{ id: r.id, outcome: 'new' as const }] : [];
  });
}
