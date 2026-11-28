// Coverage regression tests: one record per catalog rule per scan, and every coverage number and score built from those records.
// Covers the discrepancies found on scan a696bacb (81 "ran", 54 "unbuilt", 70 "human reviews", category totals that did not add up, rollups and
// zero-weight rules shown as passes, three different scores, a "cannot be used" claim resting on a closed menu, "bOOK A CALL", empty bullets).
// Run: node --experimental-strip-types test/coverage.mjs
// Optional: SCAN_COPY=<copy of the PGlite data dir> also checks the historical scan itself, read-only, through loadReport and buildView.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.PGLITE_DIR = process.env.SCAN_COPY ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avara-cov-')), 'pg');
const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { recordsFromOutcomes, recordsFromHistory, summarize, bucketOf, implementationOf, BUCKETS } = await import('../src/engines/rule-engine/RuleCoverage.ts');
const { buildCoverage } = await import('../lib/avara/coverage.ts');
const { collapsedContainer, fixCaps } = await import('../lib/avara/evidence-check.ts');
const { classify } = await import('../scanner/avara.ts');
const { lower } = await import('../analysis/avara/build.ts');
const { nonEmpty, bulletLines } = await import('../lib/bullets.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const rules = new RuleLoader(path.join(process.cwd(), 'src', 'rules')).loadAllRules();
const snapshotOf = (rs) => rs.reduce((o, r) => ({ ...o, [r.category]: (o[r.category] ?? 0) + 1 }), {});
const snap = snapshotOf(rules);
const out = (ruleId, result, method, extra = {}) => ({ ruleId, result, method, observation: '', evidence: [], confidence: 1, ...extra });
const find = (p) => rules.find(p);
const detectorRule = find((r) => implementationOf(r) === 'detector' && r.weight > 0);
const aiRule = find((r) => implementationOf(r) === 'ai_only');
const personRule = find((r) => implementationOf(r) === 'person_only');
const rollupRule = find((r) => implementationOf(r) === 'rollup');
const zeroRule = find((r) => r.weight <= 0 && implementationOf(r) !== 'rollup');
const notBuilt = find((r) => implementationOf(r) === 'not_built');

// ---- one record per catalog rule; totals reconcile to the snapshot ----
{
  const recs = recordsFromOutcomes(rules, new Map());
  const s = summarize(recs, snap);
  check('one record per catalog rule, and an empty outcome map leaves every rule unknown (never a pass, never "not run")', recs.length === rules.length && s.totals.buckets.unknown === rules.length && s.totals.ran === 0);
  check('category totals reconcile to the scan\'s catalog snapshot', s.reconciles && s.byCategory.every((c) => c.rules === snap[c.category] && Object.values(c.buckets).reduce((n, v) => n + v, 0) === c.rules));
  const short = summarize(recs.slice(1), snap);
  check('a missing record is reported, not hidden', !short.reconciles && short.problems.some((p) => /records but the snapshot has/.test(p)));
  const dup = summarize([...recs, recs[0]], snap);
  check('a duplicated record is reported', !dup.reconciles && dup.problems.some((p) => /more than one record/.test(p)));
}
// ---- "ran" needs saved execution evidence ----
{
  const recs = recordsFromOutcomes(rules, new Map([
    [detectorRule.ruleId, out(detectorRule.ruleId, 'observed_pass', 'measured')],                                  // decided, but no detector reported
    [aiRule.ruleId, out(aiRule.ruleId, 'observed_failure', 'ai_assisted')],                                          // model verdict = evidence
  ]));
  const byId = new Map(recs.map((r) => [r.ruleId, r]));
  check('a decided outcome with no detector evidence is unknown, not "ran" and not a pass', bucketOf(byId.get(detectorRule.ruleId)) === 'unknown' && byId.get(detectorRule.ruleId).execution === 'unknown');
  check('an AI verdict counts as ran, with "model" as its evidence', byId.get(aiRule.ruleId).execution === 'ran' && byId.get(aiRule.ruleId).evidence.includes('model'));
  const s = summarize(recs, snap);
  check('the ran count is exactly the records with saved evidence', s.totals.ran === recs.filter((r) => r.execution === 'ran' && r.evidence.length).length && s.totals.ran === 1);
}
// ---- rollups and zero-weight rules never become passes ----
{
  const recs = recordsFromOutcomes(rules, new Map([
    [rollupRule.ruleId, out(rollupRule.ruleId, 'observed_pass', 'rollup', { detectorsRan: ['rollup'] })],
    ...(zeroRule ? [[zeroRule.ruleId, out(zeroRule.ruleId, 'observed_pass', 'measured', { detectorsRan: ['d'] })]] : []),
  ]));
  const byId = new Map(recs.map((r) => [r.ruleId, r]));
  check('a rollup "pass" is an observation, never a pass, and never score-eligible', bucketOf(byId.get(rollupRule.ruleId)) === 'observed' && !byId.get(rollupRule.ruleId).scoreEligible);
  check('a zero-weight rule\'s "pass" is an observation, never a pass', !zeroRule || (bucketOf(byId.get(zeroRule.ruleId)) === 'observed' && !byId.get(zeroRule.ruleId).scoreEligible));
  const s = summarize(recs, snap);
  check('no observation-only record lands in passed', recs.filter((r) => r.observationOnly).every((r) => !['passed', 'passed_measurable_part'].includes(bucketOf(r))) && s.totals.buckets.passed === 0);
}
// ---- distinct skip reasons ----
{
  const pick = rules.filter((r) => implementationOf(r) === 'detector').slice(0, 3);
  const recs = recordsFromOutcomes(rules, new Map([
    ...(notBuilt ? [[notBuilt.ruleId, out(notBuilt.ruleId, 'unimplemented', 'none')]] : []),
    [aiRule.ruleId, out(aiRule.ruleId, 'not_run', 'ai_assisted', { skip: 'ai_unavailable' })],
    [pick[0].ruleId, out(pick[0].ruleId, 'not_run', 'measured', { skip: 'missing_input' })],
    [pick[1].ruleId, out(pick[1].ruleId, 'not_applicable', 'measured', { detectorsRan: ['d'] })],
    [pick[2].ruleId, out(pick[2].ruleId, 'not_run', 'measured', { skip: 'analyzer_error' })],
    [personRule.ruleId, out(personRule.ruleId, 'not_run', 'human')],
  ]));
  const r = summarize(recs, snap).totals.reasons;
  check('missing detector, unavailable AI, missing input, not applicable, analyzer error and needs-a-person are counted apart',
    (!notBuilt || r.missing_detector === 1) && r.ai_unavailable === 1 && r.missing_input === 1 && r.not_applicable === 1 && r.analyzer_error === 1 && r.needs_person === 1, JSON.stringify(r));
  const byId = new Map(recs.map((x) => [x.ruleId, x]));
  check('a skipped AI rule is "not run (AI unavailable)", not "not built"', byId.get(aiRule.ruleId).implementation === 'ai_only' && bucketOf(byId.get(aiRule.ruleId)) === 'not_run' && byId.get(aiRule.ruleId).reason === 'ai_unavailable');
}
// ---- historical scans: stored rule findings are the only execution evidence ----
{
  const stored = rules.slice(0, 5).map((r, i) => ({ id: `row${i}`, ruleId: r.ruleId, ruleVersion: '0.9', category: r.category, title: r.title, result: i === 0 ? 'observed_failure' : 'needs_human_review', method: 'ai_assisted' }));
  const recs = recordsFromHistory(rules, stored);
  const s = summarize(recs, snap);
  check('history: a rule with a stored row ran; every other rule is unknown (historical), never a pass or "not built"', s.totals.ran === 5 && s.totals.buckets.unknown === rules.length - 5 && s.totals.reasons.unknown_historical === rules.length - 5 && s.totals.buckets.passed === 0);
  check('history: the definition used at scan time is marked as not saved', recs.every((r) => r.definitionHash === null && r.origin === 'historical'));
  const extra = recordsFromHistory(rules, [...stored, { id: 'gone', ruleId: 'GONE-1', ruleVersion: '1', category: 'Gone', title: 'Removed', result: 'observed_failure', method: 'measured' }]);
  check('history: a stored row for a rule no longer in the library is kept, and it fails reconciliation instead of vanishing', extra.length === rules.length + 1 && !summarize(extra, snap).reconciles);
}
// ---- human review: tasks, sessions, findings and unique repairs are separate numbers ----
{
  const recs = recordsFromOutcomes(rules, new Map([[aiRule.ruleId, out(aiRule.ruleId, 'needs_human_review', 'ai_assisted')]]));
  const fsx = [
    { id: 'a', bucket: 'needs_review', repairKey: 'k1', ruleId: 'x', category: 'trust', severity: 'serious', goalImpact: 'hinders' },
    { id: 'b', bucket: 'needs_review', repairKey: 'k1', ruleId: 'x', category: 'trust', severity: 'serious', goalImpact: 'hinders' },
    { id: 'c', bucket: 'confirmed_failure', repairKey: 'k2', ruleId: 'x', category: 'trust', severity: 'critical', goalImpact: 'blocks' },
    { id: 'd', bucket: 'confirmed_failure', repairKey: 'k2', ruleId: 'x', category: 'trust', severity: 'critical', goalImpact: 'blocks' },
  ];
  const cov = buildCoverage({ records: recs, snapshot: snap, saved: true }, fsx, 1);
  const h = cov.human;
  check('review tasks (rules), person-only topics, session kinds, review findings and unique repairs are counted separately',
    h.reviewTasks === 1 && h.personOnlyTopics === rules.filter((r) => implementationOf(r) === 'person_only').length && h.sessionKinds.length >= 1 && h.reviewFindings === 2 && h.reviewRepairs === 1 && h.confirmedRepairs === 1 && h.repairGroups === 1, JSON.stringify(h));
}
// ---- strict scoring: withheld without the required coverage; non-eligible rules never deduct ----
{
  const cov = buildCoverage({ records: recordsFromOutcomes(rules, new Map()), snapshot: snap, saved: true }, [], 0);
  check('strict: nothing ran, so every category score and the overall score are withheld', cov.strict.overall === null && !!cov.strict.overallWithheld && cov.strict.categories.every((c) => c.score === null));
  check('strict: a saved scan proves everything it claims (no "cannot prove" notes)', cov.cannotProve.length === 0);
  const hist = buildCoverage({ records: recordsFromHistory(rules, []), snapshot: snap, saved: false }, [], 0);
  check('historical: what the scan cannot prove is listed', hist.cannotProve.length === 3 && /no saved per-rule result/.test(hist.cannotProve[0]));
}
// ---- BOOK A CALL: a closed menu is not proof that a visitor is blocked ----
{
  const closedMenu = { found: true, selector: 'a.book', text: 'BOOK A CALL', html: '', tag: 'a', rendered: true, pointerEventsNone: true, disabled: false, box: { x: 0, y: 0, width: 100, height: 40 }, width: 100, height: 40, belowFirstScreen: false, outsideX: false, sidewaysScrollPossible: false, xOverflowHidden: false, pageWidth: 320, viewportWidth: 320, visibleRatio: 0, clippedBy: 'header > div.grid.md:hidden > div.overflow-hidden', covered: true, cover: { selector: 'div.inline-block', position: 'relative', text: 'y', dismissible: false }, centerPoint: { x: 50, y: 20 } };
  const c = classify(closedMenu);
  check('a 0%-visible, tap-ignoring action inside a clipping container is flagged as unproven, not as a confirmed blocker', c.level === 'unusable' && !!c.unproven && /closed menu/.test(c.unproven));
  check('the saved measurement of scan a696bacb (visibleRatio 0, clippedBy, pointer-events none) matches the collapsed-container check', collapsedContainer({ visibleRatio: 0, clippedBy: 'div.overflow-hidden', reasons: ['It ignores taps (pointer-events: none).'] }) === 'div.overflow-hidden');
  check('a partly visible or tappable action is not excused by the check', collapsedContainer({ visibleRatio: 0.1, clippedBy: 'x', pointerEventsNone: true }) === null && collapsedContainer({ visibleRatio: 0, clippedBy: 'x', pointerEventsNone: false }) === null && !classify({ ...closedMenu, pointerEventsNone: false, visibleRatio: 0.1, covered: false, cover: null }).unproven);
  check('all-caps button text keeps its case ("BOOK A CALL", not "bOOK A CALL")', lower('BOOK A CALL') === 'BOOK A CALL' && lower('Join the waitlist') === 'join the waitlist' && fixCaps('may not be able to bOOK A CALL.') === 'may not be able to BOOK A CALL.' && fixCaps('an iPhone') === 'an iPhone');
}
// ---- empty bullets ----
check('blank, whitespace and punctuation-only bullets are removed; real ones are kept and trimmed', JSON.stringify(nonEmpty(['', '  ', '•', ' a ', null, 'b'])) === '["a","b"]');
check('fix steps lose their numbers and blank lines', JSON.stringify(bulletLines('1. Open the menu\n\n2) Click Save\n- \n')) === '["Open the menu","Click Save"]');

// ---- why a scan has no score: one honest reason per cause, never "it will move as more checks run" ----
{
  const { unscoredWhy } = await import('../lib/review-view.ts');
  const both = unscoredWhy(true, true), aiOnly = unscoredWhy(true, false), none = unscoredWhy(false, false);
  check('an unscored old scan says it predates saved results and that a rescan records them', both.length === 2 && /saved before/.test(both[0]) && /rescan/i.test(both[0]));
  check('an unscored scan with AI off says judgement checks did not run, without promising a rescan fixes it', aiOnly.length === 1 && /judgement/.test(aiOnly[0]) && !/rescan/i.test(aiOnly[0]));
  check('there is always at least one reason, and none says the score will move', none.length === 1 && [...both, ...aiOnly, ...none].every((s) => !/will move|provisional/i.test(s)));
  const src = fs.readFileSync(path.join(process.cwd(), 'components', 'report', 'ReviewBoard.tsx'), 'utf8');
  check('the board no longer shows "Provisional score" or "will move as more checks run" next to "not scored"', !/Provisional score|will move as more checks run|can move as more checks run/.test(src));
}

// ---- the historical scan itself (read-only), when a copy of its database is given ----
if (process.env.SCAN_COPY) {
  const ID = 'a696bacb-5105-451d-b363-7e47013e7352';
  const { getDb, schema } = await import('../lib/db/index.ts'); const { eq } = await import('drizzle-orm');
  const db = await getDb();
  const rowsBefore = JSON.stringify(await db.select().from(schema.findings).where(eq(schema.findings.scanId, ID)));
  const { loadReport } = await import('../lib/report.ts'); const { buildView } = await import('../lib/review-view.ts');
  const r = await loadReport(ID); const lib = r.avara.library; const cv = lib.coverage;
  check('a696bacb: 70 rules ran with saved evidence; 65 have no saved result (unknown historical)', lib.executedOnUrl === 70 && cv.buckets.unknown === 65, `${lib.executedOnUrl}/${cv.buckets.unknown}`);
  check('a696bacb: 135 records against a 135-rule snapshot, reconciling in every category', cv.records === 135 && cv.snapshotSize === 135 && cv.reconciles && cv.byCategory.every((c) => Object.values(c.buckets).reduce((n, v) => n + v, 0) === c.rules));
  check('a696bacb: no "not built" count is shown for rules that are AI-only, person-only or rollups', !lib.notRun.reasons.missing_detector && lib.notRun.total === 0 && lib.notRun.unknown === 65 && cv.implementation.not_built === 4);
  check('a696bacb: human review numbers are separate (8 review tasks, 7 person-only topics in 2 session kinds, 38 review findings in 36 unique repairs, 40 confirmed repairs)', lib.needsPerson.reviewTasks === 8 && lib.needsPerson.personOnlyTopics === 7 && lib.needsPerson.sessionKinds.length === 2 && lib.needsPerson.reviewFindings === 38 && lib.needsPerson.reviewRepairs === 36 && lib.needsPerson.confirmedRepairs === 40, JSON.stringify({ ...lib.needsPerson, ids: undefined }));
  const v = buildView(r, 'paid');
  check('a696bacb: the strict overall score is withheld on the report, the board and the API alike', lib.overall === null && v.board.overall?.score === null && r.review.overall.score === null);
  check('a696bacb: the board explains the missing score (old scan, judgement checks off) and counts categories honestly', v.board.overall?.why.some((s) => /saved before/.test(s)) && v.board.overall?.why.some((s) => /judgement/.test(s)) && v.board.overall?.assessed === 0 && v.board.overall?.total === 8 && v.board.cats.filter((c) => !c.observationsOnly).every((c) => c.missing > 0), JSON.stringify(v.board.overall?.why));
  check('a696bacb: no category shows a score without the required coverage', r.review.categories.every((c) => c.score === null) && v.board.cats.every((c) => c.score === null));
  check('a696bacb: category counts on the API are the record buckets', r.review.categories.every((c) => BUCKETS.some((b) => b in c.counts)));
  const book = r.avara.findings.filter((f) => /BOOK A CALL/.test(f.title));
  check('a696bacb: the mobile BOOK A CALL claims are shown as needing review, citing the closed menu', book.length >= 2 && book.every((f) => f.bucket === 'needs_review' && /closed menu/.test(f.summary)));
  check('a696bacb: no "bOOK" anywhere in the report', !JSON.stringify(r).includes('bOOK'));
  check('a696bacb: the stored findings are unchanged by reading the report', rowsBefore === JSON.stringify(await db.select().from(schema.findings).where(eq(schema.findings.scanId, ID))));
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
