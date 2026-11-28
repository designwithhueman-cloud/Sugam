// Single source for plan names, prices and what each plan unlocks. Used by the pricing section,
// the upgrade page and the locked report views, so copy and entitlements cannot drift apart.
// Prices are placeholders until billing is connected.
export type PlanId = 'free' | 'site' | 'agency';
export type Feature = 'full_report' | 'share_links' | 'team_members' | 'ai_checks' | 'saved_flows';

export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  free: [],
  site: ['full_report', 'ai_checks', 'saved_flows'],
  agency: ['full_report', 'share_links', 'team_members', 'ai_checks', 'saved_flows'],
};
// Sites and clients a workspace can hold. Enforced when adding them (app/actions.ts).
export const LIMITS: Record<PlanId, { sites: number; clients: number }> = { free: { sites: 1, clients: 1 }, site: { sites: 1, clients: 1 }, agency: { sites: 15, clients: 15 } };
export const hasFeature = (p: PlanId, f: Feature) => PLAN_FEATURES[p].includes(f);

/** The comparison rows on each pricing card. Free makes no AI call; scores come from built-in checks only, so they are the same on every plan. */
export const PLAN_ROWS: { label: string; values: Record<PlanId, string> }[] = [
  { label: 'Automated checks', values: { free: 'All applicable built-in checks', site: 'All applicable built-in checks', agency: 'All applicable built-in checks across client projects' } },
  { label: 'AI-assisted checks', values: { free: 'Not included', site: 'Included · Reviews messaging clarity, UX, design, trust and conversion', agency: 'Included for every client project · Same AI-assisted checks as Creator' } },
  { label: 'Scores and fixes', values: { free: 'Overall and category scores, issue counts and one complete fix', site: 'Same scores, plus all available fixes and evidence', agency: 'All available fixes and evidence, plus shareable client reports' } },
];
export const PLANS: { id: PlanId; name: string; price: string; period: string; summary: string; tagline: string; features: string[]; ongoing?: string }[] = [
  { id: 'free', name: 'Free instant check', price: '$0', period: 'no account needed', tagline: 'Check one page and fix the biggest problem first.',
    summary: 'Check one page. See what could get in a visitor\u2019s way and get your first fix.',
    features: ['One page per scan, desktop and mobile', 'Every built-in check, no AI', 'Page score and a score for each category', 'Counts by category and severity', 'Your first fix: the exact element and the complete fix'] },
  { id: 'site', name: 'Creator / Startup', price: '$19', period: 'per site, per month', tagline: 'For your own site: every finding and fix, after every release.',
    summary: 'Every finding and fix for your site, with AI-assisted checks. Today Avara checks one public page per scan. Whole-site scanning is planned.',
    features: ['Exact elements pinned on desktop and mobile screenshots', 'Full reports with all three fix formats', 'Staging and live scans with before/after', 'Mark false positives “not an issue”, with notes that carry over to later scans', 'CSV and SARIF exports'],
    ongoing: 'Rescan after every release, see new issues as soon as they appear, and keep your team\'s review decisions.' },
  { id: 'agency', name: 'Agency Pro', price: '$149', period: 'per month, up to 15 sites', tagline: 'For client work: every site, with reports you can share.',
    summary: 'Show each client what you found, what changed and what still needs work.',
    features: ['Everything in Creator / Startup', 'Client and site workspaces, with team roles', 'Read-only client links with your name and colour (logo coming soon)', 'Shared review decisions across scans'] },
];
export const planName = (p: PlanId) => PLANS.find((x) => x.id === p)!.name;
