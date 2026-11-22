// What a person pastes into an AI builder is the instruction only: Element, Change and any code. The Verify line (how Avara and the person
// check the result, including any manual check) is for the person, not the builder, so it is shown beside the prompt as "How to check it"
// and never copied into it. The stored fix keeps the Verify line: the AI fix writer and the rescan read it there.
export function splitFix(text: string | null | undefined): { prompt: string; verify: string } {
  const t = text ?? '';
  const m = /\n?Verify:\s*([\s\S]*?)\s*$/.exec(t);
  if (!m) return { prompt: t.trimEnd(), verify: '' };
  return { prompt: t.slice(0, m.index).trimEnd(), verify: m[1].replace(/\s+/g, ' ').trim() };
}
export const promptOnly = (text: string | null | undefined) => splitFix(text).prompt;
