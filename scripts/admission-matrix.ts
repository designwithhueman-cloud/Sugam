// For every pure-detector rule (no AI anywhere in its evaluator), the measured result on every fixture page, AI off. Used to find, per rule,
// a page where it is a confirmed failure and a page where it passes with something inspected. Writes docs/coverage/admission-matrix.json.
//   node --experimental-strip-types scripts/admission-matrix.ts [page ...]     (needs `node fixture/server.mjs`)
import fs from 'node:fs'; import path from 'node:path';
process.env.ALLOW_PRIVATE_HOSTS ??= '127.0.0.1:4200,localhost:4200'; process.env.AVARA_LAUNCH = 'off';
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { runReview } = await import('../src/services/scan-service/index.ts');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
// Every rule with detectors: pure detector rules, and hybrid rules whose measured part runs before (and without) any AI.
const rules = ruleLoader().loadAllRules().filter((r) => r.evaluator && 'detectors' in r.evaluator && (r.evaluator.detectors ?? []).length);
const all = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? all(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const pages = process.argv.slice(2).length ? process.argv.slice(2) : all('fixture/site').map((p) => p.replace('fixture/site/', '')).filter((p) => !/^(launch|batch)\//.test(p)).sort();
const outFile = 'docs/coverage/admission-matrix.json';
const prev = { pages: {} };
const queue = [...pages]; const res: Record<string, Record<string, string>> = prev.pages;
async function worker() {
  for (let p = queue.shift(); p; p = queue.shift()) {
    const perf = /perf-/.test(p);
    try {
      const out = await scanUrl('http://127.0.0.1:4200/' + p, 'wcag22aa', () => {}, { goal: null, perfRuns: 1, perf });
      const a = analyze(out), av = analyzeAvara(out, a); const { review } = await runReview(out, a, av, { llm: null });
      const f = new Map(review!.categories.flatMap((c) => c.findings.map((x) => [x.ruleId, x] as const)));
      const ex = new Map(review!.executions!.map((x) => [x.ruleId, x] as const));
      res[p] = Object.fromEntries(rules.map((r) => { const e = ex.get(r.ruleId)!; const o = f.get(r.ruleId); return [r.ruleId, e.execution === 'ran' ? `${e.outcome}${o && /Not inspected|did not inspect/i.test(o.observation) ? '~' : ''}` : e.execution === 'not_applicable' ? 'n/a' : `skip:${e.reason}`]; }));
      console.log('done', p);
    } catch (e) { console.log('error', p, (e as Error).message.slice(0, 100)); }
  }
}
// Lighthouse pages run alone (no other scan competing for the CPU); the rest two at a time.
const perfPages = queue.filter((p) => /perf-/.test(p)); queue.splice(0, queue.length, ...queue.filter((p) => !/perf-/.test(p)));
await Promise.all([worker(), worker()]); queue.push(...perfPages); await worker();
fs.writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), pages: res }, null, 1) + '\n');
const sum = rules.map((r) => { const fails = Object.keys(res).filter((p) => res[p][r.ruleId] === 'observed_failure'); const passes = Object.keys(res).filter((p) => res[p][r.ruleId] === 'observed_pass'); return `${r.ruleId.padEnd(10)} fail ${String(fails.length).padStart(2)} pass ${String(passes.length).padStart(2)}  ${fails[0] ?? '-'} | ${passes[0] ?? '-'}`; });
console.log(sum.join('\n'));
