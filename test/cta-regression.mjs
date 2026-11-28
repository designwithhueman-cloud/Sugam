// The 320px main-action regression: a reachable button below the fold, or a hidden desktop duplicate, must not be reported as blocking
// the main action; a button a fixed bar really covers still is. Pages: fixture/site/cta/. Needs `node fixture/server.mjs` and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200.
// Run: node --experimental-strip-types test/cta-regression.mjs
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const base = process.env.FIX || 'http://127.0.0.1:4200/cta/';
const run = async (p) => { const out = await scanUrl(base + p + '.html', 'wcag22aa', undefined, { goal: null, perf: false }); return analyzeAvara(out, analyze(out)).findings.filter((f) => f.category === 'mobile' || f.key === 'a11y-reflow'); };
const blocks = (fs) => fs.filter((f) => f.bucket === 'confirmed_failure' && f.goalImpact === 'blocks');
const below = await run('below-fold'), dup = await run('desktop-duplicate'), cover = await run('obstructed'), smooth = await run('smooth-scroll'), consent = await run('smooth-consent');
check('a button below the fold that scrolls into view is usable at 320px and blocks nothing', blocks(below).length === 0 && below.some((f) => f.key === 'mobile-ok'), below.map((f) => f.key).join());
check('a copy hidden on desktop (first in the page) and a visible one at 320px: no missing or blocked action', blocks(dup).length === 0 && !dup.some((f) => f.key === 'mobile-missing'), dup.map((f) => f.key).join());
check('a fixed bar that really covers the button is reported, as the sticky-element finding that blocks', blocks(cover).length === 1 && cover.some((f) => f.key === 'mobile-sticky'), cover.map((f) => f.key).join());
check('the obstruction finding carries the element, viewport and measurement needed to reproduce it', cover.find((f) => f.key === 'mobile-sticky')?.evidence.some((e) => e.kind === 'measurement' && e.viewport === 'mobile' && e.data.cover) === true);
check('a page with scroll-behavior:smooth is measured where the button really is, not mid-scroll: nothing blocks', blocks(smooth).length === 0);
check('a dismissible cookie banner over a below-the-fold button is not blamed on the button (cookie banner with Accept and Reject)', blocks(consent).length === 0);
// The two Avara-built ids listed as fixture-proven in src/rules/_manifest.json are asserted here by id, so the list can be traced to a test.
const all = async (u) => { const out = await scanUrl(u, 'wcag22aa', undefined, { goal: null, perf: false }); return analyzeAvara(out, analyze(out)).findings; };
const ids = (fs) => fs.filter((f) => f.bucket === 'confirmed_failure').map((f) => f.rule?.id);
const cut = ids(await all(base.replace(/cta\/$/, '') + 'cta-cut.html')), covered = ids(await all(base + 'obstructed.html')), fine = ids(await all(base + 'below-fold.html'));
check('a button clipped at 320px: accessibility/reflow-function-loss and workflow/action-cannot-be-activated', cut.includes('accessibility/reflow-function-loss') && cut.includes('workflow/action-cannot-be-activated'), cut.join());
check('a covered button: workflow/action-cannot-be-activated; a reachable one below the fold: neither id', covered.includes('workflow/action-cannot-be-activated') && !fine.some((i) => i === 'workflow/action-cannot-be-activated' || i === 'accessibility/reflow-function-loss'), fine.join());
// A main action inside a closed mobile menu (0% visible, clipped, ignores taps) is not proof a visitor is blocked: review, never a confirmed blocker.
const menu = await (async () => { const out = await scanUrl(base + 'collapsed-menu.html', 'wcag22aa', undefined, { goal: 'Book a call', perf: false }); return analyzeAvara(out, analyze(out)).findings; })();
check('collapsed menu: no confirmed failure blames the hidden "Book a call"; it is a needs-review check instead', !menu.some((f) => f.bucket === 'confirmed_failure' && /Book a call/i.test(f.title + f.summary)) && menu.some((f) => f.key === 'mobile-unproven' && f.bucket === 'needs_review'), menu.filter((f) => /Book a call/i.test(f.title + f.summary)).map((f) => `${f.key}:${f.bucket}`).join(' '));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
