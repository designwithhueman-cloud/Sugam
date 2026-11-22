// Signed-in evidence access for a workspace-owned scan: an Agency Pro member starts a project scan of the v3 detector fixtures, then reads the
// saved evidence lines through the review API and the report page. An anonymous visitor to the same scan gets the locked view with no lines.
// Needs the web server (with ALLOW_PRIVATE_HOSTS=127.0.0.1:4200) and `node fixture/server.mjs`.
// Run: node test/workspace-evidence.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:3100'; const fix = process.env.FIX || 'http://127.0.0.1:4200/detectors/';
const creds = fs.readFileSync('.data/test-account.txt', 'utf8'); const email = creds.match(/Email: (\S+)/)[1]; const pw = creds.match(/Password: (\S+)/)[1]; const slug = creds.match(/Slug: (\S+)/)?.[1] ?? 'test-agency';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch({ channel: 'chrome' }); const ctx = await b.newContext(); const page = await ctx.newPage();
await page.goto(base + '/login'); await page.fill('input[type=email]', email); await page.fill('input[type=password]', pw);
await page.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/app**');
await page.goto(`${base}/app/${slug}/settings`);
check('signed in to an Agency Pro workspace', /This workspace is on the Agency Pro plan/.test(await page.locator('main').innerText()));

// One project per run would fill the 15-site limit, so the fixture project is reused when it exists.
const NAME = 'Detector fixtures v3';
await page.goto(`${base}/app/${slug}`);
let proj = await page.locator('a[href*="/projects/"]', { hasText: NAME }).first().getAttribute('href').catch(() => null);
if (!proj) {
  await page.fill('#p-cname', 'Avara test fixtures').catch(() => {}); await page.fill('#p-name', NAME);
  await page.fill('#p-live', fix + 'v3-flags.html'); await page.fill('#p-staging', fix + 'v3-clean.html');
  await page.locator('#p-name').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/projects/**'); proj = new URL(page.url()).pathname;
}
const scan = async (env) => {
  await page.goto(base + proj + '/scanner'); await page.selectOption('#env', env);
  await page.locator('#env').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/scans/**');
  const id = page.url().match(/scans\/([0-9a-f-]{36})/)[1];
  for (let i = 0; i < 120; i++) { const s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); if (!['queued', 'running', 'pending'].includes(s.status)) break; await page.waitForTimeout(3000); }
  return id;
};
const flagsId = await scan('live'), cleanId = await scan('staging');
const rv = async (id, c = ctx) => (await c.request.get(`${base}/api/scans/${id}/review`)).json();
const find = (r, rule) => r.categories.flatMap((c) => c.findings ?? []).find((f) => f.ruleId === rule);
const fr = await rv(flagsId), cr = await rv(cleanId);
check('review API is unlocked for the workspace member', fr.locked === false && cr.locked === false);
const want = { 'UX-017': '“Invalid input.”', 'A11Y-003': '#email', 'A11Y-016': 'changes transform', 'A11Y-015': 'panel-monthly' };
for (const [rule, text] of Object.entries(want)) {
  const f = find(fr, rule), c = find(cr, rule);
  check(`${rule}: saved evidence reaches the signed-in review API`, !!f && f.evidence.some((e) => e.includes(text)), f ? `${f.result}: ${f.evidence[0]?.slice(0, 80)}` : 'missing');
  check(`${rule}: the clean look-alike passes with no evidence lines`, c?.result === 'observed_pass' && !c.evidence.length);
}
check('the tab-target advisory is kept beside the confirmed ARIA failure', find(fr, 'A11Y-015').evidence.some((e) => /Tabs do not follow|does not exist/.test(e)), find(fr, 'A11Y-015').observation);
check('UX-017 on the clean page says what it checked', /1 visible linked error message was inspected/.test(find(cr, 'UX-017').observation), find(cr, 'UX-017').observation);
check('the new checks stay advisory: needs review, never a confirmed failure', ['UX-017', 'A11Y-003', 'A11Y-016'].every((r) => find(fr, r).result === 'needs_human_review'));
await page.goto(`${base}/scans/${flagsId}`); await page.waitForTimeout(500); const html = await page.content();
check('report page shows the saved evidence to the member', html.includes('Invalid input.') && html.includes('changes transform'));
const anon = await b.newContext(); const ar = await (await anon.request.get(`${base}/api/scans/${flagsId}/review`));
const aj = ar.status() === 200 ? await ar.json() : null;
check('an anonymous visitor does not get the evidence lines', !aj || (aj.locked === true && aj.categories.flatMap((c) => c.findings ?? []).every((f) => !f.evidence.length)), `HTTP ${ar.status()}`);
await b.close(); const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
