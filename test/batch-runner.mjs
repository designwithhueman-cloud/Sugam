// Batch scan runner and labeling export, on controlled fixtures only (nothing leaves this computer). Checks that every finding gets one row with its
// evidence, that checks which could not run are listed separately, that ownership-gated checks never run on sites that are not marked owned, that
// nothing secret reaches the files, and that the report computes false-positive rates, intervals, unsure counts and planted-bug recall correctly.
// Run: node --experimental-strip-types test/batch-runner.mjs      (about 1 to 2 minutes)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import { spawn } from 'node:child_process';
const PL = 4331, PC = 4332, FX = 4200; process.env.ALLOW_PRIVATE_HOSTS = `127.0.0.1:${PL},127.0.0.1:${PC},127.0.0.1:${FX}`;
const { createLeakyApp, SERVICE, STRIPE } = await import('../fixture/apps/leaky-app.mjs');
const { runBatch, checkManifest, FINDING_COLUMNS } = await import('../lib/batch/run.ts'); const { parseCsv, cell, toCsv } = await import('../lib/batch/csv.ts');
const { wilson, perCheck, plantedRecall, MIN_LABELS } = await import('../lib/batch/stats.ts'); const { buildReport } = await import('../lib/batch/report.ts');
const { makeCanaries, RAW } = await import('./support/canaries.mjs');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const listen = (s, port) => new Promise((r) => s.listen(port, '127.0.0.1', r));
const open = (port) => new Promise((r) => { const s = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.resume(); r(true); }); s.on('error', () => r(false)); });
const leaky = createLeakyApp({ leaky: true }), clean = createLeakyApp({ leaky: false }); await listen(leaky, PL); await listen(clean, PC);
let fixture = null; if (!(await open(FX))) { fixture = spawn('node', ['fixture/server.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await open(FX)); i++) await new Promise((r) => setTimeout(r, 250)); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-')); const lines = [];

// ---- the manifest is checked before anything runs ----
{ const bad = (m, o = {}) => checkManifest(m, o);
  check('a site that is not on this computer is refused without --allow-remote', bad({ sites: [{ id: 'r', url: 'https://example.com/' }] }).some((p) => /not on this computer/.test(p)) && bad({ sites: [{ id: 'r', url: 'https://example.com/' }] }, { allowRemote: true }).length === 0);
  check('an owned remote site is refused without --allow-active (probing checks are never an accident)', bad({ sites: [{ id: 'r', url: 'https://example.com/', owned: true }] }, { allowRemote: true }).some((p) => /allow-active/.test(p)));
  check('duplicate ids, bad ids, bad addresses and an empty list are refused', bad({ sites: [{ id: 'a', url: 'http://127.0.0.1/' }, { id: 'a', url: 'http://127.0.0.1/' }] }).some((p) => /Duplicate/.test(p)) && bad({ sites: [{ id: 'a b', url: 'http://127.0.0.1/' }] }).length > 0 && bad({ sites: [{ id: 'a', url: 'nope' }] }).length > 0 && bad({ sites: [] }).length > 0);
  let threw = ''; try { await runBatch({ sites: [{ id: 'r', url: 'https://example.com/' }] }, out, {}); } catch (e) { threw = e.message; }
  check('runBatch throws on a refused manifest and writes nothing', /not on this computer/.test(threw) && fs.readdirSync(out).length === 0); }

// ---- the CSV writer ----
{ check('a cell that starts with = + - or @ is neutralised, so a spreadsheet never runs it', ['=1+1', '+1', '-1', '@x'].every((v) => cell(v).startsWith("'")) && cell('plain') === 'plain');
  const C = makeCanaries(); check('a cell is masked on the way out', !cell(`key ${C.stripe}`).includes(C.stripe));
  const round = parseCsv(toCsv(['a', 'b'], [{ a: 'x,"y"\nz', b: '2' }])); check('quotes, commas and newlines round-trip', round[0].a === 'x,"y"\nz' && round[0].b === '2'); }

// ---- the statistics ----
{ const w = wilson(2, 12); check('Wilson 95% interval for 2 of 12 is about 4.7% to 44.8%', Math.abs(w.lo - 0.047) < 0.002 && Math.abs(w.hi - 0.448) < 0.002, `${w.lo.toFixed(3)}..${w.hi.toFixed(3)}`);
  const z = wilson(0, 10); check('0 of 10 has a lower bound of 0 and an upper bound above 0 (a rate is never claimed to be exactly 0)', z.lo === 0 && z.hi > 0.25);
  const rows = (c, v, n) => Array.from({ length: n }, (_, i) => ({ finding_id: `${c}${v}${i}`, check_id: c, kind: 'scan', site_id: 's', reviewer_verdict: v }));
  const r = perCheck([...rows('A', 'correct', 10), ...rows('A', 'false_positive', 2), ...rows('A', 'unsure', 3), ...rows('A', '', 4), ...rows('B', 'correct', 5), ...rows('B', 'false_positive', 4), ...rows('B', 'unsure', 9), ...rows('C', 'maybe', 1)]);
  const A = r.checks.find((c) => c.check === 'A'), B = r.checks.find((c) => c.check === 'B');
  check('check A: 12 decisive labels → rate 2/12 shown with its interval; unsure (3) and unreviewed (4) counted separately and not in the rate', A.enough && A.decisive === 12 && Math.abs(A.fpRate - 2 / 12) < 1e-9 && A.unsure === 3 && A.unlabeled === 4);
  check(`check B: 9 decisive labels (plus 9 unsure) → “insufficient labels”, no rate (needs ${MIN_LABELS})`, !B.enough && B.fpRate === null && B.unsure === 9 && B.decisive === 9);
  check('a verdict that is not correct / false_positive / unsure is reported, not guessed', r.invalid.length === 1 && r.invalid[0].value === 'maybe');
  const p = plantedRecall([{ id: 's', planted: [{ check: 'X' }, { check: 'Y', selector: '#b' }, { check: 'Y', selector: '#nope' }] }], [{ site_id: 's', check_id: 'X', selector: '' }, { site_id: 's', check_id: 'Y', selector: 'div > #b' }]);
  check('planted recall: found by check (and by selector when named), missed ones listed', p.results.filter((x) => x.found).length === 2 && p.results.find((x) => !x.found).planted.selector === '#nope' && p.byCheck.find((c) => c.check === 'Y').recall === 0.5); }

// ---- the run, on controlled fixtures ----
const manifest = { name: 'controlled fixtures', sites: [
  { id: 'leaky-notowned', url: `http://127.0.0.1:${PL}/`, owned: false, planted: [{ check: 'SEC-011', note: 'service key and a Stripe-style key in the code' }, { check: 'SEC-012', note: 'needs ownership, so it cannot be found here' }] },
  { id: 'leaky-owned', url: `http://127.0.0.1:${PL}/`, owned: true, supabaseBase: `http://127.0.0.1:${PL}`, planted: ['SEC-011', 'SEC-012', 'SEC-013', 'SEC-014'].map((check) => ({ check })) },
  { id: 'clean-owned', url: `http://127.0.0.1:${PC}/`, owned: true, supabaseBase: `http://127.0.0.1:${PC}` },
  { id: 'ai-builder-bad', url: `http://127.0.0.1:${FX}/ai-builder-bad.html`, planted: [{ check: 'video-caption', selector: 'video' }, { check: 'sugam/autofocus' }, { check: 'sugam/form-error-not-linked' }, { check: 'sugam/does-not-exist', note: 'a bug the tool cannot know about: must show as missed' }] },
] };
const res = await runBatch(manifest, out, { log: (s) => lines.push(s) }); const dir = res.dir;
const read = (f) => parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')); const F = read('findings.csv'), N = read('checks_not_run.csv'), S = read('sites.csv');
const of = (site, kind) => F.filter((r) => r.site_id === site && (!kind || r.kind === kind));
check('the run wrote findings.csv, checks_not_run.csv, sites.csv, run.json and screenshots', ['findings.csv', 'checks_not_run.csv', 'sites.csv', 'run.json'].every((f) => fs.existsSync(path.join(dir, f))) && fs.readdirSync(path.join(dir, 'screenshots')).length >= 2);
check('findings.csv has exactly the documented columns, with reviewer_verdict and reviewer_notes empty', Object.keys(F[0]).join() === FINDING_COLUMNS.join() && F.every((r) => r.reviewer_verdict === '' && r.reviewer_notes === ''));
check('every site ran (status ok) and sites.csv counts match the rows', S.length === 4 && S.every((s) => s.status === 'ok') && S.every((s) => Number(s.findings) === of(s.site_id).length && Number(s.not_run) === N.filter((n) => n.site_id === s.site_id).length));
check('one row per finding: ids are unique, and no check appears twice for the same selector and viewport on a site (the analysis does not restate page checks)', new Set(F.map((r) => r.finding_id)).size === F.length && new Set(F.map((r) => `${r.site_id}|${r.check_id}|${r.selector}|${r.viewport}`)).size === F.length);

const bad = of('ai-builder-bad', 'scan');
check('page findings carry check id, title, selector, viewport, evidence and a screenshot that exists', bad.length >= 10 && bad.every((r) => r.check_id && r.check_title && r.evidence && r.viewport && r.screenshot && fs.statSync(path.join(dir, r.screenshot)).size > 1000) && bad.filter((r) => r.selector).length >= 10);
check('the known defects of the broken page are among them (video without captions, autofocus, unlinked error)', ['video-caption', 'sugam/autofocus', 'sugam/form-error-not-linked'].every((c) => bad.some((r) => r.check_id === c)));

const lp = of('leaky-notowned', 'launch'), lo = of('leaky-owned', 'launch');
check('not owned: the key check ran and flagged the leaked keys', lp.some((r) => r.check_id === 'SEC-011' && r.severity === 'critical'));
check('not owned: private files, source maps and database tables did NOT run, and are listed as “ownership_gated” (not as findings, not as passes)', !lp.some((r) => ['SEC-012', 'SEC-013', 'SEC-014'].includes(r.check_id)) && ['SEC-012', 'SEC-013', 'SEC-014'].every((id) => N.some((n) => n.site_id === 'leaky-notowned' && n.check_id === id && n.category === 'ownership_gated' && /ownership/i.test(n.reason))));
check('owned: all four Launch checks flagged the leaky app and none is listed as not run', ['SEC-011', 'SEC-012', 'SEC-013', 'SEC-014'].every((id) => lo.some((r) => r.check_id === id)) && !N.some((n) => n.site_id === 'leaky-owned' && n.kind === 'launch'));
check('the clean app (owned, probed) has no Launch finding: nothing is invented', of('clean-owned', 'launch').length === 0 && !N.some((n) => n.site_id === 'clean-owned' && n.kind === 'launch'));
check('checks that could not run are in their own file with a reason and never in findings.csv', N.length >= 4 && N.every((n) => n.reason && n.category && n.check_id) && !F.some((r) => r.check_id === '(scan)'));
const all = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.(csv|json)$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
check('no raw secret in any file the run wrote (the leaked keys are masked)', !all.includes(STRIPE) && !all.includes(SERVICE) && /sk_live_••••/.test(all));

// ---- labeling and the report ----
{ // label the real rows: all Launch SEC-011 rows correct, one scan row a false positive, one unsure, rest unreviewed
  const text = fs.readFileSync(path.join(dir, 'findings.csv'), 'utf8'); const rows = parseCsv(text);
  for (const r of rows) { if (r.check_id === 'SEC-011') r.reviewer_verdict = 'correct'; }
  const fp = rows.find((r) => r.kind === 'scan'); fp.reviewer_verdict = 'false_positive'; fp.reviewer_notes = 'checked by hand: this is fine'; const un = rows.filter((r) => r.kind === 'scan')[1]; un.reviewer_verdict = 'unsure';
  fs.writeFileSync(path.join(dir, 'findings.csv'), toCsv(FINDING_COLUMNS, rows));
  const rep = buildReport(dir); const md = rep.markdown;
  check('the report lists every check with its labels and says “insufficient labels” where there are fewer than 10 decisive ones', /insufficient labels \(\d+ of 10\)/.test(md) && /\| SEC-011 \| launch \|/.test(md));
  check('the report lists unreviewed and unsure counts per check', new RegExp(`\\| ${fp.check_id.replace(/[/]/g, '\\/')} \\| scan \\| \\d+ \\| \\d+ \\| 0 \\| 1 \\|`).test(md) || /\| 1 \| (\d+) \|/.test(md));
  check('the report lists checks that could not run, and says ownership-gated checks are not measured on sites we do not own', /## Checks that could not run/.test(md) && /ownership_gated/.test(md) && /not measured on sites we do not own/.test(md));
  check('planted bugs: found ones are counted and the impossible ones are listed as missed (a not-owned site cannot find private files; an unknown rule cannot be found)', /## Planted bugs/.test(md) && /leaky-notowned: SEC-012/.test(md) && /ai-builder-bad: sugam\/does-not-exist/.test(md) && !/leaky-owned: SEC-01/.test(md) && /\| SEC-011 \| 2 \| 2 \| 100% \|/.test(md));
  check('report.md was written next to the data, and no raw secret is in it', fs.existsSync(path.join(dir, 'report.md')) && !md.includes(STRIPE)); }
{ // a check with 14 decisive labels, from a copy of the run, through the report command
  const d2 = path.join(out, 'twelve'); fs.cpSync(dir, d2, { recursive: true }); const rows = parseCsv(fs.readFileSync(path.join(d2, 'findings.csv'), 'utf8')); const tpl = rows.find((r) => r.kind === 'scan');
  const extra = Array.from({ length: 13 }, (_, i) => ({ ...tpl, finding_id: `x${i}`, site_id: `fx${i}`, reviewer_verdict: i < 2 ? 'false_positive' : 'correct' })); extra.push({ ...tpl, finding_id: 'xu', reviewer_verdict: 'unsure' });
  const mine = rows.filter((r) => r.check_id !== tpl.check_id); fs.writeFileSync(path.join(d2, 'findings.csv'), toCsv(FINDING_COLUMNS, [...mine, ...extra]));
  const md = buildReport(d2).markdown; const line = md.split('\n').find((l) => l.startsWith(`| ${tpl.check_id} |`));
  check('a check with 13 decisive labels and 1 unsure shows 2 false positives, 15% with a Wilson interval, and the unsure count', /\| 14 \| 0 \| 11 \| 2 \| 1 \| 15% \(4% to 42%\) \|/.test(line ?? ''), line?.slice(0, 160)); }
{ const d3 = path.join(out, 'badlabel'); fs.cpSync(dir, d3, { recursive: true }); const rows = parseCsv(fs.readFileSync(path.join(d3, 'findings.csv'), 'utf8')); rows[0].reviewer_verdict = 'yes'; fs.writeFileSync(path.join(d3, 'findings.csv'), toCsv(FINDING_COLUMNS, rows));
  const r = buildReport(d3); check('a verdict typed in some other word is flagged in the report and not counted', r.invalid.length === 1 && /not correct, false_positive or unsure/.test(r.markdown)); }

fs.rmSync(out, { recursive: true, force: true }); leaky.close(); clean.close(); fixture?.kill();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
