// Optional AI layer. Off unless SUGAM_AI=on. Claude by default (billed per call); AVARA_AI_PROVIDER=gemini uses Google Gemini with GEMINI_API_KEY
// instead (free tier: Google may use the content, so public demo pages only). Either way the model receives the grouped findings with their verbatim HTML, the keyboard trace and the
// viewport screenshots, plus the web-accessibility-audit skill as instructions. It may refine
// the plain-English explanation, the severity and the three fix modes. It may NOT add issues,
// change buckets, or touch selectors/HTML: "before" code always stays the extracted markup.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { DraftIssue } from './analyze.ts';
import type { ScanOutput } from '../scanner/scanner.ts';
import { STANDARDS } from '../lib/standards.ts';
import { aiProvider } from '../src/engines/rule-engine/llm/index.ts';
import { geminiJson, geminiModel, GeminiUndecided, limited, type GeminiPart } from '../src/engines/rule-engine/llm/GeminiClient.ts';

export const AI_MODEL = process.env.SUGAM_AI_MODEL || 'claude-opus-5-5';
export const aiEnabled = () => process.env.SUGAM_AI === 'on';
// AVARA_AI_PROVIDER is the same switch the rule engine reads, so one setting picks the vendor for both AI steps.

const Enrichment = z.object({
  issues: z.array(z.object({
    id: z.number().int(),
    severity: z.enum(['critical', 'serious', 'moderate', 'minor']),
    severity_reason: z.string(),
    what_to_change: z.string(),
    ai_builder_prompt: z.string(),
    framer_steps: z.array(z.string()),
    webflow_steps: z.array(z.string()),
    code_after: z.string(),
  })),
});

const ENRICHMENT_SCHEMA = (() => { const { $schema: _drop, ...rest } = z.toJSONSchema(Enrichment) as Record<string, unknown>; return rest; })();

function skillText(): string {
  const dir = path.join(process.cwd(), 'skills', 'web-accessibility-audit');
  const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  return [read('SKILL.md'), read('references/wcag-22-audit-checks.md')].join('\n\n');
}

export async function enrich(scan: ScanOutput, issues: DraftIssue[]): Promise<{ used: boolean; model?: string; reason?: string; changed: number }> {
  if (!aiEnabled()) return { used: false, reason: 'AI analysis is off (set SUGAM_AI=on to enable).', changed: 0 };
  const targets = issues.filter((i) => i.bucket !== 'verified_pass').slice(0, 30);
  if (!targets.length) return { used: false, reason: 'No findings to analyse.', changed: 0 };
  const payload = targets.map((i, id) => ({
    id, rule: i.ruleId, bucket: i.bucket, severity: i.severity, wcag: i.wcag, title: i.title, what_to_change: i.whatToChange,
    instances: i.instances.length, sample_selector: i.instances[0].selector, sample_html: i.instances[0].html.slice(0, 1200), detail: i.instances[0].detail?.slice(0, 600),
    current_code_after: i.fixes?.code.after.slice(0, 1200),
  }));
  const keyboard = scan.viewports.map((v) => ({ viewport: v.name, steps: v.keyboard.filter((s) => s.selector).map((s) => ({ press: s.press, selector: s.selector, indicator: s.indicator, obscured: s.obscured })) }));
  const system = `${skillText()}\n\nYou are refining an automated accessibility report for ${scan.finalUrl} against ${STANDARDS[scan.standard].label}.\nRules for this task:\n- Only refine the issues given. Do not add, remove or merge issues, and do not change their bucket.\n- Never invent selectors, HTML, colours or measurements. Quote only what is in sample_html and detail.\n- code_after must be a minimal change to sample_html (native HTML first). Keep [bracketed] placeholders for wording only the site owner can know.\n- ai_builder_prompt is a self-contained prompt a user pastes into Lovable, Bolt.new, v0 or Cursor.\n- Write for a non-specialist site owner. Short sentences.`;
  const text = `Screenshots above: ${scan.viewports.map((v) => `${v.name} ${v.width}x${v.height} viewport`).join(', ')}.\n\nKeyboard trace:\n${JSON.stringify(keyboard)}\n\nIssues:\n${JSON.stringify(payload)}`;
  const provider = aiProvider();
  if (!provider) return { used: false, reason: `AVARA_AI_PROVIDER="${process.env.AVARA_AI_PROVIDER}" is not "claude" or "gemini", so AI analysis is off.`, changed: 0 };
  if (provider === 'gemini') return enrichWithGemini(scan, targets, system, text);
  const client = new Anthropic();
  const images = scan.viewports.map((v) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: v.viewportShot.toString('base64') } }));
  try {
    const res = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Enrichment) },
      system,
      messages: [{ role: 'user', content: [...images, { type: 'text', text }] }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return { used: false, model: AI_MODEL, reason: `AI analysis returned no usable result (${res.stop_reason}); deterministic recommendations are shown.`, changed: 0 };
    return { used: true, model: AI_MODEL, changed: apply(targets, res.parsed_output) };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { used: false, model: AI_MODEL, reason: 'AI analysis was rate limited; deterministic recommendations are shown.', changed: 0 };
    if (err instanceof Anthropic.AuthenticationError) return { used: false, model: AI_MODEL, reason: 'AI analysis could not authenticate with the Claude API; deterministic recommendations are shown.', changed: 0 };
    if (err instanceof Anthropic.APIError) return { used: false, model: AI_MODEL, reason: `AI analysis failed (HTTP ${err.status}); deterministic recommendations are shown.`, changed: 0 };
    return { used: false, model: AI_MODEL, reason: 'AI analysis failed; deterministic recommendations are shown.', changed: 0 };
  }
}

