// Pure checks for the "Ready to launch?" verdict. Run: node --experimental-strip-types test/readiness.mjs
const { buildReadiness } = await import('../lib/readiness.ts');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const now = new Date('2026-11-27T12:00:00Z'), ago = (d) => new Date(now.getTime() - d * 86400000);
const hrefs = { scan: '/scan', exposure: '/exp', flows: '/flows' };
const R = (id, status, severity = null) => ({ id, title: `Check ${id}`, status, severity });
const CLEAN = () => ({ now, hrefs,
  scan: { at: ago(1), score: 88, critical: 0, high: 0, introduced: 0 },
  exposure: { at: ago(1), active: true, results: [R('a', 'pass'), R('b', 'pass')], changes: [] },
  flows: { available: true, items: [{ name: 'Sign up', status: 'passed', flaky: false, at: ago(1), regressed: false }] } });
const withIt = (patch) => buildReadiness({ ...CLEAN(), ...patch });

ok(buildReadiness(CLEAN()).level === 'ready' && /No blockers/.test(buildReadiness(CLEAN()).headline) && !/safe/i.test(buildReadiness(CLEAN()).headline), 'all clean and fresh: ready, never worded as "safe"');
ok(withIt({ scan: { ...CLEAN().scan, critical: 2 } }).level === 'stop', 'a critical scan problem stops');
ok(withIt({ scan: { ...CLEAN().scan, high: 3 } }).level === 'fix', 'high problems: fix first');
{ const r = withIt({ exposure: { ...CLEAN().exposure, results: [R('a', 'flag', 'critical'), R('b', 'pass')] } }); ok(r.level === 'stop' && r.reasons[0].area === 'exposure', 'a critical exposure problem stops'); }
{ const r = withIt({ exposure: { ...CLEAN().exposure, results: [R('a', 'flag', 'medium')] } }); ok(r.level === 'fix', 'a medium exposure problem: fix first'); }
ok(withIt({ flows: { available: true, items: [{ name: 'Save', status: 'failed', flaky: false, at: ago(1), regressed: false }] } }).level === 'stop', 'a confirmed failing flow stops');
{ const r = withIt({ flows: { available: true, items: [{ name: 'Save', status: 'passed', flaky: true, at: ago(1), regressed: false }] } }); ok(r.level === 'fix' && /only some of the time/.test(r.reasons[0].text), 'a flaky flow is "fix first", never a clean pass'); }
ok(withIt({ scan: null }).level === 'partial' && withIt({ scan: null }).areas[0].state === 'incomplete', 'no scan: not fully checked, never ready');
ok(withIt({ exposure: null }).level === 'partial', 'no launch check: not fully checked');
{ const r = withIt({ exposure: { ...CLEAN().exposure, active: false, results: [R('a', 'pass'), R('b', 'unverified')] } }); ok(r.level === 'partial' && /Confirm you own/.test(r.reasons[0].text), 'ownership not confirmed: partial, with the way forward'); }
ok(withIt({ scan: { ...CLEAN().scan, at: ago(20) } }).level === 'partial' && /20 days old/.test(withIt({ scan: { ...CLEAN().scan, at: ago(20) } }).reasons[0].text), 'a stale scan is not a pass');
ok(withIt({ flows: { available: true, items: [] } }).level === 'ready' && withIt({ flows: { available: false, items: [] } }).level === 'ready', 'no flows, or flows not on the plan, do not block a public site');
ok(withIt({ flows: { available: true, items: [{ name: 'X', status: 'running', flaky: false, at: null, regressed: false }] } }).level === 'partial', 'a flow still running keeps it partial');
ok(withIt({ flows: { available: true, items: [{ name: 'X', status: 'blocked', flaky: false, at: ago(1), regressed: false }] } }).level === 'partial', 'a blocked flow is not a pass');
// blocked flows: not fully checked, never a stop on their own, never hide an independent verified blocker
{ const note = 'Avara verified 3 steps, then stopped before ‘Buy now’ because of a safety rule. The flow outcome is unknown.';
  const blocked = { name: 'Checkout', status: 'blocked', flaky: false, at: ago(1), regressed: false, note };
  const r = withIt({ flows: { available: true, items: [blocked] } });
  ok(r.level === 'partial' && r.reasons.length === 1 && r.reasons[0].kind === 'partial' && r.reasons[0].newlyBroken !== true, 'a blocked flow alone: Not fully checked, not Stop, not newly broken');
  ok(/“Checkout” could not be verified\. Avara verified 3 steps, then stopped before ‘Buy now’/.test(r.reasons[0].text) && /by hand before launch/.test(r.reasons[0].text), 'the reason says what was verified and what to do');
  ok(r.areas.find((a) => a.area === 'flows').line === 'Not fully checked', 'the Saved flows area line says Not fully checked');
  ok(withIt({ scan: { ...CLEAN().scan, critical: 1 }, flows: { available: true, items: [blocked] } }).level === 'stop', 'a verified scan blocker elsewhere still gives Stop, with a blocked flow present');
  ok(withIt({ exposure: { ...CLEAN().exposure, results: [R('a', 'flag', 'critical')] }, flows: { available: true, items: [blocked] } }).level === 'stop', 'a verified Launch blocker elsewhere still gives Stop');
  ok(withIt({ flows: { available: true, items: [blocked, { name: 'Save', status: 'failed', flaky: false, at: ago(1), regressed: false }] } }).level === 'stop', 'another flow that really fails still gives Stop');
  ok(withIt({ scan: { ...CLEAN().scan, high: 2 }, flows: { available: true, items: [blocked] } }).level === 'fix', 'a fix-first problem outranks the blocked flow’s Not fully checked'); }
// worst wins, and newly broken comes first within a level
{ const r = buildReadiness({ ...CLEAN(), scan: { ...CLEAN().scan, high: 1, introduced: 2, critical: 0 }, exposure: { ...CLEAN().exposure, results: [R('a', 'flag', 'critical')], changes: [{ id: 'a', title: 't', outcome: 'new' }] }, flows: { available: true, items: [{ name: 'Save', status: 'failed', flaky: false, at: ago(1), regressed: true }] } });
  ok(r.level === 'stop' && r.reasons[0].kind === 'stop' && r.reasons[0].newlyBroken === true, 'worst wins, and a newly broken blocker is listed first');
  ok(r.reasons.findIndex((x) => x.kind === 'fix' && x.newlyBroken) < r.reasons.findIndex((x) => x.kind === 'fix' && !x.newlyBroken), 'within fix-first, the new breakage comes before older problems');
  ok(r.areas.length === 3 && r.areas.every((a) => a.state === 'problem'), 'each area reports its own state'); }
ok(withIt({ scan: { ...CLEAN().scan, introduced: 2 } }).reasons[0].newlyBroken === true && /changed may have broken/.test(withIt({ scan: { ...CLEAN().scan, introduced: 2 } }).reasons[0].text), 'new issues since the last scan are called out as possibly caused by a change');
ok(buildReadiness(CLEAN()).next === null && buildReadiness({ ...CLEAN(), scan: null }).next?.href === '/scan', 'next step points at the first reason, none when ready');
ok(withIt({ flows: { available: true, items: [{ name: 'New', status: 'never_run', flaky: false, at: null, regressed: false }] } }).level === 'partial', 'a flow that was never run is not a pass');
ok(!/\d/.test(withIt({ scan: { ...CLEAN().scan, high: 5 } }).detail), 'the banner makes no count that could disagree with the list');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
