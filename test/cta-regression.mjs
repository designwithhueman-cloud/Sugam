// The 320px main-action regression: a reachable button below the fold, or a hidden desktop duplicate, must not be reported as blocking
// the main action; a button a fixed bar really covers still is. Pages: fixture/site/cta/. Needs `node fixture/server.mjs` and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200.
// Run: node --experimental-strip-types test/cta-regression.mjs
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const base = process.env.FIX || 'http://127.0.0.1:4200/cta/';
const run = async (p) => { const out = await scanUrl(base + p + '.html', 'wcag22aa', undefined, { goal: null, perf: false }); return analyzeAvara(out, analyze(out)).findings.filter((f) => f.category === 'mobile' || f.key === 'a11y-reflow'); };
const blocks = (fs) => fs.filter((f) => f.bucket === 'confirmed_failure' && f.goalImpact === 'blocks');
const below = await run('below-fold'), dup = await run('desktop-duplicate'), cover = await run('obstructed');
check('a button below the fold that scrolls into view is usable at 320px and blocks nothing', blocks(below).length === 0 && below.some((f) => f.key === 'mobile-ok'), below.map((f) => f.key).join());
check('a copy hidden on desktop (first in the page) and a visible one at 320px: no missing or blocked action', blocks(dup).length === 0 && !dup.some((f) => f.key === 'mobile-missing'), dup.map((f) => f.key).join());
check('a fixed bar that really covers the button is reported, as the sticky-element finding that blocks', blocks(cover).length === 1 && cover.some((f) => f.key === 'mobile-sticky'), cover.map((f) => f.key).join());
check('the obstruction finding carries the element, viewport and measurement needed to reproduce it', cover.find((f) => f.key === 'mobile-sticky')?.evidence.some((e) => e.kind === 'measurement' && e.viewport === 'mobile' && e.data.cover) === true);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
