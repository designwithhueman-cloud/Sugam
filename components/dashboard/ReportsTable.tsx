'use client';
// Reports: Issues and Pages tabs; Group / Severity / Fix type / WCAG / Result filters;
// sortable columns; share and export; each row expands to the full fix (AI builder prompt,
// Framer and Webflow steps, code patch).
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { X, Download, Share2, Link2, Eye, ArrowDown, ArrowUp, ArrowUpDown, Contrast, Mic, Keyboard, AudioLines, LayoutGrid } from 'lucide-react';
import type { Report, ReportIssue } from '@/lib/report-types.ts';
import { IssueCard } from '@/components/report/IssueCard.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.tsx';
import { FIX_LABELS, SEV_STATUS, SEV_ICON } from './SegmentedBar.tsx';
import { GROUPS, groupOf, PILLARS, PILLAR_KEYS, pillarOf, type Pillar } from '@/lib/groups.ts';
const PILLAR_ICON = { visual: Contrast, voice: Mic, keyboard: Keyboard, screen_reader: AudioLines } as const;
import { cn } from '@/lib/utils.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { decideIssueAction } from '@/app/actions.ts';
import { impactLabels, IMPACT_NOTE } from '@/lib/impact.ts';
import { Lock } from 'lucide-react';

const SEV_LABEL = { critical: 'Critical', serious: 'Serious', moderate: 'Moderate', minor: 'Minor' } as const;
const SEV_RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
const RESULT = { confirmed_failure: 'Confirmed failure', needs_review: 'Needs human review', verified: 'Verified by your team', not_an_issue: 'Marked not an issue' } as const;
export type Decisions = Record<string, { decision: 'confirmed' | 'not_an_issue'; note: string | null; at: string; by: string | null }>;
type Env = 'live' | 'staging';
export type ReportsData = { env: Env; report: Report; previousKeys: string[] | null; previousId: string | null }[];
type SortKey = 'severity' | 'instances' | 'issue';

const selectCls = 'h-11 w-full rounded-xl border border-pine-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500';
const btnCls = 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-pine-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500 disabled:cursor-not-allowed disabled:opacity-50';

