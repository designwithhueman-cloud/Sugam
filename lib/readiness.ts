// "Ready to launch?": one verdict from three sources (the latest scan, the Launch check, saved flows). Pure: no database, no clock of its own.
// The verdict is the worst thing found. It never says "safe": a clean result means no blockers were found in what was checked, and missing,
// stale or unfinished checks keep the verdict at "not fully checked" instead of letting silence read as a pass.
export type Level = 'stop' | 'fix' | 'partial' | 'ready';
export type Area = 'scan' | 'exposure' | 'flows';
export type Reason = { area: Area; kind: 'stop' | 'fix' | 'partial'; text: string; href: string; newlyBroken?: boolean };
export type AreaState = { area: Area; label: string; state: 'ok' | 'problem' | 'incomplete' | 'none'; line: string; at: Date | null; href: string };

export type ReadinessInput = {
  now: Date; staleDays?: number;
  scan: null | { at: Date; score: number | null; critical: number; high: number; introduced: number | null };
  exposure: null | { at: Date; active: boolean; results: { id: string; title: string; status: 'pass' | 'flag' | 'unverified'; severity: string | null }[]; changes: { id: string; title: string; outcome: string }[] };
  flows: { available: boolean; items: { name: string; status: 'passed' | 'failed' | 'blocked' | 'error' | 'running' | 'never_run'; flaky: boolean; at: Date | null; regressed: boolean }[] };
  hrefs: Record<Area, string>;
};
export type Readiness = { level: Level; headline: string; detail: string; reasons: Reason[]; areas: AreaState[]; next: { label: string; href: string } | null };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const days = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export function buildReadiness(i: ReadinessInput): Readiness {
  const stale = i.staleDays ?? 14; const reasons: Reason[] = []; const areas: AreaState[] = [];
  const add = (area: Area, kind: Reason['kind'], text: string, newlyBroken = false) => reasons.push({ area, kind, text, href: i.hrefs[area], ...(newlyBroken ? { newlyBroken } : {}) });
  const old = (at: Date, what: string, area: Area) => { const d = days(at, i.now); if (d > stale) { add(area, 'partial', `Your last ${what} is ${plural(d, 'day')} old. Check again after your latest changes.`); return true; } return false; };

  // ---- the latest scan ----
  if (!i.scan) { add('scan', 'partial', 'No scan yet. Run one so we can look at how your site works for visitors.'); areas.push({ area: 'scan', label: 'Site scan', state: 'incomplete', line: 'Not run yet', at: null, href: i.hrefs.scan }); }
  else {
    const n0 = reasons.length; const s = i.scan;
    if (s.critical > 0) add('scan', 'stop', `${plural(s.critical, 'critical problem')} on your site that visitors will hit.`);
    if (s.high > 0) add('scan', 'fix', `${plural(s.high, 'problem')} to fix before launch.`);
    if ((s.introduced ?? 0) > 0) add('scan', 'fix', `${plural(s.introduced!, 'new problem')} appeared since the scan before. Something you changed may have broken it.`, true);
    const isOld = old(s.at, 'scan', 'scan'); const bad = reasons.slice(n0).some((r) => r.kind !== 'partial');
    areas.push({ area: 'scan', label: 'Site scan', state: bad ? 'problem' : isOld ? 'incomplete' : 'ok', line: bad ? 'Problems found' : `${s.score != null ? `Score ${s.score}. ` : ''}Nothing blocking`, at: s.at, href: i.hrefs.scan });
  }

  // ---- the launch check ----
  if (!i.exposure) { add('exposure', 'partial', 'No launch check yet. It looks for leaked keys and open customer data.'); areas.push({ area: 'exposure', label: 'Launch check', state: 'incomplete', line: 'Not run yet', at: null, href: i.hrefs.exposure }); }
  else {
    const n0 = reasons.length; const e = i.exposure; const fresh = new Set(i.exposure.changes.filter((c) => c.outcome === 'new').map((c) => c.id));
    for (const r of e.results.filter((x) => x.status === 'flag')) add('exposure', r.severity === 'critical' ? 'stop' : 'fix', `${r.title}.${fresh.has(r.id) ? ' This was fine at the last check and is a problem now.' : ''}`, fresh.has(r.id));
    if (!e.active) add('exposure', 'partial', 'Confirm you own your site to run the rest of the security checks.');
    else if (e.results.some((x) => x.status === 'unverified')) add('exposure', 'partial', 'Some security checks could not be completed. Check again.');
    const isOld = old(e.at, 'launch check', 'exposure'); const bad = reasons.slice(n0).some((r) => r.kind !== 'partial');
    areas.push({ area: 'exposure', label: 'Launch check', state: bad ? 'problem' : reasons.length > n0 ? 'incomplete' : 'ok', line: bad ? 'Problems found' : isOld || !e.active ? 'Only partly checked' : 'Nothing found', at: e.at, href: i.hrefs.exposure });
  }

  // ---- saved flows ----
  if (!i.flows.available) areas.push({ area: 'flows', label: 'Saved flows', state: 'none', line: 'Part of Creator and Agency', at: null, href: i.hrefs.flows });
  else if (!i.flows.items.length) areas.push({ area: 'flows', label: 'Saved flows', state: 'none', line: 'None set up. Optional for a public site.', at: null, href: i.hrefs.flows });
  else {
    const n0 = reasons.length; let latest: Date | null = null;
    for (const f of i.flows.items) {
      if (f.at && (!latest || f.at > latest)) latest = f.at;
      if (f.status === 'failed' && !f.flaky) add('flows', 'stop', f.regressed ? `“${f.name}” worked last time and is broken now.` : `“${f.name}” fails. A visitor following this path would hit the same problem.`, f.regressed);
      else if (f.flaky) add('flows', 'fix', `“${f.name}” works only some of the time. Treat it as unreliable.`);
      else if (f.status === 'error') add('flows', 'partial', `“${f.name}” could not be run. Try again.`);
      else if (f.status === 'running') add('flows', 'partial', `“${f.name}” is still running.`);
      else if (f.status === 'never_run') add('flows', 'partial', `“${f.name}” has not been run yet.`);
      else if (f.status === 'blocked') add('flows', 'partial', `“${f.name}” stopped at a step Avara will not do for safety. It was not fully checked.`);
    }
    if (latest) old(latest, 'flow run', 'flows');
    const mine = reasons.slice(n0); const bad = mine.some((r) => r.kind !== 'partial');
    areas.push({ area: 'flows', label: 'Saved flows', state: bad ? 'problem' : mine.length ? 'incomplete' : 'ok', line: bad ? 'Problems found' : mine.length ? 'Not fully checked' : `${plural(i.flows.items.length, 'flow')} passing`, at: latest, href: i.hrefs.flows });
  }

  // ---- verdict: the worst thing found; newly broken things first within each level ----
  const order = { stop: 0, fix: 1, partial: 2 } as const;
  reasons.sort((a, b) => order[a.kind] - order[b.kind] || Number(!!b.newlyBroken) - Number(!!a.newlyBroken));
  const level: Level = reasons.some((r) => r.kind === 'stop') ? 'stop' : reasons.some((r) => r.kind === 'fix') ? 'fix' : reasons.length ? 'partial' : 'ready';
  const missing = reasons.some((r) => r.kind === 'partial');
  const headline = { stop: 'Not ready to launch', fix: 'Almost there: fix these first', partial: 'Not fully checked yet', ready: 'No blockers found' }[level];
  const detail = {
    stop: `Some problems would hurt real visitors or expose your data. Fix those first${reasons.some((r) => r.kind === 'fix') ? ', then the rest' : ''}.${missing ? ' Some checks are also missing or out of date.' : ''}`,
    fix: `There are problems to fix. None is a hard blocker, but each makes launch riskier.${missing ? ' Some checks are also missing or out of date.' : ''}`,
    partial: 'We found nothing wrong in what we checked, but some checks are missing or out of date.',
    ready: 'Everything we checked is recent and clean. This does not cover every possible weakness, so keep re-checking after changes.',
  }[level];
  return { level, headline, detail, reasons, areas, next: reasons[0] ? { label: reasons[0].kind === 'partial' ? 'Finish the checks' : 'Start with the first problem', href: reasons[0].href } : null };
}
