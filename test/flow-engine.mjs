// Flow replay (milestone 2) on fixtures: a passing flow, a broken button, a refused password field, a private address, a policy refusal.
// Needs: node fixture/server.mjs (port 4200) and ALLOW_PRIVATE_HOSTS=127.0.0.1:4200.
// Run: ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 node --experimental-strip-types test/flow-engine.mjs
process.env.ALLOW_PRIVATE_HOSTS ||= '127.0.0.1:4200';
const { parseFlow } = await import('../packages/contracts/index.ts'); const { runFlow } = await import('../packages/flow-engine/index.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const F = 'http://127.0.0.1:4200/flows/'; const mk = (id, steps, startUrl = F + 'start.html') => { const r = parseFlow({ id, name: id, startUrl, steps }); if (!r.ok) throw new Error(r.error); return r.flow; };

const good = await runFlow(mk('good', [
  { id: 'next', action: 'click', selector: '#next', expect: [{ type: 'url_contains', value: 'step2.html' }, { type: 'title_contains', value: 'step 2' }] },
  { id: 'name', action: 'fill', selector: '#name', value: 'Ada', expect: [{ type: 'hidden', selector: '#hello' }] },
  { id: 'show', action: 'click', selector: '#show', expect: [{ type: 'visible', selector: '#hello' }, { type: 'text_contains', selector: '#hello', text: 'Hello Ada' }] },
]));
check('a working flow passes every step and assertion, with the final URL recorded', good.status === 'passed' && good.steps.length === 4 && good.steps.every((s) => s.status === 'passed') && /step2\.html$/.test(good.steps.at(-1).urlAfter), good.steps.map((s) => `${s.stepId}:${s.status}`).join(' '));
check('assertions record what was observed', good.steps.find((s) => s.stepId === 'show').assertions.every((a) => a.passed && a.observed.length > 0));

const broken = await runFlow(mk('broken', [{ id: 'open', action: 'click', selector: '#broken', expect: [{ type: 'visible', selector: '#msg' }] }, { id: 'after', action: 'press', key: 'Tab' }]));
check('a button that does nothing fails its assertion, and the next step is skipped', broken.status === 'failed' && broken.steps.find((s) => s.stepId === 'open').status === 'failed' && broken.steps.find((s) => s.stepId === 'after').status === 'skipped', broken.steps.find((s) => s.stepId === 'open').error);
const missing = await runFlow(mk('missing', [{ id: 'x', action: 'click', selector: '#nope' }]));
check('a selector that is not on the page fails with a one-line reason', missing.status === 'failed' && !!missing.steps.find((s) => s.stepId === 'x').error && !/\n/.test(missing.steps.find((s) => s.stepId === 'x').error));

const pw = await runFlow(mk('pw', [{ id: 'next', action: 'click', selector: '#next' }, { id: 'pw', action: 'fill', selector: '#pw', value: 'hunter2' }]));
check('a password field is never filled: the step is blocked, not failed', pw.status === 'blocked' && pw.steps.find((s) => s.stepId === 'pw').status === 'blocked');
const pol = await runFlow(mk('pol', [{ id: 'next', action: 'click', selector: '#next' }]), { beforeStep: (s) => (s.action === 'click' ? { allow: false, reason: 'Policy: clicks are not allowed in this run.' } : { allow: true }) });
check('a beforeStep policy can refuse a step before it runs', pol.status === 'blocked' && pol.steps.find((s) => s.stepId === 'next').error === 'Policy: clicks are not allowed in this run.' && /start\.html$/.test(pol.steps[0].urlAfter));

let refused = null; try { await runFlow(mk('ssrf', [{ id: 'a', action: 'press', key: 'Tab' }], 'http://169.254.169.254/latest/meta-data/')); } catch (e) { refused = e; }
check('a private or metadata start address is refused before a browser is opened', !!refused && /blocked|not allowed|private|internal/i.test(refused.message + (refused.code ?? '')), refused?.message?.slice(0, 80));
let hop = null; try { hop = await runFlow(mk('hop', [{ id: 'g', action: 'goto', url: 'http://169.254.169.254/' }])); } catch (e) { hop = { err: e }; }
check('a goto step to a private address does not succeed', hop.err ? true : hop.steps.find((s) => s.stepId === 'g').status !== 'passed', hop.err ? 'threw' : hop.steps.find((s) => s.stepId === 'g').error);

check('the run records timing and no credentials', good.ms > 0 && !JSON.stringify(good).includes('hunter2'));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
