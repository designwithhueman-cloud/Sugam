// DIFF-002 (Visual Distinctiveness): the first-screen comparison with the reference set, the threshold, skip reasons, duplicates and the report view.
// Held-out fixtures in fixture/site/template/: template-rebrand (the template-like fixture with other colours, typeface, name and copy), template-split
// (same section order as template-like, different hero layout) and indigo-editorial (a different layout in the same indigo palette).
// Needs `node fixture/server.mjs` with ALLOW_PRIVATE_HOSTS covering it (FIX=http://127.0.0.1:<port>/), and worker/vision set up (worker/vision/README.md).
// Run: node --experimental-strip-types test/hero-match.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-hero-')); fs.cpSync(path.join(process.cwd(), 'src', 'rules'), tmp, { recursive: true }); process.env.AVARA_RULES_DIR = tmp;
const { scanUrl } = await import('../scanner/scanner.ts'); const { analyze } = await import('../analysis/analyze.ts'); const { analyzeAvara } = await import('../analysis/avara/build.ts');
const { derivedReports } = await import('../src/services/scan-service/derived.ts'); const { buildWebsiteContext } = await import('../src/services/scan-service/index.ts');
const { matchHero, attachHeroMatch, loadReferences, MODEL_ID } = await import('../src/services/vision/hero-match.ts'); const { heroMatchReport } = await import('../src/services/vision/hero-detector.ts');
const { RuleEngine } = await import('../src/engines/rule-engine/RuleEngine.ts'); const { RuleLoader } = await import('../src/engines/rule-engine/RuleLoader.ts');
const { buildView } = await import('../lib/review-view.ts'); const { referenceShot } = await import('../src/services/vision/hero-refs.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const loader = new RuleLoader(tmp); const rules = loader.loadAllRules(); const byId = new Map(rules.map((r) => [r.ruleId, r]));
const DISCLAIMER = 'It does not say the page was copied, is unoriginal, or how it was made.';
const CLAIM = /\b(made|built|generated|created) (with|by|using) (ai|lovable|bolt|v0|a model)\b|ai-generated|\bcopied\b|\bplagiari|\bunoriginal\b|\boriginality\b/i;

// ---- 1. one rule, advisory, zero weight ----
const d2 = byId.get('DIFF-002');
check('DIFF-002 owns diff/hero-match beside diff/default-styling, stays advisory with zero weight and out of the score', d2.evaluator.detectors.join() === 'diff/hero-match,diff/default-styling' && d2.weight === 0 && d2.advisory && d2.scoreEligible === false);
check('no other rule names diff/hero-match, and DESIGN-014 stays the human-only rule it was (no duplicate rule)', rules.filter((r) => (r.evaluator?.detectors ?? []).includes('diff/hero-match')).length === 1 && byId.get('DESIGN-014').evaluator.type === 'human');

// ---- 2. the versioned reference set ----
const set = loadReferences(); const dir = path.join(process.cwd(), 'data', 'hero-references'); const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); const cal = JSON.parse(fs.readFileSync(path.join(dir, 'calibration.json'), 'utf8'));
check('the reference set is versioned and holds 20 to 30 references, each with name, origin, licence, ownership, viewport and a screenshot whose hash matches', /^\d{4}-\d\d-\d\d\.\d+$/.test(set.version) && set.references.length >= 20 && set.references.length <= 30 && set.references.every((r) => r.name && r.origin && r.license && r.ownership && r.viewport.width === 1280 && r.viewport.height === 800 && crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, r.screenshot))).digest('hex') === r.sha256), `${set.references.length} references`);
check('fixtures are labelled as fixtures; templates are MIT-licensed with a pinned commit', set.references.filter((r) => r.kind === 'fixture').every((r) => /fixture/i.test(r.license + r.ownership)) && set.references.filter((r) => r.kind === 'template').every((r) => r.license === 'MIT' && /@ [0-9a-f]{7}$/.test(r.origin)), `${man.counts.templates} templates, ${man.counts.fixtures} fixtures`);
check('every reference has an embedding from the pinned DINOv2 model', set.model === MODEL_ID && set.references.every((r) => set.vectors[r.sha256]?.length === 384));
check('the threshold was validated on labelled pairs with no false positives', cal.threshold?.validated === true && /0 of \d+ negatives pass/.test(cal.threshold.note) && cal.pairs.some((p) => p.label.startsWith('same')) && cal.pairs.some((p) => p.label === 'different templates'), cal.threshold?.note);

