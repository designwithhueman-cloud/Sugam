// Accuracy audit: scan one public page per site and keep compact evidence (rule, bucket, selector, HTML) for hand review.
// node test/audit-real-sites.mjs <outDir> [workerIndex workerCount]   Each scan is one page view of that site; run it sparingly.
import fs from 'node:fs';
import { scanUrl } from '../scanner/scanner.ts';
import { analyze } from '../analysis/analyze.ts';
const OUT = process.argv[2]; const part = process.argv[3] ?? '0'; const parts = process.argv[4] ?? '1';
if (!OUT) { console.error('usage: node test/audit-real-sites.mjs <outDir> [workerIndex workerCount]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const SITES = ['https://www.gov.uk/', 'https://www.usa.gov/', 'https://www.w3.org/WAI/', 'https://www.who.int/', 'https://www.ontario.ca/page/how-make-websites-accessible',
  'https://en.wikipedia.org/wiki/Web_accessibility', 'https://developer.mozilla.org/en-US/', 'https://tailwindcss.com/', 'https://getbootstrap.com/', 'https://web.dev/', 'https://www.a11yproject.com/',
  'https://stripe.com/', 'https://vercel.com/', 'https://linear.app/', 'https://www.notion.com/', 'https://www.figma.com/', 'https://slack.com/',
  'https://www.gymshark.com/', 'https://www.ikea.com/', 'https://www.bbc.com/news', 'https://www.theguardian.com/international', 'https://news.ycombinator.com/',
  'https://css-tricks.com/', 'https://www.smashingmagazine.com/', 'https://example.com/', 'http://info.cern.ch/', 'https://craigslist.org/',
  'https://lovable.dev/', 'https://bolt.new/', 'https://v0.app/', 'https://www.canva.com/', 'https://github.com/'];
const mine = SITES.filter((_, i) => i % Number(parts) === Number(part));
for (const url of mine) {
  const t = Date.now(); const key = url.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  try {
    const out = await scanUrl(url, 'wcag22aa'); const a = analyze(out);
    const issues = a.issues.filter((i) => i.bucket !== 'verified_pass').map((i) => ({ rule: i.ruleId, bucket: i.bucket, sev: i.severity, n: i.instances.length, ex: i.instances.slice(0, 4).map((x) => ({ sel: x.selector.slice(0, 140), html: x.html.slice(0, 320), detail: (x.detail || '').slice(0, 220), vp: x.viewport })) }));
    fs.writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ url, ok: true, secs: Math.round((Date.now() - t) / 1000), title: out.title, final: out.finalUrl, score: a.score, passes: a.issues.filter((i) => i.bucket === 'verified_pass').length, limitations: out.limitations, pageHeights: out.viewports.map((v) => v.pageHeight), issues }));
    console.log('OK  ', url, Math.round((Date.now() - t) / 1000) + 's score', a.score, 'conf', issues.filter((i) => i.bucket === 'confirmed_failure').length, 'rev', issues.filter((i) => i.bucket === 'needs_review').length);
  } catch (e) { fs.writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ url, ok: false, secs: Math.round((Date.now() - t) / 1000), error: String(e.message).slice(0, 200) })); console.log('FAIL', url, Math.round((Date.now() - t) / 1000) + 's', String(e.message).slice(0, 100)); }
}
process.exit(0);
