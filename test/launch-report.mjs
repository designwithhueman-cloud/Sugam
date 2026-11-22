// Launch report release check, through the browser and the API of a running server: one score result on every surface, Free/Paid parity,
// issues counted once across widths, the phone layout, two concurrent scans with interrupted polling, and a reload that resumes the same scan.
// Signs in with the local test accounts (.data/test-account.txt = Agency Pro, .data/test-free.txt = Free); passwords are read, never printed.
// Needs `node fixture/server.mjs` and a server started with ALLOW_PRIVATE_HOSTS=127.0.0.1:4200. Run: node test/launch-report.mjs http://localhost:3100
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:3100'; const F = 'http://127.0.0.1:4200/';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const creds = (f) => { const t = fs.readFileSync(f, 'utf8'); return { email: t.match(/Email: (\S+)/)[1], pw: t.match(/Password: (\S+)/)[1], slug: t.match(/Slug: (\S+)/)?.[1] ?? (f.includes('free') ? 'free-test' : 'test-agency') }; };
const b = await chromium.launch({ channel: 'chrome' });
async function signIn(file) {
  const c = creds(file); const ctx = await b.newContext(); const page = await ctx.newPage();
  await page.goto(base + '/login'); await page.fill('input[type=email]', c.email); await page.fill('input[type=password]', c.pw);
  await page.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await page.waitForURL('**/app**', { timeout: 30000 });
  return { ctx, page, slug: c.slug };
}
const retry = async (fn, n = 4) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= n) throw e; await new Promise((r) => setTimeout(r, 800)); } } };
const start = (ctx, url) => retry(async () => { const r = await ctx.request.post(base + '/api/scans', { data: { url, standard: 'wcag22aa' } }); if (r.status() !== 202) throw new Error(`POST /api/scans ${r.status()} ${await r.text()}`); return (await r.json()).id; });
const json = (ctx, id) => retry(async () => (await ctx.request.get(`${base}/api/scans/${id}`)).json());
async function done(ctx, id, ms = 240000) { const t = Date.now(); for (;;) { const r = await json(ctx, id); if (r.status === 'completed' || r.status === 'failed') return { ...(await retry(async () => (await ctx.request.get(`${base}/api/scans/${id}/review`)).json())), status: r.status }; if (Date.now() - t > ms) throw new Error(`scan ${id} still ${r.status}`); await new Promise((x) => setTimeout(x, 1500)); } }
const strip = (ps) => JSON.parse(JSON.stringify(ps, (k, v) => (k === 'id' ? undefined : v)));
// What Free and Paid must share: score, category rows, totals and which fix comes first. The AI writer may still be rewording the first fix's
// Change line, and AI observations can arrive at different times on two separate scans, so those two are reported, not compared.
const core = (ps) => ps && { score: ps.score, contributing: ps.contributing, scorable: ps.scorable, issues: ps.issues, fixes: ps.fixes, categories: ps.categories, first: ps.firstFix && { title: ps.firstFix.title, category: ps.firstFix.category, level: ps.firstFix.level } };

const paid = await signIn('.data/test-account.txt'); const free = await signIn('.data/test-free.txt');

// ---- two concurrent scans, one with polling interrupted, one reloaded mid-scan ----
const posts = []; paid.ctx.on('request', (r) => { if (r.method() === 'POST' && /\/api\/scans$/.test(r.url())) posts.push(r.url()); });
const t0 = Date.now();
const [idA, idB] = await Promise.all([start(paid.ctx, F + 'admission/A11Y-001-fail.html'), start(paid.ctx, F + 'continuity/bad.html')]);
const before = posts.length;
const pa = await paid.ctx.newPage(); const pb = await paid.ctx.newPage();
await Promise.all([pa.goto(`${base}/scans/${idA}`), pb.goto(`${base}/scans/${idB}`)]);
await pa.waitForTimeout(2500);
const midA = (await json(paid.ctx, idA)).status;
await paid.ctx.setOffline(true); await pa.waitForTimeout(5000); await paid.ctx.setOffline(false);   // polling fails for 5 s on both tabs
await pb.reload();                                                                                  // and one tab is reloaded mid-scan
await Promise.all([pa.waitForSelector('[data-testid="scorecard"]', { timeout: 240000 }), pb.waitForSelector('[data-testid="scorecard"]', { timeout: 240000 })]);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
check('two concurrent scans both complete after polling was cut for 5 s and one tab was reloaded', pa.url().endsWith(idA) && pb.url().endsWith(idB), `${elapsed}s wall time, A was “${midA}” when the network dropped`);
check('…the retry resumed the same scans: no page posted a new scan', posts.length === before, `${posts.length - before} extra POST /api/scans`);
const A = await done(paid.ctx, idA), Bj = await done(paid.ctx, idB);
check('…and each scan id kept its own page (no cross-over)', A.url?.includes('A11Y-001-fail') && Bj.url?.includes('continuity/bad'), `${A.url} | ${Bj.url}`);

