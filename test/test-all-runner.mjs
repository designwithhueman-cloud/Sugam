// The test runner itself (npm run test:all): every test file is in exactly one place, the skip list is explicit, and the exit code means what it says.
// Run: node --experimental-strip-types test/test-all-runner.mjs   (in-process, no servers)
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
const R = await import('../scripts/test-all.mjs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const files = fs.readdirSync(new URL('./', import.meta.url).pathname).filter((f) => f.endsWith('.mjs')); const c = R.classify(files);
ok(c.unclassified.length === 0, `every test file is in a group or the skip list (unclassified: ${c.unclassified.join(', ')})`);
ok(c.missing.length === 0, `no group lists a file that does not exist (missing: ${c.missing.join(', ')})`);
ok(c.duplicated.length === 0, `no test file is in two groups (${c.duplicated.join(', ')})`);
ok(R.classify([...files, 'brand-new-test.mjs']).unclassified.join() === 'brand-new-test', 'a new, unlisted test file is reported');
ok(new Set(R.SERVER.map((e) => e.id)).size === R.SERVER.length && new Set(R.DOCKER.map((e) => e.id)).size === R.DOCKER.length, 'ids are unique');
ok(JSON.stringify(R.SKIPPED.map((s) => s.name)) === JSON.stringify(['audit-real-sites', 'gemini-path (live case)', 'auth', 'setup-test-account']) && R.SKIPPED.every((s) => s.reason.length > 20), 'the four skipped tests are named, each with a reason');
ok(R.DOCKER.map((e) => e.id).join() === 'browser-worker-container,flows-api', 'the docker group is the container test and the flows API test');

ok(R.exitCode([{ status: 'pass' }, { status: 'skip' }]) === 0, 'exit 0 when everything that ran passed, skips included');
ok(R.exitCode([{ status: 'pass' }, { status: 'fail' }]) === 1 && R.exitCode([{ status: 'timeout' }]) === 1, 'exit 1 when a test fails or times out');
ok(R.exitCode([{ status: 'pass' }], ['server']) === 2 && R.exitCode([{ status: 'fail' }], ['server']) === 1, 'exit 2 when a group is blocked, but a failure still wins');

const listed = spawnSync('node', ['--experimental-strip-types', 'scripts/test-all.mjs', '--list'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
ok(listed.status === 0, '--list exits 0');
ok(R.IN_PROCESS.every((n) => listed.stdout.includes(`  ${n}\n`)) && R.SERVER.every((e) => listed.stdout.includes(`  ${e.id}\n`)) && R.DOCKER.every((e) => listed.stdout.includes(`  ${e.id}\n`)), '--list names every test in every group');
ok(['audit-real-sites', 'gemini-path (live case)', 'auth', 'setup-test-account'].every((n) => listed.stdout.includes(`SKIPPED  ${n}:`)), '--list prints the skipped tests with their reasons');
const only = spawnSync('node', ['--experimental-strip-types', 'scripts/test-all.mjs', '--list', '--only', 'fix-writer-server'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
ok((only.stdout.match(/fix-writer-server\(/g) ?? []).length === 4 && !only.stdout.includes('  journey'), '--only narrows the list');

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
