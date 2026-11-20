'use client';
// A fix, opened on demand: the person's own builder, the exact change, one copy button, and how to check it. The builder choice is remembered on this device.
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton.tsx';
import type { AvaraFix } from '@/lib/report-types.ts';

const NAMES: Record<string, string> = { lovable: 'Lovable', bolt: 'Bolt', v0: 'v0', cursor: 'Cursor', framer: 'Framer', webflow: 'Webflow', code: 'Plain code' };
const ORDER = ['lovable', 'bolt', 'v0', 'cursor', 'framer', 'webflow', 'code'];
const bare = (p: string) => (p.includes('\n\n') ? p.slice(p.indexOf('\n\n') + 2) : p);
const KEY = 'sugam:builder';
const wrap = '[overflow-wrap:anywhere]';

export function FixPanel({ fixes, id }: { fixes: AvaraFix[]; id: string }) {
  const tools = ORDER.filter((t) => fixes.some((f) => f.tool === t));
  const [tool, setTool] = React.useState(tools[0] ?? 'lovable');
  React.useEffect(() => { try { const s = localStorage.getItem(KEY); if (s && tools.includes(s)) setTool(s); } catch { /* remembered choice is optional */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tools.length) return null;
  const f = fixes.find((x) => x.tool === tool) ?? fixes[0];
  let text = f.content, body: React.ReactNode, how = ''; let label = 'prompt'; let intro = `Paste this into ${NAMES[tool]}`;
  if (f.kind === 'patch') {
    let code: { before: string; after: string; note?: string } = { before: '', after: '' }; try { code = JSON.parse(f.content); } catch { /* shown as text */ }
    text = `Before:\n${code.before}\n\nAfter:\n${code.after}`; label = 'patch'; intro = 'Change this in your code'; how = code.note ?? '';
    body = <div className="space-y-3"><div><p className="text-sm font-semibold text-neutral-700">Before</p><pre tabIndex={0} role="region" aria-label="Code before" className={`mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-sm ${wrap}`}>{code.before}</pre></div>
      <div><p className="text-sm font-semibold text-neutral-700">After</p><pre tabIndex={0} role="region" aria-label="Code after" className={`mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-sm ${wrap}`}>{code.after}</pre></div></div>;
  } else if (f.kind === 'steps') {
    const steps = f.content.split('\n').map((l) => l.replace(/^\d+\.\s*/, '')); label = 'steps'; intro = `Follow these steps in ${NAMES[tool]}`; how = steps[steps.length - 1] ?? '';
    body = <ol className="list-decimal space-y-1.5 rounded-xl bg-white p-4 pl-9 text-base">{steps.map((l, i) => <li key={i} className={wrap}>{l}</li>)}</ol>;
  } else { text = bare(f.content); how = /Verify:\s*([\s\S]+?)(?:\n|$)/.exec(text)?.[1] ?? ''; body = <pre tabIndex={0} role="region" aria-label={`Change for ${NAMES[tool]}`} data-testid="fix-text" className={`max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-sm leading-relaxed sm:p-4 sm:text-[15px] ${wrap}`}>{text}</pre>; }
  return (
    <div className="space-y-4 rounded-2xl bg-[#f3fbd9] p-4 sm:p-5" data-testid={`fix-${id}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={`b-${id}`} className="text-base font-semibold text-ink">Your builder</label>
        <select id={`b-${id}`} value={tool} onChange={(e) => { setTool(e.target.value); try { localStorage.setItem(KEY, e.target.value); } catch { /* optional */ } }} className="min-h-11 rounded-xl border border-ink bg-white px-3 text-base text-ink">
          {tools.map((t) => <option key={t} value={t}>{NAMES[t]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-semibold text-ink">{intro}</p><CopyButton text={text} label={label} className="min-h-12 rounded-full border-0 bg-ink px-5 text-white hover:bg-neutral-800" /></div>
      {body}
      <div><h4 className="text-base font-semibold text-ink">How to check it</h4><p className={`mt-1 text-base text-neutral-800 ${wrap}`}>{how || 'Apply the change, then press Rescan. Avara marks it fixed only when it can re-check the same element.'}</p></div>
    </div>
  );
}