// ---- 3. real scans, compared in the worker step ----
const base = process.env.FIX || 'http://127.0.0.1:4200/';
const run = async (p) => { const out = await scanUrl(base + p, 'wcag22aa', undefined, { goal: null, perf: false }); const m = await attachHeroMatch(out); return { out, m, d: derivedReports(out) }; };
const pages = {}; for (const p of ['template/template-rebrand.html', 'template/template-split.html', 'template/indigo-editorial.html', 'detectors/good.html']) pages[p.split('/')[1].replace('.html', '')] = await run(p);
const { 'template-rebrand': reb, 'template-split': spl, 'indigo-editorial': ind, good } = pages; const top = (x) => x.m.candidates?.[0];
check('same template, different branding: matched to the template-like fixture and surfaced', reb.m.status === 'ok' && top(reb).id === 'fx-template-like' && reb.m.surfaced, `${top(reb)?.id} ${top(reb)?.similarity} shared ${top(reb)?.shared.length}`);
check('same section order, different hero layout: not surfaced', spl.m.status === 'ok' && !spl.m.surfaced, `${top(spl)?.id} ${top(spl)?.similarity} shared ${top(spl)?.shared.length}`);
check('different template, similar colours: not surfaced', ind.m.status === 'ok' && !ind.m.surfaced, `${top(ind)?.id} ${top(ind)?.similarity} shared ${top(ind)?.shared.length}`);
check('an unrelated page still has a nearest match, kept as a diagnostic in the pass note', good.m.status === 'ok' && !good.m.surfaced && good.d['diff/hero-match'].hits.length === 0 && /Nearest reference .* Kept as a diagnostic/.test(good.d['diff/hero-match'].passNote), good.d['diff/hero-match'].passNote?.slice(0, 120));
const h = reb.d['diff/hero-match'].hits[0];
check('the finding names the reference and states specific resemblances from the captured layout', h?.bucket === 'needs_review' && /Avara fixture: starter-template landing/.test(h.title) && h.evidence.some((e) => /^Both (centre|left-align) the headline/.test(e)) && h.evidence.some((e) => /^Both put .*button/.test(e)) && h.evidence[0].includes('[ref:fx-template-like]'), h?.evidence.slice(2, 4).join(' | '));
check('it makes no claim about copying, originality or which tool made the page, and says so', !!h && !CLAIM.test((h.title + h.summary + h.evidence.join(' ')).replace(DISCLAIMER, '')) && h.summary.includes(DISCLAIMER));

// ---- 4. missing inputs give explicit skip reasons ----
const shot = reb.out.viewports.find((v) => v.name === 'desktop').viewportShot; const lay = reb.out.viewports.find((v) => v.name === 'desktop').pageContext.heroLayout;
const sk = async (env, f) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; } try { return await f(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } } };
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-norefs-')); const coldCache = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-cold-'));
const s1 = await matchHero(undefined, lay), s2 = await matchHero(shot, undefined), s3 = await sk({ AVARA_HERO_REFS: empty }, () => matchHero(shot, lay)), s4 = await sk({ AVARA_VISION_PYTHON: '/nonexistent/python', AVARA_VISION_CACHE: coldCache }, () => matchHero(shot, lay)), s5 = await sk({ AVARA_HERO_MATCH: 'off' }, () => matchHero(shot, lay)), s6 = await matchHero(shot, lay, { width: 375, height: 812 });
check('no screenshot, no layout, no references, no model, switched off and a different viewport each give their own skip reason', [s1, s2, s3, s4, s5, s6].map((s) => s.skip).join() === 'no_capture,no_layout,no_references,model_unavailable,disabled,viewport_mismatch', [s1, s2, s3, s4, s5, s6].map((s) => s.skip).join());
const r4 = heroMatchReport(s4), r0 = heroMatchReport(undefined);
check('a skipped comparison is "did not run" with the reason, never a pass', !r4.ran && /model_unavailable/.test(r4.note) && !r0.ran && /scan worker/.test(r0.note));
const outNoModel = reb.out; const dsk = outNoModel.viewports.find((v) => v.name === 'desktop'); const saved = dsk.pageContext.heroMatch; dsk.pageContext.heroMatch = s4;
const ids = new Set(rules.flatMap((r) => r.evaluator?.detectors ?? [])); const review = async (out) => { const a = analyze(out), av = analyzeAvara(out, a); return new RuleEngine(loader, null).review(buildWebsiteContext(out, a, av, ids)); };
const find = (rv, id) => rv.categories.flatMap((c) => c.findings).filter((f) => f.ruleId === id);
const rvNo = await review(outNoModel); const f2no = find(rvNo, 'DIFF-002')[0]; dsk.pageContext.heroMatch = saved;
check('with the model missing, DIFF-002 still reports the style check and carries the skip reason in its observation', f2no?.result === 'observed_pass' && /Not run: Hero comparison skipped \(model_unavailable\)/.test(f2no.observation), `${f2no?.result}: ${f2no?.observation.slice(0, 140)}`);

