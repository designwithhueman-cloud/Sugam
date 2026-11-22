// Report first, AI after; and the early blocker. Against a server started with the Gemini stub (no key, no quota):
//   GEMINI_STUB=ok GEMINI_STUB_DELAY=4000 NODE_OPTIONS="--import ./test/support/gemini-stub.mjs" AVARA_AI=on AVARA_AI_PROVIDER=gemini GEMINI_API_KEY=stub \
//   ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 next start -p 3301        (and `node fixture/server.mjs`)
// Run: node test/report-first.mjs [baseUrl] [ok|fail]   ("fail": the server runs with GEMINI_STUB=400)
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:3301'; const mode = process.argv[3] || 'ok';
const dir = new URL('../fixture/site/avara/', import.meta.url).pathname; const live = dir + 'early-live.html';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
try {
  fs.copyFileSync(dir + 'book-call-bad.html', live);
  await p.goto(base + '/'); const t0 = Date.now();
  const r = await ctx.request.post(base + '/api/scans', { headers: { origin: base, 'content-type': 'application/json' }, data: { url: 'http://127.0.0.1:4200/avara/early-live.html', standard: 'wcag22aa' } });
  const id = (await r.json()).id; const seen = {}; let st;
  for (let i = 0; i < 400; i++) {
    st = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); const t = Date.now() - t0;
    if (st.early && seen.early == null) { seen.early = t; seen.earlyStatus = st.status; seen.earlyBody = st.early; }
    if (st.status === 'completed' && seen.done == null) { seen.done = t; seen.pendingAtDone = st.aiPending; }
    if (st.status === 'completed' && st.aiPending === false) { seen.ai = t; break; }
    if (st.status === 'failed') break; await new Promise((x) => setTimeout(x, 700));
  }
  const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
  console.log(`timeline: blocker ${s(seen.early ?? NaN)} (scan ${seen.earlyStatus}), report ${s(seen.done ?? NaN)}, AI done ${s(seen.ai ?? NaN)}`);
  const e = seen.earlyBody;
  check('a covered "Book a call" is revealed while the scan is still running', seen.early != null && seen.earlyStatus !== 'completed' && seen.early < seen.done);
  check('the early blocker carries its evidence and a fix for each builder', !!e && /Book a call/.test(e.title) && e.evidence.length >= 1 && /covered/.test(e.evidence[0]) && ['lovable', 'bolt', 'v0', 'cursor'].every((k) => /Book a call/.test(e.prompts[k] ?? '')), e?.title);
  check('free (anonymous) scan: no screenshot URL, and the screenshot route answers 402', e?.shotUrl === null && (await ctx.request.get(`${base}/api/scans/${id}/early-shot`)).status() === 402);
  check('the report is complete before the AI review: status completed with AI pending', seen.done != null && seen.pendingAtDone === true && seen.ai > seen.done, `report ${s(seen.done)}, AI ${s(seen.ai)}`);
  await p.goto(`${base}/scans/${id}`); const first = await p.getByTestId('primary').innerText();
  check('the full report leads with the same blocker', /Book a call/.test(first));
  check('once the AI review is done the "still running" note is gone', (await p.getByTestId('ai-pending').count()) === 0);
  const rv = await (await ctx.request.get(`${base}/api/scans/${id}/review`)).json(); const conv = rv.categories.flatMap((c) => c.findings).find((f) => f.ruleId === 'CONV-008');
  await p.getByTestId('why-not-run').first().locator('summary').click().catch(() => {}); const reasons = await p.getByTestId('not-run-row').evaluateAll((els) => els.map((x) => x.dataset.reason));
  check('no rule is left "AI still checking" after the AI review', !reasons.includes('ai_pending'), [...new Set(reasons)].join(','));
  if (mode === 'ok') check('the AI judgement replaced the pending record (stub verdict: needs review)', conv?.result === 'needs_human_review' && rv.ai.used === true, `${conv?.result}`);
  else check('provider failure: the AI rules say why they did not run (model call failed), the report is intact', !conv && reasons.includes('ai_unavailable') && rv.ai.used === false && /model call failed/.test(rv.ai.reason ?? ''), rv.ai.reason);
} finally { fs.rmSync(live, { force: true }); await b.close(); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
