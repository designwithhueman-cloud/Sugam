// Batch scan runner for accuracy measurement. For each site in a manifest it runs the same code paths the product uses (the scanner and analysis for the
// page checks, the exposure audit for the Launch checks), and writes one row per finding for a person to label, plus a separate list of checks that
// could not run. No AI is called. Everything written passes through the redaction module (the scan output is masked inside the scanner, and every
// row and cell is masked again on the way out).
//   - Launch checks that probe the site (private files, source maps, open database tables) run only when the manifest says the site is owned.
//     On any other site they are listed as "not run: needs ownership proof", never skipped silently and never run.
//   - Addresses that are not on this computer need allowRemote; an owned remote site needs allowActive (the person running the batch attests ownership).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scanUrl, type ScanOutput } from '../../scanner/scanner.ts';
import { analyze } from '../../analysis/analyze.ts';
import { analyzeAvara } from '../../analysis/avara/build.ts';
import { auditSite, type ExposureResult } from '../../packages/security-exposure/index.ts';
import { redactDeep, redactError, redactUrl } from '../security/redact.ts';
import { toCsv } from './csv.ts';
import type { Planted } from './stats.ts';

export type SiteSpec = { id: string; url: string; owned?: boolean; note?: string; planted?: Planted[]; supabaseBase?: string };
export type Manifest = { name?: string; sites: SiteSpec[] };
export type RunOptions = { allowRemote?: boolean; allowActive?: boolean; perf?: boolean; delayMs?: number; log?: (s: string) => void };

export const FINDING_COLUMNS = ['finding_id', 'run_id', 'site_id', 'site_url', 'owned', 'kind', 'check_id', 'check_title', 'bucket', 'severity', 'instance_count', 'selector', 'viewport', 'evidence', 'signal', 'screenshot', 'reviewer_verdict', 'reviewer_notes'] as const;
export const NOT_RUN_COLUMNS = ['run_id', 'site_id', 'kind', 'check_id', 'category', 'reason'] as const;
export const SITE_COLUMNS = ['site_id', 'site_url', 'owned', 'status', 'seconds', 'findings', 'not_run', 'error'] as const;
type Row = Record<string, string | number | boolean>;

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);
const isLocal = (u: string) => { try { return LOCAL.has(new URL(u).hostname) || new URL(u).hostname.endsWith('.localhost'); } catch { return false; } };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const one = (s: string) => s.replace(/\s+/g, ' ').trim();
const fid = (...p: string[]) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 12);

/** Refuses a manifest that would reach beyond this computer, or run probing checks, without being told to. */
export function checkManifest(m: Manifest, o: RunOptions): string[] {
  const problems: string[] = []; const seen = new Set<string>();
  if (!Array.isArray(m.sites) || m.sites.length === 0) problems.push('The manifest has no sites.');
  for (const s of m.sites ?? []) {
    if (!s.id || !/^[\w.-]{1,60}$/.test(s.id)) problems.push(`Site id “${s.id}” must be 1 to 60 letters, digits, dots, dashes or underscores.`);
    if (seen.has(s.id)) problems.push(`Duplicate site id “${s.id}”.`); seen.add(s.id);
    try { new URL(s.url); } catch { problems.push(`${s.id}: “${s.url}” is not a web address.`); continue; }
    if (!isLocal(s.url) && !o.allowRemote) problems.push(`${s.id}: ${new URL(s.url).host} is not on this computer. Pass --allow-remote to scan it.`);
    if (s.owned && !isLocal(s.url) && !o.allowActive) problems.push(`${s.id}: owned sites that are not on this computer run the probing checks. Pass --allow-active only for sites you own.`);
  }
  return problems;
}

export type BatchResult = { runId: string; dir: string; findings: Row[]; notRun: Row[]; sites: Row[] };

