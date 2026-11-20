// The rule registry: every rule Avara can report, at a version, with where it comes from. A finding stores the rule's id, version and
// source type; the registry row (rule_versions) keeps the URL and section as they were when the report was made. Source type belongs to
// the rule ("a WCAG success criterion", "Google's web.dev guidance", "an axe-core rule", "a usability heuristic"); how sure Avara is
// belongs to each finding (its confidence), never to the rule.
export type Category = 'accessibility' | 'mobile' | 'ux_workflow' | 'performance';
export type SourceType = 'standard' | 'vendor_guidance' | 'tool_rule' | 'usability_heuristic' | 'sugam_check';
export type RuleDef = { id: string; version: string; category: Category; title: string; sourceType: SourceType; sourceUrl: string; sourceSection: string };

export const RULE_VERSION = '1.0.0';
const W = (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;
const NN = 'https://www.nngroup.com/articles/ten-usability-heuristics/';

const def = (id: string, category: Category, title: string, sourceType: SourceType, sourceUrl: string, sourceSection: string): RuleDef => ({ id, version: RULE_VERSION, category, title, sourceType, sourceUrl, sourceSection });

export const RULES: Record<string, RuleDef> = Object.fromEntries([
  def('accessibility/reflow-function-loss', 'accessibility', 'A control cannot be used at 320px wide', 'standard', W('reflow'), 'WCAG 2.2 SC 1.4.10 Reflow: no loss of content or function at 320 CSS px (a 400% zoom on a 1280px screen)'),
  def('mobile/primary-action-missing', 'mobile', 'The main action is missing at 320px wide', 'standard', W('reflow'), 'WCAG 2.2 SC 1.4.10 Reflow: content and functionality available at 320 CSS px without loss of function'),
  def('mobile/primary-action-unusable', 'mobile', 'The main action cannot be used at 320px wide', 'standard', W('reflow'), 'WCAG 2.2 SC 1.4.10 Reflow: no loss of content or function at 320 CSS px'),
  def('mobile/primary-action-inconvenient', 'mobile', 'The main action is hard to use at 320px wide', 'standard', W('target-size-minimum'), 'WCAG 2.2 SC 2.5.8 Target Size (Minimum): at least 24 by 24 CSS px'),
  def('mobile/sticky-ui-interference', 'mobile', 'A fixed or sticky element covers the main action at 320px wide', 'standard', W('focus-not-obscured-minimum'), 'Measured overlap of the primary action by a fixed or sticky element. WCAG 2.2 SC 2.4.11 applies only if the element entirely hides keyboard focus; the passage is not yet verified for this reading'),
  def('mobile/horizontal-scroll', 'mobile', 'The page scrolls sideways at 320px wide', 'standard', W('reflow'), 'WCAG 2.2 SC 1.4.10 Reflow: no two-dimensional scrolling for vertical content'),
  def('workflow/action-cannot-be-activated', 'ux_workflow', 'The main action could not be activated', 'standard', W('reflow'), 'WCAG 2.2 SC 1.4.10 Reflow and SC 2.5.8 Target Size: the control must be reachable and operable'),
  def('workflow/action-no-response', 'ux_workflow', 'Activating the main action shows no response', 'usability_heuristic', NN, 'Nielsen Norman Group heuristic 1, Visibility of system status: the page should show that something happened'),
  def('workflow/first-field-unreachable', 'ux_workflow', 'The first field cannot be reached after the main action', 'standard', W('focus-order'), 'WCAG 2.2 SC 2.4.3 Focus Order: focus must move to the next field in a usable order'),
  def('perf/lcp', 'performance', 'The main content appears slowly (Largest Contentful Paint)', 'vendor_guidance', 'https://web.dev/articles/lcp', 'web.dev, Largest Contentful Paint: good is 2.5 s or less, poor is over 4 s'),
  def('perf/cls', 'performance', 'The layout shifts while loading (Cumulative Layout Shift)', 'vendor_guidance', 'https://web.dev/articles/cls', 'web.dev, Cumulative Layout Shift: good is 0.1 or less, poor is over 0.25'),
  def('perf/lcp-image-lazy', 'performance', 'The main image is lazy-loaded', 'vendor_guidance', 'https://web.dev/articles/optimize-lcp', 'web.dev, Optimize LCP: do not lazy-load the LCP image'),
  def('perf/lcp-image-not-prioritized', 'performance', 'The main image is not prioritised', 'vendor_guidance', 'https://web.dev/articles/optimize-lcp', 'web.dev, Optimize LCP: give the LCP image a high fetch priority'),
  def('perf/cls-unsized-images', 'performance', 'Images without a width and height shift the layout', 'vendor_guidance', 'https://web.dev/articles/optimize-cls', 'web.dev, Optimize CLS: always include width and height on images'),
].map((r) => [r.id, r]));

// WCAG 2.2 success criterion -> its "Understanding" page.
const SC: Record<string, string> = {
  '1.1.1': 'non-text-content', '1.2.1': 'audio-only-and-video-only-prerecorded', '1.2.2': 'captions-prerecorded', '1.2.3': 'audio-description-or-media-alternative-prerecorded',
  '1.3.1': 'info-and-relationships', '1.3.5': 'identify-input-purpose', '1.4.1': 'use-of-color', '1.4.3': 'contrast-minimum', '1.4.4': 'resize-text', '1.4.5': 'images-of-text',
  '1.4.10': 'reflow', '1.4.11': 'non-text-contrast', '1.4.12': 'text-spacing', '2.1.1': 'keyboard', '2.1.2': 'no-keyboard-trap', '2.2.2': 'pause-stop-hide', '2.4.1': 'bypass-blocks',
  '2.4.2': 'page-titled', '2.4.3': 'focus-order', '2.4.4': 'link-purpose-in-context', '2.4.6': 'headings-and-labels', '2.4.7': 'focus-visible', '2.4.11': 'focus-not-obscured-minimum',
  '2.5.3': 'label-in-name', '2.5.7': 'dragging-movements', '2.5.8': 'target-size-minimum', '3.1.1': 'language-of-page', '3.2.1': 'on-focus', '3.3.2': 'labels-or-instructions',
  '3.3.8': 'accessible-authentication-minimum', '4.1.2': 'name-role-value', '4.1.3': 'status-messages',
};
export const wcagUrl = (sc: string) => (SC[sc] ? W(SC[sc]) : null);

// An accessibility finding's rule: a WCAG success criterion when there is one, otherwise the tool's own documentation.
export function accessibilityRule(ruleId: string, title: string, wcag: { sc: string; name: string }[], helpUrl: string | undefined, source: string, axeVersion: string): RuleDef {
  const first = wcag.find((w) => wcagUrl(w.sc));
  const fromAxe = source === 'axe';
  return {
    id: ruleId, version: fromAxe ? `axe-core ${axeVersion}` : RULE_VERSION, category: 'accessibility', title,
    ...(first ? { sourceType: 'standard' as const, sourceUrl: wcagUrl(first.sc)!, sourceSection: `WCAG 2.2 SC ${first.sc} ${first.name}` }
      : { sourceType: fromAxe ? 'tool_rule' as const : 'sugam_check' as const, sourceUrl: helpUrl || 'https://dequeuniversity.com/rules/axe/html', sourceSection: fromAxe ? `axe-core rule ${ruleId}` : `Sugam check ${ruleId}` }),
  };
}
export const SOURCE_LABEL: Record<SourceType, string> = { standard: 'Standard', vendor_guidance: 'Vendor guidance', tool_rule: 'Tool rule', usability_heuristic: 'Usability heuristic', sugam_check: 'Sugam check' };
