// Calls the isolated browser worker (services/browser-worker). The app never runs a flow's browser in its own process.
// Env: WORKER_URL (e.g. http://127.0.0.1:8080), WORKER_TOKEN. Without them, runs fail with a clear message instead of falling back.
import { DiscoveryResult, FlowRun, type Flow } from '../../packages/contracts/index.ts';
import { redactDeep } from '../security/redact.ts';

export class WorkerError extends Error { code: 'not_configured' | 'busy' | 'refused' | 'timeout' | 'unavailable' | 'bad_response'; constructor(message: string, code: WorkerError['code']) { super(message); this.code = code; } }

export async function runOnWorker(flow: Flow): Promise<FlowRun> {
  const url = process.env.WORKER_URL, token = process.env.WORKER_TOKEN;
  if (!url || !token) throw new WorkerError('The browser worker is not configured.', 'not_configured');
  let res: Response;
  try { res = await fetch(`${url.replace(/\/$/, '')}/run`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(flow), signal: AbortSignal.timeout(Number(process.env.WORKER_CALL_TIMEOUT_MS || 100_000)) }); }
  catch (e) { throw new WorkerError((e as Error).name === 'TimeoutError' ? 'The run took too long.' : 'The browser worker could not be reached.', (e as Error).name === 'TimeoutError' ? 'timeout' : 'unavailable'); }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 429) throw new WorkerError('The worker is busy. Try again shortly.', 'busy');
  if (res.status === 504) throw new WorkerError('The run took too long and was stopped.', 'timeout');
  if (res.status === 422 || res.status === 400) throw new WorkerError(String(body?.error ?? 'The worker refused this flow.').slice(0, 200), 'refused');
  if (res.status !== 200) throw new WorkerError('The browser worker could not run this flow.', 'unavailable');
  const parsed = FlowRun.safeParse(body); if (!parsed.success) throw new WorkerError('The worker returned an unreadable result.', 'bad_response');
  return redactDeep(parsed.data);
}

/** Asks the worker to look for journeys from one address. Same token, same isolation as a flow run. */
export async function discoverOnWorker(startUrl: string): Promise<DiscoveryResult> {
  const url = process.env.WORKER_URL, token = process.env.WORKER_TOKEN;
  if (!url || !token) throw new WorkerError('The browser worker is not configured.', 'not_configured');
  let res: Response;
  try { res = await fetch(`${url.replace(/\/$/, '')}/discover`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ startUrl }), signal: AbortSignal.timeout(90_000) }); }
  catch (e) { throw new WorkerError((e as Error).name === 'TimeoutError' ? 'Looking for journeys took too long.' : 'The browser worker could not be reached.', (e as Error).name === 'TimeoutError' ? 'timeout' : 'unavailable'); }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 429) throw new WorkerError('The worker is busy. Try again shortly.', 'busy');
  if (res.status === 504) throw new WorkerError('Looking for journeys took too long and was stopped.', 'timeout');
  if (res.status === 422 || res.status === 400) throw new WorkerError(String(body?.error ?? 'The worker refused this address.').slice(0, 200), 'refused');
  if (res.status !== 200) throw new WorkerError('The browser worker could not look for journeys.', 'unavailable');
  const parsed = DiscoveryResult.safeParse(body); if (!parsed.success) throw new WorkerError('The worker returned an unreadable result.', 'bad_response');
  return redactDeep(parsed.data);
}
