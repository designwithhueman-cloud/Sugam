// Plain-language issue groups for filtering and reporting, rolled up into four pillars.
export const GROUPS = ['Colors and contrast', 'Layout and zoom', 'Motion and timing', 'Voice and speech', 'Keyboard and focus', 'Names and labels', 'Images', 'Forms', 'Links', 'Structure', 'Language and page'] as const;
export type Group = typeof GROUPS[number];

export const PILLARS = {
  visual: { label: 'Visual and contrast', short: 'Visual', groups: ['Colors and contrast', 'Layout and zoom', 'Motion and timing'] },
  voice: { label: 'Speech and voice', short: 'Speech and voice', groups: ['Voice and speech'] },
  keyboard: { label: 'Keyboard and tab flow', short: 'Keyboard', groups: ['Keyboard and focus'] },
  screen_reader: { label: 'Screen readers and semantics', short: 'Screen readers', groups: ['Names and labels', 'Images', 'Forms', 'Links', 'Structure', 'Language and page'] },
} as const satisfies Record<string, { label: string; short: string; groups: readonly Group[] }>;
export type Pillar = keyof typeof PILLARS;
export const PILLAR_KEYS = Object.keys(PILLARS) as Pillar[];
export function pillarOf(g: Group): Pillar {
  return PILLAR_KEYS.find((k) => (PILLARS[k].groups as readonly Group[]).includes(g)) ?? 'screen_reader';
}

export function groupOf(ruleId: string, scs: string[]): Group {
  // Rules whose criteria alone would put them in the wrong group.
  if (/no-main-landmark|heading-structure/.test(ruleId)) return 'Structure';
  if (/new-tab-warning/.test(ruleId)) return 'Links';
  if (/dragging-alternative/.test(ruleId)) return 'Keyboard and focus';
  // Voice and speech first: voice-control naming (2.5.3) and spoken content in media (1.2.x).
  if (/label-content-name-mismatch|video-caption|audio-caption|media-transcript|embedded-media/.test(ruleId) || scs.some((s) => s === '2.5.3' || s.startsWith('1.2.'))) return 'Voice and speech';
  if (/contrast|link-in-text-block/.test(ruleId) || scs.some((s) => ['1.4.1', '1.4.3', '1.4.6', '1.4.11'].includes(s))) return 'Colors and contrast';
  if (/image|img|svg|object|area-alt/.test(ruleId) || scs.includes('1.1.1')) return 'Images';
  if (/link|duplicate-cta/.test(ruleId)) return 'Links';
  if (/label|select-name|autocomplete|form|input/.test(ruleId) || scs.some((s) => s.startsWith('3.3.') || s === '1.3.5')) return 'Forms';
  if (/focus|keyboard|tabindex|scrollable|clickable|tablist|bypass|skip/.test(ruleId) || scs.some((s) => s.startsWith('2.1.') || ['2.4.1', '2.4.3', '2.4.7', '2.4.11'].includes(s))) return 'Keyboard and focus';
  if (/motion|marquee|blink/.test(ruleId) || scs.some((s) => s.startsWith('2.2.') || s.startsWith('2.3.'))) return 'Motion and timing';
  if (/reflow|viewport|target-size|zoom/.test(ruleId) || scs.some((s) => ['1.4.4', '1.4.10', '1.4.12', '2.5.8', '1.3.4'].includes(s))) return 'Layout and zoom';
  if (/lang|title/.test(ruleId) || scs.some((s) => s.startsWith('3.1.') || s === '2.4.2')) return 'Language and page';
  if (/name|aria|button|frame/.test(ruleId) || scs.includes('4.1.2')) return 'Names and labels';
  return 'Structure';
}
