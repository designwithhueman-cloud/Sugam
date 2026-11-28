// The browser worker's own logs and responses carry no secrets. Runs services/browser-worker/server.ts as a plain process (the same file the Docker image
// runs) and sends flows whose id and address hold synthetic canaries. Docker itself is checked separately (docker group); this needs no daemon.
// Run: node test/worker-logs.mjs
import { spawn } from 'node:child_process';
import { makeCanaries, RAW } from './support/canaries.mjs';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const C = makeCanaries(); const PORT = 4343, TOKEN = 'worker-test-token-' + Math.random().toString(36).slice(2, 14);
const child = spawn('node', ['--experimental-strip-types', 'services/browser-worker/server.ts'], { env: { ...process.env, PORT: String(PORT), WORKER_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', (d) => (logs += d)); child.stderr.on('data', (d) => (logs += d));
for (let i = 0; i < 50 && !/listening/.test(logs); i++) await new Promise((r) => setTimeout(r, 200));
check('the worker started', /listening/.test(logs));
const run = async (flow) => { const r = await fetch(`http://127.0.0.1:${PORT}/run`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(flow) }); return { status: r.status, text: await r.text() }; };
const flow = (id, startUrl) => ({ id, name: 'canary', startUrl, steps: [{ id: 's1', action: 'reload' }] });
const a = await run(flow(C.stripe, `http://127.0.0.1:9/p/${C.github}?api_key=${C.aws}`));   // a private address: refused, and the refusal is logged
const b = await run(flow('ok', `http://127.0.0.1:9/p/${C.openai}`));
const bad = await run({ id: 'x', name: C.anthropic, startUrl: 'not a url', steps: [] });
await new Promise((r) => setTimeout(r, 300));
check('the refused jobs answered with an error (so the log path ran)', a.status === 422 && b.status === 422 && bad.status === 400, `${a.status} ${b.status} ${bad.status}`);
check('the worker logged the refusals', /refused or failed/.test(logs));
const leaked = (t) => RAW(C).filter((v) => t.includes(v));
check('no raw canary in the worker’s stdout or stderr', leaked(logs).length === 0, leaked(logs).length ? `${leaked(logs).length} leaked` : '');
check('no raw canary in any response it sent', leaked(a.text + b.text + bad.text).length === 0);
check('…the log still says which job was refused (masked, not deleted)', /job sk_live_••••/.test(logs) || /job .{0,12}••••/.test(logs), logs.split('\n').find((l) => /refused/.test(l))?.slice(0, 120));
child.kill();
const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
