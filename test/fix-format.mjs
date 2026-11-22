// Every builder fix in three short parts: Element (exact element: label or asset name, section, viewport, and the measurement or missing
// property), Change (the smallest edit, naming the property; what to inspect first when meaning decides; code only when safe as written),
// Verify (the same element, state and viewport: what Avara can confirm, plus one manual check when meaning or interaction needs judgement).
// Checked on every accessibility recipe and every repair recipe, with a long generated selector. Run: node --experimental-strip-types test/fix-format.mjs
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { buildFixes, FIX_RULES } = await import('../analysis/fixes.ts');
const { buildAvaraFix } = await import('../analysis/avara/fixes.ts');
const { applyChanges, rubricFor } = await import('../analysis/claude.ts');
const LONG = 'html > body > div:nth-child(3) > main > section:nth-child(2) > div > div:nth-child(4) > button';
const bare = (p) => p.slice(p.indexOf('\n\n') + 2);
const parts = (t) => t.split('\n');
function shape(t) {
  const L = parts(t); const e = L[0], c = L[1], v = L[L.length - 1]; const mid = L.slice(2, -1);
  // A code block is preceded by its label line (Suggested CSS, Verified at …, Tested on a copy …).
  const codeOk = !mid.length || (/:$/.test(mid[0]) && mid[1]?.startsWith('```') && mid[mid.length - 1] === '```');
  return { ok: e.startsWith('Element: ') && c.startsWith('Change: ') && v.startsWith('Verify: ') && codeOk && L.filter((l) => /^(Element|Change|Verify): /.test(l)).length === 3, e, c, v, label: mid[0] ?? null, code: mid.slice(2, -1).join('\n') };
}
const BANNED = [/\[[^\]\n]*\]/, /^Fix: /m, /nth-child/, /(\S+\s>\s){3}/, /\bcomplian/i, /\b(conversions?|revenue|sales|sign-ups)\b/i, /Keep the visual design/];
const problems = (t) => BANNED.filter((re) => re.test(t)).map(String);

// Accessibility recipes
const input = (ruleId) => ({ ruleId, title: ruleId, whatToChange: '', wcagText: 'WCAG 1.1.1', pageUrl: 'https://x.example/', selector: LONG, html: '<button type="button"><svg aria-hidden="true"></svg></button>', instanceCount: 1, viewports: ['desktop', 'mobile'], source: ruleId.startsWith('sugam/') ? 'heuristic' : 'axe', detail: 'Fix any of the following:\n  Element does not have inner text that is visible to screen readers', data: { fgColor: '#999999', bgColor: '#ffffff', contrastRatio: 2.85, expectedContrastRatio: '4.5:1' } });
const bad = [];
for (const id of [...FIX_RULES, 'some-unknown-rule']) {
  const t = bare(buildFixes(input(id)).aiPrompt.lovable); const s = shape(t); const p = problems(t);
  if (!s.ok || p.length) bad.push(`${id}: ${!s.ok ? 'shape' : ''} ${p.join(' ')}`);
}
check(`all ${FIX_RULES.length + 1} accessibility fixes have exactly Element, Change, (code), Verify, with no placeholders, long selectors, “Fix:” title, compliance or business claims`, !bad.length, bad.slice(0, 4).join(' | '));

