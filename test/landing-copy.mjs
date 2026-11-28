// The landing page and the Flows page say what happens when a safety rule stops a flow. Run: node test/landing-copy.mjs
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const SENTENCE = 'If a safety rule stops a flow, Avara shows which steps passed and what still needs checking.';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
ok(read('components/landing/LaunchCheck.tsx').includes(SENTENCE), 'the landing page has the safety-rule sentence');
ok(read('components/dashboard/FlowsPanel.tsx').includes(SENTENCE), 'the Flows page has the same sentence');
ok(!/Blocked by safety rules/.test(read('components/dashboard/FlowsPanel.tsx')), 'the old “Blocked by safety rules” label is gone from the Flows page');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
