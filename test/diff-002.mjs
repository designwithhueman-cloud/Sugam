// DIFF-002 hero-layout comparison (Avara detector pack, prototype-1). Diagnostic only: it ranks reference heroes by matching geometry groups, is
// stored per scan and never changes DIFF-002's outcome, weight or score eligibility. Unit cases are the pack's own; the browser cases scan the pack's
// pages (fixture/site/diff002/) and use browser-measured references. Needs `node fixture/server.mjs`.
// Run: ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 node --experimental-strip-types test/diff-002.mjs   (WRITE_FIXTURES=1 rewrites the demo references)
import fs from 'node:fs';
process.env.ALLOW_PRIVATE_HOSTS ||= '127.0.0.1:4200';
const { compareHero, loadReferences, heroParams } = await import('../src/services/scan-service/hero-layout.ts');
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const set = (records) => ({ version: 'test', validated: false, source: 'test', records });

// ---- the pack's unit cases (hand-authored geometry) ----
const F = { stack: { headingX: 0.5, headingY: 0.13, actionX: 0.5, actionY: 0.32, visualX: 0.5, visualY: 0.65, visualWidth: 0.88, visualHeight: 0.4 }, split: { headingX: 0.24, headingY: 0.43, actionX: 0.24, actionY: 0.58, visualX: 0.75, visualY: 0.5, visualWidth: 0.41, visualHeight: 0.4 } };
const refs = Object.entries(F).map(([id, features]) => ({ id, origin: 'Hand-authored geometry fixture', rights: 'Original fixture', viewport: [1280, 800], features }));
const s = (k) => ({ viewport: [1280, 800], features: { ...F[k] } });
for (const [sample, expected] of [['stack', 'stack'], ['split', 'split']]) {
  const r = compareHero(s(sample), set(refs));
  check(`unit: ${sample} ranks ${expected} first with all 3 groups, the other below 3, weight 0, unpublished`, r.candidates[0].referenceId === expected && r.candidates[0].matchedGroups === 3 && r.candidates[1].matchedGroups < 3 && r.publish === false && r.weight === 0);
}
for (const [name, sample, rs] of [['missing capture', null, refs], ['no references', s('stack'), []], ['missing measurements', { ...s('stack'), features: {} }, refs], ['different viewport', { ...s('stack'), viewport: [320, 720] }, refs], ['unknown provenance', s('stack'), refs.map((r) => ({ ...r, rights: '' }))]])
  check(`unit: ${name} is not run`, compareHero(sample, set(rs)).status === 'not-run');

// ---- rule data: extended in place, still diagnostic and unscored ----
const rule = new RuleLoader().loadAllRules().find((r) => r.ruleId === 'DIFF-002'); const p = heroParams();
check('DIFF-002 carries the pack parameters (prototype-1, tolerance 0.08, 3 groups), carries its tier weight (6), is not admitted for scoring (no confirmed-failure fixture), and stays advisory', p.version === 'prototype-1' && p.positionTolerance === 0.08 && p.minimumGroups === 3 && p.publish === false && rule.weight === 6 && rule.scoreEligible === false && rule.advisory === true);
check('DIFF-002 outcome still comes only from diff/default-styling (the comparison is not a detector of the rule)', JSON.stringify(rule.evaluator.detectors) === '["diff/default-styling"]');
check('DIFF-001 still owns section order', new RuleLoader().loadAllRules().find((r) => r.ruleId === 'DIFF-001').evaluator.detectors.includes('diff/template-sequence'));

// ---- browser: the pack's pages, scanned by the real scanner ----
const { scanUrl } = await import('../scanner/scanner.ts'); const { HERO_LAYOUT } = await import('../scanner/avara-inpage.ts');
const { buildWebsiteContext } = await import('../src/services/scan-service/index.ts'); const { analyze } = await import('../analysis/analyze.ts');
const base = process.env.FIX || 'http://127.0.0.1:4200/diff002/';
const cap = {}; let anyOut = null;
for (const name of ['stack', 'split', 'rebrand', 'lookalike', 'covered']) { const out = await scanUrl(base + name + '.html', 'wcag22aa', undefined, { goal: null, perf: false }); cap[name] = out.viewports.find((v) => v.name === 'desktop').pageContext?.heroLayout; anyOut ||= out; }
check('browser capture: heading, main action and lead visual found in each clean page', ['stack', 'split', 'rebrand', 'lookalike'].every((n) => cap[n]?.elements?.heading === 'h1' && cap[n].elements.action === 'button' && cap[n].elements.visual === 'figure' && cap[n].actionSource), JSON.stringify(cap.rebrand?.elements));
check('browser capture: the main action under a fixed bar is dropped, with the reason', !('actionX' in (cap.covered?.features ?? {})) && cap.covered?.notes?.some((n) => /covered|not inside/.test(n)), cap.covered?.notes?.join(' | '));
const demo = 'fixture/site/diff002/references.json';
const measured = { version: 'demo-1', validated: false, purpose: 'Demo references for tests only: the pack\'s synthetic pages measured in Chromium by test/diff-002.mjs. Not production data.', records: ['stack', 'split'].map((id) => ({ id, origin: `fixture/site/diff002/${id}.html`, rights: 'Original synthetic Avara pack fixture', viewport: cap[id].viewport, features: cap[id].features })) };
if (process.env.WRITE_FIXTURES) fs.writeFileSync(demo, JSON.stringify(measured, null, 2) + '\n');
const stored = loadReferences(demo);
const close = stored.records.every((r) => Object.entries(r.features).every(([k, v]) => Math.abs(v - measured.records.find((m) => m.id === r.id).features[k]) < 0.005));
check('the stored demo references match a fresh browser measurement', close);
const reb = compareHero(cap.rebrand, stored), look = compareHero(cap.lookalike, stored), cov = compareHero(cap.covered, stored);
check('browser: the recoloured, reworded stack ranks stack first with all 3 groups; split below 3', reb.status === 'diagnostic' && reb.candidates[0].referenceId === 'stack' && reb.candidates[0].matchedGroups === 3 && reb.candidates[1].matchedGroups < 3, reb.candidates?.map((c) => `${c.referenceId}:${c.matchedGroups}`).join(' '));
check('browser: the split look-alike ranks split first with all 3 groups; stack below 3', look.candidates[0].referenceId === 'split' && look.candidates[0].matchedGroups === 3 && look.candidates[1].matchedGroups < 3, look.candidates?.map((c) => `${c.referenceId}:${c.matchedGroups}`).join(' '));
check('browser: with the action dropped there are too few groups, so nothing is compared', cov.status === 'not-run', cov.reason);
check('the production reference set is empty and unvalidated, so a real scan compares nothing', (() => { const prod = loadReferences(); return prod.source === 'production' && prod.records.length === 0 && !prod.validated && compareHero(cap.rebrand, prod).status === 'not-run'; })());
check('the capture is kept out of what rules and models read', !('heroLayout' in buildWebsiteContext(anyOut, analyze(anyOut), null, []).metadata));
check('the hero capture only reads (no click, submit, focus or navigation)', !/\.click\(|\.submit\(|\.focus\(|location\.(href|hash)\s*=|dispatchEvent|scrollTo|scrollIntoView/.test(HERO_LAYOUT));
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
