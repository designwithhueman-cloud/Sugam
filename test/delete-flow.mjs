// The delete buttons and URL cleaning, end to end in a browser against a running server (with `node fixture/server.mjs`):
// an anonymous scan of an address with a token is saved without it, and its browser can delete it; a new account can delete itself and
// then cannot sign in. Creates and deletes one throwaway account (@example.com). Run: node test/delete-flow.mjs [baseUrl]
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:3100';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch();

// 1. Anonymous: scan with a secret in the address, then delete the scan.
{ const ctx = await b.newContext(); const p = await ctx.newPage(); const SECRET = 'tok_' + crypto.randomBytes(6).toString('hex');
  await p.goto(base + '/'); await p.fill('#hero-url', `http://127.0.0.1:4200/long-urls.html?token=${SECRET}&lang=en`); await p.getByRole('button', { name: /Scan my page free/ }).first().click();
  await p.waitForURL(/\/scans\/[0-9a-f-]{36}/, { timeout: 30000 }); const id = p.url().match(/scans\/([0-9a-f-]{36})/)[1];
  await p.waitForFunction(() => document.querySelector('[data-testid=primary]'), null, { timeout: 120000 });
  const api = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); const html = await p.content();
  check('the token is removed before the address is saved; the rest of the query stays', !api.url.includes(SECRET) && /lang=en/.test(api.url) && !html.includes(SECRET), api.url);
  check('an anonymous report says when it will be deleted automatically', /deleted automatically after \d+ days/.test(await p.locator('body').innerText()));
  await p.getByText('Delete this scan', { exact: true }).click(); await p.getByLabel('Type delete to confirm').fill('nope'); await p.getByRole('button', { name: 'Delete scan permanently' }).click();
  check('a wrong confirmation is refused with a message', await p.getByText('Type delete to confirm.', { exact: true }).waitFor({ timeout: 10000 }).then(() => true, () => false));
  await p.getByLabel('Type delete to confirm').fill('delete'); await p.getByRole('button', { name: 'Delete scan permanently' }).click();
  await p.waitForURL((u) => u.searchParams.get('deleted') === 'scan', { timeout: 20000 }).catch(() => {});
  const after = [(await ctx.request.get(`${base}/api/scans/${id}`)).status(), (await ctx.request.get(`${base}/scans/${id}`, { maxRedirects: 0 })).status()];
  check('after deleting, the scan and its report are gone (404)', after.every((c) => c === 404), after.join(','));
  const other = await (await b.newContext()).request.get(`${base}/api/scans/${id}`); check('…for everyone', other.status() === 404);
  await ctx.close(); }

// 2. A new account deletes itself.
{ const ctx = await b.newContext(); const p = await ctx.newPage(); const email = `delete-me-${Date.now()}@example.com`, pw = crypto.randomBytes(12).toString('base64url');
  await p.goto(base + '/signup'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await p.getByRole('button', { name: /Create account/ }).click();
  await p.waitForURL(/\/app/, { timeout: 20000 }); await p.goto(base + '/app'); await p.waitForLoadState();
  const slug = (await p.locator('a[href^="/app/"]').first().getAttribute('href')).split('/')[2];
  await p.goto(`${base}/app/${slug}/settings`); await p.getByText('Delete my account', { exact: true }).click();
  await p.getByLabel('Type your email address to confirm').fill('someone@example.com'); await p.getByRole('button', { name: 'Delete my account permanently' }).click();
  check('deleting an account needs the account’s own email typed', await p.getByText('Type your email address exactly to confirm.').waitFor({ timeout: 10000 }).then(() => true, () => false));
  await p.getByLabel('Type your email address to confirm').fill(email); await p.getByRole('button', { name: 'Delete my account permanently' }).click();
  await p.waitForURL((u) => u.searchParams.get('deleted') === 'account', { timeout: 20000 }).catch(async () => console.log('  form says:', (await p.locator('[data-testid=del-acct-box]').innerText()).replace(/\n+/g, ' | ')));
  check('after deleting, the visitor is signed out', (await ctx.request.get(`${base}/app`, { maxRedirects: 0 })).status() !== 200 && (await ctx.request.get(`${base}/app/${slug}`, { maxRedirects: 0 })).status() !== 200);
  const p2 = await (await b.newContext()).newPage(); await p2.goto(base + '/login'); await p2.fill('input[name=email]', email); await p2.fill('input[name=password]', pw); await p2.getByRole('button', { name: /Sign in/ }).click();
  await p2.waitForTimeout(1500); check('…and cannot sign in again', !/\/app/.test(p2.url()));
  await ctx.close(); }

await b.close(); const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