// ---- 5. one observation, one finding ----
const rvR = await review(reb.out), rvS = await review(spl.out);
check('each rule produces at most one finding per scan', [rvR, rvS].every((rv) => { const all = rv.categories.flatMap((c) => c.findings.map((f) => f.ruleId)); return all.length === new Set(all).size; }));
const d1 = find(rvS, 'DIFF-001')[0], d2s = find(rvS, 'DIFF-002')[0], d2r = find(rvR, 'DIFF-002')[0];
check('section order stays with DIFF-001: it is reported there, and DIFF-002 never mentions section order', /Hero → /.test(d1?.observation ?? '') && ![d2s, d2r].some((f) => f && /section order|Logo cloud|Testimonials|Pricing|FAQ/.test(f.observation + f.evidence.join(' '))), `${d1?.result} / ${d2s?.result} / ${d2r?.result}`);
check('the surfaced match reaches the engine as "needs a person", measured and advisory, with the reference first in the evidence', d2r?.result === 'needs_human_review' && d2r.method === 'measured' && d2r.advisory && d2r.evidence[0].includes('[ref:fx-template-like]'));
const diffCat = (rv) => rv.categories.find((c) => c.category === 'Differentiation & Design Maturity');
check('the Differentiation category still has no score and zero weight', diffCat(rvR).score === null && diffCat(rvR).weight === 0);

// ---- 6. the report view ----
const cat = diffCat(rvR); const mk = (url) => ({ url: 'x', viewports: [{ viewport: 'desktop', viewportWidth: 1280, viewportHeight: 800, pageWidth: 1280, pageHeight: 4000, truncated: false, screenshotUrl: url }], review: { ...rvR, categories: [{ ...cat, findings: [d2r] }] }, avara: null, issues: [] });
let v; try { v = buildView(mk('/api/scans/s/screenshot/desktop'), 'paid'); } catch (e) { v = null; console.log('  buildView:', e.message.split('\n')[0]); }
const item = v && [v.primary, ...v.others].find((i) => i?.compare);
check('the report item shows both first screens side by side, names the reference and lists the resemblances', !!item && item.compare.id === 'fx-template-like' && item.compare.src === '/api/hero-references/fx-template-like' && item.compare.scanned?.crop.height === 800 && item.compare.shared.length >= 1 && /Avara fixture/.test(item.compare.name));
let vl; try { vl = buildView(mk(''), 'free'); } catch { vl = null; } const il = vl && [vl.primary, ...vl.others].find((i) => i?.compare);
check('when the plan keeps screenshots back, the page screenshot is withheld but the licensed reference is still shown', !!il && il.compare.scanned === null && !!il.compare.src);
check('the reference image route serves only ids in the manifest', referenceShot('fx-template-like')?.length > 1000 && referenceShot('../manifest') === null && referenceShot('nope') === null);

fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true }); fs.rmSync(coldCache, { recursive: true, force: true });
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
