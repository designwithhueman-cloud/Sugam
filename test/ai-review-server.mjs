// The paid AI review, end to end: real scans → saved review → rendered report, on a portfolio, a SaaS page and a service page.
// The model is SIMULATED (test/support/gemini-stub.mjs, GEMINI_STUB=review): it grades with fixed rules and quotes real page text. This proves
// the pipeline (grounding, ratings, saving, plan gating, fixes, no extra calls), not the quality of a real model's judgement.
// Server: GEMINI_STUB=review GEMINI_STUB_LOG=<file> NODE_OPTIONS="--import ./test/support/gemini-stub.mjs" AVARA_AI=on AVARA_AI_PROVIDER=gemini
//         GEMINI_API_KEY=stub ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 next start -p 3301      Run: node test/ai-review-server.mjs http://127.0.0.1:3301 <log>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base, log] = [process.argv[2] || 'http://127.0.0.1:3301', process.argv[3]]; const F = 'http://127.0.0.1:4200/review/';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const b = await chromium.launch({ channel: 'chrome' });
async function signIn(file) { const t = fs.readFileSync(file, 'utf8'); const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(base + '/login'); await p.fill('input[type=email]', t.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', t.match(/Password: (\S+)/)[1]); await p.locator('input[type=password]').evaluate((e) => e.form.requestSubmit()); await p.waitForURL('**/app**', { timeout: 30000 }); return { ctx, p }; }
async function scan(ctx, page) {
  const { id } = await (await ctx.request.post(base + '/api/scans', { headers: { origin: base }, data: { url: F + page } })).json();
  for (let i = 0; i < 400; i++) { const s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); if (s.status === 'failed') throw new Error(`${page}: ${JSON.stringify(s.error)}`); if (s.status === 'completed' && !s.aiPending) break; await new Promise((r) => setTimeout(r, 1000)); }
  return { id, rv: await (await ctx.request.get(`${base}/api/scans/${id}/review`)).json() };
}
const paid = await signIn('.data/test-account.txt'), free = await signIn('.data/test-free.txt');
const perScan = [];
const run = async (page) => { const n0 = calls().length; const r = await scan(paid.ctx, page); const used = calls().slice(n0); perScan.push({ page, calls: used.length, chars: used.reduce((n, c) => n + (c.system?.length ?? 0) + c.text.length, 0), images: used.reduce((n, c) => n + (c.images ?? 0), 0) }); return r; };
const S = await run('saas-vague.html'), P = await run('portfolio.html'), V = await run('service-blocked.html');

// ---- saved and rendered: the review covers all nine categories, ratings computed in code ----
const report = async (ctx, id) => { const pg = await ctx.newPage(); await pg.goto(`${base}/scans/${id}`); await pg.waitForSelector('[data-testid="category-summary"]'); return pg; };
const sp = await report(paid.ctx, S.id); const sHtml = await sp.content();
const aiS = await sp.evaluate(() => [...document.querySelectorAll('[data-testid="catsum-ai"]')].map((e) => e.innerText));
check('paid report: an AI review line on all nine category rows, separate from the score', aiS.length === 9 && aiS.every((t) => /AI review: (\d+\/100|not enough evidence)/.test(t) && /Separate from the score/.test(t)), aiS[0]);
// The API returns the stored review through the report; read the AI review from the rendered page's data instead of guessing.
const pc = aiS.find((t) => /AI review: 0\/100/.test(t));
check('vague SaaS hero: Product Clarity AI review is 0/100 from unmet criteria (rating calculated in code: met 1, partly 0.5, unmet 0)', !!pc, aiS.join(' | ').slice(0, 300));
check('the ungrounded point (a quote that is not on the page) is never shown as a finding', !sHtml.includes('This sentence does not exist on the page'));
// Actionable AI findings carry a fix; open one and switch through every tool: no extra model call.
const before = calls().length;
const row = sp.locator('[data-testid="issue-list"] li', { hasText: 'the headline does not say' }).first();
const hasRow = await row.count();
if (hasRow) { await sp.waitForLoadState('networkidle'); await sp.waitForTimeout(800); await row.locator('button').first().click(); await sp.waitForTimeout(300); }
// Select every tool in the open panel (a change event, as the select fires), and read the Claude prompt.
const sw = hasRow ? await row.evaluate(async (li) => { const sel = li.querySelector('[data-tool] select'); if (!sel) return { tools: [], prompt: '' }; const tools = [...sel.options].map((o) => o.value); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  for (const t of tools) { setter.call(sel, t); sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); }
  setter.call(sel, 'claude'); sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 60)); return { tools, prompt: li.querySelector('[data-tool]').textContent }; }) : { tools: [], prompt: '' };
