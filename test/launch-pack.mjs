import fs from 'node:fs';
// Avara Launch Scanner integration, offline: all sixteen entries map to a real Avara rule once, every row keeps rule version, viewport, page
// state, target, evidence and outcome, a missing input keeps its specific reason, the 320px hit sample attaches to the existing main-action
// repair (never a new finding), and nothing is weighted. Uses the vendored pack's own evaluators. Run: node --experimental-strip-types test/launch-pack.mjs
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { LAUNCH_ENTRIES, entryFor } = await import('../lib/launch/registry.ts');
const { launchRows, actionHitEvidence } = await import('../lib/launch/persist.ts');
const { reviewSnapshot } = await import('../vendor/avara-launch/scanner.mjs');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const rules = new Map(ruleLoader().loadAllRules().map((r) => [r.ruleId, r]));

check('sixteen entries: nine DIFF reviews and seven launch adapters, each once', LAUNCH_ENTRIES.length === 16 && new Set(LAUNCH_ENTRIES.map((e) => e.entry)).size === 16 && LAUNCH_ENTRIES.filter((e) => e.entry.startsWith('DIFF-')).length === 9);
check('every entry names an Avara rule that exists in src/rules', LAUNCH_ENTRIES.every((e) => rules.has(e.hostRuleId)), LAUNCH_ENTRIES.filter((e) => !rules.has(e.hostRuleId)).map((e) => e.hostRuleId).join(','));
check('the pack’s A11Y-003 (button-name) is owned by A11Y-015, which lists axe button-name', entryFor({ ruleId: 'A11Y-003', detectorId: 'launch/button-name' }).hostRuleId === 'A11Y-015' && rules.get('A11Y-015').evaluator.detectors.includes('button-name'));
check('the pack’s PERF-004 (lazy LCP image) is owned by PERF-001, which lists perf/lcp-image-lazy', entryFor({ ruleId: 'PERF-004', detectorId: 'launch/lcp-image' }).hostRuleId === 'PERF-001' && rules.get('PERF-001').evaluator.detectors.includes('perf/lcp-image-lazy'));
check('every decision is reused, improved, added or blocked, and blocked ones say what input they need', LAUNCH_ENTRIES.every((e) => ['reused', 'improved', 'added', 'blocked'].includes(e.decision)) && LAUNCH_ENTRIES.filter((e) => e.decision === 'blocked').every((e) => e.needs));
check('DIFF-010 is untouched: still a rollup of DIFF-001 to DIFF-009', rules.get('DIFF-010').evaluator.type === 'rollup' && rules.get('DIFF-010').evaluator.rollsUp.length === 9);
check('the touched DIFF host rules keep their tier weight, and the pack never makes a rule score-eligible (only a recorded admission does)', ['DIFF-007', 'DIFF-009'].every((id) => rules.get(id).weight === 6) && LAUNCH_ENTRIES.every((e) => rules.get(e.hostRuleId).scoreEligible === JSON.parse(fs.readFileSync('src/rules/_admissions.json', 'utf8')).rules.some((a) => a.ruleId === e.hostRuleId)));

