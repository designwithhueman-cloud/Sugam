// Debug helper: scan a URL and print the analysed issues. node scanner/cli-analyze.ts <url> [standard]
import { scanUrl } from './scanner.ts';
import { analyze } from '../analysis/analyze.ts';
import type { StandardId } from '../lib/standards.ts';
const [url, std = 'wcag22aa'] = process.argv.slice(2);
const r = await scanUrl(url, std as StandardId);
const a = analyze(r);
console.log('score', a.score, 'outOfScope', a.outOfScope);
for (const i of a.issues.filter((x) => x.bucket !== 'verified_pass')) console.log(`${i.bucket.padEnd(18)} ${i.severity.padEnd(9)} ${String(i.instances.length).padStart(2)}x ${i.ruleId.padEnd(30)} ${i.wcag.map((w) => w.sc).join(',').padEnd(12)} [${i.roleTag}] ${i.title} | boxes d:${i.instances.filter((x) => x.boxes.desktop).length} m:${i.instances.filter((x) => x.boxes.mobile).length}`);
console.log('passes:', a.issues.filter((x) => x.bucket === 'verified_pass').length);