const tools = sw.tools, prompt = sw.prompt;
check('an AI finding opens a fix in every tool (16), grounded in the page’s own words', tools.length === 16 && /Welcome to the future of work|Trusted by 10,000 teams|Learn more/.test(prompt) && /Change: /.test(prompt), `${tools.length} tools · ${prompt.replace(/\s+/g, ' ').slice(0, 260)}`);
check('switching between all 16 tools makes no additional model call', calls().length === before, `${calls().length - before} calls`);

// ---- portfolio: clear hero met, a working download CTA is not a finding, no Critical ----
const pps = P.rv.pageSummary;
check('portfolio: the working “Download CV” is not reported as a problem, and nothing is Critical', !P.rv.recommendations.some((r) => /Download CV/.test(r.title)) && pps.severity.critical === 0, P.rv.recommendations.map((r) => r.title).join(' | '));
const pp = await report(paid.ctx, P.id); const aiP = await pp.evaluate(() => [...document.querySelectorAll('[data-testid="catsum-ai"]')].map((e) => e.innerText));
const pcP = P.rv.aiReview?.categories.find((c) => c.category === 'Product Clarity');
check('portfolio: the clear hero meets the Product Clarity criteria (AI review 100/100, from met criteria)', pcP?.rating === 100 && pcP.met >= 1, JSON.stringify(pcP && { rating: pcP.rating, met: pcP.met, unmet: pcP.unmet, insufficient: pcP.insufficient }));
const pcS = S.rv.aiReview?.categories.find((c) => c.category === 'Product Clarity');
check('vague hero via the API: Product Clarity unmet, each point grounded in an exact quote from the page', pcS?.rating === 0 && pcS.items.filter((i) => i.grade === 'unmet').every((i) => i.grounding?.kind === 'quote' && i.grounding.quote === 'Welcome to the future of work'));
check('paid review covers all nine categories; insufficient evidence is excluded from ratings', S.rv.aiReview?.categories.length === 9 && S.rv.aiReview.categories.every((c) => c.decided + c.insufficient === c.items.length));

// ---- service page: a genuinely blocked CTA is the one Critical, from a measured blocker ----
const vps = V.rv.pageSummary;
check('service page: the covered “Book a call” is Critical (a measured blocker), and it is the first fix', vps.severity.critical >= 1 && /Book a call/.test(vps.firstFix?.title ?? '') && vps.firstFix.level === 'critical', `${vps.firstFix?.title} (${vps.firstFix?.level})`);
check('Critical is reserved for measured blockers: the SaaS and portfolio pages have none', S.rv.pageSummary.severity.critical === 0 && pps.severity.critical === 0);

// ---- Free: zero AI calls, same automated score, AI review withheld on the server ----
const nF = calls().length; const FS = await scan(free.ctx, 'saas-vague.html');
check('Free scan: zero AI calls', calls().length === nF, `${calls().length - nF} calls`);
check('Free: the review API returns no AI review (enforced on the server)', FS.rv.aiReview === null && FS.rv.locked === true);
check('Free: the automated page score and category scores equal the paid scan of the same page', FS.rv.pageSummary.score === S.rv.pageSummary.score && JSON.stringify(FS.rv.pageSummary.categories.map((c) => [c.code, c.score])) === JSON.stringify(S.rv.pageSummary.categories.map((c) => [c.code, c.score])), `${FS.rv.pageSummary.score} / ${S.rv.pageSummary.score}`);
const fp = await report(free.ctx, FS.id); const fHtml = await fp.content();
check('Free report: no AI review lines or findings reach the browser, and the row says AI review is part of Creator and Agency', (await fp.locator('[data-testid="catsum-ai"]').count()) === 0 && !fHtml.includes('Welcome to the future of work</span> is') && /Creator and Agency add an AI-assisted review/.test(await fp.locator('[data-testid="category-summary"]').innerText()));

// ---- token use (estimate from what was actually sent: characters / 4, plus images) ----
for (const s of perScan) console.log(`  ${s.page}: ${s.calls} model calls, ~${Math.round(s.chars / 4).toLocaleString()} input text tokens (characters ÷ 4), ${s.images} images`);
check('every paid scan made a bounded number of model calls (one per category batch, plus fix wording)', perScan.every((s) => s.calls > 0 && s.calls <= 14), perScan.map((s) => s.calls).join(', '));

await b.close();
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
