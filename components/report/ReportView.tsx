'use client';
// Split-screen report: Visual Pin Viewer (left) linked to prioritised findings (right).
import * as React from 'react';
import { Download, Link2, Monitor, Smartphone, ShieldCheck, Info } from 'lucide-react';
import type { Bucket, Report, ViewportId } from '@/lib/report-types.ts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { PinViewer, type PinViewerHandle, SEV_COLOR } from './PinViewer.tsx';
import { IssueCard } from './IssueCard.tsx';
import { groupOf } from '@/lib/groups.ts';

const BUCKETS: [Bucket, string][] = [['confirmed_failure', 'Confirmed Failures'], ['needs_review', 'Needs Human Verification'], ['verified_pass', 'Verified Passes']];

function ScoreRing({ score }: { score: number }) {
  const c = 2 * Math.PI * 26; const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Sugam score ${score} out of 100`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden><circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="7" /><circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} /></svg>
      <span aria-hidden className="absolute inset-0 grid place-items-center text-lg font-extrabold">{score}</span>
    </div>
  );
}

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

  // pin -> card
  const onPin = (id: string, idx: number) => {
    setSelected({ id, idx });
    const el = cards.current.get(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    el?.focus({ preventScroll: true });
    const issue = report.issues.find((i) => i.id === id);
    if (issue) setAnnounce(`Issue ${issue.position} selected: ${issue.title}`);
  };
  // card -> pin
  const onLocate = (id: string, idx: number) => {
    setSelected({ id, idx }); setPulse((p) => p + 1);
    viewer.current?.scrollToIssue(id, idx);
    const issue = report.issues.find((i) => i.id === id);
    if (issue) setAnnounce(`Showing issue ${issue.position} on the ${vp} screenshot`);
  };

  React.useEffect(() => {
    if (!initial) return;
    const t = setTimeout(() => { viewer.current?.scrollToIssue(initial.id, 0); setPulse((p) => p + 1); cards.current.get(initial.id)?.scrollIntoView({ block: 'nearest' }); }, 400);
    return () => clearTimeout(t);
  }, [initial]);
  const filterNote = filters && Object.values(filters).some(Boolean) ? `Filtered view: ${Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(', ')}` : null;
  const s = report.summary;
  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-4">
          {report.score !== null && <ScoreRing score={report.score} />}
          <div className="min-w-0 flex-1">
            {report.brand && <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: report.brand.primary || '#2b2a27' }}>Prepared by {report.brand.name}</p>}
            <h1 className="truncate text-lg font-bold">{report.pageTitle || report.finalUrl || report.url}</h1>
            <p className="truncate text-sm text-slate-600"><a className="underline underline-offset-2" href={report.finalUrl || report.url} target="_blank" rel="noreferrer">{report.finalUrl || report.url}</a> · {report.standardLabel}</p>
          </div>
          {s && (
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Confirmed failures by severity">
              {(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => <li key={k} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[k] }} /><b>{s.confirmed[k]}</b> {k}</li>)}
            </ul>
          )}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={async () => { const r = await fetch(`/api/scans/${report.id}/share`, { method: 'POST' }); const j = await r.json(); if (r.ok) { setShare(j.url); await navigator.clipboard.writeText(j.url).catch(() => {}); setAnnounce('Client link created and copied.'); } }}><Link2 aria-hidden />Client link</Button>
              <Button variant="outline" size="sm" asChild><a href={`/api/scans/${report.id}/export?format=csv`}><Download aria-hidden />CSV</a></Button>
              <Button variant="outline" size="sm" asChild><a href={`/api/scans/${report.id}/export?format=sarif`}><Download aria-hidden />SARIF</a></Button>
            </div>
          )}
        </div>
        {filterNote && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{filterNote}</p>}
        {share && <p className="mt-2 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-900" role="status">Read-only client link (copied, valid 90 days): <a className="break-all font-mono underline" href={share}>{share}</a></p>}
        <details className="mt-2 text-xs text-slate-600">
          <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold"><Info aria-hidden className="size-3.5" />What this report can and cannot tell you</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Automated checks find a share of accessibility barriers, not all of them. This report never claims full compliance: confirmed failures are definite, items needing human verification must be checked by a person, and real screen-reader testing (NVDA, VoiceOver, JAWS) is still needed.</li>
            <li>{report.standardNote}</li>
            <li>The Sugam score compares scans of the same site over time. It is not a compliance grade.</li>
            {report.engine && <li>Engine: axe-core {report.engine.axe}, {report.engine.browser}, viewports {report.engine.viewports.join(' and ')}. Keyboard trace: 25 Tab presses per viewport.</li>}
            <li>AI analysis: {report.ai?.used ? `on (${report.ai.model}); explanations and fixes marked "AI refined" were reviewed against the extracted HTML.` : report.ai?.reason || 'off'}</li>
            {s?.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]">
        <section aria-label="Visual pin viewer" className="flex min-h-[420px] flex-col gap-2 p-3 lg:p-4">
          <div className="flex items-center justify-between gap-2">
            <Tabs value={vp} onValueChange={(v) => setVp(v as ViewportId)}>
              <TabsList aria-label="Viewport">
                {report.viewports.map((v) => <TabsTrigger key={v.viewport} value={v.viewport}>{v.viewport === 'desktop' ? <Monitor aria-hidden className="size-4" /> : <Smartphone aria-hidden className="size-4" />}{v.viewport === 'desktop' ? 'Desktop 1280' : 'Mobile reflow 320'}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <span className="text-xs text-slate-600">Pins show: {BUCKETS.find((b) => b[0] === bucket)?.[1]}</span>
          </div>
          {viewport ? <PinViewer ref={viewer} viewport={viewport} issues={pinned} selectedId={selected?.id ?? null} pulse={pulse} onSelect={onPin} /> : <p>No screenshot.</p>}
        </section>

        <aside aria-label="Findings" className="flex min-h-0 flex-col border-l border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 p-3">
            <Tabs value={bucket} onValueChange={(v) => { setBucket(v as Bucket); setSelected(null); }}>
              <TabsList aria-label="Finding type" className="w-full">
                {BUCKETS.map(([b, label]) => <TabsTrigger key={b} value={b} className="flex-1 text-xs sm:text-sm">{label} <Badge variant="outline" className="ml-1">{counts[b]}</Badge></TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {bucket === 'verified_pass' && <p className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />These checks ran and passed. Passing automated checks does not prove the page is accessible.</p>}
            {bucket === 'needs_review' && <p className="rounded-xl bg-pine-50 p-3 text-sm text-pine-900">Sugam found a pattern but cannot decide on its own. Each one needs a person to look before it counts as a failure.</p>}
            {shown.length === 0 && <p className="p-4 text-sm text-slate-600">Nothing in this group.</p>}
            {shown.map((i) => (
              <IssueCard key={i.id} ref={(el) => { if (el) cards.current.set(i.id, el); else cards.current.delete(i.id); }} issue={i}
                selected={selected?.id === i.id} instanceIndex={selected?.id === i.id ? selected.idx : 0} readOnly={readOnly}
                hasPin={i.instances.some((x) => x.boxes.some((b) => b.viewport === vp && b.visible))}
                onLocate={(idx) => onLocate(i.id, idx)} />
            ))}
          </div>
        </aside>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
