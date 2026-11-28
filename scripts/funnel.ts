// Counts the product funnel from data Avara already keeps, one row per day, as counts only (no addresses, no ids in the output):
//   scans that finished with findings → scans where a fix was copied (distinct findings) → rescans started → findings a rescan confirmed fixed.
//   node --experimental-strip-types scripts/funnel.ts [--days 30]
// The embedded database allows one process: stop the app first, or point PGLITE_DIR at a copy.
import { funnel } from '../lib/funnel.ts';
const i = process.argv.indexOf('--days'); const rows = await funnel(i >= 0 ? Number(process.argv[i + 1]) || 30 : 30);
console.log(['day', 'scans_with_findings', 'scans_with_fix_copied', 'findings_copied', 'rescans_started', 'findings_fixed'].join('\t'));
for (const r of rows) console.log([r.day, r.scansWithFindings, r.scansWithFixCopied, r.findingsCopied, r.rescansStarted, r.findingsFixed].join('\t'));
process.exit(0);
