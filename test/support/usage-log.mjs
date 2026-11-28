// Records the usage each live model call reports, for cost measurement. Pass-through: the request and response are unchanged.
// Logs one JSON line per call to USAGE_LOG: time, provider, model, HTTP status, duration, image count and the provider's own usage numbers.
// Never logs headers, keys, prompts or page content. Load with NODE_OPTIONS="--import ./test/support/usage-log.mjs" USAGE_LOG=<file>.
import fs from 'node:fs';
const LOG = process.env.USAGE_LOG; const real = globalThis.fetch;
if (LOG) globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input?.url ?? String(input);
  const gemini = /generativelanguage\.googleapis\.com/.test(u), anthropic = /api\.anthropic\.com/.test(u);
  if (!gemini && !anthropic) return real(input, init);
  const t0 = Date.now(); let images = 0;
  try { const b = JSON.parse(init?.body ?? '{}'); images = gemini ? (b.contents ?? []).flatMap((c) => c.parts ?? []).filter((p) => p.inline_data).length : (b.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image').length; } catch { /* body not JSON */ }
  const model = gemini ? decodeURIComponent(u.match(/models\/([^:?]+)/)?.[1] ?? '') : null;
  const res = await real(input, init);
  let usage = null;
  try { const j = await res.clone().json(); usage = gemini ? j.usageMetadata ?? null : j.usage ?? null; if (anthropic) usage = { ...usage, model: j.model }; } catch { /* streamed or not JSON */ }
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date(t0).toISOString(), provider: gemini ? 'gemini' : 'anthropic', model, status: res.status, ms: Date.now() - t0, images, usage }) + '\n');
  return res;
};
