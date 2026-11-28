// Every tool in "Fix it where you build" gets a working fix, built from real stored fixes (lib/fix-tools.ts). Pure; no browser or server.
//   AI builders: a ready-to-paste prompt with the element, the measured problem, the smallest change and a Check line for the builder.
//   Visual editors: only the selected editor's steps, ending with how to preview. Vercel: asks where you edit, then routes.
//   Code: the change in the framework's syntax and where it goes; "Copy patch" only for an evidence-backed edit, otherwise "Copy example";
//   the DOM locator only under Technical details; every code option says what to change.
// Run: node --experimental-strip-types test/fix-tools.mjs
const { buildFixes } = await import('../analysis/fixes.ts'); const { buildAvaraFix } = await import('../analysis/avara/fixes.ts');
const { TOOLS, fixForTool, fixesFromSet, svelteGlobal } = await import('../lib/fix-tools.ts');
const { PLATFORMS } = await import('../lib/platforms.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

check('the report offers exactly the tools the landing page lists, in four groups', JSON.stringify(TOOLS.map((t) => t.name).sort()) === JSON.stringify(PLATFORMS.map((p) => p.name).sort()) && TOOLS.length === 16, TOOLS.map((t) => t.name).join(', '));
check('AI builders: Claude, ChatGPT, Lovable, Base44, Cursor, Bolt.new and v0; editors: Shopify, Webflow, Framer; code: Next.js, React, Astro, Vue, Svelte; Vercel routes',
  ['claude', 'chatgpt', 'lovable', 'base44', 'cursor', 'bolt', 'v0'].every((id) => TOOLS.find((t) => t.id === id)?.group === 'ai') && ['shopify', 'webflow', 'framer'].every((id) => TOOLS.find((t) => t.id === id)?.group === 'editor')
  && ['nextjs', 'react', 'astro', 'vue', 'svelte'].every((id) => TOOLS.find((t) => t.id === id)?.group === 'code') && TOOLS.find((t) => t.id === 'vercel')?.group === 'route');

// 1. A gated CSS fix (target size on a Framer site: long generated selector, no confirmed selector) — the case in the report screenshot.
const target = fixesFromSet(buildFixes({ ruleId: 'target-size', html: '<a class="framer-bsJMh framer-1pN0o" href="/cv.pdf">Download CV</a>', selector: '#intro > div.framer-2lupg3 > div.framer-1uok021 > a.framer-bsJMh.framer-1pN0o', viewports: ['mobile'], source: 'axe', stable: null, failureSummary: 'x', title: 'Tap targets that are too small', count: 1 }));
for (const id of ['claude', 'chatgpt', 'lovable', 'base44', 'cursor', 'bolt', 'v0']) {
  const f = fixForTool(id, target);
  check(`${id}: Copy prompt with the element, the change and a Check line, and no Avara Verify line`, f.copyLabel === 'prompt' && f.copyText.startsWith('Element: “Download CV” link, on a phone (390px wide)') && f.hint === TOOLS.find((t) => t.id === id).prefix.replace(/:$/, '.') && /\nChange: /.test(f.copyText) && /\nCheck: At 390px wide, “Download CV”/.test(f.copyText) && !/Verify:|Rescan:/.test(f.copyText));
}
const sh = fixForTool('shopify', target), wf = fixForTool('webflow', target), fr = fixForTool('framer', target);
check('Shopify: theme editor path, the section, Custom CSS with the change, a mobile preview, then Save', sh.copyLabel === 'steps' && /Online Store, then Themes, and click Customize/.test(sh.steps[0]) && /section that contains it/.test(sh.steps[1]) && /Custom CSS/.test(sh.steps[2]) && /preview to mobile/.test(sh.steps[3]) && /Save/.test(sh.steps[4]) && /min-height: 24px/.test(sh.copyText));
check('Webflow: the Mobile portrait breakpoint, the element by name, the exact Style panel control and value, then Preview', /switch to the Mobile portrait breakpoint/.test(wf.steps[0]) && /select “Download CV”/.test(wf.steps[1]) && /under Size, set Min W to 24px and Min H to 24px/.test(wf.steps[2]) && /^Click Preview at Mobile portrait and check: At 390px wide, “Download CV”/.test(wf.steps.at(-1)) && !wf.copyText.includes('Framer'));
check('Framer: the Phone breakpoint, Layers, the Size control and value, then Preview at the measured width', /Phone breakpoint/.test(fr.steps[0]) && /In Layers, select “Download CV”/.test(fr.steps[1]) && /Min Width to 24px and Min Height to 24px/.test(fr.steps[2]) && /resize to 390px/.test(fr.steps.at(-1)) && !fr.copyText.includes('Webflow'));
const vc = fixForTool('vercel', target);
check('Vercel asks where the site is edited and routes to the v0 prompt or the code', !!vc.route && vc.route.options.map((o) => o.to).join('|') === 'v0|nextjs' && /v0/.test(vc.route.options[0].label) && /source/.test(vc.route.options[1].label));
for (const id of ['nextjs', 'react', 'astro', 'vue', 'svelte']) {
  const f = fixForTool(id, target);
  check(`${id}: an example (no confirmed selector), what to change, where it goes, and the locator only in Technical details`, f.copyLabel === 'example' && f.example && /min-width: 24px/.test(f.copyText) && !f.copyText.includes('framer-2lupg3') && /framer-2lupg3/.test(f.technical ?? '') && /24×24/.test(f.change) && /\.your-link/.test(f.where));
}
check('framework syntax: Astro uses a global style block, Vue a <style> block, Svelte wraps the selector in :global()', /<style is:global>/.test(fixForTool('astro', target).copyText) && /^<style>/.test(fixForTool('vue', target).copyText) && /:global\(\.your-link\)/.test(fixForTool('svelte', target).copyText));
check('Svelte :global() reaches into media queries and selector lists', svelteGlobal('@media (max-width: 767px) {\n  .a, .b { x: 1; }\n}') === '@media (max-width: 767px) {\n  :global(.a), :global(.b) { x: 1; }\n}');

// 2. An exact, evidence-backed patch: Copy patch.
const exact = fixesFromSet(buildFixes({ ruleId: 'target-size', html: '<a class="cv" href="/cv.pdf">Download CV</a>', selector: 'main > a.cv', viewports: ['mobile', 'desktop'], source: 'axe', stable: 'a.cv', failureSummary: 'x', title: 'Tap targets that are too small', count: 1 }));
const ex = fixForTool('react', exact);
check('a confirmed selector gives “Copy patch” with the exact rule, not an example', ex.copyLabel === 'patch' && !ex.example && /a\.cv/.test(ex.copyText), ex.copyText.replace(/\s+/g, ' '));

// 3. An HTML change: JSX for React and Next.js, markup for the others; wording only the owner can supply stays an example.
const btn = fixesFromSet(buildFixes({ ruleId: 'button-name', html: '<button class="icon-btn" type="button"><svg aria-hidden="true"></svg></button>', selector: 'header > button.icon-btn', viewports: ['desktop'], source: 'axe', stable: 'button.icon-btn', failureSummary: 'x', title: 'Buttons without a name', count: 1 }));
const rj = fixForTool('nextjs', btn), vu = fixForTool('vue', btn);
check('HTML change: JSX (className) for Next.js, markup (class) for Vue, before and after, and the [bracketed] wording explained', /className="icon-btn"/.test(rj.copyText) && /aria-label=/.test(rj.copyText) && /class="icon-btn"/.test(vu.copyText) && !!rj.code.before && /\[brackets\]/.test(rj.where) && rj.copyLabel === 'example');

// 4. An Avara recommendation seen only on phones: the example CSS is wrapped in a phone media query to adjust, and no internal note leaks.
const av = fixesFromSet(buildAvaraFix({ ruleId: 'mobile/sticky-ui-interference', action: { text: 'Book a call', selector: '#book', html: '<a id="book" href="#">Book a call</a>' }, causes: [{ kind: 'covered', detail: 'x' }], cover: { selector: 'div.promo', position: 'fixed', text: 'Bookings open' }, width: 390, widths: [390, 320], evidence: { cover: { found: true, stable: '.promo', naive: null, media: [], unreadableSheets: 0 }, seenAt: [390, 320], clearAt: [1280] } }).fixes);
const ap = fixForTool('lovable', av), an = fixForTool('nextjs', av);
check('the prompt carries no internal “no code is given” note, and its Check names the button at both widths', !/no code is given|locator, not a patch/.test(ap.copyText) && /\nChange: Find the rule/.test(ap.copyText) && /Check: At 390px and 320px wide, “Book a call” is fully on screen/.test(ap.copyText));
check('phone-only problem: the example CSS is in a phone media query marked to adjust, with the placeholder to replace', /@media \(max-width: 767px\)/.test(an.copyText) && /Adjust 767px/.test(an.copyText) && /Replace \.your-banner/.test(an.where) && an.copyLabel === 'example');

// 5. Nothing to show as code: still says what to change.
const none = fixesFromSet({ aiPrompt: { lovable: 'In Lovable chat, paste:\n\nElement: “Pricing” heading, on desktop (1280px wide). Heading levels skip from h1 to h4.\nChange: Use the next heading level (h2). Change nothing else.\nVerify: Rescan: Avara reruns the check and marks it Fixed only when it passes there.' }, noCode: { framer: [], webflow: [] }, code: { language: 'html', before: '<h4>Pricing</h4>', after: '', note: 'x' } });
const nn = fixForTool('svelte', none);
check('no snippet: the code option still says exactly what to change and where to look (Copy change)', nn.copyLabel === 'change' && /Use the next heading level \(h2\)/.test(nn.copyText) && /\.svelte component/.test(nn.where));


// Editor steps follow the change: the cover (Position), an attribute (Custom attributes / Alt text), a cause with no control (custom code).
const coverWf = fixForTool('webflow', av).steps.join(' | ');
check('a covering bar: Webflow selects the bar (not the button) and sets Position to Static at Mobile portrait', /select the bar that covers “Book a call”/.test(coverWf) && /under Position, set Position to Static/.test(coverWf) && /Mobile portrait/.test(coverWf), coverWf.slice(0, 160));
const btnWf = fixForTool('webflow', btn).steps.join(' | '), btnFr = fixForTool('framer', btn).steps.join(' | ');
check('an unnamed icon button: named by the scan’s description; Webflow adds aria-label in Custom attributes; Framer says it has no field and routes it', /select the icon button \(button\.icon-btn\) in the header/.test(btnWf) && /Custom attributes, click \+ and add Name aria-label/.test(btnWf) && /Framer has no field for aria-label/.test(btnFr));
const imgWf = fixForTool('webflow', fixesFromSet(buildFixes({ ruleId: 'image-alt', html: '<img class="hero" src="/hero.jpg">', selector: 'main > img.hero', viewports: ['desktop'], source: 'axe', stable: null, failureSummary: 'x', title: 't', count: 1 }))).steps.join(' | ');
check('an image without alt: Webflow sets Alt text in Element settings', /Element settings \(D\) and set Alt text to/.test(imgWf));
const tap = fixesFromSet(buildAvaraFix({ ruleId: 'workflow/action-cannot-be-activated', action: { text: 'Book a call', selector: '#book', html: '<a id="book" href="#">Book a call</a>' }, causes: [{ kind: 'ignored', detail: 'x' }], width: 390, widths: [390] }).fixes);
const tapWf = fixForTool('webflow', tap).steps.join(' | ');
check('a control that ignores taps: pointer-events, which the Style panel lacks, goes through Page settings custom code (not a size change)', /no control for pointer-events/.test(tapWf) && /Custom code/.test(tapWf) && !/Min W/.test(tapWf) && /pointer-events: auto/.test(fixForTool('react', tap).copyText));
const wide = fixesFromSet(buildAvaraFix({ ruleId: 'mobile/horizontal-scroll', action: { text: '', selector: 'div.timeline', html: '<div class="timeline">x</div>' }, causes: [], width: 390, widths: [390], hscroll: { widths: [{ width: 390, pageWidth: 900 }], offenders: [{ selector: 'div.timeline', html: '<div class="timeline">The reminder timeline</div>' }] } }).fixes);
const wideWf = fixForTool('webflow', wide).steps.join(' | ');
check('sideways scroll: Webflow selects the offending element by its class and sets only Max W to 100% (the table-wrapper alternative is not merged in)', /class timeline/.test(wideWf) && /Max W to 100%/.test(wideWf) && !/Overflow/.test(wideWf), wideWf.slice(0, 200));

// Rules that used to give no code now give an example, and editor steps follow the kind of change.
const mk = (ruleId, html) => fixesFromSet(buildFixes({ ruleId, title: 't', whatToChange: '', wcagText: '', pageUrl: '', selector: 'main > x.y', html, instanceCount: 1, viewports: ['desktop'], source: 'axe', stable: null }));
const aria = mk('aria-valid-attr-value', '<button class="tab" aria-controls="panel-yearly">Yearly</button>');
check('invalid ARIA reference: an example pointing it at an id that exists, in JSX for React with the comment as {/* */}', /aria-controls="\[id-of-the-target\]"/.test(fixForTool('react', aria).copyText) && /\{\/\* and on the element it points to: \*\/\}/.test(fixForTool('react', aria).copyText) && /Custom attributes, click \+ and add Name aria-controls/.test(fixForTool('webflow', aria).steps.join(' ')));
const head = mk('sugam/heading-structure', '<h4 class="t">Pricing</h4>');
check('skipped heading level: an example with h2, and Webflow changes the heading Tag in Element settings', /<h2 class="t">Pricing<\/h2>/.test(fixForTool('vue', head).copyText) && /change the heading Tag to H2/.test(fixForTool('webflow', head).steps.join(' ')));
const fake = mk('sugam/looks-clickable', '<div class="card-link">Read more</div>');
check('looks clickable: an example <button>; Webflow replaces the element with a Button (not a custom “type” attribute); Framer adds a Link', /<button type="button" class="card-link">Read more<\/button>/.test(fixForTool('svelte', fake).copyText) && /Replace it with a Button element/.test(fixForTool('webflow', fake).steps.join(' ')) && !/add Name type/.test(fixForTool('webflow', fake).steps.join(' ')) && /under Link, add a link/.test(fixForTool('framer', fake).steps.join(' ')));
check('focus off screen: a :focus-visible CSS example', /:focus-visible/.test(fixForTool('nextjs', mk('sugam/focus-offscreen', '<a class="skip" href="#main">Skip</a>')).copyText));

const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
