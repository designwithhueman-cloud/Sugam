// 390px primary phone, focused 320px pass, and the three fix-generator corrections, through the real scanner and analysis (no server).
//   shared:     book-call-both.html      covered at 390px and 320px: one finding, evidence at both widths, one repair.
//   320 only:   book-call-320-only.html  covered at 320px only, no breakpoint in the page CSS: described, no media query, no guessed cause.
//   clean:      book-call-fixed.html     no phone finding at either width.
//   aria-label: launch/aria-safe.html (removal tested safe on a copy) and launch/aria-mismatch.html (one of two grouped links would lose its name).
// Also: rescans at the original width (legacy probes at 320px), and CSS applied to a copy and remeasured before it is labelled verified.
// Needs `node fixture/server.mjs`. Run: node --experimental-strip-types test/phone-widths.mjs
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200'; process.env.AVARA_PERF = 'off'; process.env.AVARA_LAUNCH = 'off';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts');
const { analyzeAvara } = await import('../analysis/avara/build.ts'); const { buildAvaraFix } = await import('../analysis/avara/fixes.ts');
const { verifyProbes, remeasureWithCss } = await import('../scanner/avara-verify.ts');
const F = 'http://127.0.0.1:4200/';
const bare = (p) => p.slice(p.indexOf('\n\n') + 2);
const run = async (p) => { const out = await scanUrl(F + p, 'wcag22aa', () => {}, { goal: null, perfRuns: 1 }); const a = analyze(out); return { out, a, av: analyzeAvara(out, a) }; };
const phone = (av) => av.findings.filter((f) => f.category === 'mobile' || f.rule.id.startsWith('accessibility/reflow'));

const both = await run('avara/book-call-both.html');
const mob = both.out.viewports.find((v) => v.name === 'mobile');
check('the primary phone is 390×844 with the full pass: axe run, keyboard trace and a preview screenshot', mob.width === 390 && mob.height === 844 && mob.axe.passes.length > 0 && Array.isArray(mob.keyboard) && mob.viewportShot.length > 0, `${mob.width}×${mob.height}`);
check('desktop stays 1280px', both.out.viewports.find((v) => v.name === 'desktop').width === 1280);
check('the 320px pass is focused: main action, reflow and overflow, with its own screenshot, and no axe run', both.out.narrow?.width === 320 && !!both.out.narrow.avara && both.out.narrow.screenshot.length > 0 && !('axe' in both.out.narrow) && both.out.viewports.length === 2, JSON.stringify(both.out.engine.viewports));
const st = phone(both.av).filter((f) => f.rule.id === 'mobile/sticky-ui-interference');
check('shared issue: one finding at 390px and 320px, with evidence from each width', st.length === 1 && / at 390px and 320px wide/.test(st[0].title) && ['mobile', 'narrow'].every((v) => st[0].evidence.some((e) => e.viewport === v && e.kind === 'measurement')), st.map((f) => f.title).join(' | '));
check('…the rescan probe keeps both original widths', JSON.stringify(st[0].verify.widths) === '[390,320]');
const rec = both.av.recommendations.filter((r) => r.repairKey.startsWith('action:'));
check('…the repair is listed once (the sticky and workflow findings share it)', rec.length === 1 && rec[0].findingKeys.includes('mobile-sticky') && rec[0].findingKeys.length >= 2, rec.map((r) => r.findingKeys.join('+')).join(' | '));
check('…WCAG 1.4.10 reflow comes from the 320px pass only', phone(both.av).filter((f) => f.rule.id === 'accessibility/reflow-function-loss').every((f) => f.evidence.every((e) => e.viewport === 'narrow')));
const bp = bare(st[0].fix.fixes.aiPrompt.lovable);
check('…before Avara tests it, the CSS is labelled “Suggested CSS” in the prompt and the Plain code tab', /\nSuggested CSS:\n```css\n@media \(max-width: 767\.98px\)/.test(bp) && /^Suggested CSS \(not tested by Avara\)/.test(st[0].fix.fixes.code.note), st[0].fix.fixes.code.note);

// Correction 1: apply and remeasure
const css = st[0].fix.fixes.code.after;
const pc = await remeasureWithCss(F + 'avara/book-call-both.html', css, 'Book a call', null, [320, 390]);
check('Avara applies the CSS to a copy and remeasures “Book a call” at 320px and 390px', pc.length === 2 && pc.every((r) => r.ok), JSON.stringify(pc));
const v = buildAvaraFix({ ...st[0].fixCtx, patchCheck: { css, results: pc } });
check('…so the label is generated from the result: “Verified at 320px and 390px”', /\nVerified at 320px and 390px:\n```css/.test(bare(v.fixes.aiPrompt.lovable)) && /^Verified at 320px and 390px: Avara applied it/.test(v.fixes.code.note), v.fixes.code.note.slice(0, 90));
const bad = await remeasureWithCss(F + 'avara/book-call-both.html', '.promo { opacity: 1; }', 'Book a call', null, [320, 390]);
const vb = buildAvaraFix({ ...st[0].fixCtx, patchCheck: { css, results: bad } });
check('a patch that fails the remeasure is not offered, and the reason says what Avara measured', bad.every((r) => !r.ok) && !/```/.test(bare(vb.fixes.aiPrompt.lovable)) && vb.fixes.code.after === '' && /applied this CSS to a copy of the page and remeasured/.test(vb.fixes.code.note), vb.fixes.code.note.slice(0, 120));
check('one width only verified is not enough for the label', !/Verified/.test(bare(buildAvaraFix({ ...st[0].fixCtx, patchCheck: { css, results: [pc[0]] } }).fixes.aiPrompt.lovable)));

// Correction 2: 320px only, breakpoint unknown
const only = await run('avara/book-call-320-only.html');
const o = phone(only.av); const s320 = o.find((f) => f.rule.id === 'mobile/sticky-ui-interference');
check('320px-only issue: a finding at 320px only, and the 390px phone is recorded as usable', !!s320 && / at 320px wide$/.test(s320.title) && s320.evidence.every((e) => e.viewport === 'narrow') && o.some((f) => f.bucket === 'verified_pass' && / at 390px wide$/.test(f.title)) && o.filter((f) => f.bucket === 'confirmed_failure').length === 1, o.map((f) => f.key).join(','));
const op = bare(s320.fix.fixes.aiPrompt.lovable); const oc = (op.match(/\nChange: .*/) ?? [''])[0];
check('…the fix describes the overlap and asks where it begins', /overlaps “Book a call” at 320px wide but not at 390px\. Check at which width the overlap begins/.test(oc), oc);
check('…with no media query, no code and no guessed cause', !/@media|```|position: static|fixed at small widths|breakpoint in the page/.test(op) && s320.fix.fixes.code.after === '');
check('…its screenshot evidence is the 320px pass', s320.evidence.some((e) => e.kind === 'measurement' && e.viewport === 'narrow' && e.data.box));

