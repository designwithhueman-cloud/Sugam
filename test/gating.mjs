// Plan gating checks: node test/gating.mjs <free|site|agency> [baseUrl]
// Signs in as the local test account (password from .data/test-account.txt) and checks that the
// server only returns what the workspace's plan allows. Set the plan first with scripts/set-plan.ts.
import { chromium } from 'playwright';
import fs from 'node:fs';
const plan = process.argv[2]; const base = process.argv[3] || 'http://localhost:3100';
const creds = fs.readFileSync(process.env.GATING_FILE || '.data/test-account.txt', 'utf8'); const email = creds.match(/Email: (\S+)/)[1]; const pw = creds.match(/Password: (\S+)/)[1];
const slug = creds.match(/Slug: (\S+)/)?.[1] ?? 'test-agency'; const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${plan}] ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch({ channel: 'chrome' }); const ctx = await b.newContext(); const page = await ctx.newPage();
await page.goto(base + '/login'); await page.fill('input[type=email]', email); await page.fill('input[type=password]', pw);
await page.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/app**');
await page.goto(`${base}/app/${slug}`);
const proj = (await page.locator(`a[href*="/projects/"]`).first().getAttribute('href'));
await page.goto(base + proj + '/reports'); await page.waitForTimeout(800);
const html = await page.locator('main').innerText();
const rows = await page.locator('tbody tr').count();
const paid = plan !== 'free';
check('reports page ' + (paid ? 'has share and export controls' : 'shows the locked banner'), paid ? html.includes('Download issues CSV') : html.includes('Free plan:') && !html.includes('Download issues CSV'));
check('agency-only share buttons', plan === 'agency' ? html.includes('Share full report') : !html.includes('Share full report'));
// Free plan: exactly one finding is open ("Fix unlocked" is not shown in the dashboard table, so
// find it by trying rows). Paid plans: every row opens.
let open = ''; let openedFull = 0; let openedLocked = 0; const nRows = Math.min(await page.locator('tbody th button').count(), 6);
for (let k = 0; k < nRows; k++) { await page.locator('tbody th button').nth(k).click(); await page.waitForTimeout(150); const t = await page.locator('tbody').innerText(); if (/unlock with a paid plan/.test(t)) openedLocked++; else openedFull++; open = t; await page.locator('tbody th button').nth(k).click(); await page.waitForTimeout(100); }
check(paid ? 'every issue row opens its fixes' : 'exactly one row opens its fix on the free plan, the rest stay locked', paid ? openedLocked === 0 : openedFull === 1 && openedLocked === nRows - 1, `full ${openedFull}, locked ${openedLocked}`);

check('impact labels shown on an opened finding', /Screen-reader navigation|Voice control|Keyboard navigation|Low vision/.test(open));
// latest scan id: the scanner page lists recent scans
await page.goto(base + proj + '/scanner');
const sid = await page.evaluate(() => document.body.innerHTML.match(/\/scans\/([0-9a-f-]{36})/)?.[1]);
if (!sid) { console.log('no scan found'); process.exit(1); }
const get = (u) => ctx.request.get(base + u, { maxRedirects: 0 });
const shot = await get(`/api/scans/${sid}/screenshot/desktop`); check('screenshot', paid ? shot.status() === 200 : shot.status() === 402, 'HTTP ' + shot.status());
const exp = await get(`/api/scans/${sid}/export?format=csv`); check('CSV export', paid ? exp.status() === 200 : exp.status() === 402, 'HTTP ' + exp.status());
const share = await ctx.request.post(`${base}/api/scans/${sid}/share`, { headers: { origin: base } }); check('share link', plan === 'agency' ? share.status() === 201 : share.status() === 402, 'HTTP ' + share.status());
await page.goto(`${base}/scans/${sid}`); const sp = await page.locator('body').innerText();
check('scan page', paid ? sp.includes('Every finding, pinned on the screenshot') : /page review/i.test(sp) && !sp.includes('Show on screenshot') && !sp.includes('Every finding, pinned'));
const body = await (await get(`/scans/${sid}`)).text();
const opened = await page.locator('[data-testid=primary] pre[aria-label="Element"]').count();
check('free report opens at most the one unlocked finding (1 to 3 elements), no screenshots', paid || (opened >= 1 && opened <= 3 && !/\\?"screenshotUrl\\?":\s*\\?"\/api/.test(body)), `elements shown ${opened}`);
if (!paid) { await page.getByTestId('see-fix').click(); await page.waitForTimeout(200); check('free report opens its one fix on demand, with a copyable prompt and how to check it', (await page.getByRole('button', { name: /Copy prompt/ }).count()) >= 1 && (await page.locator('main').innerText()).includes('How to check it')); }
if (plan === 'agency') { const url = (await share.json()).url; const s2 = await ctx.request.get(url); check('shared link opens read-only', s2.status() === 200); }
await page.goto(base + proj + '/compare'); const cp = await page.locator('main').innerText();
check('before and after', paid ? !cp.includes('part of the paid plans') : cp.includes('part of the paid plans'));
await b.close(); const f = results.filter((r) => !r).length; console.log(f ? `${f} FAILED` : 'All passed'); process.exit(f ? 1 : 0);
