// The Avara Launch Scanner through the real product: the normal scan endpoint, the review API and the report page, on triggering and clean
// fixtures, as a paid (Agency Pro) member, a free account and an anonymous visitor. Then the covered-button repair, the rescan, and a rescan
// whose target disappeared. Needs the app and `node fixture/server.mjs`. Run: node test/launch-integration.mjs [baseUrl]
import fs from 'node:fs';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:3100'; const F = 'http://127.0.0.1:4200';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const acct = (f) => { const c = fs.readFileSync(f, 'utf8'); return { email: c.match(/Email: (\S+)/)[1], pw: c.match(/Password: (\S+)/)[1] }; };
const b = await chromium.launch();
const who = async (a) => { const ctx = await b.newContext(); if (a) { const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', a.email); await p.fill('input[type=password]', a.pw); await p.press('input[type=password]', 'Enter'); await p.waitForURL(/\/app/); await p.close(); } return ctx; };
const paid = await who(acct('.data/test-account.txt')), free = await who(acct('.data/test-free.txt')), anon = await who(null);
const wait = async (ctx, id) => { const t0 = Date.now(); let early = null; for (;;) { let s; try { s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); } catch { await new Promise((r) => setTimeout(r, 500)); continue; } if (s.early && early == null) early = Date.now() - t0; if (['completed', 'failed'].includes(s.status)) return { status: s.status, ms: Date.now() - t0, early, s }; await new Promise((r) => setTimeout(r, 400)); } };
const scan = async (ctx, path) => { const r = await ctx.request.post(base + '/api/scans', { headers: { origin: base }, data: { url: F + path } }); const { id } = await r.json(); const w = await wait(ctx, id); return { id, ...w }; };
const review = async (ctx, id) => (await ctx.request.get(`${base}/api/scans/${id}/review`)).json();
const line = (rv, e) => rv.launch?.lines.find((l) => l.entry === e);
const rule = (rv, id) => rv.categories.flatMap((c) => c.findings).find((f) => f.ruleId === id);
const timings = [];
const pair = async (bad, good) => { const [x, y] = await Promise.all([scan(paid, bad), scan(paid, good)]); timings.push([bad, x.ms], [good, y.ms]); return [x, y, await review(paid, x.id), await review(paid, y.id)]; };

try {
  // Covered phone booking button vs a desktop copy hidden on phones with a usable phone equivalent
  { const [x, y, rx, ry] = await pair('/avara/book-call-both.html', '/cta/desktop-duplicate.html');
    check('covered booking button: the 390px phone hit sample needs review, desktop does not apply', line(rx, 'launch/action-hit')?.viewports.mobile?.outcome === 'needs-review' && line(rx, 'launch/action-hit')?.viewports.desktop?.outcome === 'not-applicable', line(rx, 'launch/action-hit')?.viewports.mobile?.reason);
    check('…and the existing repair still leads the report: the covered button is the first fix', (await (await paid.newPage()).goto(`${base}/scans/${x.id}`).then(async (r) => (await r.text()))).includes('Book a call'));
    check('…the first usable fix arrived before the report finished (early blocker)', x.early != null && x.early < x.ms, `blocker ${x.early} ms, report ${x.ms} ms`);
    check('hidden desktop copy with a usable phone equivalent: the hit sample is observed, not a block', line(ry, 'launch/action-hit')?.viewports.mobile?.outcome === 'observed', line(ry, 'launch/action-hit')?.viewports.mobile?.reason);
    const pg = await paid.newPage(); await pg.goto(`${base}/scans/${y.id}`); const vis = await pg.locator('main').innerText();
    check('…and the visible report never says the button is blocked, covered or missing on a phone', !/covered on a phone|cannot be used at 320px|missing at 320px|is covered/i.test(vis), (vis.match(/.{0,60}(covered|320px).{0,60}/i) ?? [''])[0]); }

  // Unnamed vs named button
  { const [, , rx, ry] = await pair('/launch/unnamed-button.html', '/launch/named-button.html');
    check('unnamed button: axe button-name is an analyzer finding with the element as target, under A11Y-015', line(rx, 'launch/button-name')?.viewports.desktop?.outcome === 'analyzer-finding' && line(rx, 'launch/button-name')?.hostRuleId === 'A11Y-015' && !!line(rx, 'launch/button-name')?.viewports.desktop?.target, line(rx, 'launch/button-name')?.viewports.desktop?.target);
    check('…and A11Y-015 itself still reports it once (the pack adds no second count)', rule(rx, 'A11Y-015')?.result === 'observed_failure', rule(rx, 'A11Y-015')?.result);
    check('named button: the same check is observed and A11Y-015 passes', line(ry, 'launch/button-name')?.viewports.desktop?.outcome === 'observed' && rule(ry, 'A11Y-015')?.result === 'observed_pass', rule(ry, 'A11Y-015')?.result); }

  // Vague vs specific CTA
  { const [, , rx, ry] = await pair('/launch/vague-cta.html', '/launch/specific-cta.html');
    check('vague primary CTA (“Learn more”): CONV-001 needs a person, and the launch label check agrees', rule(rx, 'CONV-001')?.result === 'needs_human_review' && line(rx, 'launch/cta')?.viewports.desktop?.outcome === 'needs-review', `${rule(rx, 'CONV-001')?.result} / ${line(rx, 'launch/cta')?.viewports.desktop?.outcome}`);
    check('specific label (“Book a 15-minute demo”): CONV-001 passes and the label check is observed', rule(ry, 'CONV-001')?.result === 'observed_pass' && line(ry, 'launch/cta')?.viewports.desktop?.outcome === 'observed', `${rule(ry, 'CONV-001')?.result} / ${line(ry, 'launch/cta')?.viewports.desktop?.outcome}`); }

  // Repeated feature grids vs ordinary pricing cards
  { const [, , rx, ry] = await pair('/launch/feature-grids.html', '/launch/pricing-cards.html');
    check('three feature grids: DIFF-009 needs a person, never a confirmed failure', rule(rx, 'DIFF-009')?.result === 'needs_human_review', rule(rx, 'DIFF-009')?.result);
    check('one feature grid and pricing cards: DIFF-009 passes (pricing cards are not feature grids)', rule(ry, 'DIFF-009')?.result === 'observed_pass', rule(ry, 'DIFF-009')?.result);
  }

  // Blaming vs calm error message
  { const [, , rx, ry] = await pair('/launch/blame-error.html', '/launch/calm-error.html');
    check('blaming error (“You failed to …”): UX-017 needs a person and the recovery check needs review', rule(rx, 'UX-017')?.result === 'needs_human_review' && line(rx, 'launch/recovery')?.viewports.desktop?.outcome === 'needs-review', `${rule(rx, 'UX-017')?.result} / ${line(rx, 'launch/recovery')?.viewports.desktop?.outcome}`);
    check('calm error with a format: UX-017 raises no wording flag and the recovery check is observed', !/blames the visitor|only says it is wrong/i.test(rule(ry, 'UX-017')?.observation ?? '') && line(ry, 'launch/recovery')?.viewports.desktop?.outcome === 'observed', `${rule(ry, 'UX-017')?.result}: ${(rule(ry, 'UX-017')?.observation ?? '').slice(0, 90)} / ${line(ry, 'launch/recovery')?.viewports.desktop?.outcome}`);

    // Missing inputs, on any page
    const need = (e) => line(ry, e)?.needs ?? '';
    check('no references: the reference comparisons did not run and say what they need', line(ry, 'DIFF-006')?.viewports.desktop?.outcome === 'not-run' && /reference/.test(need('DIFF-006')), need('DIFF-006'));
    check('no brand brief: heading font and vocabulary did not run and say they need the brief', ['launch/font-role', 'launch/voice'].every((e) => line(ry, e)?.viewports.desktop?.outcome === 'not-run' && /brand brief/.test(need(e))));
    check('no claim mapping: the trust check did not run and says so', line(ry, 'DIFF-008')?.viewports.desktop?.outcome === 'not-run' && /claim/.test(need('DIFF-008')));
    check('brand recall is a task for a person', line(ry, 'DIFF-003')?.viewports.desktop?.outcome === 'needs-person');
    check('every launch line reports both viewports with the page state', ry.launch.lines.every((l) => l.viewports.desktop && l.viewports.mobile) && ry.launch.pageState === 'initial');
  }

  // Free and anonymous access: the actual payloads
  { const x = await scan(free, '/launch/unnamed-button.html'), a = await scan(anon, '/launch/unnamed-button.html');
    const rf = await review(free, x.id), ra = await review(anon, a.id);
    check('free account: the review payload is locked and carries no launch checks', rf.locked === true && rf.launch === null, `locked ${rf.locked}, launch ${JSON.stringify(rf.launch)}`);
    check('anonymous: the same', ra.locked === true && ra.launch === null);
    check('free payload: no recommendation text or evidence on rule findings', rf.categories.flatMap((c) => c.findings).every((f) => !f.recommendation && !(f.evidence?.length)));
    const html = await (await free.request.get(`${base}/scans/${x.id}`)).text();
    check('free report page: no launch-check panel or its evidence in the HTML', !html.includes('launch-checks') && !html.includes('launch/action-hit'));
    const p = await free.newPage(); await p.goto(`${base}/scans/${x.id}`); const t = await p.locator('main').innerText();
    check('free report: separate totals for recommended fixes and observations', /\d+ recommended fixes/.test(t) && /\d+ observations/.test(t), (t.match(/\d+ recommended fixes · \d+ observations/) ?? [''])[0]);
    check('free report: one issue opens with where it is, its fix and how to check it', (await p.getByTestId('see-fix').count()) >= 1 && await p.getByTestId('see-fix').first().click().then(async () => { await p.waitForTimeout(300); const m = await p.locator('main').innerText(); return /How to check it/.test(m) && /Where:/.test(m); }));
    const pp = await paid.newPage(); await pp.goto(`${base}/scans/${(await scan(paid, '/launch/specific-cta.html')).id}`); const tp = await pp.locator('main').innerText();
    check('paid report page: the launch-check panel is shown', await pp.getByTestId('launch-checks').isVisible());
    const none = await pp.getByTestId('no-issues').count(); check('a page without a confirmed issue says so, or leads with its real first fix', none ? /No confirmed problems in what was checked/.test(tp) : (await pp.getByTestId('primary').count()) === 1); }

  // Repair the covered button and rescan; then remove the target and rescan
  { const dir = new URL('../fixture/site/avara/', import.meta.url).pathname; const live = dir + 'launch-live.html';
    try {
      fs.copyFileSync(dir + 'book-call-bad.html', live); const o = await scan(paid, '/avara/launch-live.html');
      const page = await paid.newPage(); await page.goto(`${base}/scans/${o.id}`); const before = await page.getByTestId('primary').innerText();
      fs.copyFileSync(dir + 'book-call-fixed.html', live);
      const r1 = await paid.request.post(`${base}/api/scans/${o.id}/rescan`, { headers: { origin: base } }); const n1 = (await r1.json()).id; await wait(paid, n1);
      await page.goto(`${base}/scans/${n1}`); await page.waitForSelector('[data-testid=outcomes]', { timeout: 60000 });
      const outs1 = await page.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ o: e.dataset.outcome, t: e.innerText })));
      const fixed = outs1.filter((x) => x.o === 'fixed' && /Book a call/i.test(x.t));
      check('repaired: the covered booking button is Fixed on rescan', fixed.length >= 1, outs1.map((x) => x.o).join(','));
      check('…on positive comparable evidence (what the rescan measured now)', fixed.some((x) => /Now/.test(x.t) && /(visible|tapp|reach|nothing covers|not covered|clear)/i.test(x.t)));
      const r2 = await review(paid, n1); check('…and the rescan’s own hit sample is observed', line(r2, 'launch/action-hit')?.viewports.mobile?.outcome === 'observed', line(r2, 'launch/action-hit')?.viewports.mobile?.reason);
      await page.goto(`${base}/scans/${o.id}`); check('the original report is unchanged', (await page.getByTestId('primary').innerText()) === before);
      fs.copyFileSync(dir + 'book-call-removed.html', live);
      const r3 = await paid.request.post(`${base}/api/scans/${o.id}/rescan`, { headers: { origin: base } }); const n3 = (await r3.json()).id; await wait(paid, n3);
      await page.goto(`${base}/scans/${n3}`); await page.waitForSelector('[data-testid=outcomes]', { timeout: 60000 });
      const outs3 = await page.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ o: e.dataset.outcome, t: e.innerText })));
      const book = outs3.filter((x) => /Book a call/i.test(x.t));
      check('target removed: the booking finding is Couldn’t verify, never Fixed', book.length >= 1 && book.every((x) => x.o === 'could_not_verify'), book.map((x) => x.o).join(','));
    } finally { fs.rmSync(live, { force: true }); } }
} finally {
  console.log('\nfixture timings (scan start to completed report):'); for (const [u, ms] of timings) console.log(`  ${u.padEnd(34)} ${(ms / 1000).toFixed(1)} s`);
  await b.close();
}
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