export function ReportsTable({ data, projectBase, projectId, decisions, locked = false, canShare = false }: { data: ReportsData; projectBase: string; projectId: string; decisions: Decisions; locked?: boolean; canShare?: boolean }) {
  const router = useRouter(); const sp = useSearchParams(); const path = usePathname();
  const env = (sp.get('env') as Env) || data[0]?.env;
  const f = { pillar: sp.get('pillar') || '', group: sp.get('group') || '', severity: sp.get('severity') || '', fix: sp.get('fix') || '', wcag: sp.get('wcag') || '', result: sp.get('result') || '' };
  const [open, setOpen] = React.useState<string | null>(sp.get('open'));
  const [msg, setMsg] = React.useState('');
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'severity', dir: 1 });
  const current = data.find((d) => d.env === env) ?? data[0];
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(k, v); else q.delete(k); router.replace(`${path}?${q.toString()}`, { scroll: false }); };
  const clear = () => router.replace(`${path}${env ? `?env=${env}` : ''}`, { scroll: false });

  if (!current) return <p className="rounded-2xl bg-white p-6 text-slate-700">No completed scans yet. Run one from the Accessibility scanner.</p>;
  const r = current.report; const prev = current.previousKeys ? new Set(current.previousKeys) : null;
  const all = r.issues.filter((i) => i.bucket !== 'verified_pass').map((i) => ({ ...i, group: groupOf(i.ruleId, i.wcag.map((w) => w.sc)) }));
  const wcagOptions = [...new Set(all.flatMap((i) => i.wcag.map((w) => w.sc)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const groups = GROUPS.filter((g) => all.some((i) => i.group === g) && (!f.pillar || pillarOf(g) === f.pillar));
  const pillarCount = (k: Pillar) => all.filter((i) => pillarOf(i.group) === k && decisions[i.componentKey]?.decision !== 'not_an_issue').length;
  const rows = all
    .filter((i) => {
      const d = decisions[i.componentKey]?.decision;
      const resultOk = !f.result ? d !== 'not_an_issue' : f.result === 'not_an_issue' ? d === 'not_an_issue' : f.result === 'verified' ? d === 'confirmed' : i.bucket === f.result && d !== 'not_an_issue';
      return resultOk && (!f.pillar || pillarOf(i.group) === f.pillar) && (!f.group || i.group === f.group) && (!f.severity || i.severity === f.severity) && (!f.fix || i.roleTag === f.fix) && (!f.wcag || i.wcag.some((w) => w.sc === f.wcag));
    })
    .sort((a, b) => sort.dir * (sort.key === 'severity' ? SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.instanceCount - a.instanceCount : sort.key === 'instances' ? a.instanceCount - b.instanceCount : a.title.localeCompare(b.title)));
  const filtered = Object.values(f).some(Boolean);
  const resolvedCount = prev ? [...prev].filter((k) => !all.some((i) => i.componentKey === k)).length : null;

  const share = async (withFilters: boolean) => {
    const res = await fetch(`/api/scans/${r.id}/share`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(j.message || 'Could not create a link.'); return; }
    const q = new URLSearchParams(); if (withFilters) for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    const url = j.url + (q.toString() ? `?${q}` : '');
    await navigator.clipboard.writeText(url).catch(() => {});
    setMsg(`${withFilters ? 'Filtered' : 'Full'} read-only report link copied. Valid for 90 days: ${url}`);
  };
  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const activeSort = sort.key === k; const Icon = !activeSort ? ArrowUpDown : sort.dir === 1 ? ArrowDown : ArrowUp;
    return (
      <th scope="col" aria-sort={activeSort ? (sort.dir === 1 ? (k === 'severity' ? 'descending' : 'ascending') : (k === 'severity' ? 'ascending' : 'descending')) : 'none'} className={cn('px-3 py-3 font-semibold', className)}>
        <button type="button" onClick={() => setSort({ key: k, dir: activeSort ? (sort.dir === 1 ? -1 : 1) : 1 })} className="inline-flex items-center gap-1 rounded hover:text-pine-700 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500">{children}<Icon aria-hidden className="size-3.5" /></button>
      </th>
    );
  };
  const sel = (id: string, label: string, key: keyof typeof f, options: [string, string][], all: string) => (
    <div><label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      <select id={id} className={selectCls} value={f[key]} onChange={(e) => set(key, e.target.value)}><option value="">{all}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );

  return (
    <Tabs defaultValue="issues">
      <TabsList aria-label="Report views" className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
        <TabsTrigger value="issues" className="rounded-none border-b-2 border-transparent px-4 pb-2.5 text-base data-[state=active]:border-pine-600 data-[state=active]:bg-transparent data-[state=active]:text-pine-700 data-[state=active]:shadow-none">Issues</TabsTrigger>
        <TabsTrigger value="pages" className="rounded-none border-b-2 border-transparent px-4 pb-2.5 text-base data-[state=active]:border-pine-600 data-[state=active]:bg-transparent data-[state=active]:text-pine-700 data-[state=active]:shadow-none">Pages</TabsTrigger>
      </TabsList>

      <TabsContent value="issues" className="mt-6">
        <div role="group" aria-label="Accessibility pillar" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {([['', 'All', LayoutGrid, all.filter((i) => decisions[i.componentKey]?.decision !== 'not_an_issue').length], ...PILLAR_KEYS.map((k) => [k, PILLARS[k].short, PILLAR_ICON[k], pillarCount(k)] as const)] as const).map(([k, label, Icon, n]) => (
            <button key={k || 'all'} type="button" aria-pressed={f.pillar === k}
              onClick={() => { const q = new URLSearchParams(sp.toString()); if (k) q.set('pillar', k); else q.delete('pillar'); q.delete('group'); router.replace(`${path}?${q}`, { scroll: false }); }}
              className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold', f.pillar === k ? 'border-pine-800 bg-pine-800 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-pine-600')}>
              <Icon aria-hidden className="size-4 shrink-0" /><span className="min-w-0 flex-1 leading-tight">{label}</span><span className={cn('rounded-full px-2 text-xs tabular-nums', f.pillar === k ? 'bg-white/20' : 'bg-slate-100')}>{n}</span>
            </button>))}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-5" role="group" aria-label="Filters">
          {data.length > 1 && <div className="w-36"><label htmlFor="f-env" className="mb-1 block text-sm font-semibold text-slate-800">Environment</label><select id="f-env" className={selectCls} value={env} onChange={(e) => set('env', e.target.value)}>{data.map((d) => <option key={d.env} value={d.env}>{d.env === 'live' ? 'Live' : 'Staging'}</option>)}</select></div>}
          <div className="w-44">{sel('f-group', 'Group', 'group', groups.map((g) => [g, g]), 'All groups')}</div>
          <div className="w-36">{sel('f-sev', 'Severity', 'severity', Object.entries(SEV_LABEL), 'All')}</div>
          <div className="w-48">{sel('f-fix', 'Fix type', 'fix', Object.entries(FIX_LABELS), 'All fix types')}</div>
          <div className="w-32">{sel('f-wcag', 'WCAG', 'wcag', wcagOptions.map((w) => [w, w]), 'All')}</div>
          <div className="w-44">{sel('f-res', 'Result', 'result', Object.entries(RESULT), 'All results')}</div>
          <button type="button" className={btnCls} onClick={clear} disabled={!filtered}><X aria-hidden className="size-4" />Clear filters</button>
        </div>

        {locked ? (
          <div className="on-dark mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-pine-900 p-4 text-pine-50">
            <Lock aria-hidden className="size-5 shrink-0" /><p className="min-w-0 flex-1">Free plan: issue types, severity, counts and who they may affect. The finding marked “Fix unlocked” is open. A paid plan unlocks the exact elements, screenshots, repairs, exports and retests for the rest.</p>
            <Link href="/upgrade" className="inline-flex min-h-11 items-center rounded-xl bg-sand px-4 text-sm font-semibold text-pine-900 hover:bg-white">See plans</Link>
          </div>
        ) : (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Link className={cn(btnCls, 'mr-auto')} href={`/scans/${r.id}`}><Eye aria-hidden className="size-4" />Visual pin viewer</Link>
          {canShare && <button type="button" className={btnCls} onClick={() => share(true)} disabled={!filtered}><Link2 aria-hidden className="size-4" />Share filtered report</button>}
          {canShare && <button type="button" className={btnCls} onClick={() => share(false)}><Share2 aria-hidden className="size-4" />Share full report</button>}
          <a className={btnCls} href={`/api/scans/${r.id}/export?format=csv`}><Download aria-hidden className="size-4" />Download issues CSV</a>
          <a className={btnCls} href={`/api/scans/${r.id}/export?format=sarif`} title="SARIF 2.1.0 for code-scanning tools"><Download aria-hidden className="size-4" />SARIF</a>
        </div>
        )}
        <p role="status" className={cn('mt-3 break-all rounded-xl bg-pine-50 px-4 py-2 text-sm text-pine-900', !msg && 'hidden')}>{msg}</p>

        <p className="mt-4 text-sm text-slate-600" aria-live="polite">
          Showing {rows.length} of {all.length} issues{filtered ? ' that match the filters' : ''}{!f.result && all.some((i) => decisions[i.componentKey]?.decision === 'not_an_issue') ? ' (issues your team marked not an issue are hidden; use the Result filter to see them)' : ''}. Latest {current.env} scan, {r.completedAt ? new Date(r.completedAt).toLocaleString() : ''}.
          {resolvedCount !== null && <> {resolvedCount} issue{resolvedCount === 1 ? '' : 's'} resolved since the previous scan. <Link className="font-semibold text-pine-700 underline" href={`${projectBase}/compare?before=${current.previousId}&after=${r.id}`}>See before and after</Link></>}
        </p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">Issues in the latest {current.env} scan. Activate an issue to see how to fix it.</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-900">
              <tr>
                <SortHeader k="severity">Severity</SortHeader>
                <SortHeader k="issue">Issues <span className="ml-1 rounded-full bg-pine-100 px-1.5 text-xs text-pine-800">{rows.length}</span></SortHeader>
                <th scope="col" className="px-3 py-3 font-semibold">WCAG</th>
                <th scope="col" className="px-3 py-3 font-semibold">Group</th>
                <th scope="col" className="px-3 py-3 font-semibold">Fix type</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <SortHeader k="instances" className="text-right">Instances</SortHeader>
              </tr>
            </thead>
            <tbody>{rows.map((i) => <Row key={i.id} locked={locked && i.id !== r.unlockedIssueId} planLocked={locked} issue={i} group={i.group} status={!prev ? 'First scan' : prev.has(i.componentKey) ? 'Still present' : 'New'} decision={decisions[i.componentKey]} projectId={projectId} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} scanId={r.id} />)}</tbody>
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-slate-600">No issues match these filters.</p>}
        </div>
      </TabsContent>

      <TabsContent value="pages" className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Scanned pages</caption>
            <thead className="border-b border-slate-200 bg-slate-50"><tr><th scope="col" className="px-3 py-3">Page</th><th scope="col" className="px-3 py-3">Environment</th><th scope="col" className="px-3 py-3">Avara score</th><th scope="col" className="px-3 py-3">Confirmed issues</th><th scope="col" className="px-3 py-3">Needs review</th><th scope="col" className="px-3 py-3"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{data.map((d) => (
              <tr key={d.env} className="border-b border-slate-100">
                <td className="max-w-sm px-3 py-3"><span className="block font-semibold text-slate-900">{d.report.pageTitle}</span><span className="break-all text-slate-600">{d.report.finalUrl || d.report.url}</span></td>
                <td className="px-3 py-3 capitalize">{d.env}</td><td className="px-3 py-3">{d.report.score != null ? <span className="text-lg font-bold tabular-nums">{d.report.score}</span> : <span className="text-sm text-slate-600" title={d.report.scoreReason ?? undefined}>Not scored</span>}</td>
                <td className="px-3 py-3 tabular-nums">{d.report.summary?.confirmedIssues}</td><td className="px-3 py-3 tabular-nums">{d.report.summary?.needsReview}</td>
                <td className="px-3 py-3"><Link className="font-semibold text-pine-700 underline underline-offset-2" href={`/scans/${d.report.id}`}>Open visual report</Link></td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">Each scan covers one page. Multi-page crawling is not built yet.</p>
      </TabsContent>
    </Tabs>
  );
}

function Row({ locked, planLocked, issue, group, status, decision, projectId, open, onToggle, scanId }: { locked: boolean; planLocked: boolean; issue: ReportIssue; group: string; status: string; decision?: Decisions[string]; projectId: string; open: boolean; onToggle: () => void; scanId: string }) {
  const router = useRouter();
  const levels = [...new Set(issue.wcag.map((w) => w.level))].join(', ');
  return (
    <>
      <tr className={cn('border-b border-slate-100 align-top', open && 'bg-pine-50/50')}>
        <td className="whitespace-nowrap px-3 py-3"><span className="inline-flex items-center gap-2"><span aria-hidden className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-white" style={{ background: SEV_STATUS[issue.severity] }}>{SEV_ICON[issue.severity]}</span>{SEV_LABEL[issue.severity]}</span></td>
        <th scope="row" className="max-w-xs px-3 py-3 font-normal">
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`fix-${issue.id}`} className="text-left font-semibold text-pine-700 underline underline-offset-2 hover:text-pine-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500">{issue.title}</button>
          {planLocked && !locked && <span className="ml-2 inline-block rounded-full bg-[#d9f56e] px-2 py-0.5 text-xs font-semibold text-ink">Fix unlocked</span>}
          {decision ? <span className={cn('ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold', decision.decision === 'confirmed' ? 'bg-teal-50 text-teal-900' : 'bg-slate-100 text-slate-700')}>{decision.decision === 'confirmed' ? 'Verified issue' : 'Not an issue'}</span> : issue.bucket === 'needs_review' && <span className="ml-2 inline-block rounded-full bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-800">Needs review</span>}
        </th>
        <td className="whitespace-nowrap px-3 py-3">{issue.wcag.length ? <><span className="font-semibold">{levels}</span><span className="block text-xs text-slate-600">{issue.wcag.map((w) => w.sc).join(', ')}</span></> : 'Best practice'}</td>
        <td className="px-3 py-3">{group}</td>
        <td className="px-3 py-3">{FIX_LABELS[issue.roleTag]}</td>
        <td className="whitespace-nowrap px-3 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', status === 'New' ? 'bg-red-50 text-red-800' : status === 'Still present' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700')}>{status}</span></td>
        <td className="px-3 py-3 text-right tabular-nums">{issue.instanceCount}</td>
      </tr>
      {open && (
        <tr id={`fix-${issue.id}`}><td colSpan={7} className="bg-pine-50/50 px-3 pb-4">
          {locked ? (
            <div className="rounded-2xl border border-stone-line bg-white p-4">
              <p className="text-sm font-semibold text-bark">May affect</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">{impactLabels(issue.impactGroups).map((l) => <li key={l} className="rounded-full bg-stone px-2.5 py-0.5 text-sm font-semibold text-bark">{l}</li>)}</ul>
              <p className="mt-2 text-xs text-slate-700">{IMPACT_NOTE}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-bark"><Lock aria-hidden className="size-4" />The {issue.instanceCount} affected element{issue.instanceCount === 1 ? '' : 's'}, screenshots and the repair unlock with a paid plan. <Link className="font-semibold text-pine-800 underline" href="/upgrade">See plans</Link></p>
            </div>
          ) : <>
          <IssueCard issue={issue} selected={false} instanceIndex={0} hasPin={!planLocked} onLocate={() => router.push(`/scans/${scanId}?issue=${issue.id}`)} />
          {!planLocked && (<section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`dec-${issue.id}`}>
            <h4 id={`dec-${issue.id}`} className="font-semibold">Human verification</h4>
            {decision ? <p className="mt-1 text-sm text-slate-700">{decision.decision === 'confirmed' ? 'Confirmed as a real issue' : 'Marked not an issue'} by {decision.by || 'a former member'} on {new Date(decision.at).toLocaleDateString()}{decision.note ? `: "${decision.note}"` : '.'} This decision applies to later scans of the same markup.</p>
              : <p className="mt-1 text-sm text-slate-600">{issue.bucket === 'needs_review' ? 'Avara could not decide this automatically. Check it on the page, then record what you found.' : 'If this is a false positive, record why. The decision carries over to later scans of the same markup.'}</p>}
            <ActionForm action={decideIssueAction} submit="Save decision" className="mt-3" refreshOnOk>
              <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="issueId" value={issue.id} />
              <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="sr-only">Decision</legend>
                <label className="flex items-center gap-2"><input type="radio" name="decision" value="confirmed" defaultChecked={decision?.decision !== 'not_an_issue'} className="size-4" />It is a real issue</label>
                <label className="flex items-center gap-2"><input type="radio" name="decision" value="not_an_issue" defaultChecked={decision?.decision === 'not_an_issue'} className="size-4" />Not an issue (false positive)</label>
                {decision && <label className="flex items-center gap-2"><input type="radio" name="decision" value="clear" className="size-4" />Clear the decision</label>}
              </fieldset>
              <div><label htmlFor={`note-${issue.id}`} className="mb-1 block text-sm font-semibold">Note <span className="font-normal text-slate-600">(required for "not an issue")</span></label>
                <textarea id={`note-${issue.id}`} name="note" rows={2} defaultValue={decision?.note ?? ''} className="w-full rounded-lg border border-slate-400 p-2 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500" /></div>
            </ActionForm>
          </section>)}
          </>}
        </td></tr>
      )}
    </>
  );
}
