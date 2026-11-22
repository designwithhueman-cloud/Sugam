'use client';
// The scan field: a pill with the yourwebsite.com placeholder and a black "Scan my page free" button. The
// "Website address" label is kept for screen readers only, since the placeholder already says what to type.
// Same scan flow as every other form: POST /api/scans, then the progress page.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, Gift, SlidersHorizontal, UserX } from 'lucide-react';
import { STANDARD_OPTIONS as OPTIONS, isStandard } from '@/lib/standards.ts';


export function ScanBar({ idPrefix, sampleHref = '#repair', sampleLabel = 'See a repair', where, align = 'center', extras = true, terms = true, defaultStandard, autoFocus = false }: { idPrefix: string; sampleHref?: string; sampleLabel?: string; where: string; align?: 'center' | 'start'; extras?: boolean; terms?: boolean; defaultStandard?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = React.useState(''); const [std, setStd] = React.useState<string>(isStandard(defaultStandard) ? defaultStandard : 'wcag22aa');
  const [goal, setGoal] = React.useState('');
  const [err, setErr] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const start = align === 'start';
  return (
    <form noValidate className={`w-full ${start ? 'max-w-[40rem]' : 'mx-auto max-w-[52rem]'}`} onSubmit={async (e) => {
      e.preventDefault(); setErr('');
      if (!url.trim()) { setErr('Enter the address of a public website.'); input.current?.focus(); return; }
      setBusy(true);
      const r = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, standard: std, goal: goal.trim() || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.message || 'The scan could not start.'); setBusy(false); input.current?.focus(); return; }
      router.push(`/scans/${j.id}`);
    }}>
      <div className={`flex flex-col gap-1 rounded-2xl border border-ink bg-white p-2.5 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-vio ${start ? 'xl:flex-row xl:items-center xl:gap-4 xl:rounded-2xl xl:pl-8' : 'sm:flex-row sm:items-center sm:gap-4 sm:rounded-2xl sm:pl-8'}`}>
        <label htmlFor={`${idPrefix}-url`} className="sr-only">Website address</label>
        <input ref={input} id={`${idPrefix}-url`} autoFocus={autoFocus} data-own-ring value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourwebsite.com" inputMode="url" autoComplete="url" spellCheck={false}
          aria-describedby={`${!start || terms ? `${idPrefix}-hint` : ''}${err ? ` ${idPrefix}-err` : ''}`.trim() || undefined} aria-invalid={err ? true : undefined}
          className={`min-h-12 min-w-0 flex-1 bg-transparent px-3 text-lg text-ink placeholder:text-neutral-600 ${start ? 'xl:px-0' : 'sm:px-0'}`} />
        <button type="submit" disabled={busy} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-70">
          {busy ? 'Starting…' : <>Scan my page free<ArrowRight aria-hidden className="size-5" /></>}<span className="sr-only"> ({where})</span>
        </button>
      </div>
      <p id={`${idPrefix}-err`} role="alert"  className={`mt-5 rounded-xl bg-[#fde7e1] px-4 py-2 text-base font-semibold text-[#7a1f0b] ${start ? '' : 'text-center'}`} hidden={!err}>{err}</p>
      {start
        ? !terms ? null : <ul id={`${idPrefix}-hint`} className="mt-5 flex flex-wrap gap-x-5 gap-y-2.5 text-lg text-ink">
          {[[FileText, 'One page free'], [Gift, 'First fix included'], [UserX, 'No account needed']].map(([I, t]) => { const Icon = I as typeof Gift; return <li key={t as string} className="inline-flex items-center gap-2"><span aria-hidden className="grid size-8 place-items-center rounded-full bg-[#e6f9b6] text-ink"><Icon className="size-4" /></span>{t as string}</li>; })}
        </ul>
        : <div id={`${idPrefix}-hint`} className="mx-auto mt-6 max-w-2xl space-y-1 text-center text-lg leading-snug text-neutral-700">
            <p>One public page per scan, checked at desktop and 320px mobile widths. Pages behind a sign-in can’t be scanned.</p>
            <p>No account needed: you get your score, severity counts, top issues and one finding with its fix.</p>
          </div>}
      {extras && (
      <div className={`mt-3 flex flex-wrap items-start gap-x-10 gap-y-1 ${start ? '' : 'justify-center'}`}>
        <a href={sampleHref} className="inline-flex min-h-11 items-center text-lg font-medium text-ink underline underline-offset-4 hover:text-vio">{sampleLabel}</a>
        <details open={std !== 'wcag22aa' || !!goal}>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-base font-medium text-ink marker:hidden"><SlidersHorizontal aria-hidden className="size-4" />Scan settings<span className="sr-only"> ({where})</span></summary>
          <div className="mx-auto mt-1 w-72 max-w-full">
            <label htmlFor={`${idPrefix}-goal`} className="mb-1 block text-base font-medium text-ink">Main goal of this page <span className="font-normal text-neutral-700">(optional)</span></label>
            <input id={`${idPrefix}-goal`} value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} placeholder="Join the waitlist" aria-describedby={`${idPrefix}-goal-hint`} className="min-h-12 w-full rounded-xl border border-ink bg-white px-3 text-base text-ink placeholder:text-neutral-600" />
            <p id={`${idPrefix}-goal-hint`} className="mb-3 mt-1 text-sm text-neutral-700">Name the button or action visitors should take. Without it, Avara picks the most prominent one.</p>
            <label htmlFor={`${idPrefix}-standard`} className="mb-1 block text-base font-medium text-ink">Benchmark</label>
            <select id={`${idPrefix}-standard`} value={std} onChange={(e) => setStd(e.target.value)} className="min-h-12 w-full rounded-xl border border-ink bg-white px-3 text-base text-ink">
              {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </details>
      </div>
      )}
    </form>
  );
}
