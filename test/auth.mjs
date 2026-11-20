// "Continue with Google / GitHub", end to end against a fake provider. Start the app first with the provider variables set:
//   GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=y SUGAM_OAUTH_TEST_BASE=http://127.0.0.1:4300 npm start
// This script runs the fake provider itself. It creates two throwaway accounts (@example.com) in the local database.
import http from 'node:http';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:3100'; const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const PROFILES = { verified: { email: 'google.user@example.com', email_verified: true, name: 'Gia Google' }, unverified: { email: 'nope@example.com', email_verified: false, name: 'No Verify' }, haspw: { email: 'agency-test@example.com', email_verified: true, name: 'Pw Owner' } };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (u.pathname.endsWith('/auth')) { res.statusCode = 302; res.setHeader('location', `${u.searchParams.get('redirect_uri')}?code=${process.env.FAKE_CODE || 'verified'}&state=${u.searchParams.get('state')}`); return res.end(); }
  if (u.pathname.endsWith('/token')) { let b = ''; req.on('data', (c) => (b += c)); return req.on('end', () => { const p = new URLSearchParams(b); json(p.get('code_verifier') && p.get('client_secret') ? { access_token: p.get('code') } : {}); }); }
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  if (u.pathname === '/google/profile') return json(PROFILES[tok] || {});
  if (u.pathname === '/github/profile') return json({ login: 'octo', name: 'Octo Cat' });
  if (u.pathname === '/github/emails') return json([{ email: 'octo@example.com', primary: true, verified: true }]);
  res.statusCode = 404; res.end();
}).listen(4300);
const b = await chromium.launch();
const fresh = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); return [ctx, await ctx.newPage()]; };
let [ctx, p] = await fresh();
await p.goto(base + '/login');
check('sign in offers Google and GitHub first, then email, with a clear divider', (await p.getByRole('link', { name: /Continue with/ }).allInnerTexts()).map((x) => x.trim()).join('|') === 'Continue with Google|Continue with GitHub' && (await p.locator('main').innerText()).includes('or use your email'));
await p.goto(base + '/signup'); check('create account says what an account is for and shows the same options', (await p.locator('main').innerText()).includes('Keep your scan history') && (await p.getByRole('link', { name: /Continue with Google/ }).count()) === 1);
await p.goto(base + '/login'); await p.getByRole('link', { name: 'Continue with Google' }).click(); await p.waitForURL('**/app**', { timeout: 15000 });
check('Google sign-in lands in the dashboard, signed in, with a workspace', (await p.locator('body').innerText()).includes("Gia Google's workspace") || /workspace/i.test(await p.locator('body').innerText()));
await ctx.close(); [ctx, p] = await fresh();
await p.goto(base + '/login'); await p.getByRole('link', { name: 'Continue with Google' }).click(); await p.waitForURL('**/app**', { timeout: 15000 });
check('signing in with Google again goes to the same account, with no second workspace', await p.evaluate(() => { const hs = [...new Set([...document.querySelectorAll('a[href^="/app/"]')].map((a) => a.getAttribute('href')).filter((h) => /^\/app\/gia-google/.test(h)))]; return hs.length === 1 && hs[0] === '/app/gia-google'; }));
await ctx.close(); [ctx, p] = await fresh();
await p.goto(base + '/login'); await p.getByRole('link', { name: 'Continue with GitHub' }).click(); await p.waitForURL('**/app**', { timeout: 15000 }); check('GitHub sign-in works and makes a workspace from the GitHub name', await p.evaluate(() => [...document.querySelectorAll('a[href^="/app/"]')].some((a) => a.getAttribute('href') === '/app/octo-cat')));
await ctx.close(); [ctx, p] = await fresh();
await p.goto(base + '/api/auth/google/callback?code=x&state=wrong'); check('a callback without the matching state is refused with a plain message', /took too long or did not match/.test(await p.locator('main').innerText()));
await p.goto(base + '/api/auth/twitter'); check('an unknown provider goes back to sign-in with a message', /not available right now/.test(await p.locator('main').innerText()));
process.env.FAKE_CODE = 'unverified'; await p.goto(base + '/login'); await p.getByRole('link', { name: 'Continue with Google' }).click(); await p.waitForURL('**/login?error=**'); check('an unverified provider email is refused', /could not get a verified email/.test(await p.locator('main').innerText()));
process.env.FAKE_CODE = 'haspw'; await p.goto(base + '/login'); await p.getByRole('link', { name: 'Continue with Google' }).click(); await p.waitForURL('**/login?error=**'); check('a provider sign-in never opens an account that has a password', /already has a password account/.test(await p.locator('main').innerText()) && !/\/app/.test(p.url()));
check('the error is announced (an alert) and the page still has the email form', (await p.getByRole('alert').first().isVisible()) && (await p.locator('#email').isVisible()));
await ctx.close(); await b.close(); srv.close(); const f = results.filter((x) => !x).length; console.log(f ? `\n${f} FAILED` : '\nAll passed'); process.exit(f ? 1 : 0);
