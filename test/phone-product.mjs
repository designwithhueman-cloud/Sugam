// The 390px phone and the 320px pass through the real product (normal scan endpoint, report page, screenshot routes, rescan).
// Modes:  make-legacy <base>   scan a disposable copy of the covered-button page as the Agency member and print the scan id (run on an OLD build)
//         check <base> [legacyId]  everything else on the NEW build; with legacyId, rescan that old report too.
// Needs `node fixture/server.mjs`.
import fs from 'node:fs';
import { chromium } from 'playwright';
const [mode, base, legacyId] = process.argv.slice(2); const F = 'http://127.0.0.1:4200';
const dir = new URL('../fixture/site/avara/', import.meta.url).pathname; const live = dir + 'legacy-live.html';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const acct = (f) => { const c = fs.readFileSync(f, 'utf8'); return { email: c.match(/Email: (\S+)/)[1], pw: c.match(/Password: (\S+)/)[1] }; };
const b = await chromium.launch();
const who = async (a) => { const ctx = await b.newContext(); if (a) { const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', a.email); await p.fill('input[type=password]', a.pw); await p.press('input[type=password]', 'Enter'); await p.waitForURL(/\/app/); await p.close(); } return ctx; };
const wait = async (ctx, id) => { const t0 = Date.now(); let early = null; for (;;) { let s; try { s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); } catch { await new Promise((r) => setTimeout(r, 500)); continue; } if (s.early && early == null) early = Date.now() - t0; if (['completed', 'failed'].includes(s.status)) return { ms: Date.now() - t0, early, status: s.status }; await new Promise((r) => setTimeout(r, 300)); } };
const scan = async (ctx, path) => { const { id } = await (await ctx.request.post(base + '/api/scans', { headers: { origin: base }, data: { url: F + path } })).json(); return { id, ...(await wait(ctx, id)) }; };
const html = async (ctx, id) => (await (await ctx.request.get(`${base}/scans/${id}`)).text()).replace(/\\"/g, '"').replace(/\\u0026/g, '&');
const paid = await who(acct('.data/test-account.txt'));
try {
  if (mode === 'make-legacy') { fs.copyFileSync(dir + 'book-call-bad.html', live); const s = await scan(paid, '/avara/legacy-live.html'); console.log('LEGACY', s.id, s.status); process.exit(0); }
  const free = await who(acct('.data/test-free.txt'));
  // Screenshot selection: the shot of the width the problem was measured at
  const [both, only, clean] = await Promise.all([scan(paid, '/avara/book-call-both.html'), scan(paid, '/avara/book-call-320-only.html'), scan(paid, '/avara/book-call-fixed.html')]);
  const hb = await html(paid, both.id), ho = await html(paid, only.id), hc = await html(paid, clean.id);
  const shotOf = async (id) => { const pg = await paid.newPage(); await pg.goto(`${base}/scans/${id}`); const srcs = await pg.locator('[data-testid=primary] img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || '')); await pg.close(); return srcs.filter((x) => x.includes('/screenshot/')).join(' '); };
  const sb = await shotOf(both.id), so = await shotOf(only.id);
  check('shared issue: the first fix shows the 390px phone screenshot', /\/screenshot\/mobile$/.test(sb), sb || '(no screenshot in the first fix)');
  check('320px-only issue: the first fix shows the 320px screenshot', /\/screenshot\/narrow$/.test(so), so || '(no screenshot in the first fix)');
  const r1 = await paid.request.get(`${base}/api/scans/${only.id}/screenshot/narrow`), r2 = await paid.request.get(`${base}/api/scans/${only.id}/screenshot/mobile`);
  check('both phone screenshots are kept and served (320px and 390px)', r1.status() === 200 && r2.status() === 200 && (await r1.body()).length > 1000);
  check('a free account gets 402 for the 320px screenshot too', (await free.request.get(`${base}/api/scans/${only.id}/screenshot/narrow`)).status() === 404 || (await (async () => { const f = await scan(free, '/avara/book-call-320-only.html'); return (await free.request.get(`${base}/api/scans/${f.id}/screenshot/narrow`)).status() === 402; })()));
  check('the report says where each was measured: “Phone (390px wide)” and “Phone (320px wide)”', /Phone \(390px wide\)/.test(hb) && /Phone \(320px wide\)/.test(ho));
  check('shared issue: the repair is listed once on the report', (hb.match(/covers “Book a call” at 390px and 320px wide/g) ?? []).length >= 1 && !/covers “Book a call” at 320px wide"/.test(hb));
  check('shared issue: CSS applied and remeasured, so it is labelled “Verified at 320px and 390px”', /Verified at 320px and 390px:\\n```css/.test(hb) || /Verified at 320px and 390px:\n```css/.test(hb), (hb.match(/(Verified at [^:"]+|Suggested CSS)/) ?? [''])[0]);
  check('320px-only issue: no code; the fix asks where the overlap begins', /Check at which width the overlap begins/.test(ho) && !/Verified at|Suggested CSS:/.test(ho.split('Check at which width')[0].slice(-1500)));
  check('clean page: no confirmed problem and no phone issue', !/covers “Book a call”/.test(hc));
  console.log(`TIMING both report=${(both.ms / 1000).toFixed(1)}s early=${both.early}ms | 320-only report=${(only.ms / 1000).toFixed(1)}s early=${only.early}ms | clean report=${(clean.ms / 1000).toFixed(1)}s`);

  // Rescan of a new report: the shared finding is re-checked at both widths
  fs.copyFileSync(dir + 'book-call-both.html', live); const n0 = await scan(paid, '/avara/legacy-live.html');
  fs.copyFileSync(dir + 'book-call-fixed.html', live);
  const r = await paid.request.post(`${base}/api/scans/${n0.id}/rescan`, { headers: { origin: base } }); const n1 = (await r.json()).id; await wait(paid, n1);
  const p = await paid.newPage(); await p.goto(`${base}/scans/${n1}`); await p.waitForSelector('[data-testid=outcomes]', { timeout: 60000 });
  const outs = await p.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ o: e.dataset.outcome, t: e.innerText })));
  const sticky = outs.filter((x) => /Book a call/.test(x.t) && x.o === 'fixed');
  check('rescan of a new report: Fixed, with the check repeated at 390px and at 320px', sticky.some((x) => /At 390px wide/.test(x.t) && /At 320px wide/.test(x.t)), outs.map((x) => x.o).join(','));
  if (legacyId) {
    fs.copyFileSync(dir + 'book-call-fixed.html', live);
    const lp = await paid.newPage(); await lp.goto(`${base}/scans/${legacyId}`); const lt = await lp.locator('main').innerText();
    check('legacy report (made with the 320px phone) still opens and says 320px', /320px/.test(lt) && !/390px/.test(lt), (lt.match(/Phone \(\d+px wide\)/) ?? [''])[0]);
    const lr = await paid.request.post(`${base}/api/scans/${legacyId}/rescan`, { headers: { origin: base } }); const l1 = (await lr.json()).id; await wait(paid, l1);
    await lp.goto(`${base}/scans/${l1}`); await lp.waitForSelector('[data-testid=outcomes]', { timeout: 60000 });
    const lo = await lp.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ o: e.dataset.outcome, t: e.innerText })));
    const lf = lo.filter((x) => /Book a call/.test(x.t));
    check('legacy rescan: the old phone findings are re-checked at their original 320px and are Fixed', lf.length >= 1 && lf.every((x) => x.o === 'fixed' && /320px/.test(x.t) && !/390px/.test(x.t)), lf.map((x) => x.t.replace(/\n+/g, ' | ').slice(0, 220)).join(' || '));
    check('…and the legacy report itself is unchanged after the rescan', (await (await paid.newPage()).goto(`${base}/scans/${legacyId}`).then((x) => x.text())).includes('Book a call'));
  }
} finally { fs.rmSync(live, { force: true }); await b.close(); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
