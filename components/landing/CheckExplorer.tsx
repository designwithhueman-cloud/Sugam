'use client';
// What we check, one question at a time. The four questions are a WAI-ARIA tablist (arrow keys, Home and End, roving tabindex). The panel shows the
// question's picture and why it matters, then its two areas: a bar of how the checks are answered, a few example checks, and the full list on demand.
// Data comes from lib/check-catalog.ts (the rule library), so nothing here can drift from what the scanner runs.
import * as React from 'react';
import { SCENES } from './Pillars.tsx';
import type { Area, Catalog, How } from '@/lib/check-catalog.ts';

const HOW: Record<How, { label: string; count: string; bar: string; note: string }> = {
  measured: { label: 'Measured', count: 'measured', bar: 'bg-ink', note: 'Checked in a real browser on desktop and a 320px phone.' },
  ai: { label: 'Judged by AI', count: 'judged by AI', bar: 'bg-[#7c5cf0]', note: 'A model reads the page against the rule. Shown as “worth a look”, never confirmed.' },
  person: { label: 'For a person', count: 'for a person', bar: 'bg-[#e0623a]', note: 'No scan can decide it, so it is listed for you to check.' },
  soon: { label: 'Coming soon', count: 'coming soon', bar: 'bg-black/15', note: 'In the library, not measured yet.' },
};
const ORDER: How[] = ['measured', 'ai', 'person', 'soon'];

function AreaCard({ a }: { a: Area }) {
  const [open, setOpen] = React.useState(false); const id = React.useId();
  const n = (h: How) => a.checks.filter((c) => c.how === h).length; const total = a.checks.length;
  const examples = a.checks.filter((c) => c.how === 'measured').slice(0, 6);
  const shown = examples.length ? examples : a.checks.slice(0, 6);
  return (
    <article className="flex flex-col rounded-[1.5rem] bg-white p-5 ring-1 ring-black/10 sm:p-6" data-testid="check-category">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-2xl font-semibold tracking-tight text-ink">{a.label}</h4>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-600">{total} checks</p>
      </div>
      <p className="mt-1.5 text-base leading-relaxed text-neutral-800">{a.about}</p>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-black/5" role="img" aria-label={ORDER.filter(n).map((h) => `${n(h)} ${HOW[h].count}`).join(', ')}>
        {ORDER.filter(n).map((h) => <span key={h} className={`${HOW[h].bar} h-full`} style={{ width: `${(100 * n(h)) / total}%` }} />)}
      </div>
      <p aria-hidden className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-700">{ORDER.filter(n).map((h) => <span key={h} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${HOW[h].bar}`} />{n(h)} {HOW[h].count}</span>)}</p>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-neutral-600">{examples.length ? 'For example, measured' : 'For example'}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">{shown.map((c) => <li key={c.title} className="rounded-lg bg-[#f4f2ec] px-2.5 py-1 text-[15px] text-ink">{c.title}</li>)}</ul>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="mt-4 inline-flex min-h-11 items-center self-start font-semibold text-vio-deep underline underline-offset-4 hover:text-ink">
        {open ? 'Hide the full list' : `See all ${total} checks`}
      </button>
      <div id={id} hidden={!open} className="mt-2 space-y-3 border-t border-black/10 pt-3">
        {ORDER.filter(n).map((h) => (
          <div key={h}><p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-neutral-600"><span aria-hidden className={`size-2 rounded-full ${HOW[h].bar}`} />{HOW[h].label}</p>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-base text-ink sm:grid-cols-2">{a.checks.filter((c) => c.how === h).map((c) => <li key={c.title}>{c.title}</li>)}</ul></div>))}
      </div>
    </article>
  );
}

export function CheckExplorer({ catalog }: { catalog: Catalog }) {
  const qs = catalog.questions; const [cur, setCur] = React.useState(0); const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => { const k = (i + qs.length) % qs.length; setCur(k); tabs.current[k]?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const k = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 0, End: qs.length - 1 }[e.key];
    if (k !== undefined) { e.preventDefault(); go(k); }
  };
  const q = qs[cur]; const Scene = SCENES[q.scene];
  return (
    <div>
      <div role="tablist" aria-label="What every scan checks" className="grid grid-cols-2 gap-2 lg:grid-cols-4" onKeyDown={onKey}>
        {qs.map((x, i) => (
          <button key={x.id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`wq-tab-${x.id}`} aria-selected={i === cur} aria-controls="wq-panel" tabIndex={i === cur ? 0 : -1} onClick={() => setCur(i)}
            className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left transition-colors ${i === cur ? 'border-ink bg-ink text-white' : 'border-black/10 bg-white text-ink hover:border-black/30'}`}>
            <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${i === cur ? 'text-[#d9f56e]' : 'text-neutral-600'}`}>{x.areas.map((a) => a.label).join(' · ')}</span>
            <span className="mt-0.5 text-lg font-semibold leading-snug">{x.q}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="wq-panel" aria-labelledby={`wq-tab-${q.id}`} tabIndex={0} className={`mt-4 rounded-[2rem] p-4 sm:p-6 lg:p-8 ${q.tint}`}>
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div>
            <div aria-hidden className="grid h-44 place-items-center overflow-hidden rounded-[1.5rem] bg-white/70 px-4 pb-3"><Scene /></div>
            <h3 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-ink">{q.q}</h3>
            <p className="mt-2 text-lg leading-snug text-neutral-800">{q.why}</p>
            <p className="mt-3 text-base font-semibold text-ink">{q.areas.reduce((n, a) => n + a.checks.length, 0)} checks across {q.areas.map((a) => a.label).join(' and ')}</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">{q.areas.map((a) => <AreaCard key={a.name} a={a} />)}</div>
        </div>
      </div>
      {catalog.extra && (
        <details className="mt-4 rounded-2xl bg-white px-5 py-3 ring-1 ring-black/10">
          <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold text-ink">Also observed: {catalog.extra.label} <span className="font-normal text-neutral-700">({catalog.extra.checks.length} checks, never scored)</span></summary>
          <p className="text-base text-neutral-800">{catalog.extra.about}</p>
          <ul className="mt-2 mb-2 flex flex-wrap gap-1.5">{catalog.extra.checks.map((c) => <li key={c.title} className="rounded-lg bg-[#f4f2ec] px-2.5 py-1 text-[15px] text-ink">{c.title}</li>)}</ul>
        </details>
      )}
      <dl className="mt-5 grid gap-x-6 gap-y-2 text-base text-neutral-800 md:grid-cols-2">
        {ORDER.map((h) => <div key={h} className="flex gap-2"><dt className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-ink"><span aria-hidden className={`size-2.5 rounded-full ${HOW[h].bar}`} />{HOW[h].label}:</dt><dd>{HOW[h].note}</dd></div>)}
      </dl>
    </div>
  );
}
