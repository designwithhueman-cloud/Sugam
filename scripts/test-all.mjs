// One command for every test:  npm run test:all   (see docs/testing.md)
//   node scripts/test-all.mjs [--group in-process,server,docker] [--only <text>] [--list] [--reseed] [--help]
// Three groups: in-process (no app server), server (each test gets its own app server on a fresh copy of a seeded database), docker (needs Docker
// and the avara-browser-worker image). Tests that are not run are always printed, with the reason. Exit code: 0 all run passed, 1 a test failed, 2 blocked.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN = path.join(ROOT, '.data', 'test-run'); const SNAPSHOT = path.join(ROOT, '.data', 'test-snapshot'); const META = path.join(ROOT, '.data', 'test-snapshot.json');
const ALLOW = '127.0.0.1:4200,localhost:4200'; const DOCKER_BIN = '/Applications/Docker.app/Contents/Resources/bin';
const APP_PORT = 3390, SEED_PORT = 3398, LC_PORT = 4331;
const STUB = path.join(ROOT, 'test', 'support', 'gemini-stub.mjs');

// ---------------- the three groups ----------------
export const IN_PROCESS = ['avara-catalog', 'code-evidence', 'continuity-detectors', 'coverage', 'coverage-matrix', 'cta-regression', 'data-lifecycle', 'detector-pack', 'detector-pack-v3', 'detector-spec', 'detector-trace', 'detectors', 'diff-002', 'fix-enrichment', 'fix-format', 'fix-tools', 'fix-writer', 'fixture-apps', 'flow-contracts', 'flow-engine', 'flow-insights', 'gemini-path', 'batch-detectors', 'launch-pack', 'milestone1', 'not-run-reasons', 'phone-widths', 'policy-engine', 'readiness', 'rule-engine', 'scanner-accuracy', 'score-admission', 'scoring', 'security-exposure', 'tracks', 'value-detectors', 'ai-review', 'redaction', 'redaction-pipeline', 'test-all-runner'];
const stubEnv = (extra = {}) => (c) => ({ AVARA_AI: 'on', AVARA_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'stub', NODE_OPTIONS: `--import ${STUB}`, GEMINI_STUB_LOG: c.file('stub.log'), ...extra });
const gated = (mode, fix) => ({ server: (c) => ({ ...stubEnv({ GEMINI_STUB: mode === '500' ? '500' : 'ok', GEMINI_STUB_FIX: fix, GEMINI_STUB_GATE: c.file('gate') })(c) }) });
// id, test file, arguments (b = the server's address), and the server's own settings when they differ from the default (AI off).
export const SERVER = [
  { id: 'avara', test: 'avara', args: () => ['main'], env: (c) => ({ BASE: c.base }) },
  { id: 'delete-flow', test: 'delete-flow', args: (c) => [c.base] }, { id: 'fixpanel', test: 'fixpanel', args: (c) => [c.base] },
  { id: 'gating(free)', test: 'gating', args: (c) => ['free', c.base] }, { id: 'gating(site)', test: 'gating', args: (c) => ['site', c.base] }, { id: 'gating(agency)', test: 'gating', args: (c) => ['agency', c.base] },
  { id: 'journey', test: 'journey', args: (c) => [c.base] }, { id: 'landing', test: 'landing', args: (c) => [c.base] }, { id: 'launch-integration', test: 'launch-integration', args: (c) => [c.base] },
  { id: 'launch-report', test: 'launch-report', args: (c) => [c.base] }, { id: 'security', test: 'security', args: (c) => [c.base] }, { id: 'tools', test: 'tools', args: (c) => [c.base] },
  { id: 'workspace-evidence', test: 'workspace-evidence', args: (c) => [c.base] }, { id: 'crawl', test: 'crawl', args: () => [], env: (c) => ({ BASE: c.base }) },
  { id: 'phone-product', test: 'phone-product', args: (c) => ['check', c.base] },
  { id: 'redaction-server', test: 'redaction-server', args: (c) => [c.base], server: () => ({ ALLOW_PRIVATE_HOSTS: '127.0.0.1:4342' }), testEnv: () => ({ ALLOW_PRIVATE_HOSTS: '127.0.0.1:4342' }) },
  { id: 'diff-002-api', test: 'diff-002-api', args: (c) => [c.base], server: () => ({ AVARA_DIFF002_REFERENCES: 'fixture/site/diff002/references.json' }) },
  { id: 'launch-check-api', test: 'launch-check-api', args: (c) => [c.base], server: () => ({ ALLOW_PRIVATE_HOSTS: `127.0.0.1:${LC_PORT}`, LC_TEST_SUPABASE_BASE: `http://127.0.0.1:${LC_PORT}` }), testEnv: () => ({ ALLOW_PRIVATE_HOSTS: `127.0.0.1:${LC_PORT}` }) },
  { id: 'ai-review-server', test: 'ai-review-server', args: (c) => [c.base, c.file('stub.log')], server: (c) => stubEnv({ GEMINI_STUB: 'review' })(c) },
  { id: 'fix-writer-server(ok)', test: 'fix-writer-server', args: (c) => [c.base, 'ok', c.file('stub.log'), c.file('gate')], ...gated('ok', 'ok') },
  { id: 'fix-writer-server(bad)', test: 'fix-writer-server', args: (c) => [c.base, 'bad', c.file('stub.log'), c.file('gate')], ...gated('ok', 'bad') },
  { id: 'fix-writer-server(500)', test: 'fix-writer-server', args: (c) => [c.base, '500', c.file('stub.log'), c.file('gate')], ...gated('500', 'ok') },
  { id: 'fix-writer-server(off)', test: 'fix-writer-server', args: (c) => [c.base, 'off', c.file('stub.log')] },
  { id: 'report-first(ok)', test: 'report-first', args: (c) => [c.base, 'ok'], server: (c) => stubEnv({ GEMINI_STUB: 'ok', GEMINI_STUB_DELAY: '4000' })(c) },
  { id: 'report-first(fail)', test: 'report-first', args: (c) => [c.base, 'fail'], server: (c) => stubEnv({ GEMINI_STUB: '400', GEMINI_STUB_DELAY: '4000' })(c) },
];
export const DOCKER = [
  { id: 'browser-worker-container', test: 'browser-worker-container', args: () => [], noServer: true },
  { id: 'flows-api', test: 'flows-api', args: (c) => [c.base], testEnv: (c) => ({ FLOW_TEST_PROJECTS: JSON.stringify(c.projects) }),
    server: () => ({ WORKER_URL: 'http://127.0.0.1:18095', WORKER_TOKEN: 'flows-test-token-0123456789', ALLOW_PRIVATE_HOSTS: 'host.docker.internal:4200,127.0.0.1:4200' }) },
];
// Never run by test:all, always listed. gemini-path is also in IN_PROCESS: its stub cases run, only the live case is skipped.
export const SKIPPED = [
  { name: 'audit-real-sites', reason: 'scans real public sites over the network; run it by hand and sparingly: node test/audit-real-sites.mjs <outDir>' },
  { name: 'gemini-path (live case)', reason: 'sends one real Gemini request; needs GEMINI_API_KEY and GEMINI_LIVE=1. The stub cases still run in the in-process group' },
  { name: 'auth', reason: 'needs a server started with fake sign-in provider variables (see the header of test/auth.mjs)' },
  { name: 'setup-test-account', reason: 'not a test: test:all uses it to seed the test database' },
];
const SKIP_FILES = ['audit-real-sites', 'auth', 'setup-test-account'];

