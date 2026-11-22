// Single source for plan names, prices and what each plan unlocks. Used by the pricing section,
// the upgrade page and the locked report views, so copy and entitlements cannot drift apart.
// Prices are placeholders until billing is connected.
export type PlanId = 'free' | 'site' | 'agency';
export type Feature = 'full_report' | 'share_links' | 'team_members';

export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  free: [],
  site: ['full_report'],
  agency: ['full_report', 'share_links', 'team_members'],
};
// Sites and clients a workspace can hold. Enforced when adding them (app/actions.ts).
export const LIMITS: Record<PlanId, { sites: number; clients: number }> = { free: { sites: 1, clients: 1 }, site: { sites: 1, clients: 1 }, agency: { sites: 15, clients: 15 } };
export const hasFeature = (p: PlanId, f: Feature) => PLAN_FEATURES[p].includes(f);

export const PLANS: { id: PlanId; name: string; price: string; period: string; summary: string; features: string[]; ongoing?: string }[] = [
  { id: 'free', name: 'Free instant check', price: '$0', period: 'no account needed',
    summary: 'Check one page. See what could get in a visitor\u2019s way and get your first fix.',
    features: ['One page per scan, desktop and mobile', 'Score, severity counts and top 3 issues', 'Your top finding unlocked: exact element and its fix', 'A free account lists every issue type and who it may affect'] },
  { id: 'site', name: 'Creator / Startup', price: '$19', period: 'per site, per month',
    summary: 'Planned: whole-site scanning. Today Avara checks one public page per scan; join the waiting list to hear when more opens.',
    features: ['Exact elements pinned on desktop and mobile screenshots', 'Full reports with all three fix formats', 'Staging and live scans with before/after', 'Mark false positives “not an issue”, with notes that carry over to later scans', 'CSV and SARIF exports'],
    ongoing: 'Rescan after every release, see new issues as soon as they appear, and keep your team\'s review decisions.' },
  { id: 'agency', name: 'Agency Pro', price: '$149', period: 'per month, up to 15 sites',
    summary: 'Show each client what you found, what changed and what still needs work.',
    features: ['Everything in Creator / Startup', 'Client and site workspaces, with team roles', 'White-label, read-only client links', 'Shared review decisions across scans'] },
];
export const planName = (p: PlanId) => PLANS.find((x) => x.id === p)!.name;
