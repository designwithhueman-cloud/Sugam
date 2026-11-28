// When an AI model refines a fix, the builder prompt keeps Avara's structure: Fix, Element, the model's Change, and the Verify line that the
// fix panel turns into "How to check it". A free-form model prompt (no Verify line, wrong element) must not replace it. Pure; no browser.
// Run: node --experimental-strip-types test/fix-enrichment.mjs
const { apply } = await import('../analysis/claude.ts');
const { buildFixes } = await import('../analysis/fixes.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const input = { ruleId: 'image-alt', title: 'Images must have alternate text', whatToChange: 'Add alt text.', wcagText: 'WCAG 1.1.1', pageUrl: 'http://127.0.0.1:4200/', selector: 'main > img.hero', html: '<img class="hero" src="/a.png">', instanceCount: 1 };
const issue = { ruleId: input.ruleId, severity: 'serious', whatToChange: input.whatToChange, fixes: buildFixes(input) };
const before = issue.fixes.aiPrompt.lovable;
check('the built prompt has Element, Change and Verify lines', /\nElement: /.test(before) && /\nChange: /.test(before) && /\nVerify: /.test(before));
check('the built prompt names Avara, not Sugam', !/Sugam/.test(before));
const n = apply([issue], { issues: [{ id: 0, severity: 'serious', severity_reason: 'x', what_to_change: 'Describe the product photo in the alt attribute,\n  for example alt="Blue running shoe".', ai_builder_prompt: 'Make every image accessible. Thanks!', framer_steps: [], webflow_steps: [], code_after: '' }] });
const after = issue.fixes.aiPrompt;
check('the enrichment was applied', n === 1 && issue.aiEnriched === true);
check('every tool prompt keeps Element and Verify after the AI step', Object.values(after).every((p) => /\nElement: /.test(p) && /\nVerify: /.test(p)));
check('the Change line carries the model wording, on one line', Object.values(after).every((p) => /\nChange: Describe the product photo in the alt attribute, for example alt="Blue running shoe"\.( Change nothing else\.)?\n/.test(p)));
check('the free-form model prompt does not replace the structured one', Object.values(after).every((p) => !/Make every image accessible/.test(p)));
check('each tool keeps its own paste instruction', /^In Lovable/.test(after.lovable) || after.lovable.split('\n\n')[0] === before.split('\n\n')[0]);
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
