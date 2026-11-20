// Compliance targets -> axe-core tag sets and the WCAG version each one cites.
export type StandardId = 'wcag22aa' | 'ada_title_ii' | 'en_301_549' | 'aoda';
export const STANDARDS: Record<StandardId, { label: string; short: string; wcagVersion: '2.0' | '2.1' | '2.2'; axeTags: string[]; note: string }> = {
  wcag22aa: { label: 'WCAG 2.2 Level AA', short: 'WCAG 2.2 AA', wcagVersion: '2.2', axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'], note: 'Success criterion 4.1.1 Parsing is removed in WCAG 2.2 and is never reported as a failure.' },
  ada_title_ii: { label: 'US ADA Title II (WCAG 2.1 Level AA)', short: 'ADA Title II', wcagVersion: '2.1', axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], note: 'The ADA Title II rule adopts WCAG 2.1 Level AA as the technical standard.' },
  en_301_549: { label: 'EU European Accessibility Act (EN 301 549)', short: 'EN 301 549', wcagVersion: '2.1', axeTags: ['EN-301-549'], note: 'EN 301 549 clause 9 maps to WCAG 2.1 Level AA for web content.' },
  aoda: { label: 'Ontario AODA (WCAG 2.0 Level AA)', short: 'AODA', wcagVersion: '2.0', axeTags: ['wcag2a', 'wcag2aa'], note: 'AODA cites WCAG 2.0 Level AA, excluding live captions (1.2.4) and pre-recorded audio description (1.2.5).' },
};
// Options for every standards picker (hero dropdown, scan settings). The first is the default.
export const STANDARD_OPTIONS: readonly (readonly [StandardId, string])[] = [
  ['wcag22aa', 'WCAG 2.2 Level AA (default)'],
  ['ada_title_ii', 'US ADA Title II (WCAG 2.1 AA)'],
  ['en_301_549', 'EU European Accessibility Act (EN 301 549)'],
  ['aoda', 'Ontario AODA (WCAG 2.0 AA)'],
];
export const isStandard = (s: unknown): s is StandardId => typeof s === 'string' && s in STANDARDS;

// Which WCAG version introduced a success criterion (used to keep findings in scope).
const SINCE_21 = new Set(['1.3.4', '1.3.5', '1.3.6', '1.4.10', '1.4.11', '1.4.12', '1.4.13', '2.1.4', '2.2.6', '2.3.3', '2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6', '4.1.3']);
const SINCE_22 = new Set(['2.4.11', '2.4.12', '2.4.13', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8', '3.3.9']);
export function criterionInScope(sc: string, std: StandardId): boolean {
  const v = STANDARDS[std].wcagVersion;
  if (sc === '4.1.1') return v === '2.0';
  if (SINCE_22.has(sc)) return v === '2.2';
  if (SINCE_21.has(sc)) return v !== '2.0';
  if (std === 'aoda' && (sc === '1.2.4' || sc === '1.2.5')) return false;
  return true;
}
