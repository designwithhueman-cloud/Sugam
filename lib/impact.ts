// Who an issue may affect. These describe potential impact from the WCAG criteria involved;
// Sugam does not run real screen readers or voice-control software.
export const IMPACT_LABELS: Record<string, string> = {
  screen_reader: 'Screen-reader navigation',
  speech: 'Voice control',
  keyboard: 'Keyboard navigation',
  visual: 'Low vision',
  hearing: 'Deaf and hard of hearing',
  cognitive: 'Cognitive and attention',
  motor: 'Limited dexterity',
};
export const impactLabels = (groups: string[]) => groups.map((g) => IMPACT_LABELS[g]).filter(Boolean);
export const IMPACT_NOTE = 'Potential impact, based on the WCAG criteria involved. Sugam does not test with real screen readers or voice-control software.';

// One plain sentence about who an issue may get in the way of, from the same impact groups as the labels above.
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}`);
export function affectsSentence(groups: string[]): string {
  const use = [groups.includes('screen_reader') && 'screen readers', groups.includes('keyboard') && 'a keyboard', groups.includes('speech') && 'voice control'].filter(Boolean) as string[];
  const have = [groups.includes('visual') && 'low vision', groups.includes('motor') && 'limited dexterity', groups.includes('cognitive') && 'cognitive or attention needs'].filter(Boolean) as string[];
  const parts = [use.length && `people who use ${list(use)}`, have.length && `people with ${list(have)}`, groups.includes('hearing') && 'people who are deaf or hard of hearing'].filter(Boolean) as string[];
  return parts.length ? `This may get in the way of ${parts.join(' and ')}.` : 'This may get in the way of some visitors.';
}
