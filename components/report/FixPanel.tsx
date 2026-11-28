'use client';
// A fix, opened on demand, in the tool the person builds with (lib/fix-tools.ts): a prompt for AI builders, the selected editor's steps,
// a question for Vercel, or the change in the framework's own syntax. One copy button, then how Avara checks it. The tool choice is
// remembered on this device.
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton.tsx';
import { useScanScope } from './scan-scope.tsx';
import type { AvaraFix } from '@/lib/report-types.ts';
import { TOOLS, GROUP_LABEL, fixForTool, readFix, type ToolGroup } from '@/lib/fix-tools.ts';

const KEY = 'sugam:builder';
const LEGACY: Record<string, string> = { code: 'react' };   // a choice remembered before the tool list grew
const wrap = '[overflow-wrap:anywhere]';
const pre = `whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-sm leading-relaxed sm:p-4 sm:text-[15px] ${wrap}`;

export function FixPanel({ fixes, id, findingId }: { fixes: AvaraFix[]; id: string; findingId?: string }) {
  const scanId = useScanScope();
  const usable = fixes.some((f) => f.kind === 'prompt');
  const [tool, setTool] = React.useState('lovable');
  React.useEffect(() => { try { const s = localStorage.getItem(KEY); const t = s ? LEGACY[s] ?? s : null; if (t && TOOLS.some((x) => x.id === t)) setTool(t); } catch { /* remembered choice is optional */ } }, []);
  const pick = (t: string) => { setTool(t); try { localStorage.setItem(KEY, t); } catch { /* optional */ } };
  if (!usable) return null;
  const fx = fixForTool(tool, fixes)!; const rescan = readFix(fixes).rescan;
  const groups = (['ai', 'editor', 'route', 'code'] as ToolGroup[]).map((g) => ({ g, tools: TOOLS.filter((t) => t.group === g) }));
  return (
    <div className="space-y-4 rounded-2xl bg-[#f3fbd9] p-4 sm:p-5" data-testid={`fix-${id}`} data-tool={tool}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={`b-${id}`} className="text-base font-semibold text-ink">Your tool</label>
        <select id={`b-${id}`} value={tool} onChange={(e) => pick(e.target.value)} className="min-h-11 rounded-xl border border-ink bg-white px-3 text-base text-ink">
          {groups.map(({ g, tools }) => <optgroup key={g} label={GROUP_LABEL[g]}>{tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
        </select>
      </div>

      {fx.route ? (
        <div className="space-y-3" data-testid="route">
          <p className="text-lg font-semibold text-ink">{fx.route.question}</p>
          <p className="text-base text-neutral-800">Vercel hosts the site. The fix goes where you edit it.</p>
          <div className="flex flex-wrap gap-2">{fx.route.options.map((o) => <button key={o.to} type="button" onClick={() => pick(o.to)} className="inline-flex min-h-12 items-center rounded-full border-2 border-ink bg-white px-5 text-base font-semibold text-ink hover:bg-black/5">{o.label}</button>)}</div>
        </div>
      ) : (<>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold text-ink">{fx.intro}{fx.example && <span className="ml-2 rounded-full bg-white px-2.5 py-0.5 align-middle text-sm font-semibold text-[#432099]" data-testid="example-badge">Example</span>}</p>
          <CopyButton text={fx.copyText} label={fx.copyLabel} track={scanId && findingId ? { scanId, findingId } : undefined} className="min-h-12 rounded-full border-0 bg-ink px-5 text-white hover:bg-neutral-800" />
        </div>
        {fx.hint && <p className={`text-base text-neutral-700 ${wrap}`} data-testid="fix-hint">{fx.hint}</p>}
        {fx.text && <pre tabIndex={0} role="region" aria-label={`Prompt for ${fx.tool.name}`} data-testid="fix-text" className={`max-h-80 overflow-y-auto ${pre}`}>{fx.text}</pre>}
        {fx.steps && <ol className="list-decimal space-y-1.5 rounded-xl bg-white p-4 pl-9 text-base" data-testid="fix-steps">{fx.steps.map((l, i) => <li key={i} className={wrap}>{l}</li>)}</ol>}
        {fx.change && <div><h4 className="text-base font-semibold text-ink">What to change</h4><p className={`mt-1 text-base text-neutral-800 ${wrap}`} data-testid="fix-change">{fx.change}</p></div>}
        {fx.where && <div><h4 className="text-base font-semibold text-ink">Where it goes</h4><p className={`mt-1 text-base text-neutral-800 ${wrap}`} data-testid="fix-where">{fx.where}</p></div>}
        {fx.code && (<div className="space-y-3" data-testid="fix-code">
          {fx.code.before && <div><p className="text-sm font-semibold text-neutral-700">Before</p><pre tabIndex={0} role="region" aria-label="Code before" className={`mt-1 max-h-52 overflow-y-auto ${pre}`}>{fx.code.before}</pre></div>}
          <div><p className="text-sm font-semibold text-neutral-700">{fx.code.before ? `After (${fx.code.label})` : fx.code.label}</p><pre tabIndex={0} role="region" aria-label={fx.code.label} className={`mt-1 max-h-60 overflow-y-auto ${pre}`}>{fx.code.text}</pre></div>
        </div>)}
        {fx.technical && <details className="rounded-xl bg-white/70 p-3 text-sm" data-testid="fix-technical"><summary className="cursor-pointer font-semibold text-ink">Technical details</summary><p className="mt-2 text-neutral-700">Where Avara found it on the scanned page (a DOM locator, not code to paste):</p><pre className={`mt-1 max-h-40 overflow-y-auto ${pre}`}>{fx.technical}</pre></details>}
      </>)}

      <div><h4 className="text-base font-semibold text-ink">How to check it</h4><p className={`mt-1 text-base text-neutral-800 ${wrap}`} data-testid="how-to-check">{rescan || 'Apply the change, publish, then press Rescan. Avara marks it fixed only when it can re-check the same element.'}</p></div>
    </div>
  );
}
