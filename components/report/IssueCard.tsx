'use client';
// One finding as a compact row that opens in place. Closed: the pin number in its severity colour, the title, and one plain
// meta line (severity · WCAG · elements · fix type), so the list scans quickly. Open: who it may affect, where it is (with
// instance stepping and "Show on screenshot"), what to change, the evidence, and the fix in three formats. The row header is a
// real button with aria-expanded; only one row is open at a time (the parent decides).
import * as React from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Crosshair, ExternalLink, Sparkles } from 'lucide-react';
import type { ReportIssue } from '@/lib/report-types.ts';
import { Button } from '@/components/ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { cn } from '@/lib/utils.ts';
import { SEV_COLOR } from './PinViewer.tsx';

import { impactLabels, IMPACT_NOTE } from '@/lib/impact.ts';
import { nonEmpty } from '@/lib/bullets.ts';
import { splitFix, promptOnly } from '@/lib/fix-text.ts';
import { FixPanel } from './FixPanel.tsx';
import { fixesFromSet } from '@/lib/fix-tools.ts';
const ROLE: Record<string, string> = { design: 'Design fix', no_code: 'No-code fix', dev: 'Code fix' };
const BUILDERS = [['lovable', 'Lovable'], ['bolt', 'Bolt.new'], ['v0', 'v0'], ['cursor', 'Cursor']] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="sm" variant="outline" className="rounded-lg" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }} aria-label={`Copy ${label}`}>
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}{done ? 'Copied' : 'Copy'}<span className="sr-only" role="status">{done ? `${label} copied` : ''}</span>
    </Button>
  );
}
const Code = ({ children, label }: { children: string; label: string }) => (
  <pre tabIndex={0} aria-label={label} className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#1e1e1e] p-3 font-mono text-xs leading-relaxed text-neutral-100">{children}</pre>
);
const Label = ({ children }: { children: React.ReactNode }) => <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-pine-600">{children}</h4>;
const segList = 'grid w-full grid-cols-3 gap-1 rounded-xl bg-stone p-1';
const segTrigger = 'min-h-10 flex-1 justify-center whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold text-pine-700 hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm';

type Props = { issue: ReportIssue; selected: boolean; instanceIndex: number; hasPin: boolean; readOnly?: boolean; onToggle?: () => void; onLocate: (idx: number) => void };
export const IssueCard = React.forwardRef<HTMLElement, Props>(function IssueCard({ issue, selected, instanceIndex, hasPin, onToggle, onLocate }, ref) {
  const [builder, setBuilder] = React.useState<(typeof BUILDERS)[number][0]>('lovable');
  const inst = issue.instances[instanceIndex] ?? issue.instances[0];
  const f = issue.fixes;
  const isPass = issue.bucket === 'verified_pass';
  const panel = `issue-${issue.id}-panel`;
  // Without onToggle (the dashboard table opens its own rows) the card is always open and its header is a plain heading.
  const expandable = !!onToggle;
  const open = selected || !expandable;
  const meta = [
    !isPass && cap(issue.severity),
    ...issue.wcag.map((w) => `WCAG ${w.sc}`),
    !isPass && `${issue.instanceCount} element${issue.instanceCount === 1 ? '' : 's'}`,
    !isPass && ROLE[issue.roleTag],
  ].filter(Boolean) as string[];

  const head = (
    <>
          {isPass
            ? <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#e6f4dc] text-[#2d6a00]"><Check className="size-4" strokeWidth={3} /></span>
            : <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: SEV_COLOR[issue.severity] }}>{issue.position}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug text-ink">{!isPass && <span className="sr-only">Issue {issue.position}: </span>}{issue.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-snug text-pine-600">
              {meta.map((m, n) => <React.Fragment key={m}>{n > 0 && <span aria-hidden>·</span>}<span>{m}</span></React.Fragment>)}
              {issue.aiEnriched && <><span aria-hidden>·</span><span className="inline-flex items-center gap-1 text-vio-deep"><Sparkles aria-hidden className="size-3" />AI refined</span></>}
            </span>
          </span>
          {expandable && <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-pine-600 transition-transform', selected && 'rotate-180')} />}
    </>
  );

  return (
    <article ref={ref} tabIndex={-1} aria-labelledby={`issue-${issue.id}`}
      className={cn('scroll-mt-3 rounded-xl border bg-white outline-none transition-[border-color,box-shadow]', selected && expandable ? 'border-ink/25 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)] ring-2 ring-vio/25' : 'border-stone-line hover:border-pine-300')}>
      <h3 className="m-0">
        {expandable
          ? <button type="button" id={`issue-${issue.id}`} aria-expanded={selected} aria-controls={panel} onClick={onToggle} className="flex w-full items-start gap-3 rounded-xl p-3 text-left">{head}</button>
          : <div id={`issue-${issue.id}`} className="flex w-full items-start gap-3 p-3">{head}</div>}
      </h3>

      <div id={panel} hidden={!open} className="space-y-4 border-t border-stone-line px-3 pb-4 pt-3">
        {isPass ? <p className="text-sm leading-relaxed text-pine-700">{issue.whatToChange}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="subtle" className="rounded-lg" onClick={() => onLocate(instanceIndex)} disabled={!hasPin} aria-label={hasPin ? `Show issue ${issue.position} on the screenshot` : 'Not visible on this screenshot'}><Crosshair aria-hidden />{hasPin ? 'Show on screenshot' : 'Not visible at this width'}</Button>
              {issue.instanceCount > 1 && (
                <span className="inline-flex items-center gap-1 text-sm text-pine-700">
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg" aria-label="Previous element" onClick={() => onLocate((instanceIndex - 1 + issue.instances.length) % issue.instances.length)}><ChevronLeft aria-hidden /></Button>
                  <span aria-live="polite" className="tabular-nums">{instanceIndex + 1} of {issue.instances.length}</span>
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg" aria-label="Next element" onClick={() => onLocate((instanceIndex + 1) % issue.instances.length)}><ChevronRight aria-hidden /></Button>
                </span>
              )}
            </div>

            <div>
              <Label>What to change</Label>
              <p className="mt-1 text-sm leading-relaxed text-ink">{issue.whatToChange}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-pine-700"><span className="font-semibold text-ink" title={IMPACT_NOTE}>May affect:</span>{impactLabels(issue.impactGroups).join(', ')}<span className="sr-only">. {IMPACT_NOTE}</span></p>
            </div>

            {inst && (
              <details className="rounded-lg border border-stone-line bg-[#fbfaf7] px-3 py-2 text-sm">
                <summary className="cursor-pointer font-semibold text-ink">Evidence from the page</summary>
                <p className="mt-2 break-all font-mono text-xs text-pine-700">{inst.selector}</p>
                {inst.detail && <p className="mt-2 text-xs text-pine-700">{inst.detail}</p>}
                <div className="mt-2"><Code label="Verbatim HTML of the affected element">{inst.html}</Code></div>
                <p className="mt-1 text-xs text-pine-600">Seen at: {inst.viewports.join(', ')}</p>
              </details>
            )}

            {f && (
              <div>
                <Label>How to fix it</Label>
                <div className="mt-2"><FixPanel fixes={fixesFromSet(f)} id={`issue-${issue.id}`} /></div>
              </div>
            )}
            {issue.helpUrl && <a href={issue.helpUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2">Rule documentation (Deque) <ExternalLink aria-hidden className="size-3" /><span className="sr-only">(opens in a new tab)</span></a>}
          </>
        )}
      </div>
    </article>
  );
});
