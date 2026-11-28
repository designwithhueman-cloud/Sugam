// DIFF-002 hero-layout comparison (Avara detector pack, prototype-1). Ranks same-viewport reference heroes by how many feature groups match
// within the experimental tolerance, then by mean distance. Diagnostic only: the result is stored with the scan and read through a gated API;
// it never becomes a rule observation, a finding or a score input. Parameters come from DIFF-002's rule data (src/rules/diff.json).
import fs from 'node:fs';
import path from 'node:path';
import { ruleLoader } from '../../engines/rule-engine/RuleLoader.ts';
import type { ScanOutput } from '../../../scanner/scanner.ts';

export type HeroCapture = { viewport?: number[]; features?: Record<string, number>; elements?: Record<string, string>; actionSource?: string | null; notes?: string[]; skip?: string } | null | undefined;
export type HeroReference = { id: string; origin: string; rights: string; viewport: number[]; features: Record<string, number>; screenshot?: string };
export type ReferenceSet = { version: string; validated: boolean; records: HeroReference[]; source: string };
type Params = { version: string; positionTolerance: number; minimumGroups: number; groups: Record<string, string[]> };
export type HeroDiagnostic = {
  ruleId: 'DIFF-002'; ruleVersion: string; status: 'diagnostic' | 'not-run'; reason?: string; weight: 0; publish: false;
  referenceSet: { version: string; validated: boolean; source: string; records: number };
  capture: { viewport: number[] | null; elements: Record<string, string>; actionSource: string | null; notes: string[] } | null;
  candidates?: { referenceId: string; origin: string; matchedGroups: number; distance: number; evidence: { group: string; delta: number; matches: boolean; observations: { key: string; page: number; reference: number }[] }[] }[];
};

const PRODUCTION = path.join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'detectors', 'references', 'diff-002-hero.json');

export function heroParams(): Params {
  const r = ruleLoader().loadAllRules().find((x) => x.ruleId === 'DIFF-002');
  const p = (r?.parameters as { heroLayout?: Params } | undefined)?.heroLayout;
  if (!p) throw new Error('DIFF-002 has no heroLayout parameters');
  return p;
}

/** The production set unless AVARA_DIFF002_REFERENCES names another file (tests point it at the demo fixtures; never set it in production). */
export function loadReferences(file = process.env.AVARA_DIFF002_REFERENCES || PRODUCTION): ReferenceSet {
  const j = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8')) as { version?: string; validated?: boolean; records?: HeroReference[] } | HeroReference[];
  const set = Array.isArray(j) ? { version: 'unversioned', validated: false, records: j } : { version: j.version ?? 'unversioned', validated: j.validated === true, records: j.records ?? [] };
  return { ...set, source: file === PRODUCTION ? 'production' : 'override: ' + path.basename(path.dirname(file)) + '/' + path.basename(file) };
}

const validViewport = (v: unknown): v is number[] => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x > 0);

export function compareHero(sample: HeroCapture, set: ReferenceSet, p: Params = heroParams()): HeroDiagnostic {
  const capture = sample && !sample.skip ? { viewport: validViewport(sample.viewport) ? sample.viewport : null, elements: sample.elements ?? {}, actionSource: sample.actionSource ?? null, notes: sample.notes ?? [] } : null;
  const base = { ruleId: 'DIFF-002' as const, ruleVersion: p.version, weight: 0 as const, publish: false as const, referenceSet: { version: set.version, validated: set.validated, source: set.source, records: set.records.length }, capture };
  const skipped = (reason: string): HeroDiagnostic => ({ ...base, status: 'not-run', reason });
  if (!sample || !validViewport(sample.viewport) || !sample.features) return skipped(sample?.skip || 'Capture missing');
  const candidates: NonNullable<HeroDiagnostic['candidates']> = [];
  for (const ref of set.records ?? []) {
    if (!ref?.id || !ref.origin || !ref.rights || !ref.features || !validViewport(ref.viewport)) continue;   // no provenance or rights: never compared
    if (ref.viewport.some((x, i) => x !== sample.viewport![i])) continue;
    const evidence = [];
    for (const [group, keys] of Object.entries(p.groups)) {
      if (!keys.every((k) => Number.isFinite(sample.features![k]) && Number.isFinite(ref.features[k]))) continue;
      const observations = keys.map((key) => ({ key, page: sample.features![key], reference: ref.features[key] }));
      const delta = Math.max(...observations.map((o) => Math.abs(o.page - o.reference)));
      evidence.push({ group, delta, matches: delta <= p.positionTolerance, observations });
    }
    if (evidence.length >= p.minimumGroups) candidates.push({ referenceId: ref.id, origin: ref.origin, evidence, matchedGroups: evidence.filter((e) => e.matches).length, distance: evidence.reduce((s, e) => s + e.delta, 0) / evidence.length });
  }
  candidates.sort((a, b) => b.matchedGroups - a.matchedGroups || a.distance - b.distance || a.referenceId.localeCompare(b.referenceId));
  if (!candidates.length) return skipped('No comparable same-viewport reference with sufficient measurements');
  return { ...base, status: 'diagnostic', candidates: candidates.slice(0, 5) };
}

/** What the scan worker stores. Never throws. */
export function heroDiagnostic(out: ScanOutput): HeroDiagnostic | { ruleId: 'DIFF-002'; status: 'not-run'; reason: string; weight: 0; publish: false } {
  try {
    const pc = out.viewports.find((v) => v.name === 'desktop')?.pageContext as { heroLayout?: HeroCapture } | null | undefined;
    return compareHero(pc?.heroLayout, loadReferences());
  } catch (e) { return { ruleId: 'DIFF-002', status: 'not-run', reason: `The comparison did not run: ${(e as Error).message.split('\n')[0].slice(0, 160)}`, weight: 0, publish: false }; }
}
