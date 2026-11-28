// Gemini provider path, in process, on a non-sensitive fixture (fixture/site/avara/book-call-bad.html). The network call to Google is answered by a
// local stub, so this proves the integration path (flag -> provider -> request -> response validation -> rule outcome), not Gemini's judgement.
// A real call needs GEMINI_API_KEY: with one set and GEMINI_LIVE=1 the last case sends one low-cost request. The key is never printed.
// Needs `node fixture/server.mjs`. Run: ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 node --experimental-strip-types test/gemini-path.mjs
process.env.ALLOW_PRIVATE_HOSTS ||= '127.0.0.1:4200';
const realKey = process.env.GEMINI_API_KEY; const live = process.env.GEMINI_LIVE === '1' && !!realKey;
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { runReview } = await import('../src/services/scan-service/index.ts');
const { createLlmClient } = await import('../src/engines/rule-engine/llm/index.ts'); const { aiEnabled } = await import('../analysis/claude.ts');
const out = await scanUrl('http://127.0.0.1:4200/avara/book-call-bad.html', 'wcag22aa', undefined, { goal: null, perf: false }); const a = analyze(out);
const real = globalThis.fetch; let seen = [];
const stub = (mode) => { seen = []; globalThis.fetch = async (url, init) => {
  const u = String(url); if (!u.startsWith('https://generativelanguage.googleapis.com/')) return real(url, init);
  seen.push({ keyInUrl: /key=/.test(u), keyHeader: !!init?.headers?.['x-goog-api-key'], model: u.split('/models/')[1]?.split(':')[0] });
  if (mode === 500) return new Response('{"error":{"message":"stub"}}', { status: 500 });
  if (mode === 400) return new Response('{"error":{"message":"API key not valid (stub)"}}', { status: 400 });
  const text = JSON.parse(init.body).contents[0].parts.map((p) => p.text || '').join('\n');
  const reply = /FAILURES \(data\)/.test(text) ? { impacts: [] } : { verdicts: JSON.parse(text.match(/RULES \(data\):\n(\[[\s\S]*?\])\n\nPAGE CONTEXT/)[1]).map((r) => r.ruleId === 'CONV-008'
    ? { ruleId: r.ruleId, result: 'fail', observation: 'Stub: the offer is not stated beside the heading.', evidence: ['Talk to a designer this week'], confidence: 0.6 }
    : { ruleId: r.ruleId, result: 'inconclusive', observation: 'Stub: not judged.', evidence: [], confidence: 0.2 }) };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] }), { status: 200 });
}; };
// A decided rule is a finding; a rule that did not run is only in the per-rule records, with its skip code, and the reason text is review.ai.reason.
const outcome = (rv, id) => { const f = rv.review?.categories.flatMap((c) => c.findings ?? []).find((x) => x.ruleId === id); if (f) return f;
  const r = rv.review?.executions?.find((x) => x.ruleId === id); return r && { result: r.outcome, method: r.method, skip: r.reason, observation: rv.review.ai?.reason ?? '' }; };
const env = (o) => { for (const k of ['AVARA_AI', 'AVARA_AI_PROVIDER', 'GEMINI_API_KEY', 'SUGAM_AI']) delete process.env[k]; Object.assign(process.env, o); };

// 1. AI off: the scan's review still finishes and says why judgement rules did not run.
env({}); const off = await runReview(out, a, null);
const offO = outcome(off, 'CONV-008');
check('AI off: the review finishes; CONV-008 is not run with the reason naming AVARA_AI', !!off.review && offO?.result === 'not_run' && /AVARA_AI is not "on"/.test(offO.observation ?? ''), offO?.observation);
env({ AVARA_AI: 'on', AVARA_AI_PROVIDER: 'gemini' }); const nokey = await runReview(out, a, null);
check('Gemini selected without a key: not run, and the reason names GEMINI_API_KEY (not the Claude key)', /GEMINI_API_KEY is not set for the Gemini provider/.test(outcome(nokey, 'CONV-008')?.observation ?? ''), outcome(nokey, 'CONV-008')?.observation);
// 2. Gemini on, stubbed answer: provider chosen, key in a header, verdict validated, judgement becomes "needs review" with a quote that is on the page.
env({ AVARA_AI: 'on', AVARA_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'stub-not-a-real-key' }); stub('ok');
check('provider selection: AVARA_AI=on + gemini gives the Gemini client', createLlmClient()?.model?.startsWith('gemini'), createLlmClient()?.model);
const on = await runReview(out, a); const o = outcome(on, 'CONV-008');
check('Gemini verdict reaches the rule outcome as needs_human_review (ai_assisted), with the quoted page text', o?.result === 'needs_human_review' && o.method === 'ai_assisted' && o.evidence.includes('Talk to a designer this week'), `${o?.result} ${o?.method}`);
check('the key travels in a header, never in the URL', seen.length > 0 && seen.every((x) => x.keyHeader && !x.keyInUrl), `${seen.length} calls`);
// 3. Provider failures: the review finishes and records why.
stub(500); const s5 = await runReview(out, a); const o5 = outcome(s5, 'CONV-008');
check('Gemini server error: the review finishes; CONV-008 did not run (AI gave no answer) with the reason, never pass or fail', !!s5.review && o5?.result === 'not_run' && o5.skip === 'ai_no_answer' && /server error/.test(o5.observation), `${o5?.result} ${o5?.skip}: ${o5?.observation}`);
check('Gemini server error: the scan records AI as not used, 0 rules judged, and why (an unanswered call is not a judgement)', s5.review.ai.used === false && s5.review.ai.rulesJudged === 0 && /server error/.test(s5.review.ai.reason ?? ''), JSON.stringify(s5.review.ai));
check('stubbed answer: AI recorded as used with the judged count', on.review.ai.used === true && on.review.ai.rulesJudged > 0, JSON.stringify(on.review.ai));
stub(400); const s4 = await runReview(out, a); const o4 = outcome(s4, 'CONV-008');
check('Gemini configuration error (bad key): the review finishes; CONV-008 is not run, marked AI unavailable, with the reason', !!s4.review && o4?.result === 'not_run' && o4.skip === 'ai_unavailable' && /model call failed/.test(o4.observation), `${o4?.result} ${o4?.skip}: ${o4?.observation}`);
globalThis.fetch = real;
// 4. One switch for both AI features.
env({ AVARA_AI: 'on' }); const both = aiEnabled(); env({ SUGAM_AI: 'on' }); const alias = aiEnabled(); env({});
check('AVARA_AI=on also turns on the fix writer; SUGAM_AI=on still works as an alias; off by default', both && alias && !aiEnabled());
// 5. Optional live call (one request, needs a real key).
if (live) { env({ AVARA_AI: 'on', AVARA_AI_PROVIDER: 'gemini', GEMINI_API_KEY: realKey }); const lv = await runReview(out, a); const lo = outcome(lv, 'CONV-008'); check('live Gemini: CONV-008 decided or recorded as undecided with a reason', !!lo && ['needs_human_review', 'observed_pass', 'inconclusive', 'not_applicable'].includes(lo.result), lo?.result); }
else console.log('SKIP  live Gemini call: no GEMINI_API_KEY (missing configuration)');
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