const btn = shape(bare(buildFixes({ ...input('button-name'), selector: 'main > p > button.icon' }).aiPrompt.lovable));
check('Element names the element, section and viewport, with what is missing', /^Element: The icon button \(button\.icon\) in the main content, on desktop \(1280px wide\) and on a phone \(390px wide\)\. It has no accessible name/.test(btn.e), btn.e);
check('a long generated selector is never shown, even when the element has no label', !/nth-child|>/.test(shape(bare(buildFixes(input('button-name')).aiPrompt.lovable)).e));
check('Change tells the builder what to inspect when meaning decides, then the edit, once', /^Change: First check what the button does when used, then name that action\. Then add that as visible text, or as an aria-label/.test(btn.c) && (btn.c.match(/aria-label/g) ?? []).length === 1, btn.c);
check('no code when the only patch would need a placeholder (the button name)', !btn.code);
check('Verify rechecks the same element at the recorded viewport and adds one manual check for meaning', /^Verify: Rescan: Avara reruns the axe-core “button-name” check on this icon button at 1280px wide, on the page as it first loads, and marks it Fixed only when it passes there\. Manual check: With a screen reader/.test(btn.v), btn.v);
const img = shape(bare(buildFixes({ ...input('image-alt'), html: '<img src="/assets/team-photo.jpg?w=800">', selector: 'header > img' }).aiPrompt.lovable));
check('an image is named by its asset file name, in its section', /^Element: “team-photo\.jpg” image in the header/.test(img.e), img.e);
const con = shape(bare(buildFixes({ ...input('color-contrast'), html: '<p class="muted">Free for 14 days</p>', selector: 'main > p.muted', instanceCount: 3 }).aiPrompt.lovable));
check('contrast: the measurement is in Element only, the change names the property and a verified colour', /measures 2\.85:1; it needs 4\.5:1/.test(con.e) && !/2\.85/.test(con.c) && /the color property/.test(con.c) && /and 2 more like it/.test(con.e) && /shared component/.test(con.c), `${con.e} / ${con.c}`);
check('contrast: no confirmed selector, so no code (a short-looking selector is not enough)', !con.code);
const conOk = buildFixes({ ...input('color-contrast'), html: '<p class="muted">Free for 14 days</p>', selector: 'main > p.muted', stable: 'p.muted' });
check('contrast: with a selector confirmed unique in the captured state, CSS labelled “Suggested CSS” (untested) in the prompt and the Plain code tab', /^p\.muted \{\n  color: #[0-9a-f]{6};/.test(shape(bare(conOk.aiPrompt.lovable)).code) && shape(bare(conOk.aiPrompt.lovable)).label === 'Suggested CSS:' && conOk.code.after === shape(bare(conOk.aiPrompt.lovable)).code && /^Suggested CSS \(not tested by Avara\): p\.muted matches only this element/.test(conOk.code.note), conOk.code.note);
const tsz = buildFixes({ ...input('sugam/text-spacing'), html: '<p class="note">x</p>', selector: 'main > p.note', stable: 'p.note', viewports: ['mobile'] });
check('a width-dependent CSS fix seen at one width only gets no code, even with a confirmed selector', !shape(bare(tsz.aiPrompt.lovable)).code && tsz.code.after === '' && /390px wide only/.test(tsz.code.note), tsz.code.note);
const nm = buildFixes({ ...input('button-name'), selector: 'main > p > button.icon' });
check('Plain code tab: a patch that needs wording (aria-label) has no “after”; the captured markup stays as the locator', nm.code.after === '' && nm.code.before.includes('<button') && /wording only you can supply/.test(nm.code.note), nm.code.note);
const mm = buildFixes({ ...input('label-content-name-mismatch'), html: '<a href="/p" aria-label="Pricing plans">See pricing</a>', selector: 'main > a.p' });
check('aria-label removal not tested on a copy: no code, a manual instruction', mm.code.after === '' && /Remove the aria-label only after checking with a screen reader/.test(bare(mm.aiPrompt.lovable)), mm.code.note);
const mt = buildFixes({ ...input('label-content-name-mismatch'), html: '<a href="/p" aria-label="Pricing plans">See pricing</a>', selector: 'main > a.p', nameCheck: { safe: true, name: 'See pricing', reason: 'without the aria-label it is named “See pricing”' } });
check('aria-label removal tested safe on a copy: paste-ready, labelled with the result, in the prompt and the Plain code tab', mt.code.after === '<a href="/p">See pricing</a>' && shape(bare(mt.aiPrompt.lovable)).label === 'Tested on a copy of this element: without the aria-label it is named “See pricing”:' && /^Tested on a copy/.test(mt.code.note), mt.code.note);
const { breakpointFor, parseMedia, whyNoCss } = await import('../analysis/fix-format.ts');
const R = (media, value, prop = 'position') => ({ media, prop, value });
const bp = (rules, seenAt = [320], clearAt = [1280]) => breakpointFor(rules, { prop: 'position', problem: /^(fixed|sticky)$/, seenAt, clearAt });
check('breakpoint: the page’s min-width rule that clears it gives its complement', bp([R(null, 'fixed'), R('(min-width: 768px)', 'static')])?.query === '@media (max-width: 767.98px)');
check('breakpoint: the page’s max-width rule that causes it is used as written', bp([R('screen and (max-width: 600px)', 'fixed')])?.query === '@media screen and (max-width: 600px)');
check('breakpoint: a rule that does not separate 320 from 1280 is not evidence', bp([R('(min-width: 200px)', 'static')]) === null && bp([R('(max-width: 2000px)', 'fixed')]) === null);
check('breakpoint: em, orientation and “or” conditions are not guessed at', bp([R('(min-width: 48em)', 'static')]) === null && bp([R('(orientation: landscape)', 'static')]) === null && parseMedia('(min-width: 768px), print') === null);
check('breakpoint: no page rule and an overlap at 320px only means no breakpoint, so no CSS', bp([R(null, 'fixed')]) === null);
check('breakpoint: seen at every captured width needs none (an unconditional rule)', bp([R(null, 'fixed')], [320, 1280], [])?.query === null);
check('whyNoCss: two elements sharing the class are named as the reason', /2 elements match \.promo/.test(whyNoCss({ found: true, stable: null, naive: { selector: '.promo', count: 2 }, media: [], unreadableSheets: 0 }, 'n/a')));
check('contrast: with a long generated selector, no code is given', !shape(bare(buildFixes({ ...input('color-contrast'), html: '<p>x</p>' }).aiPrompt.lovable)).code);
const kb = shape(bare(buildFixes({ ...input('sugam/keyboard-trap'), source: 'keyboard', viewports: ['mobile'], html: '<div id="widget" tabindex="0"></div>', selector: 'main > div#widget' }).aiPrompt.lovable));
check('a check Avara cannot re-run says so, and gives a manual check at the same width', /Avara cannot recheck this automatically yet/.test(kb.v) && /Manual check: At 390px wide, press Tab/.test(kb.v), kb.v);
check('the observation is not repeated in Change (each fact once)', /Pressing Tab does not move focus away/.test(kb.e) && !/Pressing Tab does not move focus away/.test(kb.c));

// Repair recipes
const a = { text: 'Book a call', selector: 'html > body > main > button#book', html: '<button id="book">Book a call</button>' };
const reps = [
  ['covered', { ruleId: 'mobile/sticky-ui-interference', action: a, causes: [{ kind: 'covered', detail: '' }], cover: { selector: 'html > body > div.promo', position: 'fixed' }, width: 320 }],
  ['clipped', { ruleId: 'mobile/primary-action-unusable', action: a, causes: [{ kind: 'clipped', detail: '' }], clippedBy: 'div.row', width: 320 }],
  ['hidden', { ruleId: 'mobile/primary-action-missing', action: a, causes: [{ kind: 'hidden', detail: '' }], width: 320 }],
  ['small', { ruleId: 'mobile/primary-action-inconvenient', action: a, causes: [{ kind: 'small', detail: '' }], width: 320 }],
  ['no response', { ruleId: 'workflow/action-no-response', action: a, causes: [], width: 1280 }],
  ['first field', { ruleId: 'workflow/first-field-unreachable', action: a, causes: [], width: 1280, workflow: { reason: 'it is covered by the header', outcome: 'form_not_reached' } }],
  ['lazy LCP', { ruleId: 'perf/lcp-image-lazy', action: { text: 'main content', selector: 'img', html: '' }, causes: [], width: 0, perf: { lcpElement: { selector: 'main > img.hero', snippet: '<img class="hero" src="/hero.webp" loading="lazy" alt="Our team">' }, value: 4200 } }],
  ['unsized', { ruleId: 'perf/cls-unsized-images', action: { text: 'images', selector: 'img', html: '' }, causes: [], width: 0, perf: { unsized: [{ selector: 'img', snippet: '<img src="/a.png">' }], value: 0.31 } }],
  ['blocking', { ruleId: 'perf/lcp', action: { text: 'main content', selector: 'body', html: '' }, causes: [], width: 0, perf: { renderBlocking: [{ url: 'https://cdn.example.com/app.js', wastedMs: 640 }] } }],
  ['covered, long cover selector', { ruleId: 'mobile/sticky-ui-interference', action: { ...a, selector: LONG }, causes: [{ kind: 'covered', detail: '' }], cover: { selector: LONG, position: 'fixed' }, width: 320 }],
];
const rbad = [];
for (const [n, c] of reps) { const f = buildAvaraFix(c); const t = bare(f.fixes.aiPrompt.lovable); const s = shape(t); const p = problems(t); if (!s.ok || p.length) rbad.push(`${n}: ${s.ok ? '' : 'shape '}${p.join(' ')}`); }
check(`all ${reps.length} repair fixes have the three parts, with no placeholders, long selectors or claims`, !rbad.length, rbad.join(' | '));
const cov = shape(bare(buildAvaraFix(reps[0][1]).fixes.aiPrompt.lovable));
check('covered button: Element has the measurement (what sits on its centre), Change the property, Verify the same width and state', /^Element: “Book a call” button in the main content, on a phone \(320px wide\)\. At its centre div\.promo \(position: fixed\)/.test(cov.e) && /position to static|position: static/.test(cov.c) && !cov.code && /at 320px wide, the width it was found at, on the page as it first loads/.test(cov.v) && /Manual check: On a phone, tap “Book a call”/.test(cov.v), cov.e);
check('covered button with a long generated cover selector: no code, and the selector is not shown', !shape(bare(buildAvaraFix(reps[9][1]).fixes.aiPrompt.lovable)).code && !/nth-child/.test(bare(buildAvaraFix(reps[9][1]).fixes.aiPrompt.lovable)));
const nr = shape(bare(buildAvaraFix(reps[4][1]).fixes.aiPrompt.lovable));
check('meaning-dependent repair: Change says what to inspect first, and Verify states what the rescan requires', /^Change: First check what “Book a call” should do/.test(nr.c) && /reaches a form’s first field/.test(nr.v), nr.v);
const lz = shape(bare(buildAvaraFix(reps[6][1]).fixes.aiPrompt.lovable));
check('lazy LCP image: named by its alt, measured property and timing in Element, safe code in Change', /“Our team” image \(img\.hero\)/.test(lz.e) && /loading="lazy"/.test(lz.e) && /4\.2 s/.test(lz.e) && /fetchpriority="high"/.test(lz.code) && !/loading="lazy"/.test(lz.code));
check('unsized images: the placeholder patch is not given', !shape(bare(buildAvaraFix(reps[7][1]).fixes.aiPrompt.lovable)).code);

// The AI step may change only the Change sentence
const issue = { ruleId: 'button-name', bucket: 'confirmed_failure', severity: 'serious', whatToChange: '', instances: [{ selector: 'main > button.icon', html: '<button class="icon"></button>' }], fixes: buildFixes({ ...input('button-name'), selector: 'main > p > button.icon' }) };
const before = bare(issue.fixes.aiPrompt.lovable); applyChanges([{ issue, rubric: rubricFor('button-name') }], { issues: [{ id: 0, change: 'Add aria-label="Search invoices" so the button says what it does.' }] });
const after = shape(bare(issue.fixes.aiPrompt.lovable)), b0 = shape(before);
check('after the AI step: Element and Verify unchanged, Change reworded, Avara’s closing instruction kept', after.e === b0.e && after.v === b0.v && after.c === 'Change: Add aria-label="Search invoices" so the button says what it does. Change nothing else.', after.c);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
