// Avara end to end, through the real UI, on a controlled page with one known defect (fixture/site/avara/waitlist-bad.html: the sign-up
// button is clipped at 320px). Modes (run each against a server started with the matching env, see the bottom of this file):
//   main    : scan -> exact generated fix -> apply a change -> rescan (fixed), then persistent / unmatched variants, original report unchanged
//   failed <analyzer> : the server runs with AVARA_FAIL_ANALYZER=<analyzer>; the report must still be usable
// Needs the app (port 3100, ALLOW_PRIVATE_HOSTS=127.0.0.1:4200) and `node fixture/server.mjs`.
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.env.BASE || 'http://localhost:3100'; const mode = process.argv[2] || 'main'; const analyzer = process.argv[3];
const dir = new URL('../fixture/site/avara/', import.meta.url).pathname; const out = new URL('../audit-output/', import.meta.url).pathname;
const live = (variant) => fs.copyFileSync(dir + variant + '.html', dir + 'live.html');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage();
const URL_ = 'http://127.0.0.1:4200/avara/live.html';

async function scan(goal) {
  await p.goto(base + '/website-accessibility-checker'); await p.fill('#hero-url', URL_);
  if (goal) { await p.getByText('Scan settings').first().click(); await p.fill('#hero-goal', goal); }
  await p.getByRole('button', { name: /Scan my page free/ }).first().click();
  await p.waitForFunction(() => document.querySelector('[data-testid=primary],[data-testid=no-issues]') || /We could not review/i.test(document.body.innerText), null, { timeout: 240000 });
  return p.url();
}
async function rescanFrom(url) {
  await p.goto(url); await p.getByTestId('rescan').first().click();
  await p.waitForFunction(() => document.querySelector('[data-testid=outcomes]') || /We could not review/i.test(document.body.innerText), null, { timeout: 300000 });
  const outcomes = await p.getByTestId('outcome').evaluateAll((els) => els.map((e) => ({ outcome: e.dataset.outcome, text: e.innerText })));
  return { url: p.url(), outcomes };
}
const prim = () => p.getByTestId('primary');
const openTech = async () => { const d = prim().getByTestId('technical'); if ((await d.getAttribute('open')) === null) await d.locator('summary').click(); };
const checkedText = () => p.getByTestId('checked').evaluate((e) => e.textContent);

