// Dev only: creates the local test account, a workspace with one site (the bundled fixture) and a
// first scan, then saves the credentials to .data/test-account.txt.
// Needs: the app running with ALLOW_PRIVATE_HOSTS=127.0.0.1:4200, and `node fixture/server.mjs`.
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:3100';
const email = 'agency-test@example.com'; const pw = crypto.randomBytes(9).toString('base64url');
const b = await chromium.launch({ channel: 'chrome' }); const page = await (await b.newContext()).newPage();
await page.goto(base + '/signup');
await page.fill('#name', 'Test Agency'); await page.fill('#email', email); await page.fill('#password', pw);
await page.locator('#password').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/app**');
fs.mkdirSync('.data', { recursive: true });
fs.writeFileSync('.data/test-account.txt', `Local test account (dev only)\nEmail: ${email}\nPassword: ${pw}\n`, { mode: 0o600 });
const slug = (await page.locator('a[href^="/app/"]').first().getAttribute('href')).split('/')[2];
await page.goto(`${base}/app/${slug}`);
await page.fill('#p-cname', 'Launchpad Inc'); await page.fill('#p-name', 'Launchpad marketing site'); await page.fill('#p-live', 'http://127.0.0.1:4200/');
await page.locator('#p-name').evaluate((e) => e.form.requestSubmit()); await page.waitForTimeout(2500);
const proj = await page.locator('a[href*="/projects/"]').first().getAttribute('href');
await page.goto(base + proj + '/scanner'); await page.getByRole('button', { name: 'Start scan' }).click();
await page.waitForURL('**/scans/**'); const id = page.url().split('/scans/')[1];
for (let i = 0; i < 60; i++) { const s = await (await page.request.get(`${base}/api/scans/${id}`)).json().catch(() => ({})); if (s.status === 'completed' || s.status === 'failed') { console.log('workspace', slug, 'scan', s.status); break; } await page.waitForTimeout(2000); }
await b.close();
