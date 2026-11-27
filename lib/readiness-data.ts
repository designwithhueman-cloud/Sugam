// Gathers what "Ready to launch?" needs for one project from the scan, the Launch check and saved flows, then hands it to buildReadiness.
import { siteStats } from './dashboard.ts';
import { loadReport } from './report.ts';
import { buildView } from './review-view.ts';
import { latestRuns } from './security/service.ts';
import { listFlows, listRuns } from './flows/service.ts';
import { hasFeature, type PlanId } from './plans.ts';
import { compareExposure } from '../packages/security-exposure/index.ts';
import { compareRuns } from '../packages/flow-engine/insights.ts';
import { buildReadiness, type Readiness, type ReadinessInput } from './readiness.ts';
import type { FlowRun } from '../packages/contracts/index.ts';

const MAX_FLOWS = 10;
export async function loadReadiness(project: { id: string }, org: string, plan: PlanId): Promise<Readiness> {
  const base = `/app/${org}/projects/${project.id}`;
  // scan
  const s = await siteStats(project.id); let scan: ReadinessInput['scan'] = null; let scanHref = `${base}/scanner`;
  if (s.latest?.completedAt) {
    scanHref = `/scans/${s.latest.id}`;
    const report = await loadReport(s.latest.id); const t = report ? buildView(report, report.locked ? 'free' : 'paid').board.totals : null;
    scan = { at: s.latest.completedAt, score: s.score?.score ?? null, critical: t?.critical ?? 0, high: t?.high ?? 0, introduced: s.change?.introduced ?? null };
  }
  // launch check
  const runs = await latestRuns(project.id, 2); let exposure: ReadinessInput['exposure'] = null;
  if (runs[0]) { const [cur, prev] = runs; exposure = { at: new Date(cur.at), active: cur.active, results: cur.results, changes: prev && prev.url === cur.url ? compareExposure(prev.results, cur.results) : [] }; }
  // flows
  const available = hasFeature(plan, 'saved_flows'); const items: ReadinessInput['flows']['items'] = [];
  if (available) for (const f of (await listFlows(project.id)).slice(0, MAX_FLOWS)) {
    const rs = await listRuns(f.id); const cur = rs[0]; if (!cur) { items.push({ name: f.name, status: 'never_run', flaky: false, at: null, regressed: false }); continue; }
    const prev = rs.slice(1).find((r) => r.result && (r.status === 'passed' || r.status === 'failed'));
    const res = cur.result as unknown as FlowRun | null;
    items.push({ name: f.name, status: cur.status as ReadinessInput['flows']['items'][number]['status'], flaky: !!res?.flaky, at: cur.finishedAt ?? cur.startedAt, regressed: !!(res && prev?.result && cur.status === 'failed' && compareRuns(prev.result as unknown as FlowRun, res).result === 'regressed') });
  }
  return buildReadiness({ now: new Date(), scan, exposure, flows: { available, items }, hrefs: { scan: scanHref, exposure: `${base}/launch-check`, flows: `${base}/flows` } });
}