/** Every test file must be in exactly one place. A new file that is nowhere fails test/test-all-runner.mjs. */
export function classify(files) {
  const where = new Map(); const add = (n, g) => where.set(n, [...(where.get(n) ?? []), g]);
  IN_PROCESS.forEach((n) => add(n, 'in-process')); SERVER.forEach((e) => add(e.test, 'server')); DOCKER.forEach((e) => add(e.test, 'docker')); SKIP_FILES.forEach((n) => add(n, 'skipped'));
  const names = files.map((f) => f.replace(/\.mjs$/, ''));
  return { unclassified: names.filter((n) => !where.has(n)), missing: [...where.keys()].filter((n) => !names.includes(n)), duplicated: [...where].filter(([n, g]) => n !== 'gemini-path' && new Set(g).size > 1 && !(SERVER.filter((e) => e.test === n).length > 1)).map(([n]) => n) };
}
/** 0: everything that ran passed. 1: something failed. 2: a group could not start (no build, no browser). Skips never fail a run. */
export function exitCode(results, blocked = []) { return results.some((r) => r.status === 'fail' || r.status === 'timeout') ? 1 : blocked.length ? 2 : 0; }

// ---------------- helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s = '') => process.stdout.write(s + '\n');
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1').once('connect', () => { s.destroy(); r(true); }).once('error', () => r(false)); });
async function waitFor(fn, ms, step = 250) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* keep waiting */ } await sleep(step); } return false; }
const up = (url) => async () => (await fetch(url, { signal: AbortSignal.timeout(1500) })).status < 500;

