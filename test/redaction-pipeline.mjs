// Redaction end to end with synthetic canary secrets: the real scanner, the real scan job (with the simulated AI model), a throwaway database and
// storage folder. A canary page carries a secret in every place one can sit (visible text, an input, a placeholder, CSS content, a data attribute,
// an image address, a link, a meta tag, an inline script, a comment, the title). Checks that no raw value escapes (database, stored files, report, model
// requests, logs), that findings and their locations survive, that screenshots hide visible secrets (and are replaced when they cannot be), that
// legacy rows are masked on read, and that a saved flow refuses sensitive values. Takes about 4 minutes.
// Run: node --experimental-strip-types test/redaction-pipeline.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { makeCanaries, RAW } from './support/canaries.mjs';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-redact-')); const PORT = 4341; const BASE = `http://127.0.0.1:${PORT}`;
Object.assign(process.env, { PGLITE_DIR: path.join(tmp, 'db'), STORAGE_DIR: path.join(tmp, 'objects'), ALLOW_PRIVATE_HOSTS: `127.0.0.1:${PORT}`, AVARA_PERF: 'off', AVARA_LAUNCH: 'off', AVARA_AI: 'on', AVARA_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'stub', GEMINI_STUB: 'review', GEMINI_STUB_LOG: path.join(tmp, 'stub.log') });
delete process.env.DATABASE_URL; delete process.env.REDIS_URL; fs.writeFileSync(process.env.GEMINI_STUB_LOG, '');
globalThis.__sugamQueue = { add: async () => {} };   // never start a scan by itself
await import('./support/gemini-stub.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const C = makeCanaries(); const FILL = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, 'N'.repeat(v.length)]));
const covered = fs.readFileSync(new URL('../fixture/site/avara/book-call-bad.html', import.meta.url), 'utf8');
const MASKED = 'sk_live_••••';

// ---- the canary pages (built at run time, so no key-shaped text is in the repository) ----
const leakPage = (c) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Canary page ${c.stripe}</title><meta name="x-note" content="${c.openai}"><style>#c::before{content:"${c.anthropic}"}</style></head><body><main>
<h1>Canary test page</h1><p id="p1">Visible text key: ${c.stripe}</p><p id="p2" data-k="${c.restricted}">data attribute</p>
<img id="img1" src="/pic.png?access_token=${c.param}"><a id="l1" href="/go?api_key=${c.github}&x=${c.aws}">a link</a>
<input id="in1" value="${c.supabaseSecret}" aria-label="k"> <input id="in2" placeholder="${c.google}" aria-label="p"> <span id="c"></span>
<button id="b1"></button><pre id="pk">${c.privateKey}</pre>
<script>var inline = "${c.serviceJwt}"; var anon = "${c.anonJwt}"; var user = "${c.userJwt}";</script><!-- ${c.stripe} --></main></body></html>`;
const shotPage = (text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body style="margin:0;padding:24px;font:24px monospace"><p>Key: ${text}</p><p>Another line of ordinary text.</p></body></html>`;
const pseudoPage = (content) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>body{margin:0;padding:24px;font:24px monospace} #k::before{content:"${content}"}</style></head><body><p>Label: <span id="k"></span></p></body></html>`;
const sabotage = `<script>for (const o of [CharacterData.prototype, Node.prototype]) for (const k of ['data','nodeValue','textContent']) { const d = Object.getOwnPropertyDescriptor(o, k); if (d && d.set) Object.defineProperty(o, k, { configurable: true, get: d.get, set() { throw new Error('locked'); } }); }</script>`;
const sabPage = (key) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${sabotage}</head><body style="margin:0;padding:24px;font:24px monospace"><p>Key: ${key}</p></body></html>`;
const blockerPage = (text) => covered.replace('Book a call to get started.', `Book a call to get started. Key: ${text}`);
const SAB = [makeCanaries().stripe, makeCanaries().stripe];   // equal length, so both pages have the same size and the two notices can be compared
const routes = (u) => {
  if (u.startsWith('/leak')) return leakPage(C); if (u.startsWith('/clean')) return leakPage(FILL);
  if (u === '/shot-a') return shotPage(C.stripe); if (u === '/shot-b') return shotPage(MASKED);
  if (u === '/pseudo-a') return pseudoPage(C.anthropic); if (u === '/pseudo-b') return pseudoPage('••••');
  if (u === '/sab-1') return sabPage(SAB[0]); if (u === '/sab-2') return sabPage(SAB[1]);
  if (u === '/blocker-sab') return blockerPage(SAB[0]).replace('</head>', `${sabotage}</head>`);
  if (u === '/blocker-a') return blockerPage(C.stripe); if (u === '/blocker-b') return blockerPage(MASKED);
  return null;
};
const server = http.createServer((req, res) => { const html = routes(new URL(req.url, BASE).pathname); if (html == null) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// capture everything the process logs
const logs = []; for (const m of ['log', 'warn', 'error', 'info']) { const real = console[m].bind(console); console[m] = (...a) => { const t = a.map(String).join(' '); if (!/^(PASS|FAIL)  /.test(t)) logs.push(t); real(...a); }; }   // the product's output is recorded; the test's own result lines are not

const { getDb, schema } = await import('../lib/db/index.ts'); const { runScanJob } = await import('../lib/jobs.ts'); const { scanUrl } = await import('../scanner/scanner.ts');
const { loadReport } = await import('../lib/report.ts'); const { createFlow } = await import('../lib/flows/service.ts'); const { checkUrl } = await import('../lib/net/guard.ts');
const { eq } = await import('drizzle-orm'); const { is } = await import('drizzle-orm'); const { PgTable } = await import('drizzle-orm/pg-core'); const { chromium } = await import('playwright');
const db = await getDb();

// ---- a workspace on the Agency plan, so the paid AI review and the fix writer run too ----
const [org] = await db.insert(schema.organizations).values({ name: 'Redaction Org', slug: 'redaction-org', plan: 'agency' }).returning();
const [client] = await db.insert(schema.clients).values({ organizationId: org.id, name: 'Client' }).returning();
const [project] = await db.insert(schema.projects).values({ organizationId: org.id, clientId: client.id, name: 'Canary site', liveUrl: `${BASE}/leak` }).returning();
const [user] = await db.insert(schema.users).values({ email: 'redact@example.com', passwordHash: 'x:y' }).returning();
const runJob = async (path) => {
  const url = (await checkUrl(`${BASE}${path}`)).toString();   // exactly what the API stores: the submitted address with secrets removed
  const [s] = await db.insert(schema.scans).values({ url, projectId: project.id, standard: 'wcag22aa', status: 'queued' }).returning();
  await runScanJob(s.id);
  for (let i = 0; i < 120; i++) { const [row] = await db.select().from(schema.scans).where(eq(schema.scans.id, s.id)); if (!row.ai?.pending && row.ai?.fixes?.state !== 'pending') break; await new Promise((r) => setTimeout(r, 1000)); }
  return { id: s.id, submitted: url };
};
const leak = await runJob(`/leak/${C.github}?q=${C.stripe}&page=1`); const clean = await runJob('/clean/x?page=1');
check('the scan completed', (await db.select().from(schema.scans).where(eq(schema.scans.id, leak.id)))[0].status === 'completed');
check('the submitted address was cleaned before it was stored (a key in the path and in an ordinary parameter, both gone; the rest kept)', !leak.submitted.includes(C.github) && !leak.submitted.includes(C.stripe) && /\/leak\/\[removed\]\?page=1$/.test(leak.submitted), leak.submitted.replace(BASE, ''));

// ---- everything that was stored, shown or sent ----
const tables = Object.values(schema).filter((t) => is(t, PgTable)); let dbDump = ''; for (const t of tables) dbDump += JSON.stringify(await db.select().from(t));
const files = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (!/\.(jpg|jpeg|png)$/i.test(f.name)) files.push(fs.readFileSync(p, 'utf8')); } }; walk(process.env.STORAGE_DIR); const storageDump = files.join('\n');
const report = JSON.stringify(await loadReport(leak.id)); const aiLog = fs.readFileSync(process.env.GEMINI_STUB_LOG, 'utf8'); const logText = logs.join('\n');
const escaped = (text) => RAW(C).filter((v) => text.includes(v));
check('the paid AI review and the fix writer really ran (the model requests are on record)', aiLog.trim().split('\n').filter(Boolean).length >= 2, `${aiLog.trim().split('\n').length} model calls`);
check('database: no raw canary in any table', escaped(dbDump).length === 0, escaped(dbDump).join(' '));
check('stored files (raw axe results, diagnostics): no raw canary', escaped(storageDump).length === 0, escaped(storageDump).join(' '));
check('the rendered report data: no raw canary', escaped(report).length === 0, escaped(report).join(' '));
check('requests sent to the model: no raw canary', escaped(aiLog).length === 0, escaped(aiLog).join(' '));
check('server logs during the run: no raw canary', escaped(logText).length === 0, escaped(logText).join(' '));
check('the evidence is masked, not deleted: masked forms are in the stored findings, and the model was sent the page text with the secret masked', dbDump.includes('sb_secret_••••') && dbDump.includes('[removed]') && aiLog.includes(MASKED));
check('the anon JWT and the Google key are hidden in stored evidence too', !dbDump.includes(C.anonJwt) && !dbDump.includes(C.google));

// ---- findings and their locations survive ----
const findingSet = async (id) => { const iss = await db.select().from(schema.issues).where(eq(schema.issues.scanId, id)); const inst = await db.select().from(schema.issueInstances).where(eq(schema.issueInstances.scanId, id)); const byId = new Map(iss.map((i) => [i.id, i])); return { set: new Set(inst.map((x) => `${byId.get(x.issueId)?.ruleId}|${x.selector}`)), inst }; };
const A = await findingSet(leak.id), B = await findingSet(clean.id);
check('the same findings at the same locations as the same page without secrets (rule and selector sets are equal, and not empty)', A.set.size > 0 && A.set.size === B.set.size && [...A.set].every((k) => B.set.has(k)), [...A.set].filter((k) => !B.set.has(k)).length || [...B.set].filter((k) => !A.set.has(k)).length ? `only with secrets: ${[...A.set].filter((k) => !B.set.has(k)).join(', ') || 'none'}; only without: ${[...B.set].filter((k) => !A.set.has(k)).join(', ') || 'none'}` : [...A.set].join(', '));   // on a mismatch the difference is printed, so an intermittent failure can be attributed
check('the expected accessibility findings are present (image without text alternative, button without a name)', [...A.set].some((k) => /^image-alt\|/.test(k) && k.includes('#img1')) && [...A.set].some((k) => /^button-name\|/.test(k) && k.includes('#b1')));
{ const img = A.inst.find((x) => x.selector.includes('#img1')); check('the image finding keeps its element and its evidence, with the secret address parameter masked', !!img && /<img/.test(img.html) && img.html.includes('access_token=[removed]') && !img.html.includes(C.param)); }
{ const [row] = await db.select().from(schema.scans).where(eq(schema.scans.id, leak.id)); const lim = (row.summary?.limitations ?? []).join(' | ');
  check('the scan says how many secret values were hidden, and in how many screenshots, without saying what they were', /\d+ values? that look like secrets .* hidden in the stored evidence/.test(lim) && /secret values? visible on the (desktop|mobile) page (was|were) hidden in its screenshots/.test(lim), lim.slice(0, 200)); }
{ const ruleSet = async (id) => new Set((await db.select().from(schema.ruleFindings).where(eq(schema.ruleFindings.scanId, id))).map((r) => `${r.ruleId}|${r.result}`)); const a = await ruleSet(leak.id), b = await ruleSet(clean.id);
  check('the rule-engine findings (including the simulated AI review) are the same with and without the secrets', a.size > 0 && a.size === b.size && [...a].every((k) => b.has(k))); }

// ---- legacy rows (stored before masking existed) are masked on read ----
{ const L = makeCanaries(); const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.scanId, leak.id)).limit(1);
  await db.insert(schema.issueInstances).values({ issueId: issue.id, scanId: leak.id, selector: '#legacy', html: `<p>${L.stripe}</p>`, detail: `seen ${L.github}`, viewports: ['desktop'] });
  const raw = JSON.stringify(await db.select().from(schema.issueInstances).where(eq(schema.issueInstances.scanId, leak.id)));
  check('(setup) the raw legacy row really holds the canary', raw.includes(L.stripe) && raw.includes(L.github));
  const shown = JSON.stringify(await loadReport(leak.id)); check('the report built from legacy rows shows them masked, with their location', !shown.includes(L.stripe) && !shown.includes(L.github) && shown.includes('#legacy')); }

// ---- legacy scan addresses stored raw are masked on every dashboard list ----
{ const L = makeCanaries(); const rawUrl = `${BASE}/legacy/${L.github}?q=${L.stripe}`;
  const [ls] = await db.insert(schema.scans).values({ url: rawUrl, finalUrl: rawUrl, pageTitle: `Legacy ${L.openai}`, projectId: project.id, createdBy: user.id, standard: 'wcag22aa', status: 'completed', completedAt: new Date() }).returning();
  const [qs] = await db.insert(schema.scans).values({ url: rawUrl, finalUrl: rawUrl, pageTitle: `Legacy ${L.openai}`, createdBy: user.id, standard: 'wcag22aa', status: 'completed', completedAt: new Date() }).returning();
  const stored = JSON.stringify(await db.select({ u: schema.scans.url, t: schema.scans.pageTitle }).from(schema.scans).where(eq(schema.scans.id, ls.id)));
  check('(setup) the legacy scan rows really hold the raw address and title', stored.includes(L.github) && stored.includes(L.stripe) && stored.includes(L.openai));
  const { siteStats } = await import('../lib/dashboard.ts'); const { quickScans, workspaceOverview } = await import('../lib/overview.ts'); const { compareScans } = await import('../lib/compare.ts');
  const noL = (v) => { const t = JSON.stringify(v); return ![L.github, L.stripe, L.openai].some((x) => t.includes(x)); };
  const st = await siteStats(project.id); check('the site dashboard list masks the legacy address and title (and still lists the scan)', noL(st.scans) && st.scans.some((x) => x.id === ls.id));
  const q = await quickScans(user.id); check('the quick-scans list masks them (and still lists the scan)', noL(q.scans) && q.scans.some((x) => x.id === qs.id));
  const cmp = await compareScans(ls.id, qs.id); check('the compare view masks them', noL(cmp));
  const ov = typeof workspaceOverview === 'function' ? await workspaceOverview(org.id, 'agency') : null; if (ov) check('the workspace overview masks them', noL(ov)); }

// ---- saved flows ----
{ const flow = (steps, startUrl = `${BASE}/clean`) => ({ name: 'Canary flow', startUrl, steps });
  const secret = await createFlow(project.id, user.id, flow([{ id: 'f1', action: 'fill', selector: '#in1', value: C.stripe }])); check('a flow with a key typed into a field is refused before it is saved', !secret.ok && secret.error === 'sensitive_value' && secret.status === 400 && /Step “f1”/.test(secret.message), secret.message);
  const pw = await createFlow(project.id, user.id, flow([{ id: 'f2', action: 'fill', selector: 'input[type=password]', value: 'anything' }])); check('a flow that fills a password field is refused', !pw.ok && pw.error === 'sensitive_value');
  const fine = await createFlow(project.id, user.id, flow([{ id: 'n', action: 'fill', selector: '#in1', value: 'AVARA_TEST_Customer' }, { id: 'e', action: 'fill', selector: '#in2', value: 'alice@avara-test.local' }, { id: 'c', action: 'click', selector: '#l1' }], `${BASE}/clean?token=${C.param}&utm=x`));
  check('an ordinary flow (test name, email, a click) is saved and stays replayable', fine.ok === true, fine.message ?? '');
  if (fine.ok) { const [row] = await db.select().from(schema.flows).where(eq(schema.flows.id, fine.id)); const def = JSON.stringify(row.definition); check('the saved flow’s start address has the secret parameter removed, and its steps are intact', !def.includes(C.param) && /utm=x/.test(def) && (row.definition.steps ?? []).length === 3 && def.includes('AVARA_TEST_Customer')); } }

// ---- screenshots, through the real scanner ----
const scan = (p, opts = {}) => scanUrl(`${BASE}${p}`, 'wcag22aa', undefined, { perf: false, ...opts });
const noRaw = (o) => escaped(JSON.stringify(o, (k, v) => (v && v.type === 'Buffer' ? undefined : v))).length === 0;
const rawShot = async (p, w, h, quality = 70) => { const b = await chromium.launch({ channel: 'chrome' }); try { const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); await pg.goto(`${BASE}${p}`); return await pg.screenshot({ type: 'jpeg', quality }); } finally { await b.close(); } };
{ const [a, b] = await Promise.all([scan('/shot-a'), scan('/shot-b')]);
  const same = (k) => a.viewports.every((v, i) => Buffer.compare(v[k], b.viewports[i][k]) === 0);
  check('a visible secret is masked in the screenshots: they equal the screenshots of the same page with the masked text typed in (every viewport, full page and top of page)', same('viewportShot') && same('screenshot') && a.viewports.length >= 2);
  const raw = await rawShot('/shot-a', a.viewports[0].width, a.viewports[0].height); check('…and they differ from an unmasked screenshot of the page (so the masking really changed the pixels)', Buffer.compare(raw, a.viewports[0].viewportShot) !== 0);
  check('…the 320px pass too', !!a.narrow && Buffer.compare(a.narrow.viewportShot, b.narrow.viewportShot) === 0 && Buffer.compare(a.narrow.screenshot, b.narrow.screenshot) === 0);
  check('…no screenshot was omitted, the scan result holds no raw canary, and it says values were hidden', a.viewports.every((v) => !v.screenshotOmitted) && noRaw(a) && a.limitations.some((l) => /secret value.* hidden in its screenshots/.test(l))); }
{ const [a, b] = await Promise.all([scan('/pseudo-a'), scan('/pseudo-b')]);
  check('a secret shown through CSS generated content (::before) is masked in the screenshots', a.viewports.every((v, i) => Buffer.compare(v.viewportShot, b.viewports[i].viewportShot) === 0 && Buffer.compare(v.screenshot, b.viewports[i].screenshot) === 0) && noRaw(a)); }
{ const raw1 = await rawShot('/sab-1', 1280, 800); const [a, b] = await Promise.all([scan('/sab-1'), scan('/sab-2')]);
  const all = (o) => [...o.viewports, ...(o.narrow ? [o.narrow] : [])];
  check('when a visible secret cannot be hidden (the page blocks the change), every screenshot is omitted and replaced by a notice', all(a).length >= 3 && all(a).every((v) => v.screenshotOmitted === true) && a.limitations.some((l) => /replaced with a notice/.test(l)));
  check('…the notice is the same image for two different pages and secrets, so it holds nothing from the page', all(a).every((v, i) => Buffer.compare(v.viewportShot, all(b)[i].viewportShot) === 0 && Buffer.compare(v.screenshot, all(b)[i].screenshot) === 0) && Buffer.compare(raw1, a.viewports[0].viewportShot) !== 0);
  check('…the scan itself still completed with its findings, and holds no raw canary', a.viewports[0].axe.violations.length + a.viewports[0].axe.passes.length > 0 && noRaw(a) && noRaw(b)); }
{ const blockers = []; const out = await scan('/blocker-a', { onBlocker: (x) => blockers.push(x) });
  check('the early phone screenshot (taken while the scan runs) is masked and carries no raw canary in its record', blockers.length >= 1 && noRaw(blockers) && blockers[0].shot.length > 1000);
  if (blockers[0]) { const raw = await rawShot('/blocker-a', blockers[0].width, blockers[0].height, 75); check('…and it differs from an unmasked screenshot of the page', Buffer.compare(raw, blockers[0].shot) !== 0); }
  const sabBlockers = []; await scan('/blocker-a', { onBlocker: (x) => sabBlockers.push(x) }); check('(repeat) the early screenshot is still masked on a second run', sabBlockers.length >= 1 && noRaw(sabBlockers)); void out; }

{ const sb = []; const out = await scan('/blocker-sab', { onBlocker: (x) => sb.push(x) });
  check('when the page blocks masking, the early phone screenshot is not recorded at all (no raw image is ever handed out)', sb.length === 0 && noRaw(sb));
  check('…the scan still finishes, every final screenshot is the notice, and nothing holds the raw canary', out.viewports.length >= 2 && out.viewports.every((v) => v.screenshotOmitted === true) && noRaw(out)); }

server.close();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
