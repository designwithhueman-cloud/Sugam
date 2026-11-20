'use client';
import * as React from 'react';
import { Check, Copy, ChevronLeft, ChevronRight, Crosshair, ExternalLink, Sparkles } from 'lucide-react';
import type { ReportIssue } from '@/lib/report-types.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { cn } from '@/lib/utils.ts';
import { SEV_COLOR } from './PinViewer.tsx';

import { impactLabels, IMPACT_NOTE } from '@/lib/impact.ts';
const ROLE: Record<string, string> = { design: 'Design Fix', no_code: 'No-Code Inspector', dev: 'Dev / Code Fix' };
const BUILDERS = [['lovable', 'Lovable'], ['bolt', 'Bolt.new'], ['v0', 'v0'], ['cursor', 'Cursor']] as const;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }} aria-label={`Copy ${label}`}>
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}{done ? 'Copied' : 'Copy'}<span className="sr-only" role="status">{done ? `${label} copied` : ''}</span>
    </Button>
  );
}
const Code = ({ children, label }: { children: string; label: string }) => (
  <pre tabIndex={0} aria-label={label} className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{children}</pre>
);

type Props = { issue: ReportIssue; selected: boolean; instanceIndex: number; hasPin: boolean; readOnly?: boolean; onLocate: (idx: number) => void };
export const IssueCard = React.forwardRef<HTMLElement, Props>(function IssueCard({ issue, selected, instanceIndex, hasPin, onLocate }, ref) {
  const [builder, setBuilder] = React.useState<(typeof BUILDERS)[number][0]>('lovable');
  const inst = issue.instances[instanceIndex] ?? issue.instances[0];
  const f = issue.fixes;
  const isPass = issue.bucket === 'verified_pass';
  return (
    <article ref={ref} tabIndex={-1} aria-labelledby={`issue-${issue.id}`}
      className={cn('scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm outline-none transition-shadow', selected ? 'border-pine-500 ring-[3px] ring-pine-200' : 'border-slate-200')}
      style={{ borderLeft: `5px solid ${isPass ? '#16a34a' : SEV_COLOR[issue.severity]}` }}>
      <div className="flex items-start gap-3">
        {!isPass && <span aria-hidden className="mt-0.5 grid h-7 min-w-7 place-items-center rounded-full text-xs font-bold text-white" style={{ background: SEV_COLOR[issue.severity] }}>{issue.position}</span>}
        <div className="min-w-0 flex-1">
          <h3 id={`issue-${issue.id}`} className="text-[15px] font-semibold leading-snug text-slate-900">{!isPass && <span className="sr-only">Issue {issue.position}: </span>}{issue.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!isPass && <Badge variant={issue.severity}>{issue.severity[0].toUpperCase() + issue.severity.slice(1)}</Badge>}
            {issue.wcag.map((w) => <Badge key={w.sc} variant="outline">WCAG {w.sc} {w.name} ({w.level})</Badge>)}
            {!isPass && <Badge variant={issue.roleTag}>[{ROLE[issue.roleTag]}]</Badge>}
            {issue.aiEnriched && <Badge variant="ai"><Sparkles aria-hidden className="size-3" />AI refined</Badge>}
          </div>
          {!isPass && <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-700"><span className="font-semibold" title={IMPACT_NOTE}>May affect:</span>{impactLabels(issue.impactGroups).map((l) => <span key={l} className="rounded-full bg-stone px-2 py-0.5 font-semibold text-bark">{l}</span>)}<span className="sr-only">{IMPACT_NOTE}</span></p>}
        </div>
      </div>

      {isPass ? <p className="mt-2 text-sm text-slate-700">{issue.whatToChange}</p> : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{issue.instanceCount} instance{issue.instanceCount === 1 ? '' : 's'}</span>
            {issue.instanceCount > 1 && (
              <span className="inline-flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Previous instance" onClick={() => onLocate((instanceIndex - 1 + issue.instances.length) % issue.instances.length)}><ChevronLeft aria-hidden /></Button>
                <span aria-live="polite">{instanceIndex + 1} of {issue.instances.length}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Next instance" onClick={() => onLocate((instanceIndex + 1) % issue.instances.length)}><ChevronRight aria-hidden /></Button>
              </span>
            )}
            <Button size="sm" variant="subtle" onClick={() => onLocate(instanceIndex)} disabled={!hasPin} aria-label={hasPin ? `Show issue ${issue.position} on the screenshot` : 'Not visible on this screenshot'}><Crosshair aria-hidden />{hasPin ? 'Show on screenshot' : 'Not visible at this width'}</Button>
          </div>

          <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">What to change</h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-800">{issue.whatToChange}</p>

          {inst && (
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-800">Evidence from the page</summary>
              <p className="mt-2 break-all font-mono text-xs text-slate-700">{inst.selector}</p>
              {inst.detail && <p className="mt-2 text-xs text-slate-700">{inst.detail}</p>}
              <div className="mt-2"><Code label="Verbatim HTML of the affected element">{inst.html}</Code></div>
              <p className="mt-1 text-xs text-slate-500">Seen at: {inst.viewports.join(', ')}</p>
            </details>
          )}

          {f && (
            <>
              <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">How to fix it</h4>
              <Tabs defaultValue="prompt" className="mt-2">
                <TabsList aria-label="Fix formats">
                  <TabsTrigger value="prompt">AI Builder Prompt</TabsTrigger>
                  <TabsTrigger value="nocode">No-Code Inspector</TabsTrigger>
                  <TabsTrigger value="code">Code Patch</TabsTrigger>
                </TabsList>
                <TabsContent value="prompt">
                  <div className="mb-2 flex flex-wrap items-center gap-1" role="group" aria-label="AI builder">
                    {BUILDERS.map(([k, label]) => <Button key={k} size="sm" variant={builder === k ? 'default' : 'outline'} aria-pressed={builder === k} onClick={() => setBuilder(k)}>{label}</Button>)}
                    <span className="ml-auto"><CopyButton text={f.aiPrompt[builder]} label={`${builder} prompt`} /></span>
                  </div>
                  <Code label={`Prompt for ${builder}`}>{f.aiPrompt[builder]}</Code>
                </TabsContent>
                <TabsContent value="nocode">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([['Framer', f.noCode.framer], ['Webflow', f.noCode.webflow]] as const).map(([name, steps]) => (
                      <div key={name} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between"><h5 className="text-sm font-semibold">{name}</h5><CopyButton text={steps.map((s, n) => `${n + 1}. ${s}`).join('\n')} label={`${name} steps`} /></div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="code">
                  <div className="grid gap-3">
                    <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-red-700">Before {f.code.language === 'css' ? '(CSS)' : '(verbatim from the page)'}</span></div><Code label="Code before">{f.code.before}</Code></div>
                    {f.code.after && <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-green-700">After ({f.code.language.toUpperCase()})</span><CopyButton text={f.code.after} label="fixed code" /></div><Code label="Code after">{f.code.after}</Code></div>}
                    {f.code.note && <p className="text-xs text-slate-600">{f.code.note}</p>}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
          {issue.helpUrl && <a href={issue.helpUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-pine-700 underline underline-offset-2">Rule documentation (Deque) <ExternalLink aria-hidden className="size-3" /><span className="sr-only">(opens in a new tab)</span></a>}
        </>
      )}
    </article>
  );
});