// ---- one scoring result: report API, report page, export, dashboard ----
const ps = A.pageSummary; const acc = ps?.categories.find((c) => c.code === 'accessibility');
check('API: page score 87 (Accessibility 100 × 66 ÷ 76), one of eight categories contributed', ps?.score === 87 && ps.contributing === 1 && ps.scorable === 8 && acc?.score === 87 && acc.scoredRules === 10, JSON.stringify({ score: ps?.score, contributing: ps?.contributing, acc: acc && { score: acc.score, scoredRules: acc.scoredRules } }));
check('API: the nine categories are ordered by confirmed issues, highest first', ps.categories.length === 9 && ps.categories.every((c, i, a) => i === 0 || a[i - 1].issues >= c.issues), ps.categories.map((c) => `${c.code}:${c.issues}`).join(' '));
check('API: the other categories say why there is no number; Differentiation is observation only', ps.categories.filter((c) => c.code !== 'accessibility' && c.code !== 'differentiation').every((c) => c.status === 'insufficient' && /Insufficient coverage/.test(c.note)) && ps.categories.find((c) => c.code === 'differentiation').status === 'observation');
check('API: “Fix this first” is the rank-1 fix and its category row is marked', !!ps.firstFix && ps.firstFix.id === A.recommendations[0]?.id && ps.categories.filter((c) => c.firstFix).length === 1 && ps.categories.find((c) => c.firstFix).code === ps.firstFix.category, `${ps.firstFix?.title} (${ps.firstFix?.category})`);
check('API: issues and grouped fixes are counted separately', Number.isInteger(ps.issues) && Number.isInteger(ps.fixes) && ps.issues >= ps.fixes && ps.fixes >= 1, `${ps.issues} issues, ${ps.fixes} fixes`);
const ui = await pa.locator('[data-testid="scorecard"]').innerText();
check('report page: “Page score: 87/100” and the same issue total', /Page score: 87\s*\/100/.test(ui) && (await pa.locator('[data-testid="total-issues"]').innerText()).trim() === String(ps.issues), ui.split('\n').slice(0, 3).join(' | '));
const rows = await pa.locator('[data-testid="catsum-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')));
check('report page: nine category rows in the API order, with the first fix linked from its category', JSON.stringify(rows) === JSON.stringify(ps.categories.map((c) => c.code)) && (await pa.locator(`[data-testid="catsum-row"][data-code="${ps.firstFix.category}"] [data-testid="catsum-first"]`).count()) === 1);
await pa.locator('[data-testid="catsum-first"]').click(); await pa.waitForTimeout(400);
check('…the link lands on the first fix', await pa.evaluate(() => { const r = document.getElementById('first-h')?.getBoundingClientRect(); return !!r && r.top >= -5 && r.top < innerHeight; }));
const csv = await (await paid.ctx.request.get(`${base}/api/scans/${idA}/export?format=summary`)).text();
check('export: the summary CSV carries the same page score and nine rows', /^Page,scored,87,/m.test(csv) && csv.trim().split('\n').length === 11 && /^Accessibility,scored,87,/m.test(csv), csv.split('\n')[1]);
const sarif = await (await paid.ctx.request.get(`${base}/api/scans/${idA}/export?format=sarif`)).json();
check('export: SARIF carries the same page summary', sarif.runs[0].properties.avaraPageSummary?.score === 87 && JSON.stringify(strip(sarif.runs[0].properties.avaraPageSummary)) === JSON.stringify(strip(ps)));
await paid.page.goto(`${base}/app/${paid.slug}/quick-scans`); const qs = await paid.page.locator('main').innerText();
check('dashboard: the quick-scans list shows the same score for this scan', new RegExp(`\\b87\\b`).test(qs), qs.match(/.{0,40}A11Y-001-fail.{0,60}/)?.[0] ?? '');

