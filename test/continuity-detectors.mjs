// The four rules that had no detector, each on a failing and a clean fixture, through the real scanner (no server).
//   A11Y-017 a11y/error-prevention            bad.html: card form “Pay now”, no safeguard (needs review)  clean.html: “Continue to review” (pass)
//   MOB-008  mobile/navigation-accessibility  bad.html: unnamed div menu, tap only (fail)                 clean.html: APG disclosure button (pass)
//   PERF-003 perf/interaction-latency         bad.html: key handler blocks 320 ms (fail)                  clean.html: under 200 ms (pass)
//   UX-014   ux/journey-continuity            bad.html: location.replace breaks Back (fail)               clean.html: Back returns (pass)
//                                             dialog-bad.html: dialog with no way out (fail)              dialog-clean.html: Escape and Close (pass)
// Needs `node fixture/server.mjs`. Run: node --experimental-strip-types test/continuity-detectors.mjs
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200'; process.env.AVARA_PERF = 'off'; process.env.AVARA_LAUNCH = 'off';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts');
const { derivedReports } = await import('../src/services/scan-service/derived.ts');
const { ruleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const F = 'http://127.0.0.1:4200/continuity/';
const scan = async (p) => { const out = await scanUrl(F + p, 'wcag22aa', () => {}, { goal: null, perfRuns: 1 }); return { out, m: out.viewports.find((v) => v.name === 'mobile'), d: derivedReports(out) }; };
const fails = (r) => r.hits.filter((h) => h.bucket === 'confirmed_failure');
const reviews = (r) => r.hits.filter((h) => h.bucket === 'needs_review');
const clean = (r) => r.ran && !r.hits.length && !r.notApplicable && !!r.passNote;

const IDS = { 'A11Y-017': 'a11y/error-prevention', 'MOB-008': 'mobile/navigation-accessibility', 'PERF-003': 'perf/interaction-latency', 'UX-014': 'ux/journey-continuity' };
const L = ruleLoader();
for (const [rid, det] of Object.entries(IDS)) check(`${rid} names ${det} and no other rule does`, JSON.stringify(L.getRuleById(rid).evaluator.detectors) === JSON.stringify([det]) && L.loadAllRules().filter((r) => r.evaluator.detectors?.includes(det)).length === 1);

const bad = await scan('bad.html'), ok = await scan('clean.html');
check('the probes never submit a form (the bad page’s Pay now form stays unsent)', bad.m.journey?.startUrl === F + 'bad.html', bad.m.journey?.startUrl);
check('the report keeps the address the page landed on, not where the main action led (Lighthouse measures this one)', bad.out.finalUrl === F + 'bad.html' && ok.out.finalUrl === F + 'clean.html', `${bad.out.finalUrl} | ${ok.out.finalUrl}`);

// A11Y-017
const ep = bad.d['a11y/error-prevention'];
check('A11Y-017 bad: a card form with “Pay now” and no safeguard is needs-review, never a confirmed failure', reviews(ep).length === 1 && !fails(ep).length && /financial transaction/.test(ep.hits[0].title), ep.hits[0]?.title);
check('A11Y-017 clean: “Continue to review” passes, naming the safeguard', clean(ok.d['a11y/error-prevention']) && /another step first/.test(ok.d['a11y/error-prevention'].passNote));

// MOB-008
const nb = bad.d['mobile/navigation-accessibility'];
check('MOB-008 bad: the unnamed menu fails for its name', fails(nb).some((h) => /no name/.test(h.title)), nb.hits.map((h) => h.title).join(' | '));
check('MOB-008 bad: tap-only menu fails for the keyboard, and Enter was never pressed off the button', fails(nb).some((h) => /not with the keyboard/.test(h.title)) && bad.m.navMenu.focusable === false && bad.m.navMenu.openedByClick === true);
check('MOB-008 bad: missing aria-expanded and Escape are needs-review', reviews(nb).some((h) => /aria-expanded|whether the menu is open/.test(h.summary + h.title)) && reviews(nb).some((h) => /Escape/.test(h.title)));
check('MOB-008 clean: named, aria-expanded, Enter opens, Tab reaches a link, Escape closes and returns focus', clean(ok.d['mobile/navigation-accessibility']), ok.d['mobile/navigation-accessibility'].passNote);

// PERF-003
const ib = bad.d['perf/interaction-latency'];
check('PERF-003 bad: a 320 ms key handler fails against the 200 ms limit', fails(ib).length === 1 && bad.m.interaction.worst > 200, `worst ${bad.m.interaction.worst} ms`);
check('PERF-003 says it is lab interaction timing, not field INP, and never uses TBT', ib.hits[0].evidence.some((e) => /^Lab, .*not field INP/.test(e)) && !JSON.stringify(ib).match(/TBT|blocking time/i));
check('PERF-003 clean: under 200 ms passes', clean(ok.d['perf/interaction-latency']) && ok.m.interaction.worst <= 200, `worst ${ok.m.interaction.worst} ms over ${ok.m.interaction.interactions}`);

// UX-014
const jb = bad.d['ux/journey-continuity'];
check('UX-014 bad: Back after the main action does not return to the start', fails(jb).length === 1 && /Back does not return/.test(jb.hits[0].title), jb.hits[0]?.evidence.join(' / '));
check('UX-014 clean: Back returns and the main action is there again', clean(ok.d['ux/journey-continuity']));
const db = await scan('dialog-bad.html'), dc = await scan('dialog-clean.html');
check('UX-014 dialog-bad: a dialog with no Escape and no close control fails', fails(db.d['ux/journey-continuity']).some((h) => /no way out/.test(h.title)));
check('UX-014 dialog-clean: Escape closes the dialog, a Close control exists', clean(dc.d['ux/journey-continuity']) && dc.m.journey.closeControl === 'Close');

// Not applicable, with the reason
check('MOB-008 not applicable when links are shown directly (no collapsed menu), with the count', /2 navigation links are shown directly/.test(db.d['mobile/navigation-accessibility'].notApplicable ?? ''));
check('A11Y-017 not applicable when no form is covered by SC 3.3.4', /does not apply/.test(db.d['a11y/error-prevention'].notApplicable ?? ''));
// A skip link is hidden off-screen until focused by design: it is never chosen as the main action (W3C BAD pages made it the first fix).
const sk = await scanUrl('http://127.0.0.1:4200/avara/skip-link.html', 'wcag22aa', () => {}, { goal: null, perfRuns: 1 });
const picks = sk.viewports.map((v) => v.avara?.candidates[0]?.candidate.text);
check('a “Skip to main content” link is never the main action; “Start free” is, on desktop and phone', picks.every((t) => t === 'Start free') && !sk.viewports.some((v) => v.avara?.candidates.some((c) => /^skip/i.test(c.candidate.text))), JSON.stringify(picks));
// Older scans: did not run, with a specific reason, never a pass
const old = { ...ok.out, viewports: ok.out.viewports.map((v) => { const { navMenu, interaction, journey, ...rest } = v; return rest; }) };
const od = derivedReports(old);
check('older scans without these captures report “did not run” with a reason, never a pass', ['mobile/navigation-accessibility', 'perf/interaction-latency', 'ux/journey-continuity'].every((k) => od[k].ran === false && /added after the scan was made/.test(od[k].note)));

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
