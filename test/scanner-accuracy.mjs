// Scanner accuracy checks against the fixture site: node test/scanner-accuracy.mjs
// Needs `node fixture/server.mjs` (port 4200). Two directions: a tricky but accessible page must NOT
// raise the false-positive classes found in the real-site audit, and the planted defects must still be found.
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200';
const { scanUrl } = await import('../scanner/scanner.ts');
const { analyze } = await import('../analysis/analyze.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const rules = (a) => a.issues.filter((i) => i.bucket !== 'verified_pass').map((i) => `${i.ruleId}:${i.bucket}:${i.instances.length}`);

const good = analyze(await scanUrl('http://127.0.0.1:4200/accurate.html', 'wcag22aa'));
const gr = rules(good);
for (const [rule, why] of [['sugam/non-semantic-clickable', 'a wrapper around a real link or button'], ['sugam/looks-clickable', 'a wrapper around a real control'], ['sugam/focus-not-visible', 'a ring inside a web component, or added a frame late by a script'], ['sugam/duplicate-cta-label', 'the same destination twice, or a button and a link sharing a label']])
  check(`accessible page: no "${rule}" for ${why}`, !gr.some((r) => r.startsWith(rule)), gr.filter((r) => r.startsWith(rule)).join(' '));
check('accessible page: nothing confirmed at all', !good.issues.some((i) => i.bucket === 'confirmed_failure'), gr.filter((r) => r.includes('confirmed')).join(' '));

const bad = analyze(await scanUrl('http://127.0.0.1:4200/', 'wcag22aa')); const br = rules(bad).join(' ');
for (const need of ['aria-valid-attr-value:confirmed', 'button-name:confirmed', 'image-alt:confirmed', 'sugam/non-semantic-clickable:confirmed_failure:3', 'sugam/focus-not-visible:confirmed', 'sugam/duplicate-cta-label:needs_review:3', 'sugam/reflow-320:confirmed', 'label-content-name-mismatch:confirmed', 'sugam/aria-tablist:confirmed', 'video-caption:needs_review', 'sugam/media-transcript:needs_review', 'sugam/keyboard-trap:needs_review'])
  check(`planted defect still found: ${need}`, br.includes(need));
const contrast = rules(bad).filter((r) => r.startsWith('color-contrast:needs_review')).length;
check('unmeasurable contrast is grouped by reason, not one item per element', contrast <= 3, `${contrast} review items`);

// WCAG 2.2 extras axe-core does not run. The accessible page must stay clean; the planted page must raise each one.
const EXTRA_RULES = ['sugam/image-of-text', 'sugam/form-autocomplete-missing', 'sugam/form-input-type', 'sugam/form-required-not-marked', 'sugam/form-error-not-linked', 'sugam/form-label-not-visible', 'sugam/form-group-name', 'sugam/small-text', 'sugam/autofocus', 'sugam/new-tab-warning', 'sugam/heading-structure', 'sugam/no-main-landmark', 'sugam/vague-link-text', 'sugam/placeholder-only-label', 'sugam/autoplay-no-pause', 'sugam/voice-name-not-first', 'sugam/forced-colors-optout', 'sugam/non-text-contrast', 'sugam/text-spacing', 'sugam/dragging-alternative', 'sugam/positive-tabindex', 'sugam/auth-paste-blocked', 'sugam/auth-autocomplete-off', 'sugam/auth-captcha', 'sugam/focus-context-change'];
for (const rule of EXTRA_RULES) check(`accessible page: no "${rule}" on look-alikes`, !gr.some((r) => r.startsWith(rule)), gr.filter((r) => r.startsWith(rule)).join(' '));
const extra = analyze(await scanUrl('http://127.0.0.1:4200/extra-bad.html', 'wcag22aa')); const er = rules(extra).join(' ');
for (const need of ['sugam/non-text-contrast:needs_review', 'sugam/text-spacing:needs_review', 'sugam/dragging-alternative:needs_review:2', 'sugam/positive-tabindex:needs_review', 'sugam/auth-paste-blocked:confirmed_failure', 'sugam/auth-autocomplete-off:needs_review', 'sugam/auth-captcha:needs_review'])
  check(`planted defect found: ${need}`, er.includes(need), er.split(' ').filter((r) => r.startsWith('sugam/')).join(' '));
const ada = rules(analyze(await scanUrl('http://127.0.0.1:4200/extra-bad.html', 'ada_title_ii'))).join(' ');
check('WCAG 2.2-only rules (2.5.7, 3.3.8) are left out for ADA Title II (WCAG 2.1)', !/sugam\/(dragging-alternative|auth-)/.test(ada) && ada.includes('sugam/non-text-contrast'), ada.split(' ').filter((r) => r.startsWith('sugam/')).join(' '));
const fc = rules(analyze(await scanUrl('http://127.0.0.1:4200/focus-change.html', 'wcag22aa'))).join(' ');
check('Tab that navigates away is a confirmed 3.2.1 failure', fc.includes('sugam/focus-context-change:confirmed_failure'), fc);

// Checks aimed at AI-built sites: every one must fire on the div-soup page, and none on the accessible page above.
const ai = analyze(await scanUrl('http://127.0.0.1:4200/ai-builder-bad.html', 'wcag22aa')); const air = rules(ai).join(' ');
for (const need of ['sugam/small-text', 'sugam/autofocus', 'sugam/new-tab-warning', 'sugam/heading-structure', 'sugam/no-main-landmark', 'sugam/vague-link-text', 'sugam/placeholder-only-label', 'sugam/autoplay-no-pause', 'sugam/voice-name-not-first', 'sugam/forced-colors-optout', 'sugam/image-of-text', 'sugam/form-autocomplete-missing', 'sugam/form-input-type', 'sugam/form-required-not-marked', 'sugam/form-label-not-visible', 'sugam/form-group-name'])
  check(`AI-builder defect found: ${need}`, air.includes(need), air.split(' ').filter((r) => r.startsWith('sugam/')).join(' '));
check('image of text found for both the headline and the button picture', ai.issues.filter((i) => i.ruleId === 'sugam/image-of-text').reduce((n, i) => n + i.instances.length, 0) === 2, air);
check('form error not linked is found', air.includes('sugam/form-error-not-linked'), air);
check('heading structure reports a missing h1 and a skipped level', ai.issues.filter((i) => i.ruleId === 'sugam/heading-structure').map((i) => i.title).sort().join('|') === 'Heading levels skipped|The page has no main heading', ai.issues.filter((i) => i.ruleId === 'sugam/heading-structure').map((i) => i.title).join('|'));
check('a second h1 is reported', er.includes('sugam/heading-structure'), er);
const f = results.filter((r) => !r).length; console.log(f ? `\n${f} FAILED` : '\nAll passed'); process.exit(f ? 1 : 0);
