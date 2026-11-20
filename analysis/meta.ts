// Reference data: WCAG success-criterion names, who each criterion affects, and which role
// (design, no-code inspector, developer) usually owns the fix.
export const SC_NAMES: Record<string, [string, 'A' | 'AA' | 'AAA']> = {
  '1.1.1': ['Non-text Content', 'A'], '1.2.1': ['Audio-only and Video-only', 'A'], '1.2.2': ['Captions (Prerecorded)', 'A'], '1.2.3': ['Audio Description or Media Alternative', 'A'], '1.2.4': ['Captions (Live)', 'AA'], '1.2.5': ['Audio Description (Prerecorded)', 'AA'],
  '1.3.1': ['Info and Relationships', 'A'], '1.3.2': ['Meaningful Sequence', 'A'], '1.3.3': ['Sensory Characteristics', 'A'], '1.3.4': ['Orientation', 'AA'], '1.3.5': ['Identify Input Purpose', 'AA'],
  '1.4.1': ['Use of Color', 'A'], '1.4.2': ['Audio Control', 'A'], '1.4.3': ['Contrast (Minimum)', 'AA'], '1.4.4': ['Resize Text', 'AA'], '1.4.5': ['Images of Text', 'AA'], '1.4.6': ['Contrast (Enhanced)', 'AAA'], '1.4.10': ['Reflow', 'AA'], '1.4.11': ['Non-text Contrast', 'AA'], '1.4.12': ['Text Spacing', 'AA'], '1.4.13': ['Content on Hover or Focus', 'AA'],
  '2.1.1': ['Keyboard', 'A'], '2.1.2': ['No Keyboard Trap', 'A'], '2.1.4': ['Character Key Shortcuts', 'A'], '2.2.1': ['Timing Adjustable', 'A'], '2.2.2': ['Pause, Stop, Hide', 'A'], '2.3.1': ['Three Flashes or Below Threshold', 'A'], '2.3.3': ['Animation from Interactions', 'AAA'],
  '2.4.1': ['Bypass Blocks', 'A'], '2.4.2': ['Page Titled', 'A'], '2.4.3': ['Focus Order', 'A'], '2.4.4': ['Link Purpose (In Context)', 'A'], '2.4.5': ['Multiple Ways', 'AA'], '2.4.6': ['Headings and Labels', 'AA'], '2.4.7': ['Focus Visible', 'AA'], '2.4.11': ['Focus Not Obscured (Minimum)', 'AA'],
  '2.5.1': ['Pointer Gestures', 'A'], '2.5.2': ['Pointer Cancellation', 'A'], '2.5.3': ['Label in Name', 'A'], '2.5.4': ['Motion Actuation', 'A'], '2.5.7': ['Dragging Movements', 'AA'], '2.5.8': ['Target Size (Minimum)', 'AA'],
  '3.1.1': ['Language of Page', 'A'], '3.1.2': ['Language of Parts', 'AA'], '3.2.1': ['On Focus', 'A'], '3.2.2': ['On Input', 'A'], '3.2.3': ['Consistent Navigation', 'AA'], '3.2.5': ['Change on Request', 'AAA'], '3.2.4': ['Consistent Identification', 'AA'], '3.2.6': ['Consistent Help', 'A'],
  '3.3.1': ['Error Identification', 'A'], '3.3.2': ['Labels or Instructions', 'A'], '3.3.3': ['Error Suggestion', 'AA'], '3.3.4': ['Error Prevention (Legal, Financial, Data)', 'AA'], '3.3.7': ['Redundant Entry', 'A'], '3.3.8': ['Accessible Authentication (Minimum)', 'AA'],
  '4.1.1': ['Parsing (obsolete in WCAG 2.2)', 'A'], '4.1.2': ['Name, Role, Value', 'A'], '4.1.3': ['Status Messages', 'AA'],
};
export const sc = (...ids: string[]) => ids.map((id) => ({ sc: id, name: SC_NAMES[id]?.[0] ?? id, level: SC_NAMES[id]?.[1] ?? 'A' }));

export type ImpactGroup = 'visual' | 'speech' | 'keyboard' | 'screen_reader' | 'cognitive' | 'hearing' | 'motor';
export function impactFor(scs: string[]): ImpactGroup[] {
  const out = new Set<ImpactGroup>();
  for (const s of scs) {
    if (s === '1.1.1' || s.startsWith('1.3.') || s === '3.1.1' || s === '3.1.2' || s === '4.1.3' || s === '2.4.2' || s === '2.4.1') out.add('screen_reader');
    if (s.startsWith('1.2.')) { out.add('hearing'); out.add('screen_reader'); }
    if (['1.4.1', '1.4.3', '1.4.4', '1.4.5', '1.4.6', '1.4.10', '1.4.11', '1.4.12', '1.3.4', '2.3.1'].includes(s)) out.add('visual');
    if (s.startsWith('2.1.') || ['2.4.3', '2.4.7', '2.4.11', '1.4.13'].includes(s)) out.add('keyboard');
    if (s === '2.4.4' || s === '2.4.6') { out.add('screen_reader'); out.add('cognitive'); }
    if (s === '2.5.3') out.add('speech');
    if (['2.5.1', '2.5.2', '2.5.7', '2.5.8'].includes(s)) out.add('motor');
    if (s.startsWith('2.2.') || s.startsWith('3.2.') || s.startsWith('3.3.') || s === '2.3.3' || s === '1.3.5') out.add('cognitive');
    if (s === '4.1.2') { out.add('screen_reader'); out.add('speech'); }
    if (s === '3.3.2' || s === '1.3.1') out.add('screen_reader');
  }
  return out.size ? [...out] : ['screen_reader'];
}

const DESIGN = new Set(['color-contrast', 'color-contrast-enhanced', 'link-in-text-block', 'target-size', 'meta-viewport', 'meta-viewport-large', 'sugam/focus-not-visible', 'sugam/focus-obscured', 'sugam/reflow-320', 'sugam/reduced-motion', 'sugam/non-text-contrast', 'sugam/text-spacing', 'sugam/small-text', 'sugam/forced-colors-optout']);
const NO_CODE = new Set(['sugam/image-of-text', 'sugam/form-autocomplete-missing', 'sugam/form-input-type', 'sugam/form-required-not-marked', 'sugam/form-label-not-visible', 'sugam/form-group-name', 'sugam/vague-link-text', 'sugam/placeholder-only-label', 'sugam/new-tab-warning', 'sugam/heading-structure', 'sugam/voice-name-not-first', 'image-alt', 'input-image-alt', 'role-img-alt', 'svg-img-alt', 'object-alt', 'area-alt', 'link-name', 'button-name', 'document-title', 'html-has-lang', 'html-lang-valid', 'frame-title', 'video-caption', 'label', 'empty-heading', 'heading-order', 'page-has-heading-one', 'image-redundant-alt', 'sugam/duplicate-cta-label', 'label-content-name-mismatch', 'select-name', 'input-button-name']);
export const roleFor = (ruleId: string): 'design' | 'no_code' | 'dev' => (DESIGN.has(ruleId) ? 'design' : NO_CODE.has(ruleId) ? 'no_code' : 'dev');