// Clean page
const clean = await run('avara/book-call-fixed.html');
check('clean page: no phone finding at either width; usable at 390px and 320px', !phone(clean.av).some((f) => f.bucket !== 'verified_pass') && phone(clean.av).some((f) => / at 390px and 320px wide/.test(f.title)), phone(clean.av).map((f) => f.title).join(' | '));

// Correction 3: aria-label removal
const safe = await run('launch/aria-safe.html'); const si = safe.a.issues.find((i) => i.ruleId === 'label-content-name-mismatch' || i.ruleId === 'sugam/voice-name-not-first');
check('safe removal: tested on a copy, the link is still named by its visible text, so the code is offered with that label', !!si && /\nTested on a copy of this element: without the aria-label it is named “See pricing”:\n```html\n<a id="safe-link" href="\/pricing">See pricing<\/a>/.test(bare(si.fixes.aiPrompt.lovable)) && si.fixes.code.after === '<a id="safe-link" href="/pricing">See pricing</a>', si && bare(si.fixes.aiPrompt.lovable).split('\n').slice(2, 4).join(' / '));
const mixed = await run('launch/aria-mismatch.html'); const mi = mixed.a.issues.find((i) => i.ruleId === 'label-content-name-mismatch' || i.ruleId === 'sugam/voice-name-not-first');
const mp = mi ? bare(mi.fixes.aiPrompt.lovable) : '';
check('unsafe removal: one grouped link would have no name, so no code and a manual instruction', !!mi && !/```/.test(mp) && mi.fixes.code.after === '' && /Remove the aria-label only after checking with a screen reader/.test(mp) && /would have no accessible name/.test(mi.fixes.code.note), mi?.fixes.code.note);
check('…the temporary copies were removed from the page', !mixed.out.viewports.some((x) => JSON.stringify(x.axe).includes('data-avara-namecheck')));

// Rescan at the original width, legacy included
const url = F + 'avara/book-call-fixed.html';
const [legacy, shared, hsLegacy, hsGone] = await verifyProbes(url, [{ kind: 'action', viewport: 'mobile', text: 'Book a call' }, { kind: 'action', viewport: 'mobile', width: 390, widths: [390, 320], text: 'Book a call' }, { kind: 'hscroll', viewport: 'mobile' }, { kind: 'hscroll', viewport: 'mobile', widths: [390] }], { perf: null, pageWidths: { 320: 320 } });
check('a legacy report’s phone finding is re-checked at its original 320px', legacy.outcome === 'fixed' && /^At 320px wide/.test(legacy.reason), legacy.reason.slice(0, 60));
check('a shared finding is re-checked at 390px and 320px, and Fixed only when both are', shared.outcome === 'fixed' && /At 390px wide/.test(shared.reason) && /At 320px wide/.test(shared.reason));
check('legacy sideways-scroll is compared with the rescan’s 320px pass; a width with no pass is Couldn’t verify', hsLegacy.outcome === 'fixed' && hsGone.outcome === 'could_not_verify', `${hsLegacy.outcome} / ${hsGone.outcome}`);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
