'use client';
// The fix for one recommendation, in the builder's own tool: four AI-builder prompts, Framer and Webflow steps, and a code patch.
// Each is short (the element, the smallest change, how to check it). One Copy button per tab.
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import type { AvaraFix } from '@/lib/report-types.ts';
import { bulletLines } from '@/lib/bullets.ts';

const NAMES: Record<string, string> = { lovable: 'Lovable', bolt: 'Bolt', v0: 'v0', cursor: 'Cursor', framer: 'Framer', webflow: 'Webflow', code: 'Code' };
const bare = (p: string) => (p.includes('\n\n') ? p.slice(p.indexOf('\n\n') + 2) : p);
const wrap = '[overflow-wrap:anywhere]';

export function AvaraFixTabs({ fixes, id }: { fixes: AvaraFix[]; id: string }) {
  const order = ['lovable', 'bolt', 'v0', 'cursor', 'framer', 'webflow', 'code'].filter((t) => fixes.some((f) => f.tool === t));
  const [tab, setTab] = React.useState(order[0] ?? 'lovable');
  if (!order.length) return null;
  return (
    <Tabs value={tab} onValueChange={setTab} data-testid={`fix-${id}`}>
      <TabsList aria-label="Choose your tool" className="w-full justify-start rounded-2xl bg-[#f1f0ec]">
        {order.map((t) => <TabsTrigger key={t} value={t} className="rounded-full data-[state=active]:bg-[#d9f56e]">{NAMES[t]}</TabsTrigger>)}
      </TabsList>
      {order.map((t) => {
        const f = fixes.find((x) => x.tool === t)!;
        let text = f.content; let body: React.ReactNode;
        if (f.kind === 'patch') {
          let code: { before: string; after: string; note?: string } = { before: '', after: '' };
          try { code = JSON.parse(f.content); } catch { /* shown as plain text */ }
          text = `Before:\n${code.before}\n\nAfter:\n${code.after}${code.note ? `\n\n${code.note}` : ''}`;
          body = <div className="space-y-3"><div><p className="text-sm font-semibold text-neutral-700">Before</p><pre tabIndex={0} role="region" aria-label="Code before" className={`mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-3 font-mono text-sm ${wrap}`}>{code.before}</pre></div>
            <div><p className="text-sm font-semibold text-neutral-700">After</p><pre tabIndex={0} role="region" aria-label="Code after" className={`mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-3 font-mono text-sm ${wrap}`}>{code.after}</pre></div>{code.note && <p className="text-sm text-neutral-700">{code.note}</p>}</div>;
        } else if (f.kind === 'steps') {
          body = <ol className="list-decimal space-y-1.5 rounded-2xl bg-white p-4 pl-9 text-base">{bulletLines(f.content).map((l, i) => <li key={i} className={wrap}>{l}</li>)}</ol>;
        } else { text = bare(f.content); body = <pre tabIndex={0} role="region" aria-label={`Prompt for ${NAMES[t]}`} data-testid={`prompt-${t}`} className={`max-h-[22rem] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-3 font-mono text-sm leading-relaxed sm:p-4 sm:text-[15px] ${wrap}`}>{text}</pre>; }
        return (
          <TabsContent key={t} value={t} className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-base font-semibold text-ink">{f.kind === 'prompt' ? `Paste this into ${NAMES[t]}` : f.kind === 'steps' ? `Follow these steps in ${NAMES[t]}` : 'Apply this change in your code'}</p>
              <CopyButton text={text} label={f.kind === 'prompt' ? 'prompt' : f.kind === 'steps' ? 'steps' : 'patch'} className="min-h-12 rounded-full border-0 bg-ink px-5 text-white hover:bg-neutral-800" /></div>
            <div className="mt-3">{body}</div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
