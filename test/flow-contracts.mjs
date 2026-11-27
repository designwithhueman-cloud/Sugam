// Flow contracts (milestone 1), offline: what a valid flow is, and that bad flows are refused with a one-line reason.
// Run: node --experimental-strip-types test/flow-contracts.mjs
const { parseFlow, FlowRun } = await import('../packages/contracts/index.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const ok = { id: 'f1', name: 'Open details', startUrl: 'https://example.com/', steps: [{ id: 's1', action: 'click', selector: '#go', expect: [{ type: 'visible', selector: '#panel' }] }, { id: 's2', action: 'fill', selector: '#q', value: 'hello' }] };
check('a valid flow parses, and assertions default to none', parseFlow(ok).ok && parseFlow(ok).flow.steps[1].expect.length === 0);
check('duplicate step ids are refused', !parseFlow({ ...ok, steps: [ok.steps[0], { ...ok.steps[0] }] }).ok && /Duplicate step id/.test(parseFlow({ ...ok, steps: [ok.steps[0], { ...ok.steps[0] }] }).error));
check('an unknown action is refused (no free-form scripts)', !parseFlow({ ...ok, steps: [{ id: 'x', action: 'evaluate', script: 'alert(1)' }] }).ok);
check('a flow with no steps, or more than 30, is refused', !parseFlow({ ...ok, steps: [] }).ok && !parseFlow({ ...ok, steps: Array.from({ length: 31 }, (_, i) => ({ id: `s${i}`, action: 'press', key: 'Tab' })) }).ok);
check('a start address that is not a URL is refused', !parseFlow({ ...ok, startUrl: 'not a url' }).ok);
check('there is no credential field: a fill step with a password property is stripped, not stored', (() => { const r = parseFlow({ ...ok, steps: [{ id: 'p', action: 'fill', selector: '#pw', value: 'x', password: 'secret' }] }); return r.ok && !('password' in r.flow.steps[0]); })());
check('the error is one readable line with the path', /^steps\.0\./.test(parseFlow({ ...ok, steps: [{ id: '', action: 'click', selector: '#a' }] }).error));
check('a run record rejects an unknown status', !FlowRun.safeParse({ flowId: 'f', status: 'weird', startedAt: 'x', ms: 1, steps: [], consoleErrors: [], failedRequests: [] }).success);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
