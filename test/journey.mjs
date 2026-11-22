// The signed-out journey: landing page -> scan the mobile booking fixture -> open the first free fix -> repair a disposable copy -> rescan.
// The fix must be confirmed with positive evidence and the original report must not change. Score shows "Not scored" with its reason.
// Disposable page: fixture/site/avara/journey-live.html (created and removed here). Needs the app and `node fixture/server.mjs`.
// Run: node test/journey.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:3100'; const dir = new URL('../fixture/site/avara/', import.meta.url).pathname; const live = dir + 'journey-live.html';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
const ready = () => p.waitForFunction(() => document.querySelector('[data-testid=primary],[data-testid=no-issues]') || /We could not review/i.test(document.body.innerText), null, { timeout: 300000 });
try {
  fs.copyFileSync(dir + 'book-call-bad.html', live);
  await p.goto(base + '/'); check('signed out on the landing page', !/Sign out|Workspace settings/.test(await p.locator('body').innerText()));
  await p.fill('#hero-url', 'http://127.0.0.1:4200/avara/journey-live.html'); await p.locator('#hero-url').press('Enter'); await p.waitForURL('**/scans/**', { timeout: 60000 }); await ready();
  const orig = p.url(); const prim = p.getByTestId('primary'); const first = await prim.innerText();
  check('the first priority is the booking button covered on a phone', /Book a call/i.test(first) && /(cover|banner|hidden|320px)/i.test(first), first.slice(0, 140).replace(/\s+/g, ' '));
  const body = await p.locator('body').innerText();
  // A number appears only with its basis (how many categories contributed); otherwise "not scored" with the reason.
  const shown = (await p.getByTestId('overall-score').innerText().catch(() => '–')).trim();
  check('the page score is a number with its basis, or "not scored" with the reason', /^\d+$/.test(shown) ? new RegExp(`Page score: ${shown}\\s*/100`).test(body) && /Based on \d of 8 scored categories/.test(body) : /not scored/i.test(body) && /Insufficient coverage|admitted/i.test(body), shown);
  await p.getByTestId('see-fix').first().click(); await p.waitForTimeout(300); const fix = await p.locator('main').innerText();
  check('the first fix opens free, with a copyable prompt and how to check it', (await p.getByRole('button', { name: /Copy prompt/ }).count()) >= 1 && /How to check it/.test(fix));
  fs.copyFileSync(dir + 'book-call-fixed.html', live);   // the repair: the banner no longer sits over the button
  await p.getByTestId('rescan').first().click();
  await p.waitForFunction(() => document.querySelector('[data-testid=outcomes]') || /We could not review/i.test(document.body.innerText), null, { timeout: 300000 });
  const outs = await p.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ o: e.dataset.outcome, t: e.innerText })));
  const fixed = outs.filter((x) => x.o === 'fixed' && /Book a call/i.test(x.t));
  check('rescan: the covered booking button is Fixed', fixed.length >= 1, outs.map((x) => x.o).join(','));
  check('the Fixed outcome rests on positive evidence (what the rescan measured now), not on the finding going missing', fixed.some((x) => /Now\s*\n?.*(visible|can be (tapped|reached|used)|no longer|nothing covers|clear|not covered|fully)/i.test(x.t)), fixed[0]?.t.replace(/\s+/g, ' ').slice(0, 220));
  check('nothing about the booking button is reported Still there', !outs.some((x) => x.o === 'still_present' && /Book a call/i.test(x.t)));
  await p.goto(orig); await ready(); check('the original report is unchanged', (await p.getByTestId('primary').innerText()) === first);
} finally { fs.rmSync(live, { force: true }); await b.close(); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
