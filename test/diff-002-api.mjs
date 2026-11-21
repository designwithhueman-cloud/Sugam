// DIFF-002 through the scan API: an Agency Pro member scans the pack's recoloured stack page as a workspace project, reads the stored comparison
// from /api/scans/{id}/diagnostics, rescans it, and checks who may read it. The report itself must not change. The server must run with
// AVARA_DIFF002_REFERENCES=fixture/site/diff002/references.json (demo references, test only) and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200.
// Run: node test/diff-002-api.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:3100'; const fix = process.env.FIX || 'http://127.0.0.1:4200/diff002/';
const acct = (f) => { const c = fs.readFileSync(f, 'utf8'); return { email: c.match(/Email: (\S+)/)[1], pw: c.match(/Password: (\S+)/)[1], slug: c.match(/Slug: (\S+)/)?.[1] }; };
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch({ channel: 'chrome' });
const signIn = async (a) => { const ctx = await b.newContext(); const page = await ctx.newPage(); await page.goto(base + '/login'); await page.fill('input[type=email]', a.email); await page.fill('input[type=password]', a.pw); await page.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/app**'); return { ctx, page }; };
const wait = async (ctx, id) => { for (let i = 0; i < 120; i++) { const s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); if (!['queued', 'running', 'analyzing', 'pending'].includes(s.status)) return s.status; await new Promise((r) => setTimeout(r, 3000)); } return 'timeout'; };
const agency = acct('.data/test-account.txt'); const { ctx, page } = await signIn(agency); const slug = agency.slug ?? 'test-agency';
await page.goto(`${base}/app/${slug}/settings`); check('signed in to an Agency Pro workspace', /This workspace is on the Agency Pro plan/.test(await page.locator('main').innerText()));
const NAME = 'DIFF-002 hero fixtures';
await page.goto(`${base}/app/${slug}`);
let proj = await page.locator('a[href*="/projects/"]', { hasText: NAME }).first().getAttribute('href', { timeout: 3000 }).catch(() => null);
if (!proj) { await page.goto(`${base}/app/${slug}/projects`).catch(() => {}); proj = await page.locator('a[href*="/projects/"]', { hasText: NAME }).first().getAttribute('href', { timeout: 3000 }).catch(() => null); }
if (!proj) {
  await page.goto(`${base}/app/${slug}`); if (!(await page.locator('#p-name').count())) await page.goto(`${base}/app/${slug}/projects`);
  if (!(await page.locator('#p-name').isVisible().catch(() => false))) await page.getByRole('button', { name: /add project|new project/i }).first().click().catch(() => {});
  await page.fill('#p-cname', 'Avara test fixtures').catch(() => {}); await page.fill('#p-name', NAME); await page.fill('#p-live', fix + 'rebrand.html'); await page.fill('#p-staging', fix + 'lookalike.html');
  await page.locator('#p-name').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/projects/**'); proj = new URL(page.url()).pathname;
}
await page.goto(base + proj + '/scanner'); await page.selectOption('#env', 'live'); await page.locator('#env').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/scans/**');
const id = page.url().match(/scans\/([0-9a-f-]{36})/)[1]; check('workspace scan completed', (await wait(ctx, id)) === 'completed', id);
const dr = await ctx.request.get(`${base}/api/scans/${id}/diagnostics`); const d = dr.status() === 200 ? (await dr.json()).diagnostics['DIFF-002'] : null;
check('member reads the stored comparison: diagnostic, stack first with all 3 groups', d?.status === 'diagnostic' && d.candidates[0].referenceId === 'stack' && d.candidates[0].matchedGroups === 3 && d.candidates[1]?.matchedGroups < 3, `HTTP ${dr.status()} ${d?.candidates?.map((c) => `${c.referenceId}:${c.matchedGroups}:${c.distance.toFixed(3)}`).join(' ')}`);
check('the stored record names the rule and reference-set versions and stays unpublished, weight 0', d?.ruleVersion === 'prototype-1' && d.referenceSet.version === 'demo-1' && d.referenceSet.validated === false && /^override/.test(d.referenceSet.source) && d.publish === false && d.weight === 0, JSON.stringify(d?.referenceSet));
check('the capture names the elements it measured', d?.capture?.elements?.action === 'button' && d.capture.elements.visual === 'figure' && d.capture.actionSource);
const rv = await (await ctx.request.get(`${base}/api/scans/${id}/review`)).json(); const f = rv.categories.flatMap((c) => c.findings ?? []).find((x) => x.ruleId === 'DIFF-002');
check('the DIFF-002 finding in the report is unchanged by the comparison', !!f && !/stack|split|reference|hero layout/i.test(JSON.stringify(f)), f ? `${f.result}: ${f.observation?.slice(0, 90)}` : 'missing');
await page.goto(`${base}/scans/${id}`); await page.waitForTimeout(400); check('the report page does not show the comparison', !/referenceId|prototype-1|Original synthetic Avara/.test(await page.content()));
const rs = await ctx.request.post(`${base}/api/scans/${id}/rescan`, { headers: { origin: base } }); const rid = rs.status() === 202 ? (await rs.json()).id : null;
const rd = rid && (await wait(ctx, rid)) === 'completed' ? (await (await ctx.request.get(`${base}/api/scans/${rid}/diagnostics`)).json()).diagnostics['DIFF-002'] : null;
check('rescan: the new scan stores its own comparison with the same ranking', rd?.status === 'diagnostic' && rd.candidates[0].referenceId === 'stack' && rd.candidates[0].matchedGroups === 3, `HTTP ${rs.status()} ${rid}`);
const anon = await b.newContext(); const ar = await anon.request.get(`${base}/api/scans/${id}/diagnostics`); check('anonymous visitor: 404, nothing returned', ar.status() === 404, `HTTP ${ar.status()}`);
const free = await signIn(acct('.data/test-free.txt'));
const fr = await free.ctx.request.get(`${base}/api/scans/${id}/diagnostics`); check('another workspace (free plan) cannot read it: 404', fr.status() === 404, `HTTP ${fr.status()}`);
await free.page.goto(`${base}/app`); const own = await free.page.evaluate(() => document.body.innerHTML.match(/\/scans\/([0-9a-f-]{36})/)?.[1]);
if (own) { const o = await free.ctx.request.get(`${base}/api/scans/${own}/diagnostics`); check('free plan, own scan: 402, diagnostics need a paid plan', o.status() === 402, `HTTP ${o.status()}`); } else check('free plan, own scan: 402', false, 'no free-plan scan found to try');
await b.close(); const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
