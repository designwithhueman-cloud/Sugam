// Batch scan runner and labeling export.
//   node --experimental-strip-types scripts/batch.ts run <manifest.json> <outDir> [--allow-remote] [--allow-active] [--perf] [--delay <ms>]
//   node --experimental-strip-types scripts/batch.ts report <runDir> [--labels <file.csv>]
// `run` writes <outDir>/<run id>/ with findings.csv (one row per finding; fill in reviewer_verdict and reviewer_notes), checks_not_run.csv, sites.csv,
// run.json and screenshots/. `report` reads the labeled findings.csv and writes report.md. See docs/batch-runner.md.
import fs from 'node:fs';
import { runBatch, type Manifest } from '../lib/batch/run.ts';
import { buildReport } from '../lib/batch/report.ts';

const [cmd, a, b, ...rest] = process.argv.slice(2); const flag = (n: string) => process.argv.includes(n); const val = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
try {
  if (cmd === 'run' && a && b) {
    const manifest = JSON.parse(fs.readFileSync(a, 'utf8')) as Manifest;
    const r = await runBatch(manifest, b, { allowRemote: flag('--allow-remote'), allowActive: flag('--allow-active'), perf: flag('--perf'), delayMs: Number(val('--delay') ?? 0), log: (s) => console.log(s) });
    console.log(`\nWrote ${r.dir}\n  findings.csv        ${r.findings.length} rows to label (reviewer_verdict: correct | false_positive | unsure)\n  checks_not_run.csv  ${r.notRun.length} rows\n  sites.csv, run.json, screenshots/`);
  } else if (cmd === 'report' && a) {
    const { markdown, invalid } = buildReport(a, val('--labels')); console.log(markdown); if (invalid.length) process.exitCode = 2;
  } else { console.error('usage:\n  run <manifest.json> <outDir> [--allow-remote] [--allow-active] [--perf] [--delay <ms>]\n  report <runDir> [--labels <file.csv>]'); process.exitCode = 1; }
} catch (e) { console.error(String((e as Error).message ?? e)); process.exitCode = 1; }
void rest; process.exit(process.exitCode ?? 0);
