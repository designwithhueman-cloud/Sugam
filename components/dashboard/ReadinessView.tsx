// "Ready to launch?" for one project: the verdict, what is holding it back, and what was checked. Server-rendered; every button is a link to the
// page that does the work, so nothing here changes data.
import Link from 'next/link';
import type { Readiness, AreaState } from '@/lib/readiness.ts';
import { DayDate } from '@/components/dashboard/bits.tsx';

const TONE = { stop: 'border-red-300 bg-red-50 text-red-900', fix: 'border-amber-300 bg-amber-50 text-amber-900', partial: 'border-slate-300 bg-slate-50 text-slate-800', ready: 'border-emerald-300 bg-emerald-50 text-emerald-900' } as const;
const KIND = { stop: { label: 'Blocks launch', cls: 'bg-red-100 text-red-800' }, fix: { label: 'Fix first', cls: 'bg-amber-100 text-amber-900' }, partial: { label: 'Not checked', cls: 'bg-slate-200 text-slate-700' } } as const;
const STATE: Record<AreaState['state'], { label: string; cls: string }> = { ok: { label: 'Clear', cls: 'bg-emerald-100 text-emerald-800' }, problem: { label: 'Problem', cls: 'bg-red-100 text-red-800' }, incomplete: { label: 'Incomplete', cls: 'bg-slate-200 text-slate-700' }, none: { label: 'Optional', cls: 'bg-slate-100 text-slate-600' } };
const AREA = { scan: 'Site scan', exposure: 'Launch check', flows: 'Saved flows' } as const;

export function ReadinessBanner({ r, compact, href }: { r: Readiness; compact?: boolean; href?: string }) {
  return (
    <section aria-label="Launch readiness" data-testid="readiness" data-level={r.level} className={`min-w-0 rounded-xl border p-5 ${TONE[r.level]}`}>
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Ready to launch?</p>
      <p className="mt-1 text-2xl font-semibold">{r.headline}</p>
      <p className="mt-1 max-w-prose">{r.detail}</p>
      {compact && r.reasons[0] && <p className="mt-3 text-sm"><span className="font-semibold">First: </span>{r.reasons[0].text}</p>}
      {compact && href && <Link href={href} className="mt-3 inline-block text-sm font-semibold underline underline-offset-2">See everything we checked</Link>}
    </section>
  );
}

export function ReadinessView({ r }: { r: Readiness }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <ReadinessBanner r={r} />
      {r.reasons.length > 0 && (
        <section aria-labelledby="rd-why" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="rd-why" className="text-lg font-semibold text-ink">{r.level === 'partial' ? 'What is missing' : 'What is holding you back'}</h2>
          <ol className="mt-3 space-y-3">{r.reasons.map((x, n) => (
            <li key={n} data-testid="reason" data-kind={x.kind} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
              <div className="min-w-0"><p className="text-sm text-slate-600">{AREA[x.area]}{x.newlyBroken ? ' · newly broken' : ''}</p><p className="break-words text-ink">{x.text}</p></div>
              <div className="flex items-center gap-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[x.kind].cls}`}>{KIND[x.kind].label}</span><Link href={x.href} className="text-sm font-semibold text-pine-800 underline underline-offset-2">Open</Link></div>
            </li>))}</ol>
        </section>
      )}
      <section aria-labelledby="rd-checked" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="rd-checked" className="text-lg font-semibold text-ink">What we checked</h2>
        <ul className="mt-3 space-y-3">{r.areas.map((a) => (
          <li key={a.area} data-testid="area" data-state={a.state} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div className="min-w-0"><p className="font-medium text-ink">{a.label}</p><p className="text-sm text-slate-600">{a.line}{a.at ? <> · checked <DayDate date={a.at} lower /></> : null}</p></div>
            <div className="flex items-center gap-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[a.state].cls}`}>{STATE[a.state].label}</span><Link href={a.href} className="text-sm font-semibold text-pine-800 underline underline-offset-2">{a.at ? 'Check again' : a.state === 'none' ? 'Learn more' : 'Run it'}</Link></div>
          </li>))}</ul>
      </section>
    </div>
  );
}
