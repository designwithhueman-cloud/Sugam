// Google Gemini (Developer API) behind the engine's LlmClient interface, as an optional second provider beside Claude.
// Plain REST through fetch, so there is no extra SDK. Created only when AVARA_AI=on, AVARA_AI_PROVIDER=gemini and GEMINI_API_KEY is set.
// The free tier may use what is sent to improve Google's products: use it only on public demo pages (README, privacy page).
// A refusal, malformed JSON, a rate limit (429) or a transient server error never becomes a pass or a fail: every rule in that call comes back
// "inconclusive". Only a configuration error (bad key, unknown model) throws, which the evaluator reports as "AI unavailable".
import { z } from 'zod';
import type { LlmClient, LlmVerdict, WebsiteContext } from '../RuleTypes.ts';
import { redactText } from '../../../../lib/security/redact.ts';

// The graded review (paid plans): met, partly met, unmet or insufficient evidence per criterion, grounded in an exact quote, a screenshot region
// or a browser measurement from the context, with one recommendation. result/evidence stay for the engine's existing rules.
const Grounding = z.object({ kind: z.enum(['quote', 'region', 'measurement']), quote: z.string().optional(), measurement: z.string().optional(), region: z.object({ viewport: z.string(), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional() });
const Verdicts = z.object({ verdicts: z.array(z.object({ ruleId: z.string(), result: z.enum(['pass', 'fail', 'inconclusive', 'not_applicable']), observation: z.string(), evidence: z.array(z.string()), confidence: z.number(),
  grade: z.enum(['met', 'partly_met', 'unmet', 'insufficient_evidence']).optional(), grounding: Grounding.optional(), recommendation: z.string().optional() })) });
const Impacts = z.object({ impacts: z.array(z.object({ ruleId: z.string(), userImpact: z.string(), businessImpact: z.string() })) });
const schemaOf = (s: z.ZodType) => { const { $schema: _drop, ...rest } = z.toJSONSchema(s) as Record<string, unknown>; return rest; };
const VERDICTS_SCHEMA = schemaOf(Verdicts); const IMPACTS_SCHEMA = schemaOf(Impacts);

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_IMAGES = 2;                       // the same cap the Claude client uses
const TIMEOUT_MS = 90_000;
const MAX_RETRY_WAIT_MS = 30_000;           // one retry after a 429, if Google says to wait no longer than this
const REFUSALS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE', 'OTHER']);

export const geminiConfigured = () => process.env.AVARA_AI === 'on' && !!process.env.GEMINI_API_KEY;

/** Something went wrong that says nothing about the page. The rules in the call are reported inconclusive, not passed or failed. */
export class GeminiUndecided extends Error {}
const Undecided = GeminiUndecided;

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; details?: { '@type'?: string; retryDelay?: string }[] };
}

// The engine runs every category at once; the free tier allows only a few requests a minute, so calls go out two at a time.
// The fix writer's single call goes to the front of the line (first), so it is not starved by the review's per-category calls.
let active = 0; const waiting: (() => void)[] = [];
export async function limited<T>(fn: () => Promise<T>, first = false): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => (first ? waiting.unshift(r) : waiting.push(r)));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

/** One JSON-mode generateContent call. Throws GeminiUndecided for anything that says nothing about the page (rate limit, refusal, bad JSON,
 *  server error, timeout) and a plain Error for configuration problems (key, model, request). Shared with the fix writer in analysis/claude.ts. */
export async function geminiJson(model: string, system: string, parts: GeminiPart[], schema: Record<string, unknown>, retried = false): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  // Last line of defence: whatever reaches here, a secret-shaped value is masked before it leaves the server (images are passed through untouched).
  const safeSystem = redactText(system); const safeParts = parts.map((p) => ('text' in p && typeof p.text === 'string' ? { ...p, text: redactText(p.text) } : p)) as GeminiPart[];
  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },   // the key travels in a header, never in the URL
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: safeSystem }] },
        contents: [{ role: 'user', parts: safeParts }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 },
      }),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new Undecided('Gemini did not answer in time');
    throw new Undecided('Gemini could not be reached');
  }
  const body = (await res.json().catch(() => ({}))) as GenerateResponse;
  if (res.status === 429) {
    const delay = body.error?.details?.find((d) => d['@type']?.endsWith('RetryInfo'))?.retryDelay;
    const ms = delay ? Math.ceil(parseFloat(delay) * 1000) : NaN;
    if (!retried && ms >= 0 && ms <= MAX_RETRY_WAIT_MS) { await new Promise((r) => setTimeout(r, ms)); return geminiJson(model, system, parts, schema, true); }
    throw new Undecided('the Gemini free-tier rate limit was reached');
  }
  if (res.status >= 500) throw new Undecided(`Gemini had a server error (${res.status})`);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(body.error?.message ?? res.statusText).split('\n')[0]}`);   // configuration: key, model or request
  if (body.promptFeedback?.blockReason) throw new Undecided(`Gemini declined the request (${body.promptFeedback.blockReason})`);
  const cand = body.candidates?.[0];
  if (!cand) throw new Undecided('Gemini returned no answer');
  if (cand.finishReason && REFUSALS.has(cand.finishReason)) throw new Undecided(`Gemini declined to answer (${cand.finishReason})`);
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  try { return JSON.parse(text); } catch { throw new Undecided(`Gemini returned output that was not valid JSON${cand.finishReason === 'MAX_TOKENS' ? ' (cut off)' : ''}`); }
}

export const geminiModel = () => process.env.AVARA_GEMINI_MODEL || 'gemini-3.5-flash';   // gemini-2.5-flash is closed to new API keys; 3.8-flash was overloaded (503) when tested on 2026-11-21

export function createGeminiClient(model = geminiModel()): LlmClient | null {
  if (!geminiConfigured()) return null;
  return {
    model,
    async evaluate({ system, rules, context, images }) {
      const imgs: GeminiPart[] = (images ?? ([] as WebsiteContext['screenshots'])).slice(0, MAX_IMAGES).map((i) => ({ inline_data: { mime_type: i.mime || 'image/jpeg', data: i.data.toString('base64') } }));
      const parts: GeminiPart[] = [...imgs, { text: `RULES (data):\n${JSON.stringify(rules)}\n\nPAGE CONTEXT (data):\n${JSON.stringify(context)}` }];
      const undecided = (why: string): LlmVerdict[] => rules.map((r) => ({ ruleId: r.ruleId, result: 'inconclusive', observation: `Not decided: ${why}. This says nothing about the page.`, evidence: [], confidence: 0, undecided: true }));
      try {
        const parsed = Verdicts.safeParse(await limited(() => geminiJson(model, system, parts, VERDICTS_SCHEMA)));
        if (!parsed.success) return undecided('Gemini returned verdicts in an unexpected shape');
        return parsed.data.verdicts as LlmVerdict[];
      } catch (e) { if (e instanceof Undecided) return undecided(e.message); throw e; }
    },
    async interpret({ system, failures, context }) {
      try {
        const parsed = Impacts.safeParse(await limited(() => geminiJson(model, system, [{ text: `FAILURES (data):\n${JSON.stringify(failures)}\n\nCONTEXT (data):\n${JSON.stringify(context)}` }], IMPACTS_SCHEMA)));
        return parsed.success ? parsed.data.impacts : [];
      } catch (e) { if (e instanceof Undecided) return []; throw e; }
    },
  };
}
