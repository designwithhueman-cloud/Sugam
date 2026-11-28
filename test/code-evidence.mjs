// Paste-ready CSS only with evidence, through the real scanner and analysis in a browser (no server):
//   book-call-both.html       one .promo covering at 390px and 320px, and the page's own @media (min-width: 768px) rule makes it static: CSS, scoped to that breakpoint.
//   book-call-shared-promo    a second banner also uses .promo: no selector picks out only the covering one, so no CSS; the banner is named.
//   book-call-320-only        the overlap is measured at 320px only and the page has no breakpoint for .promo: no CSS.
// The Plain code tab follows the same standard (a locator, no "after", and the reason). Needs `node fixture/server.mjs`.
// Run: node --experimental-strip-types test/code-evidence.mjs
process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200'; process.env.AVARA_PERF = 'off'; process.env.AVARA_LAUNCH = 'off';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const { scanUrl } = await import('../scanner/scanner.ts');
const { analyze } = await import('../analysis/analyze.ts');
const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { buildAvaraFix } = await import('../analysis/avara/fixes.ts');
const bare = (p) => p.slice(p.indexOf('\n\n') + 2);
async function run(page) {
  let early = null;
  const out = await scanUrl(`http://127.0.0.1:4200/avara/${page}`, 'wcag22aa', () => {}, { goal: null, perfRuns: 1, onBlocker: (b) => { early = b; } });
  const av = analyzeAvara(out, analyze(out));
  const f = av.findings.find((x) => x.rule.id.startsWith('mobile/') && x.bucket !== 'verified_pass' && x.fix);
  // The cover is read where it was measured: the 390px phone, or the 320px pass when only that width is covered.
  const vm = out.viewports.find((v) => v.name === 'mobile').avara.candidates[0].measurement; const m = vm?.cover ? vm : out.narrow.avara.candidates[0].measurement;
  // The early blocker builds its fix the way lib/jobs.ts does
  const ef = early ? buildAvaraFix({ ruleId: 'mobile/primary-action-unusable', action: { text: early.candidate.text, selector: early.measurement.selector, html: early.measurement.html }, causes: early.classification.causes, clippedBy: early.measurement.clippedBy, cover: early.measurement.cover, width: early.width, evidence: { action: early.measurement.code?.action, cover: early.measurement.code?.cover, clippedBy: early.measurement.code?.clippedBy, seenAt: [early.width], clearAt: [1280] } }) : null;
  return { prompt: f ? bare(f.fix.fixes.aiPrompt.lovable) : '', code: f?.fix.fixes.code, cover: m.code?.cover, early: ef ? bare(ef.fixes.aiPrompt.lovable) : null, earlyCode: ef?.fixes.code };
}

{ const r = await run('book-call-both.html');
  check('one .promo: the scan confirms .promo matches only the covering banner, and reads the page’s own @media rule for it', r.cover?.stable === '.promo' && r.cover.media.some((x) => x.media === '(min-width: 768px)' && x.prop === 'position' && x.value === 'static'), JSON.stringify(r.cover));
  check('…so the fix gives CSS scoped to the complement of that breakpoint', /Suggested CSS:\n```css\n@media \(max-width: 767\.98px\) \{\n  \.promo \{ position: static; \}\n\}\n```/.test(r.prompt), r.prompt.split('\n').slice(2, 6).join(' / '));
  check('…the Plain code tab has the same patch, with the evidence in its note', r.code?.after === '@media (max-width: 767.98px) {\n  .promo { position: static; }\n}' && /matches only this element/.test(r.code.note) && /min-width: 768px/.test(r.code.note), r.code?.note);
  check('…and the early blocker card gives the same paste-ready CSS', !!r.early && /@media \(max-width: 767\.98px\)/.test(r.early) && r.earlyCode?.after === r.code?.after);
  check('…Verify keeps the existing rescan criteria', /Rescan: Avara measures “Book a call” again at 390px and 320px wide, the widths it was found at, on the page as it first loads, and marks it Fixed only when it is fully on screen, not covered and large enough to tap\./.test(r.prompt)); }

{ const r = await run('book-call-shared-promo.html');
  check('two banners share .promo: the scan finds no selector that matches only the covering one', r.cover?.found && r.cover.stable === null && r.cover.naive?.selector === '.promo' && r.cover.naive.count === 2, JSON.stringify({ stable: r.cover?.stable, naive: r.cover?.naive }));
  check('…so the prompt has no code block', !!r.prompt && !/```/.test(r.prompt), r.prompt.slice(0, 120));
  check('…the Change says why and names the banner by its text', /2 elements match \.promo, so a rule on it would change more than this one\./.test(r.prompt) && /makes the \.promo bar \(the one that starts “[^”]+…”\) fixed at small widths/.test(r.prompt), (r.prompt.match(/Change: .*/) ?? [''])[0]);
  check('…the Plain code tab keeps a locator, no “after”, and gives the same reason', r.code?.after === '' && /position: fixed/.test(r.code.before) && /2 elements match \.promo/.test(r.code.note) && /locator, not a patch/.test(r.code.note), r.code?.note);
  check('…and the early blocker gives no code either', !!r.early && !/```/.test(r.early) && r.earlyCode?.after === ''); }

{ const r = await run('book-call-320-only.html');
  check('overlap at 320px only, no breakpoint in the page’s CSS: the selector resolves but no position rule sits under @media', r.cover?.stable === '.promo' && !r.cover.media.some((x) => x.prop === 'position' && x.media), JSON.stringify(r.cover?.media));
  check('…so the prompt has no code block', !!r.prompt && !/```/.test(r.prompt));
  check('…the Change describes the overlap and asks where it begins, with no guessed cause', /overlaps “Book a call” at 320px wide but not at 390px\. Check at which width the overlap begins/.test(r.prompt) && !/position: static|fixed at small widths/.test(r.prompt), (r.prompt.match(/Change: .*/) ?? [''])[0]);
  check('…the Plain code tab has no “after” and says why', r.code?.after === '' && /no breakpoint/.test(r.code.note)); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
