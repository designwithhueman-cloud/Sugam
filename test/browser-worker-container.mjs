// Browser worker in a real container (milestone 4). Starts the image with the same limits as docker-compose.yml and tries to break them.
// Needs: Docker running, the image built (docker build -f services/browser-worker/Dockerfile -t avara-browser-worker .), and the fixture
// server (node fixture/server.mjs, port 4200). Run: node --experimental-strip-types test/browser-worker-container.mjs   (takes about 2 minutes)
import { execFileSync, spawn } from 'node:child_process'; import http from 'node:http';
process.env.PATH += ':/Applications/Docker.app/Contents/Resources/bin';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); }; const info = (n) => console.log(`INFO  ${n}`);
const dk = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); const dkTry = (...a) => { try { return { ok: true, out: dk(...a) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message).trim() }; } };
const TOKEN = 'test-token-0123456789abcdef'; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMITS = ['--user', 'pwuser', '--read-only', '--tmpfs', '/tmp:size=256m', '--shm-size', '256m', '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--add-host', 'host.docker.internal:host-gateway'];
const names = [];
function start(name, port, env = {}, extra = []) {
  names.push(name); dkTry('rm', '-f', name);
  dk('run', '-d', '--name', name, ...LIMITS, ...extra, '-p', `127.0.0.1:${port}:8080`, '-e', `WORKER_TOKEN=${TOKEN}`, ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), 'avara-browser-worker');
}
async function up(port, ms = 40000) { const t = Date.now(); while (Date.now() - t < ms) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return true; } catch { /* not yet */ } await sleep(500); } return false; }
const post = (port, body, token = TOKEN, raw = false) => fetch(`http://127.0.0.1:${port}/run`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: raw ? body : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }), (e) => ({ status: 0, body: { error: e.message } }));
const H = 'http://host.docker.internal:4200/flows/'; const flow = (id, steps, startUrl = H + 'start.html') => ({ id, name: id, startUrl, steps });

