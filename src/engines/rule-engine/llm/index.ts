// Picks the model behind the rule engine. Everything stays off unless AVARA_AI=on.
//   AVARA_AI_PROVIDER=claude (default)  needs ANTHROPIC_API_KEY; model from AVARA_AI_MODEL. Billed per call.
//   AVARA_AI_PROVIDER=gemini            needs GEMINI_API_KEY; model from AVARA_GEMINI_MODEL. Free tier: public demo pages only.
// An unknown provider name gives no model rather than silently falling back to the paid one.
import type { LlmClient } from '../RuleTypes.ts';
import { createClaudeClient } from './ClaudeClient.ts';
import { createGeminiClient } from './GeminiClient.ts';

export type AiProvider = 'claude' | 'gemini';
export const aiProvider = (): AiProvider | null => { const p = (process.env.AVARA_AI_PROVIDER || 'claude').trim().toLowerCase(); return p === 'claude' || p === 'gemini' ? p : null; };

export function createLlmClient(): LlmClient | null {
  if (process.env.AVARA_AI !== 'on') return null;
  const p = aiProvider();
  if (p === 'gemini') return createGeminiClient();
  if (p === 'claude') return createClaudeClient();
  console.warn(`AVARA_AI_PROVIDER="${process.env.AVARA_AI_PROVIDER}" is not "claude" or "gemini"; AI review is off.`);
  return null;
}