function run(cmd, args, { env = {}, timeoutMs = 20 * 60_000, quiet = true } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now(); const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } }); let buf = '';
    const add = (d) => { buf += d; if (buf.length > 300_000) buf = buf.slice(-300_000); if (!quiet) process.stdout.write(d); };
    p.stdout.on('data', add); p.stderr.on('data', add); let timedOut = false;
    const k = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, timeoutMs);
    p.on('close', (code) => { clearTimeout(k); resolve({ code: timedOut ? null : code, timedOut, ms: Date.now() - t0, out: buf }); });
  });
}
async function startServer({ port, dir, env = {} }) {
  const p = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { cwd: ROOT, env: { ...process.env, PGLITE_DIR: dir, ALLOW_PRIVATE_HOSTS: ALLOW, AVARA_AI: 'off', ...env }, stdio: 'ignore' });
  const ok = await waitFor(up(`http://127.0.0.1:${port}/login`), 40_000);
  const stop = async () => { p.kill('SIGTERM'); await waitFor(async () => !(await portOpen(port)), 8000, 200); if (await portOpen(port)) p.kill('SIGKILL'); await sleep(300); };
  if (!ok) { await stop(); throw new Error(`the app server did not start on port ${port}`); }
  return stop;
}

// ---------------- preflight ----------------
async function chromeMode() {
  const { chromium } = await import('playwright');
  const tryLaunch = async (o) => { try { const b = await chromium.launch(o); await b.close(); return true; } catch { return false; } };
  if (await tryLaunch({})) return 'bundled';
  if (await tryLaunch({ channel: 'chrome' })) return 'chrome';
  return null;
}
function dockerStatus() {
  const env = { ...process.env, PATH: `${process.env.PATH}:${DOCKER_BIN}` };
  if (spawnSync('docker', ['info'], { env, stdio: 'ignore' }).status !== 0) return 'Docker is not running (or not installed)';
  if (spawnSync('docker', ['image', 'inspect', 'avara-browser-worker'], { env, stdio: 'ignore' }).status !== 0) return 'the image is not built: docker build -f services/browser-worker/Dockerfile -t avara-browser-worker .';
  return null;
}

