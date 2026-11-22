// Coverage reconciliation: one saved page input, reviewed twice by the real rule engine: AI off, and AI stubbed on (a local stub that answers
// "pass" for every judgement rule it is asked about; no model is called, no network). Every number below is traced to rule ids.
//   node --experimental-strip-types scripts/coverage-reconcile.ts [url]     (needs `node fixture/server.mjs` for the default fixture url)
// Writes docs/coverage/reconciliation.json and docs/coverage/reconciliation.md.
import fs from 'node:fs'; import crypto from 'node:crypto';
process.env.ALLOW_PRIVATE_HOSTS ??= '127.0.0.1:4200,localhost:4200'; process.env.AVARA_PERF ??= 'off'; process.env.AVARA_LAUNCH ??= 'on';
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { runReview, detectorReports } = await import('../src/services/scan-service/index.ts');
const { recordsFromOutcomes } = await import('../src/engines/rule-engine/RuleCoverage.ts');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { reasonLabel } = await import('../lib/coverage-copy.ts');
import type { LlmClient } from '../src/engines/rule-engine/RuleTypes.ts';

const url = process.argv[2] ?? 'http://127.0.0.1:4200/detectors/good.html';
const t0 = Date.now(); const scanned = await scanUrl(url, 'wcag22aa', () => {}, { goal: null, perfRuns: 1 }); const scanMs = Date.now() - t0;
// The saved input: the scan output as JSON (screenshots dropped). Both reviews read this same object back.
const saved = JSON.stringify(scanned, (k, v) => (v && v.type === 'Buffer' ? undefined : v));
const input = JSON.parse(saved); const inputHash = crypto.createHash('sha256').update(saved).digest('hex').slice(0, 16);
const a = analyze(scanned), av = analyzeAvara(scanned, a);
const stub: LlmClient = { model: 'stub (simulated AI: no model called)', async evaluate(i) { return i.rules.map((r) => ({ ruleId: r.ruleId, result: 'pass' as const, observation: 'Simulated answer from a local stub; no model was called.', evidence: [], confidence: 0.5 })); } };
const rules = ruleLoader().loadAllRules();
const run = async (llm: LlmClient | null) => { const t = Date.now(); const { review } = await runReview(input, a, av, { llm }); return { ms: Date.now() - t, records: review!.executions!, ai: review!.ai }; };
const reps = detectorReports(input, a, av, new Set(rules.flatMap((r) => (r.evaluator && 'detectors' in r.evaluator ? r.evaluator.detectors ?? [] : []))));
/** The specific reason a rule was skipped: its detectors' own notes (which input, which analyzer), the AI status, or the session it needs. */
const specific = (r: { ruleId: string; reason: string | null; session: string | null }, ai: { reason?: string }) => {
  const rule = rules.find((x) => x.ruleId === r.ruleId)!; const dets = rule.evaluator && 'detectors' in rule.evaluator ? rule.evaluator.detectors ?? [] : [];
  if (r.reason === 'needs_person') return `${r.session ?? 'person'} session. ${rule.description.slice(0, 120)}`;
  if (r.reason === 'ai_unavailable' || r.reason === 'ai_pending' || r.reason === 'ai_no_answer') return `${ai.reason ?? 'no AI model answered'}${dets.length ? ` (its detectors ${dets.join(', ')} ran first)` : ' (judgement only; no detector)'}`;
  const notes = [...new Set(dets.map((id) => reps[id]?.note ?? (reps[id] ? null : `${id}: no report`)).filter(Boolean))];
  return notes.join(' ') || reasonLabel(r.reason);
};
const off = await run(null), on = await run(stub);
const byId = (rs: typeof off.records) => new Map(rs.map((r) => [r.ruleId, r]));
const O = byId(off.records), N = byId(on.records);
const DET = (r: { evidence: string[] }) => r.evidence.filter((e) => e !== 'model' && !e.startsWith('rule_findings:'));
const kind = (r: typeof off.records[number]) => r.execution !== 'ran' ? r.execution : r.method === 'rollup' ? 'summary' : r.method === 'ai_assisted' ? (DET(r).length ? 'detector+ai' : 'ai') : 'detector';
const tally = (rs: typeof off.records) => {
  const ran = rs.filter((r) => r.execution === 'ran');
  return {
    catalogTopics: rs.length, byImplementation: Object.fromEntries([...new Set(rs.map((r) => r.implementation))].sort().map((k) => [k, rs.filter((r) => r.implementation === k).length])),
    executedChecks: ran.filter((r) => r.method !== 'rollup').length,
    detectorRan: ran.filter((r) => r.method !== 'rollup' && DET(r).length).length,            // detectors produced a result (with or without AI)
    decidedByMeasurement: ran.filter((r) => r.method === 'measured').length,                   // the answer came from the measurement
    decidedByAi: ran.filter((r) => r.method === 'ai_assisted').length,
    summaries: ran.filter((r) => r.method === 'rollup').length,
    notApplicable: rs.filter((r) => r.execution === 'not_applicable').length,
    skipped: rs.filter((r) => r.execution === 'skipped').length,
    skippedByReason: Object.fromEntries([...new Set(rs.filter((r) => r.execution === 'skipped').map((r) => r.reason ?? 'none'))].sort().map((k) => [k, rs.filter((r) => r.execution === 'skipped' && (r.reason ?? 'none') === k).length])),
  };
};
const tOff = tally(off.records), tOn = tally(on.records);
const switched = rules.map((r) => r.ruleId).filter((id) => O.get(id)?.method === 'measured' && N.get(id)?.method === 'ai_assisted');
const lostDetector = rules.map((r) => r.ruleId).filter((id) => DET(O.get(id)!).length && !DET(N.get(id)!).length);
const launch = (input.viewports as { name: string; launch?: { rows?: { ruleId: string; status: string; reason: string }[] } | null }[]).flatMap((v) => (v.launch?.rows ?? []).map((x) => ({ viewport: v.name, id: x.ruleId, status: x.status, reason: x.reason })));
// The specific reason: the engine's own sentence for this rule (which input, which analyzer, which kind of session), after the reason class.
const skippedRows = (rs: typeof off.records, ai: { reason?: string }) => rs.filter((r) => r.execution === 'skipped').map((r) => ({ ruleId: r.ruleId, category: r.category, reason: r.reason, why: `${reasonLabel(r.reason)}: ${specific(r, ai).replace(/\s+/g, ' ').slice(0, 220)}` }));
const out = {
  generated: new Date().toISOString(), url, input: { sha256_16: inputHash, bytes: saved.length, note: 'scan output as JSON, screenshots dropped; both reviews read this same object' },
  timings: { scanMs, scanLabel: 'fixture page on localhost (not a live site)', reviewOffMs: off.ms, reviewStubMs: on.ms, stubLabel: 'simulated AI: a local stub answered; no model call, no network latency' },
  aiOff: tOff, aiStub: tOn,
  trace: { measuredToAi: switched, measuredToAiCount: switched.length, detectorEvidenceLost: lostDetector, note: 'Hybrid rules whose measurement passed are re-judged by the model when one is available, so the deciding method changes from measured to AI. Their detectors still ran and are kept as evidence.' },
  launchChecks: { distinctIds: [...new Set(launch.map((x) => x.id))].length, rows: launch.length, note: 'Avara Launch Scanner checks: a separate pack, never counted as rules and never scored.' },
  skipped: { aiOff: skippedRows(off.records, off.ai), aiStub: skippedRows(on.records, on.ai) },
  rules: rules.map((r) => { const x = O.get(r.ruleId)!, y = N.get(r.ruleId)!; return { ruleId: r.ruleId, category: r.category, implementation: x.implementation, off: { kind: kind(x), outcome: x.outcome, reason: x.reason, detectors: DET(x) }, stub: { kind: kind(y), outcome: y.outcome, reason: y.reason, detectors: DET(y) } }; }),
};
fs.writeFileSync('docs/coverage/reconciliation.json', JSON.stringify(out, null, 1) + '\n');
const row = (k: string, a1: unknown, b1: unknown) => `| ${k} | ${a1} | ${b1} |`;
const md = [
  '# Coverage reconciliation', '', `Same saved input (${url}, sha256 ${inputHash}), reviewed by the real rule engine twice. Generated by scripts/coverage-reconcile.ts; do not edit.`, '',
  '| Measure | AI off | AI stubbed on |', '|---|---:|---:|',
  row('Catalog topics (rules loaded)', tOff.catalogTopics, tOn.catalogTopics),
  row('Executed checks (ran, excluding summaries)', tOff.executedChecks, tOn.executedChecks),
  row('…where a detector ran', tOff.detectorRan, tOn.detectorRan),
  row('…decided by the measurement', tOff.decidedByMeasurement, tOn.decidedByMeasurement),
  row('…decided by AI (stub)', tOff.decidedByAi, tOn.decidedByAi),
  row('Summaries (rollups, zero weight)', tOff.summaries, tOn.summaries),
  row('Not applicable', tOff.notApplicable, tOn.notApplicable),
  row('Skipped', tOff.skipped, tOn.skipped),
  ...[...new Set([...Object.keys(tOff.skippedByReason), ...Object.keys(tOn.skippedByReason)])].map((k) => row(`…${reasonLabel(k)}`, tOff.skippedByReason[k] ?? 0, tOn.skippedByReason[k] ?? 0)),
  '', `**Measured → AI (${switched.length}):** ${switched.join(', ') || 'none'}. Their detectors still ran; detector evidence lost: ${lostDetector.length ? lostDetector.join(', ') : 'none'}.`, '',
  `**Launch checks:** ${out.launchChecks.distinctIds} distinct ids (${launch.length} rows across viewports), a separate pack, never counted as rules or scored.`, '',
  '| Launch check | Desktop | Phone |', '|---|---|---|', ...[...new Set(launch.map((x) => x.id))].map((id) => `| ${id} | ${['desktop', 'mobile'].map((v) => { const x = launch.find((y) => y.id === id && y.viewport === v); return x ? `${x.status}${x.status !== 'pass' && x.status !== 'fail' ? `: ${x.reason.replace(/\|/g, '/').slice(0, 90)}` : ''}` : '–'; }).join(' | ')} |`), '',
  `**Timings:** scan ${(scanMs / 1000).toFixed(1)} s (${out.timings.scanLabel}); review ${off.ms} ms AI off, ${on.ms} ms with the stub (${out.timings.stubLabel}).`, '',
  '## Skipped, with the reason (AI stubbed on)', '', '| Rule | Category | Reason |', '|---|---|---|', ...out.skipped.aiStub.map((x) => `| ${x.ruleId} | ${x.category} | ${x.why.replace(/\|/g, '/')} |`), '',
  '## Skipped, with the reason (AI off)', '', '| Rule | Category | Reason |', '|---|---|---|', ...out.skipped.aiOff.map((x) => `| ${x.ruleId} | ${x.category} | ${x.why.replace(/\|/g, '/')} |`), '',
].join('\n');
fs.writeFileSync('docs/coverage/reconciliation.md', md);
console.log(md.split('\n').slice(0, 26).join('\n'));
