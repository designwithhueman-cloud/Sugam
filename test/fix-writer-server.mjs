// The AI fix writer through the real product, against a server started with the Gemini stub (test/support/gemini-stub.mjs).
// Mode is the server's GEMINI_STUB_FIX (ok | bad) or GEMINI_STUB=500; pass the same word here. GEMINI_STUB_LOG must point at the file given.
// Run: node test/fix-writer-server.mjs <baseUrl> <ok|bad|500|off> [stubLog]
import fs from 'node:fs';
import { chromium } from 'playwright';
const [base, mode, log] = [process.argv[2], process.argv[3] || 'ok', process.argv[4]]; const F = 'http://127.0.0.1:4200';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  [${mode}] ${n}${x ? '  ' + x : ''}`); };
const c = fs.readFileSync('.data/test-account.txt', 'utf8'); const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + '/login'); await p.fill('input[type=email]', c.match(/Email: (\S+)/)[1]); await p.fill('input[type=password]', c.match(/Password: (\S+)/)[1]); await p.press('input[type=password]', 'Enter'); await p.waitForURL(/\/app/);
if (log) fs.writeFileSync(log, '');
const t0 = Date.now(); const { id } = await (await ctx.request.post(base + '/api/scans', { headers: { origin: base }, data: { url: F + '/launch/unnamed-button.html', goal: 'Book a demo' } })).json();
let done = null, fixDone = null, atDone = null;
for (;;) { const s = await (await ctx.request.get(`${base}/api/scans/${id}`)).json(); if (s.status === 'completed' && done == null) { done = Date.now() - t0; atDone = s; } if (done != null && !s.fixPending) { fixDone = Date.now() - t0; break; } if (s.status === 'failed') break; if (Date.now() - t0 > 240000) break; await new Promise((r) => setTimeout(r, 300)); }
check('the report completed', done != null, `report ${(done / 1000).toFixed(1)} s, fix wording settled ${(fixDone / 1000).toFixed(1)} s`);
if (mode !== 'off') check('the report did not wait for the fix writer (it was still pending when the report completed)', atDone?.fixPending === true);
const html = await (await ctx.request.get(`${base}/scans/${id}`)).text(); const unesc = html.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\u0026/g, '&');
const prompts = [...unesc.matchAll(/In Lovable chat, paste:\n\n([\s\S]*?)"/g)].map((m) => m[1]); const named = prompts.filter((x) => /button/i.test(x) && /name/i.test(x));
const stubbed = prompts.filter((x) => /Stub \(copy-tone\)/.test(x));
if (mode === 'ok') {
  check('Gemini on: the button-name fix carries the model’s Change wording', stubbed.length >= 1, `${stubbed.length} of ${prompts.length} prompts`);
  check('…and keeps Avara’s Element and Verify lines', stubbed.length >= 1 && stubbed.every((x) => /(^|\n)Element: /.test(x) && /\nVerify: /.test(x) && /\nChange: Stub/.test(x)));
  check('…no other fix was reworded (technical fixes stay deterministic)', prompts.filter((x) => /Stub/.test(x)).length === stubbed.length);
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); const fixCall = calls.find((x) => /FIXES \(data\):/.test(x.text));
  check('one fix-writer call, sent only the copy-tone rubric', !!fixCall && /Rubric "copy-tone"/.test(fixCall.system) && !/visual-hierarchy/.test(fixCall.system), `${calls.length} model calls in total`);
  check('…with the visitor goal, the untrusted-data rule, no screenshot and no keyboard trace', /VISITOR GOAL: Book a demo/.test(fixCall.text) && /untrusted content/.test(fixCall.system) && fixCall.images === 0 && !/keyboard/i.test(fixCall.text));
  check('…and the scanned markup only inside the PAGE DATA block', /<<<PAGE[\s\S]*PAGE>>>/.test(fixCall.text) && !/<button/.test(fixCall.text.split('<<<PAGE')[0]));
} else {
  check(`${mode}: no fix carries model wording`, stubbed.length === 0 && prompts.length > 0, `${prompts.length} prompts`);
  check(`${mode}: the fixes still have Element and Verify`, named.length >= 1 && named.every((x) => /(^|\n)Element: /.test(x) && /\nVerify: /.test(x)));
}
const rv = await (await ctx.request.get(`${base}/api/scans/${id}/review`)).json();
check('the detector outcome is the same whatever the AI did: A11Y-015 is a measured failure', rv.categories.flatMap((x) => x.findings).find((f) => f.ruleId === 'A11Y-015')?.result === 'observed_failure');
console.log(`TIMING ${mode} report=${(done / 1000).toFixed(1)}s fixSettled=${(fixDone / 1000).toFixed(1)}s`);
await b.close(); const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
