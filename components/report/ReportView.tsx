'use client';
// All findings, as one dashboard panel under the review. Top to bottom: the section title with the export actions; a summary
// strip (score, confirmed failures by severity, which is also the colour key for the pins, and what the report can and cannot
// tell you); then the screenshot with numbered pins on the left and the findings on the right. One control picks which
// findings you see and drives both the pins and the list. Findings are compact rows (number, title, one meta line) that open
// one at a time, so the list scans quickly; opening a row shows its pin, and clicking a pin opens its row.
import * as React from 'react';
import { Download, Info, Link2, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import type { Bucket, Report, ViewportId } from '@/lib/report-types.ts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { PinViewer, type PinViewerHandle, SEV_COLOR } from './PinViewer.tsx';
import { IssueCard } from './IssueCard.tsx';
import { groupOf } from '@/lib/groups.ts';
import { cn } from '@/lib/utils.ts';

const BUCKETS: [Bucket, string, string, string][] = [['confirmed_failure', 'Failures', 'Confirmed failures', 'Failures'], ['needs_review', 'Needs review', 'Needs a person to check', 'Review'], ['verified_pass', 'Passed', 'Verified passes', 'Passed']];
const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'] as const;

// Shared looks, matching the dashboard (stone surfaces, ink text, rounded-xl controls)
const segList = 'w-full flex-nowrap gap-1 rounded-xl bg-stone p-1';
const segTrigger = 'group min-h-10 flex-1 justify-center whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold text-pine-700 hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm';
const action = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-pine-300 bg-white px-3.5 text-sm font-semibold text-ink transition-colors hover:border-pine-500 hover:bg-pine-50';

export function ReportView({ report, readOnly = false, initialIssueId, filters }: { report: Report; readOnly?: boolean; initialIssueId?: string; filters?: { fix?: string; wcag?: string; severity?: string; result?: string; group?: string } }) {
  const [vp, setVp] = React.useState<ViewportId>('desktop');
  const initial = initialIssueId ? report.issues.find((i) => i.id === initialIssueId) : undefined;
  const [bucket, setBucket] = React.useState<Bucket>(initial?.bucket ?? (filters?.result === 'needs_review' ? 'needs_review' : 'confirmed_failure'));
  const [selected, setSelected] = React.useState<{ id: string; idx: number } | null>(initial ? { id: initial.id, idx: 0 } : null);
  const [pulse, setPulse] = React.useState(0);
  const [share, setShare] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState('');
  const viewer = React.useRef<PinViewerHandle>(null);
  const cards = React.useRef(new Map<string, HTMLElement>());
  const viewport = report.viewports.find((v) => v.viewport === vp) ?? report.viewports[0];
  const keep = (i: Report['issues'][number]) => !filters || ((!filters.fix || i.roleTag === filters.fix) && (!filters.severity || i.severity === filters.severity) && (!filters.wcag || i.wcag.some((w) => w.sc === filters.wcag)) && (!filters.group || groupOf(i.ruleId, i.wcag.map((w) => w.sc)) === filters.group));
  const shown = report.issues.filter((i) => i.bucket === bucket && keep(i));
  const pinned = shown.filter((i) => i.bucket !== 'verified_pass');
  const counts = Object.fromEntries(BUCKETS.map(([b]) => [b, report.issues.filter((i) => i.bucket === b).length])) as Record<Bucket, number>;
  const bucketLabel = BUCKETS.find((b) => b[0] === bucket)?.[2] ?? '';

  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // pin -> row: open it, bring it into view and move focus to it
  const onPin = (id: string, idx: number) => {
    setSelected({ id, idx });
    const el = cards.current.get(id);
    requestAnimationFrame(() => { el?.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }); el?.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true }); });
    const issue = report.issues.find((i) => i.id === id);
    if (issue) setAnnounce(`Issue ${issue.position} opened: ${issue.title}`);
  };
  // row -> pin
  const onLocate = (id: string, idx: number) => {
    setSelected({ id, idx }); setPulse((p) => p + 1);
    viewer.current?.scrollToIssue(id, idx);
    const issue = report.issues.find((i) => i.id === id);
    if (issue) setAnnounce(`Showing issue ${issue.position} on the ${vp === 'desktop' ? 'desktop' : 'phone'} screenshot`);
  };
  const onToggle = (id: string) => {
    if (selected?.id === id) { setSelected(null); return; }
    const issue = report.issues.find((i) => i.id === id);
    const visible = issue?.instances.some((x) => x.boxes.some((b) => b.viewport === vp && b.visible));
    if (issue && issue.bucket !== 'verified_pass' && visible) onLocate(id, 0); else setSelected({ id, idx: 0 });
  };

  React.useEffect(() => {
    if (!initial) return;
    const t = setTimeout(() => { viewer.current?.scrollToIssue(initial.id, 0); setPulse((p) => p + 1); cards.current.get(initial.id)?.scrollIntoView({ block: 'nearest' }); }, 400);
    return () => clearTimeout(t);
  }, [initial]);
  const filterNote = filters && Object.values(filters).some(Boolean) ? `Filtered view: ${Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(', ')}` : null;
  const s = report.summary;

  return (
    <section aria-labelledby="full-h" className="overflow-hidden rounded-2xl border border-stone-line bg-white">
      {/* 1. What this is, and what you can do with it */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-line px-5 py-5 sm:px-6">
        <div className="min-w-0">
          {report.brand && <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: report.brand.primary || '#2b2a27' }}>Prepared by {report.brand.name}</p>}
          <h2 id="full-h" className="text-2xl font-semibold tracking-tight text-ink">All findings</h2>
          <p className="mt-1 text-base text-pine-600">Every element-level finding, pinned on the full screenshot.</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={action} onClick={async () => { const r = await fetch(`/api/scans/${report.id}/share`, { method: 'POST' }); const j = await r.json(); if (r.ok) { setShare(j.url); await navigator.clipboard.writeText(j.url).catch(() => {}); setAnnounce('Client link created and copied.'); } }}><Link2 aria-hidden className="size-4" />Client link</button>
            <a className={action} href={`/api/scans/${report.id}/export?format=csv`}><Download aria-hidden className="size-4" />CSV</a>
            <a className={action} href={`/api/scans/${report.id}/export?format=sarif`}><Download aria-hidden className="size-4" />SARIF</a>
          </div>
        )}
        {filterNote && <p className="basis-full rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{filterNote}</p>}
        {share && <p className="basis-full rounded-xl bg-pine-50 px-3 py-2 text-sm text-pine-900" role="status">Read-only client link (copied, valid 90 days): <a className="break-all font-mono underline" href={share}>{share}</a></p>}
      </div>

      {/* 2. The numbers at a glance; the severity counts are also the pin colour key */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-stone-line px-5 py-3.5 sm:px-6">
        {report.score !== null && (
          <p className="flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums text-ink">{report.score}</span><span className="text-sm text-pine-600">/ 100 Avara score</span></p>
        )}
        {report.score !== null && s && <span aria-hidden className="hidden h-6 w-px bg-stone-line sm:block" />}
        {s && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm" aria-label="Confirmed failures by severity">
            {SEVERITIES.map((k) => {
              const n = s.confirmed[k];
              return <li key={k} className={cn('flex items-center gap-1.5', n ? 'text-ink' : 'text-pine-600')}><span aria-hidden className={cn('size-2.5 rounded-full', !n && 'opacity-40')} style={{ background: SEV_COLOR[k] }} /><b className="tabular-nums">{n}</b>{k}</li>;
            })}
          </ul>
        )}
        <details className="group text-sm text-pine-700 sm:ml-auto [&[open]]:basis-full [&[open]]:sm:ml-0">
          <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg font-semibold text-ink"><Info aria-hidden className="size-4" />What this report can and cannot tell you</summary>
          <ul className="mt-1 list-disc space-y-1 pb-1 pl-5 leading-relaxed">
            <li>Automated checks find a share of accessibility barriers, not all of them. This report never claims full compliance: confirmed failures are definite, items needing review must be checked by a person, and real screen-reader testing (NVDA, VoiceOver, JAWS) is still needed.</li>
            <li>{report.standardNote}</li>
            <li>The Avara score compares scans of the same site over time. It is not a compliance grade.</li>
            {report.engine && <li>Engine: axe-core {report.engine.axe}, {report.engine.browser}, viewports {report.engine.viewports.join(' and ')}. Keyboard trace: 25 Tab presses per viewport.</li>}
            <li>AI analysis: {report.ai?.used ? `on (${report.ai.model}); explanations and fixes marked "AI refined" were reviewed against the extracted HTML.` : report.ai?.reason || 'off'}</li>
            {s?.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>
      </div>

      {/* 3. Where it is (screenshot) and what it is (findings) */}
      <div className="grid grid-cols-1 lg:h-[min(860px,calc(100vh-6rem))] lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
        <div aria-label="Screenshot with issue pins" role="group" className="flex min-h-[440px] flex-col gap-3 bg-[#f6f5f1] p-3 sm:p-4 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={vp} onValueChange={(v) => setVp(v as ViewportId)} className="w-full sm:w-auto">
              <TabsList aria-label="Screenshot width" className={cn(segList, 'bg-white/80 ring-1 ring-stone-line sm:w-auto')}>
                {report.viewports.map((v) => <TabsTrigger key={v.viewport} value={v.viewport} className={cn(segTrigger, 'data-[state=active]:bg-ink data-[state=active]:text-white')}>{v.viewport === 'desktop' ? <Monitor aria-hidden className="size-4" /> : <Smartphone aria-hidden className="size-4" />}{v.viewport === 'desktop' ? 'Desktop' : 'Phone'}<span className="font-normal opacity-80">{v.viewportWidth}px</span></TabsTrigger>)}
              </TabsList>
            </Tabs>
            <p className="text-sm text-pine-700">Pins: <b className="font-semibold text-ink">{bucketLabel}</b></p>
          </div>
          {viewport ? <PinViewer ref={viewer} viewport={viewport} issues={pinned} selectedId={selected?.id ?? null} pulse={pulse} onSelect={onPin} /> : <p className="text-sm text-pine-700">No screenshot for this scan.</p>}
        </div>

        <div aria-label="Findings" role="group" className="flex min-h-0 flex-col border-t border-stone-line lg:border-l lg:border-t-0">
          <div className="border-b border-stone-line p-3">
            <Tabs value={bucket} onValueChange={(v) => { setBucket(v as Bucket); setSelected(null); }}>
              <TabsList aria-label="Which findings to show" className={cn(segList, 'grid grid-cols-3')}>
                {BUCKETS.map(([b, label, , short]) => (
                  <TabsTrigger key={b} value={b} className={segTrigger}>
                    <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span><span className="min-w-6 rounded-md bg-white px-1.5 text-xs font-semibold tabular-nums text-ink group-data-[state=active]:bg-stone">{counts[b]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {bucket === 'needs_review' && <p className="mt-3 text-sm leading-snug text-pine-700">Avara found a pattern but can’t decide on its own. Each one needs a person to look before it counts as a failure.</p>}
            {bucket === 'verified_pass' && <p className="mt-3 flex items-start gap-2 text-sm leading-snug text-pine-700"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[#2d6a00]" />These checks ran and passed. Passing automated checks does not prove the page is accessible.</p>}
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#fbfaf7] p-3" aria-label={bucketLabel}>
            {shown.length === 0 && <li className="rounded-xl border border-dashed border-stone-line p-4 text-sm text-pine-700">Nothing in this group.</li>}
            {shown.map((i) => (
              <li key={i.id}>
                <IssueCard ref={(el) => { if (el) cards.current.set(i.id, el); else cards.current.delete(i.id); }} issue={i}
                  selected={selected?.id === i.id} instanceIndex={selected?.id === i.id ? selected.idx : 0} readOnly={readOnly}
                  hasPin={i.instances.some((x) => x.boxes.some((b) => b.viewport === vp && b.visible))}
                  onToggle={() => onToggle(i.id)} onLocate={(idx) => onLocate(i.id, idx)} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </section>
  );
}
