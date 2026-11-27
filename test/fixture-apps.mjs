// Milestone 0: proves Fixture A is correct and each defect in Fixture B really is there, before any flow runner depends on them.
// Run: node --experimental-strip-types test/fixture-apps.mjs   (starts its own servers on free ports)
import { chromium } from 'playwright';
import { createApp, ALL_DEFECTS, TEST_USERS, BOB_RECORD } from '../fixture/apps/customer-app.mjs';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const start = (opts) => new Promise((r) => { const s = createApp(opts); s.listen(0, '127.0.0.1', () => r({ s, base: `http://127.0.0.1:${s.address().port}` })); });

async function client(base) {   // minimal cookie-keeping client
  let cookie = '';
  const call = async (path, init = {}) => { const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers ?? {}), cookie } }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r; };
  const login = (u) => call('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(TEST_USERS[u]).toString() });
  const create = (name) => call('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: 'x@avara-test.local' }) });
  const list = async () => (await (await call('/api/customers')).json());
  return { call, login, create, list };
}

// ---- Fixture A: correct ----
const A = await start({ name: 'a' }); { const c = await client(A.base);
  ok((await c.call('/dashboard')).status === 302, 'A: dashboard redirects when signed out');
  ok((await c.call('/api/customers')).status === 401, 'A: api refuses when signed out');
  ok((await c.call('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=alice%40avara-test.local&password=wrong' })).status === 401, 'A: wrong password refused');
  ok((await c.login('alice')).status === 302, 'A: alice signs in');
  ok((await c.list()).length === 0, 'A: alice starts with no customers and cannot see bob\'s');
  ok((await c.create('AVARA_TEST_Customer')).status === 201, 'A: save returns 201');
  ok((await c.list()).some((x) => x.name === 'AVARA_TEST_Customer'), 'A: saved record persists');
  ok((await (await c.call('/dashboard')).text()).includes('AVARA_TEST_Customer'), 'A: dashboard shows it after reload');
  ok((await c.create('')).status === 422, 'A: empty name refused');
  const b = await client(A.base); await b.login('bob');
  const bl = await b.list(); ok(bl.some((x) => x.name === BOB_RECORD) && !bl.some((x) => x.name === 'AVARA_TEST_Customer'), 'A: bob sees only his own');
  await fetch(A.base + '/__reset', { method: 'POST' }); const c2 = await client(A.base); await c2.login('alice'); ok((await c2.list()).length === 0, 'A: reset clears the record');
}

// ---- Fixture B, one defect at a time ----
{ const s = await start({ name: 'b1', defects: ['save500'] }); const c = await client(s.base); await c.login('alice');
  ok((await c.create('AVARA_TEST_Customer')).status === 500, 'B save500: save answers 500'); ok((await c.list()).length === 0, 'B save500: nothing stored'); s.s.close(); }
{ const s = await start({ name: 'b2', defects: ['fakeToast'] }); const c = await client(s.base); await c.login('alice');
  ok((await c.create('AVARA_TEST_Customer')).status === 201, 'B fakeToast: server says created'); ok((await c.list()).length === 0, 'B fakeToast: but nothing is stored'); s.s.close(); }
{ const s = await start({ name: 'b3', defects: ['crossUser'] }); const c = await client(s.base); await c.login('alice');
  ok((await c.list()).some((x) => x.name === BOB_RECORD), 'B crossUser: alice sees bob\'s record'); s.s.close(); }

// ---- Browser checks: the defects a visitor sees ----
const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true });
const B = await start({ name: 'b', defects: ALL_DEFECTS });
async function visit(base, who, viewport) {
  const ctx = await browser.newContext({ viewport }); const p = await ctx.newPage(); const errors = []; const saves = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('response', (r) => { if (r.url().endsWith('/api/customers') && r.request().method() === 'POST') saves.push(r.status()); });
  await p.goto(base + '/login'); await p.fill('#email', TEST_USERS[who].email); await p.fill('#password', TEST_USERS[who].password); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  return { ctx, p, errors, saves };
}
{ const v = await visit(A.base, 'alice', { width: 390, height: 800 });
  ok(v.errors.length === 0, 'A browser: no console errors'); ok(await v.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'A browser: no sideways scroll at 390px');
  await v.p.click('#upgrade'); await v.p.waitForURL('**/plans', { timeout: 3000 }).then(() => ok(true), () => ok(false, 'A browser: CTA navigates'));
  await v.p.goto(A.base + '/customers/new'); await v.p.fill('#name', 'AVARA_TEST_Customer'); await v.p.click('#save'); await v.p.waitForFunction(() => document.getElementById('toast').textContent.length > 0);
  ok((await v.p.textContent('#toast')) === 'Customer saved' && v.saves[0] === 201, 'A browser: success toast after a real save');
  await v.p.reload(); await v.p.goto(A.base + '/dashboard'); ok(await v.p.locator('[data-testid=customer-row]', { hasText: 'AVARA_TEST_Customer' }).count() === 1, 'A browser: customer still listed after reload');
  await v.ctx.close(); }
{ const v = await visit(B.base, 'alice', { width: 390, height: 800 });
  ok(v.errors.some((e) => /analytics/.test(e)), 'B browser: console error present'); ok(await v.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'B browser: scrolls sideways at 390px');
  ok(await v.p.locator('[data-testid=customer-row]', { hasText: BOB_RECORD }).count() === 1, 'B browser: bob\'s record shows on alice\'s dashboard');
  const before = v.p.url(); await v.p.click('#upgrade'); await v.p.waitForTimeout(500); ok(v.p.url() === before, 'B browser: CTA does nothing');
  await v.p.goto(B.base + '/customers/new'); await v.p.fill('#name', 'AVARA_TEST_Customer'); await v.p.click('#save'); await v.p.waitForFunction(() => document.getElementById('toast').textContent.length > 0);
  ok((await v.p.textContent('#toast')) === 'Customer saved' && v.saves[0] === 500, 'B browser: success toast shown although the save returned 500');
  await v.p.goto(B.base + '/dashboard'); ok(await v.p.locator('[data-testid=customer-row]', { hasText: 'AVARA_TEST_Customer' }).count() === 0, 'B browser: customer is gone after reload');
  await v.ctx.close(); }
await browser.close(); A.s.close(); B.s.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
