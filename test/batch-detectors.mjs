// New in-category detectors (A11Y-013 reading order, DESIGN-002 font families): triggering page, look-alike that stays clear, missing evidence.
import { scanUrl } from '../scanner/scanner.ts';
import { derivedReports } from '../src/services/scan-service/derived.ts';
let bad = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ' — ' + d}`); if (!ok) bad++; };
const B = 'http://127.0.0.1:4200/batch/';
const run = async (f) => derivedReports(await scanUrl(B + f, 'wcag22aa', undefined, { goal: null, perf: false }));
const of = await run('order-flags.html'), oc = await run('order-clean.html'), ff = await run('fonts-flags.html'), fc = await run('fonts-clean.html');
check('reading order: Tab jumping back up the page is raised for a person, with each jump named', of['a11y/reading-order'].hits.length === 1 && of['a11y/reading-order'].hits[0].bucket === 'needs_review' && of['a11y/reading-order'].hits[0].evidence.length >= 2, JSON.stringify(of['a11y/reading-order']).slice(0, 300));
check('reading order look-alike: the same links in page order stay clear', oc['a11y/reading-order'].ran && oc['a11y/reading-order'].hits.length === 0, JSON.stringify(oc['a11y/reading-order']).slice(0, 300));
check('fonts: five typefaces on a page are raised', ff['design/font-families'].hits.length === 1 && ff['design/font-families'].hits[0].evidence.length >= 4, JSON.stringify(ff['design/font-families']).slice(0, 300));
check('fonts look-alike: a serif plus a sans stays clear', fc['design/font-families'].ran && fc['design/font-families'].hits.length === 0, JSON.stringify(fc['design/font-families']).slice(0, 300));
const bare = derivedReports({ viewports: [], analyzers: {}, finalUrl: 'http://x', engine: {} });
check('missing evidence: both say they did not run, never pass', bare['a11y/reading-order'].ran === false && bare['design/font-families'].ran === false);
process.exit(bad ? 1 : 0);
