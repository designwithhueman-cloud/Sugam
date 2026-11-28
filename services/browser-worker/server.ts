// Browser worker: runs one saved flow per request in a real browser, inside a container with hard limits (see Dockerfile and docker-compose.yml).
//   POST /run   header `authorization: Bearer <WORKER_TOKEN>`, body = a Flow (JSON). Returns the FlowRun.   GET /health  (no auth, no data)
// The network caller can only send a flow. It cannot loosen the policy: PolicyOptions are fixed here to the strict default.
// Limits enforced here: bearer token, body size, one job at a time (more get 429), a hard time limit per job (the process exits and the
// container restarts clean, so a hung browser cannot linger). Memory, CPU, processes and the filesystem are limited by the container.
import http from 'node:http';
import crypto from 'node:crypto';
import { parseFlow } from '../../packages/contracts/index.ts';
import { runFlow } from '../../packages/flow-engine/index.ts';
import { discover } from '../../packages/flow-engine/discover.ts';
import { redactText, redactDeep } from '../../lib/security/redact.ts';   // every log line and response leaves this process masked

const TOKEN = process.env.WORKER_TOKEN ?? '';
if (TOKEN.length < 16) { console.error('WORKER_TOKEN must be set (at least 16 characters). Refusing to start.'); process.exit(1); }
const PORT = Number(process.env.PORT || 8080), MAX_BODY = Number(process.env.WORKER_MAX_BODY || 65536), MAX_JOBS = Number(process.env.WORKER_MAX_JOBS || 1);
const SOFT_MS = Number(process.env.WORKER_JOB_TIMEOUT_MS || 60000), HARD_MS = SOFT_MS + 15000;
const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
const authorised = (h: string | undefined) => { const m = /^Bearer (.+)$/.exec(h ?? ''); return !!m && crypto.timingSafeEqual(digest(m[1]), digest(TOKEN)); };

let running = 0;
const send = (res: http.ServerResponse, status: number, body: unknown) => { const s = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s), 'cache-control': 'no-store' }).end(s); };

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || (req.url !== '/run' && req.url !== '/discover')) return send(res, 404, { error: 'Not found.' });
    if (!authorised(req.headers.authorization)) return send(res, 401, { error: 'Unauthorised.' });
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return send(res, 413, { error: 'The flow is too large.' });
    const chunks: Buffer[] = []; let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > MAX_BODY) return send(res, 413, { error: 'The flow is too large.' }); chunks.push(c as Buffer); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'The body is not valid JSON.' }); }
    if (req.url === '/discover') {   // journey discovery: one address in, candidate journeys out. Same limits as a flow run: one job at a time, a hard time limit.
      const startUrl = (input as { startUrl?: unknown } | null)?.startUrl; if (typeof startUrl !== 'string' || startUrl.length > 2000) return send(res, 400, { error: 'startUrl is required.' });
      if (running >= MAX_JOBS) return send(res, 429, { error: 'The worker is busy. Try again shortly.' });
      running++; const hardD = setTimeout(() => { console.error('discovery passed its hard limit; exiting so the container restarts clean'); try { send(res, 504, { error: 'Looking for journeys took too long and was stopped.' }); } finally { setTimeout(() => process.exit(1), 200); } }, 60000);
      try { const d = await discover(startUrl, { maxMs: 45000 }); console.log(redactText(`discovery ${d.journeys.length} journeys, ${d.pagesVisited} pages, ${d.ms}ms`)); if (!res.writableEnded) send(res, 200, redactDeep(d)); }
      catch (e) { console.error(redactText(`discovery refused or failed: ${(e as Error).message.split('\n')[0].slice(0, 160)}`)); if (!res.writableEnded) send(res, 422, { error: redactText((e as Error).message.split('\n')[0].slice(0, 200)) }); }
      finally { clearTimeout(hardD); running--; }
      return;
    }
    const parsed = parseFlow(input); if (!parsed.ok) return send(res, 400, { error: redactText(parsed.error) });
    if (running >= MAX_JOBS) return send(res, 429, { error: 'The worker is busy. Try again shortly.' });
    running++;
    const hard = setTimeout(() => { console.error(redactText(`job ${parsed.flow.id} passed its hard limit; exiting so the container restarts clean`)); try { send(res, 504, { error: 'The run took too long and was stopped.' }); } finally { setTimeout(() => process.exit(1), 200); } }, HARD_MS);
    try {
      const run = await runFlow(parsed.flow, { maxMs: SOFT_MS });
      console.log(redactText(`job ${parsed.flow.id} ${run.status} ${run.ms}ms`));
      if (!res.writableEnded) send(res, 200, redactDeep(run));
    } catch (e) {
      console.error(redactText(`job ${parsed.flow.id} refused or failed: ${(e as Error).message.split('\n')[0].slice(0, 160)}`));
      if (!res.writableEnded) send(res, 422, { error: redactText((e as Error).message.split('\n')[0].slice(0, 200)) });   // e.g. a private start address
    } finally { clearTimeout(hard); running--; }
  } catch { if (!res.headersSent) send(res, 500, { error: 'Internal error.' }); }
}).listen(PORT, () => console.log(`browser worker listening on ${PORT} (job limit ${MAX_JOBS}, soft ${SOFT_MS}ms, hard ${HARD_MS}ms)`));
