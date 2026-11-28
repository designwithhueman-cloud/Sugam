// Product events through the running app and a real browser: copying a fix sends one first-party request with two ids and nothing else, sets no cookie,
// is not sent by viewing, is refused from other origins, never breaks the page when it fails, and the privacy page says what is counted.
// Needs an app server with ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 and the fixture site. Run: node test/events-server.mjs <baseUrl>
import fs from 'node:fs';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:3390'; const origin = new URL(base).origin;
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const browser = await chromium.launch({ channel: 'chrome' }); const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const p = await ctx.newPage(); const seen = []; const hosts = new Set(); p.on('request', (r) => { hosts.add(new URL(r.url()).origin); if (/\/api\/scans\/[^/]+\/events/.test(r.url())) seen.push(r); });
// an anonymous scan (no account), as a visitor on the home page would start
const created = await ctx.request.post(`${base}/api/scans`, { headers: { origin, 'content-type': 'application/json' }, data: { url: 'http://127.0.0.1:4200/ai-builder-bad.html', standard: 'wcag22aa' } }); const id = (await created.json()).id;
check('(setup) an anonymous scan started', created.status() < 300 && /^[0-9a-f-]{36}$/.test(id));
let st = null; for (let i = 0; i < 150; i++) { st = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); if (st.status === 'completed' || st.status === 'failed') break; await new Promise((r) => setTimeout(r, 1500)); }
check('(setup) the scan completed', st?.status === 'completed');

const openFix = async () => { const sf = p.getByTestId('see-fix').first(); if (await sf.count()) { if ((await sf.getAttribute('aria-expanded')) !== 'true') await sf.click(); } await p.getByRole('button', { name: /Copy prompt/ }).first().waitFor({ timeout: 30000 }); };
await p.goto(`${base}/scans/${id}`); await openFix();
const cookiesBefore = JSON.stringify((await ctx.cookies()).map((c) => c.name).sort());
check('viewing the report sends no event, and every request the page made stayed on Avara’s own origin (no third party)', seen.length === 0 && [...hosts].every((h) => h === origin), [...hosts].join(','));
await p.getByRole('button', { name: /Copy prompt/ }).first().click(); await p.getByText('Copied').first().waitFor({ timeout: 10000 });
await p.waitForTimeout(500); const first = seen[0]; const resp = first ? await first.response() : null; const body = first ? JSON.parse(first.postData() ?? '{}') : {};
check('copying a fix sends exactly one request, to Avara’s own server for this scan', seen.length === 1 && first.method() === 'POST' && new URL(first.url()).origin === origin && first.url().includes(`/api/scans/${id}/events`));
check('…its body holds only the kind and one finding id: no address, no prompt text, no key, no user', Object.keys(body).sort().join() === 'findingId,kind' && body.kind === 'prompt_copied' && /^[0-9a-f-]{36}$/.test(body.findingId) && (first?.postData() ?? '').length < 100, first?.postData());
check('…the server answers 204 (recorded) and the button says Copied', resp?.status() === 204);
check('…no cookie was set or changed by counting', JSON.stringify((await ctx.cookies()).map((c) => c.name).sort()) === cookiesBefore, cookiesBefore);
await p.getByRole('button', { name: /Copied|Copy prompt/ }).first().click().catch(() => {}); await p.waitForTimeout(500); const again = seen.at(-1) ? await seen.at(-1).response() : null;
check('copying the same fix again is accepted (204) and, server-side, still one finding (checked in test/events.mjs)', seen.length === 2 && again?.status() === 204);

// refusals, as an outsider would meet them
const post = (data, headers = {}) => ctx.request.post(`${base}/api/scans/${id}/events`, { headers: { origin, 'content-type': 'application/json', ...headers }, data });
check('another origin is refused (403), an unknown kind is refused (400), a finding that is not in this scan is refused (404)', (await post({ kind: 'prompt_copied', findingId: body.findingId }, { origin: 'http://evil.test' })).status() === 403 && (await post({ kind: 'scan_completed', findingId: body.findingId })).status() === 400 && (await post({ kind: 'prompt_copied', findingId: '00000000-0000-4000-8000-000000000000' })).status() === 404);
check('an oversized body is refused (413)', (await ctx.request.post(`${base}/api/scans/${id}/events`, { headers: { origin, 'content-type': 'application/json' }, data: { kind: 'prompt_copied', findingId: body.findingId, pad: 'x'.repeat(3000) } })).status() === 413);

// a failing counter never breaks the page or the copy
await p.route('**/api/scans/*/events', (r) => r.abort()); await p.reload(); await openFix();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); await p.getByRole('button', { name: /Copy prompt/ }).first().click(); await p.getByText('Copied').first().waitFor({ timeout: 10000 }).then(async () => check('with the counting request blocked, the copy still works and the page shows no error', errs.length === 0 && (await p.getByText('Copy failed').count()) === 0, errs.join(';'))).catch(() => check('with the counting request blocked, the copy still works', false));
await p.unroute('**/api/scans/*/events');

// the privacy page, in the same change
const priv = await (await ctx.request.get(`${base}/privacy`)).text(); const text = priv.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('the privacy page says what is counted, that it has no cookie or third party, how long it is kept, and when it is deleted', /What we count/.test(text) && /a fix was copied for a finding/.test(text) && /no cookie, no tracking script and no third party/.test(text) && /deleted when the scan is deleted/.test(text) && /delete your account/.test(text) && /same number of days as the scan itself/.test(text) && /does not hold your name, email, account, internet address, the address of your site/.test(text));
check('shared read-only views record nothing (they are not given a scan scope)', !/ScanScope/.test(fs.readFileSync('app/(site)/share/[token]/page.tsx', 'utf8')) && /scanId=\{readOnly \? undefined : report\.id\}/.test(fs.readFileSync('components/report/FreeReport.tsx', 'utf8')));
await browser.close(); const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