try {
  live('waitlist-bad');
  if (mode === 'main') {
    const orig = await scan('Join the waitlist');
    const first = await p.getByTestId('sentence').innerText(); const head = await p.getByTestId('headline').innerText();
    check('the first priority is one sentence that names the control, says how much is visible at 320px and what the visitor cannot do; the headline names the control', /Join the waitlist/.test(first) && /320px/.test(first) && /cannot tap it/.test(first) && first.split(/\.\s/).length === 1 && /On phones, .Join the waitlist. is cut off\./.test(head), `${head} | ${first}`);
    check('the clipped signup button is ONE action across mobile, accessibility and UX, shown first and marked as blocking', (await p.getByTestId('blocker').count()) === 1 && /One change fixes this and 2 related findings/.test(await prim().innerText()));
    await openTech(); const tr = await prim().getByTestId('trace').innerText();
    check('its technical details name all three categories', ['Accessibility', 'Mobile', 'UX and workflow'].every((c) => tr.includes(c)), tr.slice(0, 200));
    const ft = await prim().getByTestId('finding').allInnerTexts();
    check('each finding names a versioned rule, its source section and link, who is affected, what they were trying to do and the consequence as a hypothesis', ft.length >= 3 && ft.every((t) => /v1\.0\.0/.test(t) && /Who is affected/.test(t) && /Trying to/.test(t) && /Likely consequence \(hypothesis\)|Consequence \(observed\)/.test(t)) && (await prim().getByTestId('finding').first().locator('a[href^="https://"]').count()) === 1);
    check('source type is shown separately from per-finding confidence', /Standard|Usability heuristic/.test(ft[0]) && /confidence/.test(ft[0]) && (await prim().getByTestId('source-type').count()) >= 3);
    check('the workflow shows the observed steps, and "What was checked" says where coverage ends', /Steps Avara took/.test(ft.join('\n')) && /Stopped before submission/.test(await checkedText()));
    // The exact generated fix, opened on demand (free plan: the recommended first fix is the available fix)
    check('the fix is closed until asked for, then offered for AI builders, Framer, Webflow and code', (await prim().getByTestId('fix-primary').isHidden()) && (await (async () => { await p.getByTestId('see-fix').click(); return prim().getByTestId('fix-primary').isVisible(); })()));
    const fixBox = prim().getByTestId('fix-primary'); const tools = await fixBox.locator('option').allInnerTexts();
    check('the builder picker lists every tool', ['Lovable', 'Bolt', 'v0', 'Cursor', 'Framer', 'Webflow', 'Plain code'].every((t) => tools.includes(t)), tools.join(','));
    await fixBox.locator('select').selectOption('lovable');
    const prompt = await fixBox.getByTestId('fix-text').innerText();
    await fixBox.getByRole('button', { name: /Copy prompt/ }).click(); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    check('Copy prompt copies the exact prompt, which is concise and names the element, the smallest change and how to verify', clip.trim() === prompt.trim() && prompt.length < 1200 && /Element:/.test(prompt) && /Change:/.test(prompt) && /Verify:/.test(prompt), `${prompt.length} chars`);
    check('"How to check it" is shown beside the fix', /How to check it/.test(await fixBox.innerText()));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(out + 'avara-generated-fix.txt', prompt + '\n');
    check('the fix does not touch brand tokens or ask for a redesign', /keep|preserve|do not change|unchanged/i.test(prompt));
    check('the other fixes keep their builder panel back on the free plan', (await p.getByTestId('other-row').evaluateAll((rows) => rows.every((r) => !r.querySelector('select')))));
    const snapshot = await prim().innerText();

    // Apply the change (fixture: a corrected page) and rescan: Fixed only with a comparable check
    live('waitlist-fixed');
    const ok = await rescanFrom(orig);
    const by = (t) => ok.outcomes.filter((o) => new RegExp(t, 'i').test(o.text));
    check('successful repair: the shared findings (mobile, accessibility, UX) are Fixed with before and after', ok.outcomes.filter((o) => o.outcome === 'fixed').length >= 3 && ok.outcomes.every((o) => o.outcome !== 'fixed' || /Before/.test(o.text) && /Now/.test(o.text)), ok.outcomes.map((o) => o.outcome).join(','));
    check('after a rescan the page leads with what changed', /fixed/i.test(await p.getByTestId('outcomes').locator('h2').innerText()) && (await p.locator('main h2').first().innerText()) === (await p.getByTestId('outcomes').locator('h2').innerText()));
    check('no unrelated finding is marked fixed without a check', ok.outcomes.every((o) => o.outcome !== 'fixed' || o.text.length > 0) && !by('usable|cut off|covered').some((o) => o.outcome === 'still_present'));
    await p.screenshot({ path: out + 'avara-rescan-fixed.png' });
    const fixedPage = await p.getByTestId('outcomes').innerText();
    fs.writeFileSync(out + 'avara-before-after.txt', `BEFORE (original scan ${orig})\n${head}\n${first}\n\nAFTER (rescan ${ok.url})\n${fixedPage}\n`);

    // Persistent issue
    live('waitlist-still-bad');
    const still = await rescanFrom(orig);
    check('persistent issue: the shared findings are Still there, none Fixed', still.outcomes.some((o) => o.outcome === 'still_present') && !still.outcomes.some((o) => o.outcome === 'fixed' && /usable|cannot|cut off|activated/i.test(o.text)), still.outcomes.map((o) => o.outcome).join(','));
    // Unmatched element
    live('waitlist-renamed');
    const gone = await rescanFrom(orig);
    check('unmatched element: findings tied to the renamed action are Couldn’t verify, never Fixed', gone.outcomes.some((o) => o.outcome === 'could_not_verify') && !gone.outcomes.some((o) => o.outcome === 'fixed' && /usable|cannot|activated/i.test(o.text)), gone.outcomes.map((o) => o.outcome).join(','));
    // Original preserved
    await p.goto(orig); const again = await prim().innerText();
    check('the original report is unchanged by rescans and links to the latest one', /Join the waitlist/.test(again) && (await p.getByTestId('outcomes').count()) === 0 && (await p.getByText('See the latest rescan of this page').count()) === 1 && snapshot.split('\n')[0] === again.split('\n')[0]);
  } else if (mode === 'bookcall') {
    // The "Book a call" scenario: a fixed banner covers the working button on phones only. One cause, one repair, one owner (MOB-013).
    live('book-call-bad');
    const orig = await scan('Book a call');
    const head = await p.getByTestId('headline').innerText(); const sentence = await p.getByTestId('sentence').innerText(); const where = await p.getByTestId('location').innerText();
    check('the headline names the visible control and what the visitor sees: the banner covers “Book a call” on phones', /On phones, the (bottom|top) banner covers “Book a call”/.test(head), head);
    check('the location gives the device, the control name and where it is', /Phone \(320px wide\)/.test(where) && /“Book a call” button/.test(where) && /first screen/.test(where), where);
    check('one sentence says what happened to the visitor', /taps “Book a call” and hits the banner instead/.test(sentence) && /cannot book a call/.test(sentence), sentence);
    check('it is a confirmed task blocker, shown first, with one repair for three findings', (await p.getByTestId('blocker').count()) === 1 && /One change fixes this and 2 related findings/.test(await prim().innerText()) && (await p.locator('[data-testid=other-row] >> text=covers “Book a call”').count()) === 0);
    await openTech();
    check('the primary rule is MOB-013 (sticky UI interference) and says why it owns the repair', /MOB-013/.test(await p.getByTestId('owner').first().innerText()) && /Most specific rule/.test(await p.getByTestId('owner').first().innerText()));
    const rel = await p.getByTestId('related').first().innerText();
    check('MOB-010, UX-002 and CONV-002 are linked as evidence, not counted again', ['MOB-010', 'UX-002', 'CONV-002'].every((x) => rel.includes(x)) && /not counted again/.test(rel), rel);
    const trace = await prim().getByTestId('trace').innerText();
    check('categories span Mobile, Accessibility and UX and workflow; the lens is H8 (and H3), as observations only', ['Mobile', 'Accessibility', 'UX and workflow'].every((c) => trace.includes(c)) && /H8/.test(await p.getByTestId('lenses').first().innerText()) && /never a penalty/.test(await p.getByTestId('lenses').first().innerText()));
    const ded = await p.getByTestId('deductions').first().innerText();
    check('exactly one deduction group, and it is not applied while no rule is score-eligible', /1 repair group/.test(ded) && /nothing is deducted today/.test(ded), ded);
    const ft = await prim().getByTestId('finding').allInnerTexts();
    check('the observed evidence names the covering element and its position on every finding in the group', ft.length === 3 && ft.every((t) => /promo|fixed/.test(t)) && ft.some((t) => /div\.promo/.test(t)) && ft.some((t) => /position: fixed/.test(t)), ft.map((t) => t.replace(/\n+/g, ' ').slice(0, 400)).join(' ## '));
    check('every finding says its source passage is still awaiting verification', (await prim().getByTestId('unverified').count()) === ft.length);
    check('no unpublished score appears anywhere on the page', !/Sugam score|\b\d{1,3}\s*out of 100\b/i.test(await p.locator('main').innerText()));
    const revs = p.getByTestId('review-category');
    check('"What was checked" lists all nine categories with counts, says so when no AI is configured, and marks Differentiation observations-only', (await revs.count()) === 9 && /No AI model/.test(await p.getByTestId('ai-note').evaluate((e) => e.textContent)) && /observations only/.test(await revs.filter({ hasText: 'Differentiation' }).evaluate((e) => e.textContent)));
    const mobText = await revs.filter({ hasText: 'Mobile Responsiveness' }).evaluate((e) => e.textContent);
    check('Mobile Responsiveness lists MOB-013 as a measured failure, and the overall number stays unpublished', /MOB-013/.test(mobText) && /measured/.test(mobText) && /No overall launch-readiness number/.test(await p.getByTestId('score-note').evaluate((e) => e.textContent)));
    await p.getByTestId('see-fix').click(); const fixBox = prim().getByTestId('fix-primary'); await fixBox.locator('select').selectOption('cursor');
    const fix = await fixBox.getByTestId('fix-text').innerText(); fs.writeFileSync(out + 'avara-bookcall-fix.txt', fix + '\n');
    check('the recommended fix is short, names the covering element, and says how to check it', fix.length < 1200 && /promo/.test(fix) && /Verify:/.test(fix) && /How to check it/.test(await fixBox.innerText()), `${fix.length} chars`);
    check('the coverage section keeps the distinctions: ran, needs a person, sources unverified', (await p.getByTestId('lib-ran').count()) === 1 && (await p.getByTestId('lib-human').count()) === 1 && (await p.getByTestId('lib-sources').count()) === 1);
    live('book-call-fixed');
    const ok = await rescanFrom(orig);
    check('rescan: replaying the main action, every finding in the group is Fixed', ok.outcomes.length >= 3 && ok.outcomes.filter((o) => /covers|activated|Keyboard focus|banner/i.test(o.text)).every((o) => o.outcome === 'fixed'), ok.outcomes.map((o) => o.outcome).join(','));
    fs.writeFileSync(out + 'avara-bookcall-trace.txt', `ORIGINAL ${orig}\n${head}\n${where}\n${sentence}\n\nTRACE: ${trace.replace(/\n+/g, ' ')}\nDEDUCTIONS: ${ded}\n\nRESCAN ${ok.url}\n${ok.outcomes.map((o) => o.outcome + ': ' + o.text.replace(/\n+/g, ' ')).join('\n')}\n`);

    // Two independent defects on the same button: it is covered AND its spoken name does not contain its visible label.
    live('book-call-two-faults');
    const two = await scan('Book a call');
    const owners = await p.getByTestId('owner').allTextContents(); const deds = await p.getByTestId('deductions').allTextContents(); const rows = await p.getByTestId('other-row').allTextContents();
    check('two independent faults on one button stay two actions with two owners and two deductions', owners.length === 2 && /MOB-013/.test(owners[0]) && /A11Y-003/.test(owners[1]) && deds.length === 2 && deds.every((d) => /1 repair group/.test(d)), owners.join(' || '));
    check('the covering banner repair does not absorb the name mismatch: the name problem is its own row', !/Spoken name/.test(await prim().innerText()) && rows.some((r) => /Spoken name does not match/.test(r)));
    live('book-call-one-fixed');
    const part = await rescanFrom(two);
    const cover = part.outcomes.filter((o) => /covers|activated|Keyboard focus|banner/i.test(o.text)); const name = part.outcomes.filter((o) => /Spoken name/.test(o.text));
    check('rescan after fixing only the banner: the banner findings are Fixed and the name mismatch is still there', cover.length >= 2 && cover.every((o) => o.outcome === 'fixed') && name.length === 1 && name[0].outcome === 'still_present', part.outcomes.map((o) => o.outcome).join(','));
  } else {
    const url = await scan('Join the waitlist');
    const failedBox = await p.getByTestId('analyzer-failed').allInnerTexts();
    const name = { perf: 'performance', action: 'mobile', workflow: 'workflow', review: 'review' }[analyzer] ?? analyzer;
    check(`failed ${analyzer} analyzer: the scan still completes with a usable report`, (await p.getByTestId('primary').count()) + (await p.getByTestId('no-issues').count()) === 1 && /page review/i.test(await p.innerText('body')));
    check(`the failure is stated plainly, near the top, and says the rest is unaffected`, failedBox.some((x) => new RegExp(name, 'i').test(x) && /rest of this report is unaffected/.test(x)), failedBox.join(' | '));
    check('the other categories still produce findings', analyzer === 'perf' ? (await p.getByTestId('headline').innerText()).length > 10 && /On phones/.test(await p.getByTestId('headline').innerText()) : true);
    check('the page still lists what else was found', (await p.getByTestId('checked').count()) === 1, url);
  }
} finally {
  fs.rmSync(dir + 'live.html', { force: true });
  await b.close();
}
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
