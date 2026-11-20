// The Claude API behind the engine's LlmClient interface. Rules arrive as data in the user message; the system prompt carries none of them.
// Billed per call, so it is only created when AVARA_AI=on and a key is present.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { LlmClient, LlmVerdict } from '../RuleTypes.ts';

const Verdicts = z.object({ verdicts: z.array(z.object({ ruleId: z.string(), result: z.enum(['pass', 'fail', 'inconclusive', 'not_applicable']), observation: z.string(), evidence: z.array(z.string()), confidence: z.number() })) });
const Impacts = z.object({ impacts: z.array(z.object({ ruleId: z.string(), userImpact: z.string(), businessImpact: z.string() })) });
export const aiConfigured = () => process.env.AVARA_AI === 'on' && !!process.env.ANTHROPIC_API_KEY;

export function createClaudeClient(model = process.env.AVARA_AI_MODEL || 'claude-sonnet-5-5'): LlmClient | null {
  if (!aiConfigured()) return null;
  const client = new Anthropic();
  return {
    model,
    async evaluate({ system, rules, context, images }) {
      const imgs = (images ?? []).slice(0, 2).map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: i.data.toString('base64') } }));
      const res = await client.messages.parse({
        model, max_tokens: 8000, output_config: { format: zodOutputFormat(Verdicts) }, system,
        messages: [{ role: 'user', content: [...imgs, { type: 'text', text: `RULES (data):\n${JSON.stringify(rules)}\n\nPAGE CONTEXT (data):\n${JSON.stringify(context)}` }] }],
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error(`no usable result (${res.stop_reason})`);
      return res.parsed_output.verdicts as LlmVerdict[];
    },
    async interpret({ system, failures, context }) {
      const res = await client.messages.parse({ model, max_tokens: 4000, output_config: { format: zodOutputFormat(Impacts) }, system, messages: [{ role: 'user', content: `FAILURES (data):\n${JSON.stringify(failures)}\n\nCONTEXT (data):\n${JSON.stringify(context)}` }] });
      return res.parsed_output?.impacts ?? [];
    },
  };
}