// ---------------- the seeded database ----------------
const ACCOUNTS = [
  { plan: 'agency', file: '.data/test-account.txt', email: 'agency-test@example.com', name: 'Test Agency' },
  { plan: 'free', file: '.data/test-free.txt', email: 'free-test@example.com', name: 'Free Test' },
  { plan: 'site', file: '.data/test-site.txt', email: 'site-test@example.com', name: 'Site Test' },
];
const titleCase = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
/** Builds (once) a closed database with the three test accounts and one project each, from the same credentials the tests read. Existing
 *  .data/test-*.txt files are never changed: their email, password and slug are reused, so your local accounts keep working. */
async function ensureSnapshot({ reseed, nodeOptions }) {
  if (!reseed && fs.existsSync(SNAPSHOT) && fs.existsSync(META)) return JSON.parse(fs.readFileSync(META, 'utf8'));
  say('Building the seeded test database (once; about 3 minutes)...');
  const seed = path.join(RUN, 'seed-db'); fs.rmSync(seed, { recursive: true, force: true }); fs.rmSync(SNAPSHOT, { recursive: true, force: true }); fs.mkdirSync(RUN, { recursive: true });
  const stop = await startServer({ port: SEED_PORT, dir: seed }); const slugs = {};
  try {
    for (const a of ACCOUNTS) {
      const have = fs.existsSync(path.join(ROOT, a.file)) ? fs.readFileSync(path.join(ROOT, a.file), 'utf8') : null;
      const email = have?.match(/Email: (\S+)/)?.[1] ?? a.email, pw = have?.match(/Password: (\S+)/)?.[1] ?? crypto.randomBytes(9).toString('base64url'), slug = have?.match(/Slug: (\S+)/)?.[1];
      const tmp = path.join(RUN, `creds-${a.plan}.txt`);
      const r = await run('node', ['test/setup-test-account.mjs', `http://127.0.0.1:${SEED_PORT}`], { env: { SETUP_EMAIL: email, SETUP_NAME: slug ? titleCase(slug) : a.name, SETUP_FILE: tmp, SETUP_PASSWORD: pw, ALLOW_PRIVATE_HOSTS: ALLOW, ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) }, timeoutMs: 5 * 60_000 });
      if (r.code !== 0 || !fs.existsSync(tmp)) throw new Error(`seeding the ${a.plan} account failed:\n${r.out.split('\n').slice(-8).join('\n')}`);
      slugs[a.plan] = fs.readFileSync(tmp, 'utf8').match(/Slug: (\S+)/)[1];
      if (!have) { fs.mkdirSync(path.dirname(path.join(ROOT, a.file)), { recursive: true }); fs.copyFileSync(tmp, path.join(ROOT, a.file)); fs.chmodSync(path.join(ROOT, a.file), 0o600); }
      else if (slug && slug !== slugs[a.plan]) say(`WARNING: ${a.file} says workspace "${slug}" but the seeded database has "${slugs[a.plan]}". Tests that use the slug may fail.`);
    }
  } finally { await stop(); }
  for (const a of ACCOUNTS.filter((x) => x.plan !== 'free')) {   // the embedded database allows one process: the server is stopped first
    const r = await run('node', ['--experimental-strip-types', 'scripts/set-plan.ts', slugs[a.plan], a.plan], { env: { PGLITE_DIR: seed, SUGAM_PORT: String(SEED_PORT) }, timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`could not set the ${a.plan} plan:\n${r.out.split('\n').slice(-6).join('\n')}`);
  }
  const q = await run('node', ['--experimental-strip-types', '--input-type=module', '-e', "import { getDb, schema } from './lib/db/index.ts'; import { eq } from 'drizzle-orm'; const db = await getDb(); const r = await db.select({ slug: schema.organizations.slug, id: schema.projects.id }).from(schema.projects).innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id)); console.log('IDS' + JSON.stringify(r)); process.exit(0);"], { env: { PGLITE_DIR: seed }, timeoutMs: 120_000 });
  const rows = JSON.parse(q.out.match(/IDS(\[.*\])/)?.[1] ?? '[]'); const projects = {}; for (const a of ACCOUNTS) projects[a.plan] = rows.find((x) => x.slug === slugs[a.plan])?.id;
  if (Object.values(projects).some((v) => !v)) throw new Error('could not read the seeded project ids');
  fs.renameSync(seed, SNAPSHOT); const meta = { projects, slugs, builtAt: new Date().toISOString() }; fs.writeFileSync(META, JSON.stringify(meta, null, 2)); return meta;
}