/** Gemini path. Anything unusable (rate limit, refusal, malformed output, bad key) leaves the deterministic fixes in place and says why. */
async function enrichWithGemini(scan: ScanOutput, targets: DraftIssue[], system: string, text: string): Promise<{ used: boolean; model?: string; reason?: string; changed: number }> {
  const model = geminiModel();
  if (!process.env.GEMINI_API_KEY) return { used: false, model, reason: 'AI analysis is set to Gemini but GEMINI_API_KEY is not set; deterministic recommendations are shown.', changed: 0 };
  const parts: GeminiPart[] = [...scan.viewports.map((v) => ({ inline_data: { mime_type: 'image/jpeg', data: v.viewportShot.toString('base64') } })), { text }];
  try {
    const parsed = Enrichment.safeParse(await limited(() => geminiJson(model, system, parts, ENRICHMENT_SCHEMA)));
    if (!parsed.success) return { used: false, model, reason: 'AI analysis (Gemini) returned output in an unexpected shape; deterministic recommendations are shown.', changed: 0 };
    return { used: true, model, changed: apply(targets, parsed.data) };
  } catch (err) {
    const why = err instanceof GeminiUndecided ? err.message : (err as Error).message.split('\n')[0].slice(0, 120);
    return { used: false, model, reason: `AI analysis (Gemini) gave no usable result: ${why}; deterministic recommendations are shown.`, changed: 0 };
  }
}

/** Writes a model's refinements onto the issues it was given. It cannot add issues, and "before" code is never replaced. */
function apply(targets: DraftIssue[], out: z.infer<typeof Enrichment>): number {
  let changed = 0;
  for (const e of out.issues) {
    const i = targets[e.id]; if (!i || !i.fixes) continue;
    i.severity = e.severity;
    i.whatToChange = e.what_to_change;
    const prompt = e.ai_builder_prompt;
    i.fixes = {
      aiPrompt: { lovable: `In Lovable chat, paste:\n\n${prompt}`, bolt: `In Bolt.new, paste into the prompt box:\n\n${prompt}`, v0: `In v0, paste into the chat for this project:\n\n${prompt}`, cursor: `In Cursor (Agent or Cmd+K), paste:\n\n${prompt}` },
      noCode: { framer: e.framer_steps.length ? e.framer_steps : i.fixes.noCode.framer, webflow: e.webflow_steps.length ? e.webflow_steps : i.fixes.noCode.webflow },
      code: { ...i.fixes.code, after: i.fixes.code.language === 'css' ? i.fixes.code.after : (e.code_after || i.fixes.code.after) }, // "before" is never replaced
    };
    i.aiEnriched = true; changed++;
  }
  return changed;
}
