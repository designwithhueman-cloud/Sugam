// Turns the pack's per-viewport rows into launch_checks rows, and attaches the mobile action-hit sample to the existing main-action repair.
import type { ScanOutput } from '../../scanner/scanner.ts';
import type { PackRow } from '../../scanner/launch.ts';
import type { schema } from '../db/index.ts';
import { entryFor } from './registry.ts';

export const PACK_VERSION = 'avara-launch 2026-11-21';
type Row = typeof schema.launchChecks.$inferInsert;
type EvidenceRow = typeof schema.findingEvidence.$inferInsert;

const clip = (v: unknown, n = 180) => (typeof v === 'string' && v.length > n ? v.slice(0, n - 1) + '…' : v);
/** Evidence as the pack returned it, bounded: at most 10 items, strings at most 180 characters, no nested raw capture. */
function bounded(evidence: unknown[]): unknown[] {
  return evidence.slice(0, 10).map((e) => (e && typeof e === 'object' && !Array.isArray(e) ? Object.fromEntries(Object.entries(e as Record<string, unknown>).slice(0, 12).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 10).map((x) => clip(x)) : clip(v)])) : clip(e)));
}
function targetOf(evidence: unknown[]): string | null {
  for (const e of evidence) {
    const o = e as { selector?: unknown; target?: unknown } | null;
    if (typeof o?.selector === 'string') return o.selector.slice(0, 300);
    if (Array.isArray(o?.target)) return o.target.join(' ').slice(0, 300);
  }
  return null;
}

// The input the pack's own reason points to wins over the entry's usual need (DIFF-001 first asks for a complete section inventory).
function needsFor(reason: string, fallback: string | undefined): string | null {
  if (/section inventory|too few mapped sections/i.test(reason)) return 'section-inventory';
  if (/reference/i.test(reason)) return 'reference';
  if (/brief|vocabulary|approved font/i.test(reason)) return 'brand-brief';
  if (/claim/i.test(reason)) return 'claim-mapping';
  if (/page type/i.test(reason)) return 'page-type';
  return fallback ?? null;
}

export function launchRows(scanId: string, out: ScanOutput): Row[] {
  const rows: Row[] = [];
  for (const v of out.viewports) {
    const l = v.launch; if (!l) continue;
    if (l.error || !l.rows.length) { rows.push({ scanId, entry: 'pack', packRuleId: 'pack', hostRuleId: 'pack', ruleVersion: '-', packVersion: PACK_VERSION, decision: 'blocked', viewport: v.name, viewportSize: null, pageState: 'initial', target: null, outcome: 'not-run', reason: l.error ? `The launch checks could not run: ${l.error}` : 'The launch checks returned no rows.', needs: null, evidence: [] }); continue; }
    for (const r of l.rows as PackRow[]) {
      const e = entryFor(r); if (!e) continue;
      const evidence = bounded(r.evidence ?? []);
      rows.push({ scanId, entry: e.entry, packRuleId: r.ruleId, hostRuleId: e.hostRuleId, ruleVersion: String(r.version), packVersion: PACK_VERSION, decision: e.decision,
        viewport: v.name, viewportSize: l.viewport, pageState: 'initial', target: targetOf(evidence), outcome: r.status, reason: r.reason,
        needs: r.status === 'not-run' || r.status === 'needs-person' ? needsFor(r.reason, e.needs) : null, evidence });
    }
  }
  return rows;
}

/** The 320px pointer-hit sample, as evidence on the main-action findings (the repair that owns it). It never adds a finding. */
export function actionHitEvidence(scanId: string, out: ScanOutput, findings: { id: string; repairKey: string; ruleId: string }[]): EvidenceRow[] {
  const m = out.viewports.find((v) => v.name === 'mobile')?.launch; const r = m?.rows.find((x) => x.detectorId === 'launch/action-hit');   // the adapter's own detector id
  if (!r || r.status === 'not-applicable') return [];
  const owners = findings.filter((f) => f.repairKey.startsWith('action:') && (f.ruleId.startsWith('mobile/') || f.ruleId.startsWith('workflow/')));
  const data = { source: 'launch/action-hit', outcome: r.status, reason: r.reason, goal: m?.goal?.text ?? null, samples: bounded(r.evidence ?? []) };
  return owners.map((f) => ({ findingId: f.id, scanId, kind: 'measurement', viewport: 'mobile', data }));
}
