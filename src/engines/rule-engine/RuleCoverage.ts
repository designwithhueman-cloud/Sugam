// One record per rule per scan, and every coverage number built from those records. Pure: the same records always give the same counts.
// A record keeps separate what used to be merged: whether the rule is built (implementation), whether it ran on this scan and why not (execution + reason),
// what it found (outcome), how it was answered (method), how much of the topic that answer covers (scope), and whether it may ever move a score.
// "Ran" means saved execution evidence exists (detector reports that ran, a model verdict, or a stored finding row); without it the record says unknown.
import crypto from 'node:crypto';
import type { Manifest, Method, Rule, RuleOutcome, RuleResult, SkipReason } from './RuleTypes.ts';

export type Implementation = 'detector' | 'detector_and_ai' | 'ai_only' | 'person_only' | 'rollup' | 'not_built';
export type Execution = 'ran' | 'not_applicable' | 'skipped' | 'unknown';
export type Scope = 'full' | 'measurable_part' | 'summary' | 'none';
export type Bucket = 'passed' | 'passed_measurable_part' | 'failed' | 'needs_review' | 'inconclusive' | 'observed' | 'not_applicable' | 'not_run' | 'unknown';
export const BUCKETS: Bucket[] = ['passed', 'passed_measurable_part', 'failed', 'needs_review', 'inconclusive', 'observed', 'not_applicable', 'not_run', 'unknown'];
export const REASONS: SkipReason[] = ['missing_detector', 'ai_unavailable', 'missing_input', 'not_applicable', 'analyzer_error', 'needs_person', 'rollup_no_inputs', 'unknown_historical'];

export interface RuleRecord {
  ruleId: string; ruleVersion: string; definitionHash: string | null; category: string; title: string; mode: string; weight: number; session: string | null;
  implementation: Implementation;
  execution: Execution; reason: SkipReason | null; evidence: string[];   // what proves it ran: detector ids that reported, "model", or "rule_findings:<id>"
  outcome: RuleResult | 'unknown'; method: Method | 'unknown'; scope: Scope;
  scoreEligible: boolean; observationOnly: boolean;
  origin: 'engine' | 'historical';
}

const specOf = (r: Rule) => r.evaluator ?? (r.mode === 'H' ? { type: 'llm' as const } : r.mode === 'U' ? { type: 'human' as const } : r.mode === 'R' ? { type: 'rollup' as const } : { type: 'detector' as const });
const detectorsOf = (r: Rule) => { const s = specOf(r); return 'detectors' in s ? s.detectors ?? [] : []; };
export function implementationOf(r: Rule): Implementation {
  const s = specOf(r); const d = detectorsOf(r);
  if (s.type === 'rollup') return 'rollup';
  if (s.type === 'human') return 'person_only';
  if (s.type === 'llm') return d.length ? 'detector_and_ai' : 'ai_only';
  return d.length ? 'detector' : 'not_built';
}
export const definitionHash = (r: Rule) => crypto.createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 16);
const isRollup = (r: Rule) => specOf(r).type === 'rollup';
/** A rule that can never move a score: zero weight, or a rollup. Its "pass" is an observation, never a pass. */
export const observationOnly = (r: Rule) => r.weight <= 0 || isRollup(r);

function base(r: Rule): Omit<RuleRecord, 'execution' | 'reason' | 'evidence' | 'outcome' | 'method' | 'scope' | 'origin'> {
  const s = specOf(r);
  return { ruleId: r.ruleId, ruleVersion: r.version ?? '1', definitionHash: definitionHash(r), category: r.category, title: r.title, mode: r.mode ?? 'H', weight: r.weight,
    session: s.type === 'human' ? s.session ?? 'person' : null, implementation: implementationOf(r), scoreEligible: !!r.scoreEligible && !observationOnly(r), observationOnly: observationOnly(r) };
}
const DECIDED: RuleResult[] = ['observed_pass', 'observed_failure', 'needs_human_review', 'inconclusive'];

/** Records for a fresh review: one per loaded rule, from the engine's outcomes. A rule with no outcome is unknown, never a pass. */
export function recordsFromOutcomes(rules: Rule[], outcomes: Map<string, RuleOutcome>, _manifest?: Manifest): RuleRecord[] {
  return rules.map((r): RuleRecord => {
    const b = base(r); const o = outcomes.get(r.ruleId);
    if (!o) return { ...b, execution: 'unknown', reason: null, evidence: [], outcome: 'unknown', method: 'unknown', scope: 'none', origin: 'engine' };
    const evidence = o.method === 'ai_assisted' ? ['model'] : o.method === 'human' ? [] : o.detectorsRan ?? [];
    if (DECIDED.includes(o.result)) {
      if (!evidence.length) return { ...b, execution: 'unknown', reason: null, evidence, outcome: 'unknown', method: o.method, scope: 'none', origin: 'engine' };
      const scope: Scope = o.method === 'rollup' ? 'summary' : o.method === 'measured' && !(r.mode === 'M' && specOf(r).type === 'detector') ? 'measurable_part' : 'full';
      return { ...b, execution: 'ran', reason: null, evidence, outcome: o.result, method: o.method, scope, origin: 'engine' };
    }
    if (o.result === 'not_applicable') return { ...b, execution: 'not_applicable', reason: 'not_applicable', evidence, outcome: 'not_applicable', method: o.method, scope: 'none', origin: 'engine' };
    const reason: SkipReason = o.skip ?? (o.result === 'unimplemented' ? 'missing_detector' : o.method === 'human' ? 'needs_person' : 'missing_input');
    return { ...b, execution: 'skipped', reason, evidence: [], outcome: o.result, method: o.method, scope: 'none', origin: 'engine' };
  });
}