export async function runBatch(manifest: Manifest, outRoot: string, o: RunOptions = {}): Promise<BatchResult> {
  const problems = checkManifest(manifest, o); if (problems.length) throw new Error(problems.join('\n'));
  const log = o.log ?? (() => {}); const runId = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z') + '-' + crypto.randomBytes(2).toString('hex');
  const dir = path.join(outRoot, runId); fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
  const findings: Row[] = [], notRun: Row[] = [], sites: Row[] = [];

  for (const [n, site] of manifest.sites.entries()) {
    if (n > 0 && o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
    const t0 = Date.now(); const owned = !!site.owned; const base = { run_id: runId, site_id: site.id, site_url: redactUrl(site.url), owned };
    const f0 = findings.length, n0 = notRun.length; let status = 'ok', error = '';
    const skip = (kind: string, check: string, category: string, reason: string) => notRun.push({ run_id: runId, site_id: site.id, kind, check_id: check, category, reason: one(reason) });

    // ---- page checks: the scanner and analysis, exactly as a scan runs them (no AI) ----
    try {
      const out: ScanOutput = await scanUrl(site.url, 'wcag22aa', undefined, { perf: !!o.perf });
      const shots = new Map<string, string>();
      for (const v of out.viewports) { const f = `screenshots/${site.id}-${v.name}.jpg`; fs.writeFileSync(path.join(dir, f), v.viewportShot); shots.set(v.name, f); }
      if (out.narrow) { const f = `screenshots/${site.id}-narrow.jpg`; fs.writeFileSync(path.join(dir, f), out.narrow.viewportShot); shots.set('narrow', f); }
      const shotFor = (vps: string[]) => vps.map((v) => shots.get(v)).filter(Boolean)[0] ?? shots.get('desktop') ?? '';
      const a = analyze(out);
      for (const i of a.issues) {
        if (i.bucket === 'verified_pass') continue;
        const x = i.instances[0]; const vps = [...new Set(i.instances.flatMap((y) => y.viewports))] as string[];
        const others = i.instances.slice(1, 4).map((y) => y.selector).join(' | ');
        findings.push({ ...base, finding_id: fid(site.id, 'scan', i.ruleId, x?.selector ?? i.componentKey), kind: 'scan', check_id: i.ruleId, check_title: i.title, bucket: i.bucket, severity: i.severity, instance_count: i.instances.length,
          selector: x?.selector ?? '', viewport: vps.join('+'), evidence: clip(one([x?.html ?? '', x?.detail ?? '', others ? `also: ${others}` : ''].filter(Boolean).join(' · ')), 600), signal: clip(one(i.whatToChange), 300), screenshot: shotFor(vps), reviewer_verdict: '', reviewer_notes: '' });
      }
      try {
        const av = analyzeAvara(out, a); const seenScan = new Set(findings.filter((r) => r.site_id === site.id && r.kind === 'scan').map((r) => r.check_id));
        for (const f of av.findings) {
          if (f.bucket === 'verified_pass' || seenScan.has(f.rule.id)) continue;   // the analysis restates many page checks; one row per finding, not two
          const ev = f.evidence[0]; const sel = typeof ev?.data?.selector === 'string' ? ev.data.selector : '';
          findings.push({ ...base, finding_id: fid(site.id, 'avara', f.rule.id, f.key), kind: 'avara', check_id: f.rule.id, check_title: f.title, bucket: f.bucket, severity: f.severity, instance_count: f.evidence.length, selector: sel, viewport: ev?.viewport ?? '',
            evidence: clip(one(JSON.stringify(ev?.data ?? {})), 600), signal: clip(one(f.summary), 300), screenshot: shotFor(ev?.viewport ? [ev.viewport] : []), reviewer_verdict: '', reviewer_notes: '' });
        }
      } catch (e) { skip('avara', 'avara-analysis', 'failed', `The cross-category analysis did not complete: ${redactError(e)}`); }
      for (const [k, v] of Object.entries(out.analyzers)) if (v.status !== 'ok') skip('scan', k, v.status === 'skipped' ? 'skipped' : 'failed', v.message ?? v.status);
      for (const l of out.limitations) skip('scan', '(scan)', 'limitation', l);
    } catch (e) { status = 'failed'; error = redactError(e); skip('scan', '(scan)', 'failed', `The page could not be scanned: ${error}`); }

    // ---- Launch checks: the same audit the Launch check runs. Probing checks only on sites the manifest marks as owned ----
    try {
      const testBase = site.supabaseBase && process.env.ALLOW_PRIVATE_HOSTS ? site.supabaseBase : undefined;   // tests only, as in lib/security/service.ts
      const results: ExposureResult[] = await auditSite(site.url, { active: owned, ...(testBase ? { supabaseBaseFor: () => testBase } : {}) });
      for (const r of results) {
        if (r.status === 'flag') findings.push({ ...base, finding_id: fid(site.id, 'launch', r.id, r.evidence.join(';')), kind: 'launch', check_id: r.id, check_title: r.title, bucket: 'flag', severity: r.severity ?? '', instance_count: r.evidence.length, selector: '', viewport: '',
          evidence: clip(one(r.evidence.join(' ; ')), 600), signal: clip(one(r.plain), 300), screenshot: '', reviewer_verdict: '', reviewer_notes: '' });
        else if (r.status === 'unverified') skip('launch', r.id, r.active && !owned ? 'ownership_gated' : 'could_not_check', r.active && !owned ? `Needs ownership proof. Not run on sites we do not own. ${r.plain}` : r.plain);
      }
    } catch (e) { if (status === 'ok') status = 'partial'; error = error || redactError(e); skip('launch', '(launch)', 'failed', `The Launch checks did not complete: ${redactError(e)}`); }

    sites.push({ site_id: site.id, site_url: redactUrl(site.url), owned, status, seconds: Math.round((Date.now() - t0) / 1000), findings: findings.length - f0, not_run: notRun.length - n0, error });
    log(`${status === 'ok' ? 'ok  ' : status}  ${site.id}  ${findings.length - f0} findings, ${notRun.length - n0} not run`);
  }

  const R = <T>(v: T): T => redactDeep(v);
  fs.writeFileSync(path.join(dir, 'findings.csv'), toCsv(FINDING_COLUMNS, R(findings)));
  fs.writeFileSync(path.join(dir, 'checks_not_run.csv'), toCsv(NOT_RUN_COLUMNS, R(notRun)));
  fs.writeFileSync(path.join(dir, 'sites.csv'), toCsv(SITE_COLUMNS, R(sites)));
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(R({ runId, at: new Date().toISOString(), name: manifest.name ?? null, options: { allowRemote: !!o.allowRemote, allowActive: !!o.allowActive, perf: !!o.perf }, sites: manifest.sites.map((s) => ({ id: s.id, url: s.url, owned: !!s.owned, note: s.note ?? null, planted: s.planted ?? [] })) }), null, 2));
  return { runId, dir, findings: R(findings), notRun: R(notRun), sites: R(sites) };
}