// ---------------- the run ----------------
function parse(argv) {
  const o = { groups: ['in-process', 'server', 'docker'], only: null, list: false, reseed: false, help: false };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === '--list') o.list = true; else if (a === '--reseed') o.reseed = true; else if (a === '--help' || a === '-h') o.help = true; else if (a === '--group') o.groups = (argv[++i] ?? '').split(',').filter(Boolean); else if (a === '--only') o.only = argv[++i]; else { say(`unknown option ${a}`); o.help = true; } }
  return o;
}
const picks = (o, id) => !o.only || id.includes(o.only);
function printSkipped() { say('\nNOT RUN BY test:all (always listed):'); for (const s of SKIPPED) say(`  SKIPPED  ${s.name}: ${s.reason}`); }

export async function main(argv) {
  const o = parse(argv);
  if (o.help) { say('usage: npm run test:all -- [--group in-process,server,docker] [--only <text>] [--list] [--reseed]\nSee docs/testing.md.'); return 0; }
  const files = fs.readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.mjs')); const cls = classify(files);
  if (cls.unclassified.length || cls.missing.length) { say(`test files not in a group or the skip list: ${cls.unclassified.join(', ') || '-'}; listed but missing: ${cls.missing.join(', ') || '-'}`); return 2; }
  if (o.list) {
    say('in-process (no app server):'); IN_PROCESS.filter((n) => picks(o, n)).forEach((n) => say(`  ${n}`));
    say('server (own app server on a fresh seeded database):'); SERVER.filter((e) => picks(o, e.id)).forEach((e) => say(`  ${e.id}`));
    say('docker (needs Docker and the avara-browser-worker image):'); DOCKER.filter((e) => picks(o, e.id)).forEach((e) => say(`  ${e.id}`)); printSkipped(); return 0;
  }
  fs.mkdirSync(path.join(RUN, 'logs'), { recursive: true });
  const blocked = []; const results = []; const want = (g) => o.groups.includes(g);
  const mode = await chromeMode(); if (!mode) { say('BLOCKED: no browser. Install Google Chrome, or Playwright\'s own browser: see docs/testing.md.'); return 2; }
  const nodeOptions = mode === 'chrome' ? `--import ${path.join(ROOT, 'test', 'support', 'use-chrome.mjs')}` : '';
  say(`Browser: ${mode === 'chrome' ? 'installed Google Chrome (Playwright\'s own browser is not installed)' : 'Playwright\'s own browser'}`);
  let fixture = null; if (!(await portOpen(4200))) { fixture = spawn('node', ['fixture/server.mjs'], { cwd: ROOT, stdio: 'ignore' }); await waitFor(() => portOpen(4200), 10_000); }
  const record = (group, id, r) => {
    const status = r.timedOut ? 'timeout' : r.code === 0 ? 'pass' : 'fail'; results.push({ group, id, status, ms: r.ms });
    fs.writeFileSync(path.join(RUN, 'logs', `${id.replace(/[^\w()-]/g, '_')}.log`), r.out);
    say(`  ${status.toUpperCase().padEnd(7)} ${id} (${Math.round(r.ms / 1000)}s)`);
    if (status !== 'pass') say(r.out.trim().split('\n').slice(-12).map((l) => `      | ${l.slice(0, 200)}`).join('\n'));
  };
  const skip = (group, id, reason) => { results.push({ group, id, status: 'skip', reason }); say(`  SKIP    ${id}: ${reason}`); };
  const baseEnv = { ALLOW_PRIVATE_HOSTS: ALLOW, ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) };
  try {
    if (want('in-process')) { say('\n== in-process =='); for (const n of IN_PROCESS.filter((n) => picks(o, n))) record('in-process', n, await run('node', ['--experimental-strip-types', `test/${n}.mjs`], { env: baseEnv })); }
    const needsServer = (want('server') && SERVER.some((e) => picks(o, e.id))) || (want('docker') && DOCKER.some((e) => picks(o, e.id) && !e.noServer));
    let meta = null;
    if (needsServer) {
      if (!fs.existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) { say('\nBLOCKED: the app is not built. Run: npm run build'); blocked.push('server'); }
      else { try { meta = await ensureSnapshot({ reseed: o.reseed, nodeOptions }); } catch (e) { say(`\nBLOCKED: ${e.message}`); blocked.push('server'); } }
    }
    const runServerTest = async (group, e) => {
      const dir = path.join(RUN, 'db'); const files = path.join(RUN, 'files'); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(files, { recursive: true, force: true }); fs.mkdirSync(files, { recursive: true }); fs.cpSync(SNAPSHOT, dir, { recursive: true });
      const c = { base: `http://127.0.0.1:${APP_PORT}`, file: (n) => path.join(files, n), projects: meta.projects };
      let stop; try { stop = await startServer({ port: APP_PORT, dir, env: e.server?.(c) ?? {} }); } catch (err) { return record(group, e.id, { code: 1, out: String(err.message), ms: 0 }); }
      try { record(group, e.id, await run('node', ['--experimental-strip-types', `test/${e.test}.mjs`, ...e.args(c)], { env: { ...baseEnv, ...(e.env?.(c) ?? {}), ...(e.testEnv?.(c) ?? {}) } })); } finally { await stop(); }
    };
    if (want('server')) { say('\n== server =='); if (blocked.includes('server')) SERVER.filter((e) => picks(o, e.id)).forEach((e) => skip('server', e.id, 'BLOCKED (see above)')); else for (const e of SERVER.filter((e) => picks(o, e.id))) await runServerTest('server', e); }
    if (want('docker')) {
      say('\n== docker =='); const why = dockerStatus();
      for (const e of DOCKER.filter((e) => picks(o, e.id))) { if (why) skip('docker', e.id, why); else if (!e.noServer && blocked.includes('server')) skip('docker', e.id, 'BLOCKED (see above)'); else if (e.noServer) record('docker', e.id, await run('node', ['--experimental-strip-types', `test/${e.test}.mjs`], { env: { ...baseEnv, PATH: `${process.env.PATH}:${DOCKER_BIN}` } })); else await runServerTest('docker', e); }
    }
  } finally { fixture?.kill(); }
  const n = (s) => results.filter((r) => r.status === s).length;
  say('\n== summary =='); for (const g of ['in-process', 'server', 'docker']) { const r = results.filter((x) => x.group === g); if (r.length) say(`  ${g.padEnd(11)} ${r.filter((x) => x.status === 'pass').length} passed, ${r.filter((x) => x.status === 'fail' || x.status === 'timeout').length} failed, ${r.filter((x) => x.status === 'skip').length} skipped (of ${r.length})`); }
  const bad = results.filter((r) => r.status === 'fail' || r.status === 'timeout'); if (bad.length) say(`  FAILED: ${bad.map((r) => r.id).join(', ')}`);
  printSkipped(); fs.writeFileSync(path.join(RUN, 'results.json'), JSON.stringify({ at: new Date().toISOString(), results, blocked }, null, 2));
  say(`\n${n('pass')} passed, ${n('fail') + n('timeout')} failed, ${n('skip')} skipped${blocked.length ? `, blocked: ${blocked.join(', ')}` : ''}. Logs: .data/test-run/logs, results: .data/test-run/results.json`);
  return exitCode(results, blocked);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => process.exit(c));
