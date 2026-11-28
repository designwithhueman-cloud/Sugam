// Reads a labeled run folder and writes report.md: false-positive rate per check (Wilson 95%), unsure counts, checks that could not run, and
// recall on planted bugs. Labels are the reviewer_verdict column of findings.csv: correct, false_positive or unsure (blank = not reviewed yet).
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv.ts';
import { MIN_LABELS, perCheck, plantedRecall, type Planted } from './stats.ts';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
export type Report = { markdown: string; invalid: { finding_id: string; value: string }[] };

export function buildReport(runDir: string, labelsFile?: string): Report {
  const findings = parseCsv(fs.readFileSync(labelsFile ?? path.join(runDir, 'findings.csv'), 'utf8'));
  const notRun = parseCsv(fs.readFileSync(path.join(runDir, 'checks_not_run.csv'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8')) as { runId: string; sites: { id: string; owned: boolean; planted?: Planted[] }[] };
  const { checks, invalid } = perCheck(findings as never);
  const L: string[] = [`# Accuracy report ${meta.runId}`, '', `${meta.sites.length} site(s), ${findings.length} finding(s), ${findings.filter((f) => f.reviewer_verdict.trim() !== '').length} labeled.`, ''];
  if (invalid.length) L.push(`**${invalid.length} row(s) have a verdict that is not correct, false_positive or unsure and were not counted:** ${invalid.slice(0, 10).map((x) => `${x.finding_id} (“${x.value}”)`).join(', ')}`, '');

  L.push('## False alarms among reviewed findings', '', `Rate = false alarms ÷ (confirmed + false alarms). Confirmed = reviewer_verdict “correct”; false alarm = “false_positive”. “Unsure” and unreviewed findings are not in the numerator or the denominator. A rate is shown only when the denominator is at least ${MIN_LABELS}. Interval: Wilson 95%.`, '',
    '| Check | Kind | Findings | Unreviewed | Confirmed | False alarms (numerator) | Reviewed = confirmed + false alarms (denominator) | Unsure (excluded) | False alarms among reviewed findings (95% interval) |', '|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...checks.map((c) => `| ${c.check} | ${c.kind} | ${c.findings} | ${c.unlabeled} | ${c.correct} | ${c.falsePositive} | ${c.decisive} | ${c.unsure} | ${c.enough ? `${pct(c.fpRate!)} = ${c.falsePositive} / ${c.decisive} (${pct(c.lo!)} to ${pct(c.hi!)})` : `insufficient labels (${c.decisive} of ${MIN_LABELS} reviewed)`} |`), '');

  L.push('## Checks that could not run', '');
  const gated = notRun.filter((r) => r.category === 'ownership_gated');
  if (!notRun.length) L.push('None.', '');
  else {
    const g = new Map<string, number>(); for (const r of notRun) { const k = `${r.kind} | ${r.check_id} | ${r.category}`; g.set(k, (g.get(k) ?? 0) + 1); }
    L.push('| Kind | Check | Why not | Sites |', '|---|---|---|---:|', ...[...g].sort().map(([k, n]) => { const [kind, check, cat] = k.split(' | '); return `| ${kind} | ${check} | ${cat} | ${n} |`; }), '');
  }
  if (gated.length) L.push('**Ownership-gated checks are not measured on sites we do not own.** Private files, source maps and open database tables are only probed on sites marked owned in the manifest. Measure them on the deliberately broken test apps (planted bugs below), where the right answer is known.', '');

  const planted = plantedRecall(meta.sites, findings as never);
  L.push('## Planted bugs', '');
  if (!planted.results.length) L.push('No planted bugs were listed in the manifest.', '');
  else {
    L.push('| Check | Planted | Found | Recall |', '|---|---:|---:|---:|', ...planted.byCheck.map((c) => `| ${c.check} | ${c.planted} | ${c.found} | ${pct(c.recall)} |`), '');
    const missed = planted.results.filter((r) => !r.found);
    L.push(missed.length ? `**Missed (${missed.length}):**` : 'Nothing missed.', ...missed.map((m) => `- ${m.site}: ${m.planted.check}${m.planted.selector ? ` at ${m.planted.selector}` : ''}${m.planted.note ? ` (${m.planted.note})` : ''}`), '');
  }
  const markdown = L.join('\n'); fs.writeFileSync(path.join(runDir, 'report.md'), markdown); return { markdown, invalid };
}