// ---- Free/Paid parity ----
const idF = await start(free.ctx, F + 'admission/A11Y-001-fail.html'); const Fj = await done(free.ctx, idF);
const diff = (x, y) => Object.keys({ ...x, ...y }).filter((k) => JSON.stringify(x?.[k]) !== JSON.stringify(y?.[k]));
check('Free gets the same page score, category breakdown and totals as Paid', JSON.stringify(core(Fj.pageSummary)) === JSON.stringify(core(ps)), `free ${Fj.pageSummary?.score} / paid ${ps.score}; differs in: ${diff(strip(Fj.pageSummary), strip(ps)).join(', ') || 'nothing'}${diff(strip(Fj.pageSummary), strip(ps)).includes('firstFix') ? ' → ' + JSON.stringify(diff(Fj.pageSummary.firstFix, ps.firstFix)) : ''}`);
const fr = Fj.recommendations; const fixParts = (r) => (r.fixes ?? []).map((x) => x.content).join('\n');
check('Free: the first fix is complete (Element / Change / Verify), every other fix is locked on the server', Fj.locked === true && /Element:[\s\S]*Change:[\s\S]*Verify:/.test(fixParts(fr[0])) && fr.slice(1).every((r) => r.fixLocked && !r.fixes), `${fr.length} fixes, ${fr.slice(1).filter((r) => r.fixLocked).length} locked`);
check('Paid: every fix is open', !A.locked && A.recommendations.every((r) => !r.fixLocked && r.fixes?.length));
check('Free: exports stay a paid feature (402)', (await free.ctx.request.get(`${base}/api/scans/${idF}/export?format=summary`)).status() === 402);
const pf = await free.ctx.newPage(); await pf.goto(`${base}/scans/${idF}`); await pf.waitForSelector('[data-testid="category-summary"]');
check('Free report page shows the same score and nine rows', /Page score: 87\s*\/100/.test(await pf.locator('[data-testid="scorecard"]').innerText()) && (await pf.locator('[data-testid="catsum-row"]').count()) === 9);

// ---- the same issue at two widths counts once ----
const idD = await start(paid.ctx, F + 'avara/book-call-both.html'); const D = await done(paid.ctx, idD); const dps = D.pageSummary;
const sticky = D.findings.filter((f) => f.ruleId === 'mobile/sticky-ui-interference');
const confirmed = D.findings.filter((f) => f.bucket === 'confirmed_failure');
check('a banner covering “Book a call” at 390px and 320px is one finding with evidence from both widths', sticky.length === 1 && ['mobile', 'narrow'].every((v) => sticky[0].viewports?.includes(v)), JSON.stringify(sticky.map((f) => f.viewports)));
check('…and the page total counts it once: category rows add up to the total, and no finding is counted twice', dps.categories.reduce((n, c) => n + c.issues, 0) === dps.issues && dps.issues >= 1, `${dps.issues} issues in ${dps.fixes} fixes; ${confirmed.length} confirmed findings`);

const [idMP, idMF] = await Promise.all([start(paid.ctx, F + 'index.html'), start(free.ctx, F + 'index.html')]); const [MP, MF] = await Promise.all([done(paid.ctx, idMP), done(free.ctx, idMF)]);
check('Free/Paid parity on a page with many fixes: same score, rows and totals', JSON.stringify(core(MF.pageSummary)) === JSON.stringify(core(MP.pageSummary)), `${MF.pageSummary.issues}/${MP.pageSummary.issues} issues, ${MF.pageSummary.fixes} fixes, score ${MF.pageSummary.score}/${MP.pageSummary.score}`);
const mfr = MF.recommendations;
check('…Free gets the rank-1 fix complete and every other fix locked on the server; Paid gets all', mfr.length >= 2 && /Element:[\s\S]*Change:[\s\S]*Verify:/.test(fixParts(mfr[0])) && mfr.slice(1).every((r) => r.fixLocked && !r.fixes) && MP.recommendations.every((r) => !r.fixLocked && r.fixes?.length), `${mfr.length} fixes, ${mfr.slice(1).filter((r) => r.fixLocked).length} locked`);

// ---- phone layout ----
const pm = await paid.ctx.newPage(); await pm.setViewportSize({ width: 390, height: 844 }); await pm.goto(`${base}/scans/${idA}`); await pm.waitForSelector('[data-testid="category-summary"]');
const lay = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, rows: [...document.querySelectorAll('[data-testid="catsum-row"]')].map((r) => r.getBoundingClientRect()).filter((r) => r.right > innerWidth + 1 || r.left < -1).length }));
check('phone (390px): the report, scorecard and category rows fit without sideways scrolling', lay.sw <= lay.w && lay.rows === 0, JSON.stringify(lay));
await pm.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/report-390.png` : '/dev/null', fullPage: false }).catch(() => {});

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