/** Records for a scan saved before records existed. Only rules with a stored finding row have execution evidence; every other rule is unknown.
 *  The aggregate counts that scan saved per category cannot be attributed to individual rules, so they are never used to fill a record. */
export type HistoricalRow = { id: string; ruleId: string; ruleVersion: string; category: string; title: string; result: string; method: string };
export function recordsFromHistory(rules: Rule[], rows: HistoricalRow[]): RuleRecord[] {
  const byId = new Map(rows.map((x) => [x.ruleId, x]));
  const out = rules.map((r): RuleRecord => {
    const b = { ...base(r), definitionHash: null };   // the definition used at scan time was not saved
    const row = byId.get(r.ruleId);
    if (!row) return { ...b, execution: 'unknown', reason: 'unknown_historical', evidence: [], outcome: 'unknown', method: 'unknown', scope: 'none', origin: 'historical' };
    const scope: Scope = row.method === 'rollup' ? 'summary' : row.method === 'measured' && !(r.mode === 'M' && specOf(r).type === 'detector') ? 'measurable_part' : 'full';
    return { ...b, ruleVersion: row.ruleVersion, execution: 'ran', reason: null, evidence: [`rule_findings:${row.id}`], outcome: row.result as RuleResult, method: row.method as Method, scope, origin: 'historical' };
  });
  // A stored row for a rule that is no longer in the library still ran; keep it rather than lose evidence.
  for (const row of rows) if (!rules.some((r) => r.ruleId === row.ruleId)) out.push({ ruleId: row.ruleId, ruleVersion: row.ruleVersion, definitionHash: null, category: row.category, title: row.title, mode: '?', weight: 0, session: null, implementation: 'not_built', execution: 'ran', reason: null, evidence: [`rule_findings:${row.id}`], outcome: row.result as RuleResult, method: row.method as Method, scope: 'full', scoreEligible: false, observationOnly: false, origin: 'historical' });
  return out;
}

/** The single bucket a record lands in. Observation-only and partial passes never land in "passed"; anything without evidence is unknown. */
export function bucketOf(x: RuleRecord): Bucket {
  if (x.execution === 'unknown') return 'unknown';
  if (x.execution === 'not_applicable') return 'not_applicable';
  if (x.execution === 'skipped') return 'not_run';
  if (!x.evidence.length) return 'unknown';
  switch (x.outcome) {
    case 'observed_pass': return x.observationOnly ? 'observed' : x.scope === 'full' ? 'passed' : 'passed_measurable_part';
    case 'observed_failure': return 'failed';
    case 'needs_human_review': return 'needs_review';
    case 'inconclusive': return 'inconclusive';
    default: return 'unknown';
  }
}

type Tally = { rules: number; ran: number; buckets: Record<Bucket, number>; reasons: Record<SkipReason, number> };
const tally = (xs: RuleRecord[]): Tally => {
  const buckets = Object.fromEntries(BUCKETS.map((k) => [k, 0])) as Record<Bucket, number>; const reasons = Object.fromEntries(REASONS.map((k) => [k, 0])) as Record<SkipReason, number>;
  for (const x of xs) { buckets[bucketOf(x)]++; if (x.reason) reasons[x.reason]++; }
  return { rules: xs.length, ran: xs.filter((x) => x.execution === 'ran' && x.evidence.length > 0).length, buckets, reasons };
};
export type CoverageSummary = {
  origin: 'engine' | 'historical'; snapshotSize: number;
  totals: Tally & { implementation: Record<Implementation, number>; scoreEligible: number; observationOnly: number };
  byCategory: (Tally & { category: string })[];
  human: { reviewTasks: number; personOnlyTopics: number; sessionKinds: string[] };
  reconciles: boolean; problems: string[];
};
/** Every coverage number on the page and in the API. `snapshot` is the rule count per category the scan was run against; totals must reconcile to it. */
export function summarize(records: RuleRecord[], snapshot: Record<string, number>): CoverageSummary {
  const cats = [...new Set([...Object.keys(snapshot), ...records.map((r) => r.category)])];
  const byCategory = cats.map((category) => ({ category, ...tally(records.filter((r) => r.category === category)) }));
  const problems: string[] = [];
  for (const c of byCategory) {
    const want = snapshot[c.category] ?? 0;
    if (c.rules !== want) problems.push(`${c.category}: ${c.rules} records but the snapshot has ${want} rules.`);
    const sum = Object.values(c.buckets).reduce((n, v) => n + v, 0); if (sum !== c.rules) problems.push(`${c.category}: buckets add to ${sum}, not ${c.rules}.`);
  }
  const ids = records.map((r) => r.ruleId); if (new Set(ids).size !== ids.length) problems.push('A rule has more than one record.');
  const impl = Object.fromEntries((['detector', 'detector_and_ai', 'ai_only', 'person_only', 'rollup', 'not_built'] as Implementation[]).map((k) => [k, records.filter((r) => r.implementation === k).length])) as Record<Implementation, number>;
  const snapshotSize = Object.values(snapshot).reduce((n, v) => n + v, 0);
  return {
    origin: records.some((r) => r.origin === 'historical') ? 'historical' : 'engine', snapshotSize,
    totals: { ...tally(records), implementation: impl, scoreEligible: records.filter((r) => r.scoreEligible).length, observationOnly: records.filter((r) => r.observationOnly).length },
    byCategory,
    human: { reviewTasks: records.filter((r) => bucketOf(r) === 'needs_review').length, personOnlyTopics: records.filter((r) => r.implementation === 'person_only').length, sessionKinds: [...new Set(records.map((r) => r.session).filter((s): s is string => !!s))].sort() },
    reconciles: problems.length === 0, problems,
  };
}