// A capture like the scanner's: a covered phone action, one unnamed button, a clicked-here CTA; nothing owner-supplied.
const action = (pts) => ({ selector: '#book', text: 'Book a call', points: 9, accessiblePoints: pts, language: 'en' });
const capture = (w, pts) => ({ viewport: [w, 800], headings: [{ selector: 'h1', font: 'Inter' }], errors: [], actions: [action(pts)], copy: [{ selector: 'h1', text: 'Book a call', language: 'en' }], goalMapped: true });
const axe = { violations: [{ id: 'button-name', nodes: [{ target: ['button.icon'] }] }] };
const vp = (name, w, pts) => ({ name, launch: { viewport: [w, 800], diagnostics: [], rows: reviewSnapshot({ snapshot: { viewport: [w, 800], sections: [], goals: [], alternatives: [] }, launch: { capture: capture(w, pts), axe } }), pattern: null, ms: 5, goal: { text: 'Book a call', selectors: ['#book'], alternatives: [] } } });
const out = { viewports: [vp('desktop', 1280, 9), vp('mobile', 320, 0)] };
const rows = launchRows('s1', out);
check('one row per entry per viewport (32), none for an unknown id', rows.length === 32 && new Set(rows.map((r) => r.entry + r.viewport)).size === 32, `${rows.length}`);
check('each row keeps rule version, pack version, viewport, page state and outcome', rows.every((r) => r.ruleVersion && r.packVersion && ['desktop', 'mobile'].includes(r.viewport) && r.pageState === 'initial' && r.outcome && r.reason));
const get = (e, v) => rows.find((r) => r.entry === e && r.viewport === v);
check('unnamed button: an analyzer finding with the axe target as the row’s target', get('launch/button-name', 'desktop').outcome === 'analyzer-finding' && get('launch/button-name', 'desktop').target === 'button.icon');
check('covered phone action: needs review on mobile with the action as target; desktop does not apply', get('launch/action-hit', 'mobile').outcome === 'needs-review' && get('launch/action-hit', 'mobile').target === '#book' && get('launch/action-hit', 'desktop').outcome === 'not-applicable');
check('missing inputs keep their specific reason: DIFF-001 asks for a section inventory, DIFF-006 for a reference', get('DIFF-001', 'desktop').outcome === 'not-run' && get('DIFF-001', 'desktop').needs === 'section-inventory' && get('DIFF-006', 'desktop').outcome === 'not-run' && get('DIFF-006', 'desktop').needs === 'reference' && /reference/i.test(get('DIFF-006', 'desktop').reason), `${get('DIFF-001', 'desktop').reason} / ${get('DIFF-006', 'desktop').reason}`);
check('missing brand brief: font and vocabulary did not run, and say they need the brief', ['launch/font-role', 'launch/voice'].every((e) => get(e, 'desktop').outcome === 'not-run' && get(e, 'desktop').needs === 'brand-brief'));
check('brand recall is a task for a person, not a finding', get('DIFF-003', 'desktop').outcome === 'needs-person' && get('DIFF-003', 'desktop').needs === 'visitor-test');
check('outcomes stay distinct: observed, needs-review, needs-person, not-applicable, not-run, analyzer-finding all present', ['observed', 'needs-review', 'needs-person', 'not-applicable', 'not-run', 'analyzer-finding'].every((o) => rows.some((r) => r.outcome === o)), [...new Set(rows.map((r) => r.outcome))].join(','));
const big = { viewports: [{ name: 'desktop', launch: { viewport: [1280, 800], diagnostics: [], rows: [{ ruleId: 'CONV-001', detectorId: 'launch/cta', version: '1', status: 'needs-review', reason: 'x', evidence: Array.from({ length: 40 }, (_, i) => ({ selector: '#a' + i, text: 'y'.repeat(900) })) }], pattern: null, ms: 1, goal: null } }] };
const b = launchRows('s1', big)[0];
check('evidence is bounded: at most 10 items, text at most 180 characters', b.evidence.length === 10 && b.evidence.every((e) => e.text.length <= 180));
const broken = launchRows('s1', { viewports: [{ name: 'mobile', launch: { viewport: null, diagnostics: [], rows: [], pattern: null, ms: 0, goal: null, error: 'turned off on this server (AVARA_LAUNCH=off)' } }] });
check('missing browser evidence: a pack that could not run leaves one not-run row with the reason', broken.length === 1 && broken[0].outcome === 'not-run' && /turned off/.test(broken[0].reason));

const findings = [{ id: 'f1', repairKey: 'action:book', ruleId: 'mobile/sticky-ui-interference' }, { id: 'f2', repairKey: 'a11y:button-name:x', ruleId: 'button-name' }, { id: 'f3', repairKey: 'perf:lcp', ruleId: 'perf/lcp' }];
const ev = actionHitEvidence('s1', out, findings);
check('the hit sample is attached to the existing main-action repair only, as evidence (no new finding)', ev.length === 1 && ev[0].findingId === 'f1' && ev[0].viewport === 'mobile' && ev[0].data.source === 'launch/action-hit' && ev[0].data.outcome === 'needs-review');
const pass = actionHitEvidence('s1', { viewports: [vp('desktop', 1280, 9), vp('mobile', 320, 9)] }, findings);
check('a usable phone action records an observed hit sample on the same repair', pass.length === 1 && pass[0].data.outcome === 'observed');
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