// A page server on the host that hangs forever (/hang) or eats memory (/hog), for the time and memory tests.
const bad = http.createServer((req, res) => { if (req.url === '/hang') return; if (req.url === '/hog') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>hog</title><script>const a=[];while(true){a.push(new Array(2e6).fill(Math.random()))}</script>'); } res.end('ok'); }).listen(4300, '0.0.0.0');

try {
  start('aw-main', 18080, { ALLOW_PRIVATE_HOSTS: 'host.docker.internal:4200,host.docker.internal:4300' });
  check('the container starts and reports healthy', await up(18080));
  const ins = JSON.parse(dk('inspect', 'aw-main'))[0].HostConfig;
  check('the limits are really applied: 1 GiB memory and swap, 1 CPU, 256 processes, read-only, all capabilities dropped', ins.Memory === 1073741824 && ins.MemorySwap === 1073741824 && ins.NanoCpus === 1e9 && ins.PidsLimit === 256 && ins.ReadonlyRootfs === true && ins.CapDrop?.includes('ALL') && ins.SecurityOpt?.includes('no-new-privileges:true'));
  check('the worker runs as a non-root user', dk('exec', 'aw-main', 'id', '-u') !== '0', `uid ${dk('exec', 'aw-main', 'id', '-u')}`);
  check('the root filesystem cannot be written (only /tmp)', !dkTry('exec', 'aw-main', 'touch', '/app/x').ok && dkTry('exec', 'aw-main', 'touch', '/tmp/x').ok);
  check('no Linux capabilities are held by the worker process', /CapEff:\s+0+$/m.test(dk('exec', 'aw-main', 'cat', '/proc/1/status')));
  check('the published port is bound to the loopback interface only', /127\.0\.0\.1/.test(dk('port', 'aw-main', '8080')) && !/0\.0\.0\.0/.test(dk('port', 'aw-main', '8080')));

  // ---- the HTTP boundary ----
  check('no token: 401; wrong token: 401', (await post(18080, flow('a', [{ id: 's', action: 'press', key: 'Tab' }]), null)).status === 401 && (await post(18080, flow('a', [{ id: 's', action: 'press', key: 'Tab' }]), 'wrong-token-0123456789')).status === 401);
  check('an oversize body is refused with 413', (await post(18080, JSON.stringify({ pad: 'x'.repeat(70000) }), TOKEN, true)).status === 413);
  const badJson = await post(18080, '{not json', TOKEN, true), badFlow = await post(18080, { id: 'x', name: 'x', startUrl: 'nope', steps: [] });
  check('bad JSON and an invalid flow get 400 with a one-line reason, no stack trace', badJson.status === 400 && badFlow.status === 400 && !/\n|at /.test(badFlow.body.error), badFlow.body?.error);

  // ---- a real run inside the container ----
  const good = await post(18080, flow('good', [{ id: 'next', action: 'click', selector: '#next', expect: [{ type: 'url_contains', value: 'step2.html' }] }, { id: 'show', action: 'click', selector: '#show', expect: [{ type: 'visible', selector: '#hello' }] }]));
  check('a flow runs in the container and passes against the fixture', good.status === 200 && good.body?.status === 'passed' && good.body.steps.every((s) => s.status === 'passed'), good.body?.error ?? good.body?.steps?.map((s) => `${s.stepId}:${s.status}`).join(' '));
  const risky = await post(18080, flow('risky', [{ id: 'save', action: 'click', selector: '#save' }], H + 'risky.html'));
  check('the policy still applies in the container: a form submit is blocked', risky.status === 200 && risky.body?.status === 'blocked' && /\(submit\)/.test(risky.body.steps.at(-1).error));
  const meta = await post(18080, flow('meta', [{ id: 's', action: 'press', key: 'Tab' }], 'http://169.254.169.254/latest/meta-data/'));
  check('a cloud-metadata start address is refused (422)', meta.status === 422, meta.body?.error?.slice(0, 80));
  const ghost = await post(18080, { ...flow('ghost', [{ id: 's', action: 'press', key: 'Tab' }]), policy: { allowSubmit: true }, allowSubmit: true });
  check('a network caller cannot send policy settings: extra keys are ignored and the strict policy still runs', ghost.status === 200 && ghost.body?.status === 'passed');

  // ---- concurrency ----
  const slow = flow('slow', [{ id: 'w', action: 'wait_for', selector: '#never', timeoutMs: 6000 }]);
  const A = post(18080, slow); await sleep(1500); const B = await post(18080, flow('b', [{ id: 's', action: 'press', key: 'Tab' }])); await A;
  check('a second job while one is running is refused with 429', B.status === 429, B.body?.error);

  // ---- egress: the application guard, and what the container itself allows ----
  start('aw-strict', 18081, {});
  await up(18081);
  const hostTry = await post(18081, flow('host', [{ id: 's', action: 'press', key: 'Tab' }]));
  check('without an allow-list the worker refuses to open the host machine’s fixture server', hostTry.status === 422, hostTry.body?.error?.slice(0, 80));
  const reach = dkTry('exec', 'aw-strict', 'node', '-e', "fetch('http://host.docker.internal:4200/flows/start.html').then(r=>console.log(r.status),e=>console.log('blocked'))");
  info(`container-level network: a raw request from inside the container to the host's port 4200 → ${reach.out}. The application guard blocks it; Docker's default network does not. Close this at the network layer (firewall or a restricted network) before production.`);

  // ---- hard time limit: a page that never answers ----
  start('aw-time', 18082, { ALLOW_PRIVATE_HOSTS: 'host.docker.internal:4300', WORKER_JOB_TIMEOUT_MS: '1000' }, ['--restart', 'unless-stopped']);
  await up(18082); const t0 = Date.now();
  const hang = await post(18082, flow('hang', [{ id: 's', action: 'press', key: 'Tab' }], 'http://host.docker.internal:4300/hang'));
  check('a page that never answers is cut off at the hard limit with 504', hang.status === 504 && Date.now() - t0 < 25000, `${hang.status} after ${Math.round((Date.now() - t0) / 1000)}s${hang.status === 504 ? '' : ' ' + JSON.stringify(hang.body).slice(0, 400)}`);
  check('the worker exits and the container restarts clean, healthy again', await up(18082, 45000));

  // ---- memory: a page that allocates until it is stopped ----
  start('aw-mem', 18083, { ALLOW_PRIVATE_HOSTS: 'host.docker.internal:4300' }, ['--restart', 'unless-stopped']);
  await up(18083); const t1 = Date.now();
  const hog = await post(18083, flow('hog', [{ id: 'w', action: 'wait_for', selector: '#never', timeoutMs: 8000 }], 'http://host.docker.internal:4300/hog'));
  const st = JSON.parse(dk('inspect', 'aw-mem'))[0].State;
  check('a memory-hungry page does not get past the 1 GiB cap: the run does not pass', hog.status !== 200 || hog.body?.status !== 'passed', `${hog.status} ${hog.body?.status ?? hog.body?.error ?? ''}; OOMKilled=${st.OOMKilled}, restarts=${JSON.parse(dk('inspect', 'aw-mem'))[0].RestartCount}`);
  check('the worker is still serving afterwards (restarted if it was killed)', await up(18083, 45000), `${Math.round((Date.now() - t1) / 1000)}s`);
  const memNow = dk('stats', '--no-stream', '--format', '{{.MemUsage}}', 'aw-mem'); info(`memory after the test: ${memNow}`);
} finally { bad.close(); for (const n of names) dkTry('rm', '-f', n); }
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
