'use client';
// The check-again loop as a scroll-linked timeline: three steps on the left, one result card on the right that changes as each step reaches the
// middle of the screen (large screens), or one card under each step (small screens). The chips above the card jump between the same three states.
// Motion happens only in response to scrolling or a click: a colour change and a one-off pop on the status pills. Nothing loops, nothing autoplays,
// and reduced motion turns the transitions off. All three states are plain text, so the page reads the same without any of this.
import * as React from 'react';
import { Check, CircleDot, X } from 'lucide-react';

type Tone = 'stop' | 'fix';
type Row = { title: string; status: 'problem' | 'fixed' | 'open' | 'new' | 'fine'; note?: string };
type State = { chip: string; tone: Tone; headline: string; detail: string; rows: Row[]; paste?: string };

const STATES: State[] = [
  { chip: 'First check', tone: 'stop', headline: 'Don’t launch yet', detail: '2 serious problems could expose your keys or your customers’ data.',
    rows: [{ title: 'Secret keys in your code', status: 'problem' }, { title: 'Customer data anyone can read', status: 'problem' }, { title: 'Private files left public', status: 'fine' }],
    paste: 'Remove every secret key from the frontend code. Keep secrets only on the server. Do not change anything else.' },
  { chip: 'After your fix', tone: 'fix', headline: 'Almost there: fix these first', detail: 'One problem is fixed. One is still open.',
    rows: [{ title: 'Customer data anyone can read', status: 'fixed' }, { title: 'Secret keys in your code', status: 'open', note: 'Replace the exposed key in the provider’s dashboard too. Removing it from the code is not enough.' }, { title: 'Private files left public', status: 'fine' }] },
  { chip: 'After your next change', tone: 'stop', headline: 'Don’t launch yet', detail: 'Something that was fine at the last check is a problem now. Fix this first.',
    rows: [{ title: 'Private files left public', status: 'new', note: 'Fine last time. Your latest change published a .env file.' }, { title: 'Secret keys in your code', status: 'fixed' }, { title: 'Customer data anyone can read', status: 'fixed' }] },
];
const STEPS = [
  { n: 1, title: 'Find it', body: 'Avara looks for four mistakes and explains each in plain words. Every problem comes with a message to paste into your AI builder.' },
  { n: 2, title: 'Fix it, then check again', body: 'Paste the message, publish, and check again. Avara runs the same checks and tells you what changed: what is fixed and what is still open.' },
  { n: 3, title: 'Change something later', body: 'Every check is compared with the one before. If a later change quietly breaks something, it is called out first as newly broken.' },
];
const PILL: Record<Row['status'], { label: string; cls: string; Icon: typeof Check }> = {
  problem: { label: 'Problem found', cls: 'bg-red-100 text-red-800', Icon: X },
  fixed: { label: 'Fixed', cls: 'bg-[#dcf3e7] text-[#174a32]', Icon: Check },
  open: { label: 'Still open', cls: 'bg-[#f5efd6] text-[#4d3f0a]', Icon: CircleDot },
  new: { label: 'Newly broken', cls: 'bg-[#fbe0dc] text-[#8a1c14]', Icon: X },
  fine: { label: 'Looks fine', cls: 'bg-slate-100 text-slate-700', Icon: Check },
};
const BANNER: Record<Tone, string> = { stop: 'border-red-300 bg-red-50 text-red-900', fix: 'border-amber-300 bg-amber-50 text-amber-900' };

function Result({ i, label }: { i: number; label: string }) {
  const s = STATES[i];
  return (
    <figure aria-label={label} data-testid="lc-demo" data-state={i} className="min-w-0 rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(67,32,153,.6)] sm:p-6">
      <div className={`rounded-xl border p-4 transition-colors duration-500 motion-reduce:transition-none ${BANNER[s.tone]}`}><p className="text-xl font-semibold">{s.headline}</p><p className="mt-1 text-base">{s.detail}</p></div>
      <ul className="mt-4 space-y-3">
        {s.rows.map((r) => { const p = PILL[r.status]; return (
          <li key={`${i}-${r.title}`} data-status={r.status} className="min-w-0 rounded-xl bg-slate-50 p-3.5">
            <div className="flex items-start justify-between gap-3"><span className="font-semibold text-ink">{r.title}</span><span className={`hs-pop inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${p.cls}`}><p.Icon aria-hidden className="size-3" strokeWidth={3} />{p.label}</span></div>
            {r.note && <p className="mt-1.5 text-sm text-neutral-800">{r.note}</p>}
            {i === 0 && r.status === 'problem' && s.paste && r.title.startsWith('Secret') && <div className="mt-2 border-t border-slate-200 pt-2"><p className="text-sm font-semibold text-ink">Tell your AI builder</p><p className="mt-0.5 break-words text-sm text-neutral-800">{s.paste}</p></div>}
          </li>); })}
      </ul>
    </figure>
  );
}

export function LaunchCheckLoop() {
  const [active, setActive] = React.useState(0); const holdUntil = React.useRef(0); const steps = React.useRef<(HTMLLIElement | null)[]>([]);
  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (Date.now() < holdUntil.current) return;   // a click on a chip wins for a moment
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
    }, { rootMargin: '-40% 0px -40% 0px' });
    steps.current.forEach((el) => el && io.observe(el)); return () => io.disconnect();
  }, []);
  const pick = (i: number) => { holdUntil.current = Date.now() + 2500; setActive(i); };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16" data-testid="lc-loop">
      <ol className="min-w-0" aria-label="How checking again works">
        {STEPS.map((s, i) => (
          <li key={s.n} ref={(el) => { steps.current[i] = el; }} data-step={i} data-testid="lc-step" data-active={active === i} className="relative flex min-w-0 gap-4 pb-12 last:pb-0 lg:min-h-[22rem] lg:pb-0">
            <div className="flex flex-col items-center" aria-hidden>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors duration-500 motion-reduce:transition-none ${active >= i ? 'border-[#5b2fd0] bg-[#5b2fd0] text-white' : 'border-black/20 bg-white text-neutral-600'}`}>{s.n}</span>
              {i < STEPS.length - 1 && <span className={`mt-1 w-0.5 flex-1 transition-colors duration-500 motion-reduce:transition-none ${active > i ? 'bg-[#5b2fd0]' : 'bg-black/15'}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className={`text-2xl font-semibold tracking-tight transition-colors duration-500 motion-reduce:transition-none ${active === i ? 'text-ink' : 'text-neutral-600 lg:text-neutral-500'}`}>{s.title}</h4>
              <p className="mt-2 max-w-md text-lg leading-snug text-neutral-800">{s.body}</p>
              <div className="mt-5 lg:hidden"><Result i={i} label={`Example result, step ${s.n}`} /></div>
            </div>
          </li>
        ))}
      </ol>
      <div className="relative hidden min-w-0 lg:block">
        <div className="sticky top-28">
          <div role="group" aria-label="Show an example result" className="mb-4 flex flex-wrap gap-2">
            {STATES.map((s, i) => <button key={s.chip} type="button" aria-pressed={active === i} onClick={() => pick(i)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#5b2fd0] ${active === i ? 'border-[#5b2fd0] bg-[#5b2fd0] text-white' : 'border-black/15 bg-white text-ink hover:bg-black/5'}`}>{i + 1}. {s.chip}</button>)}
          </div>
          <Result key={active} i={active} label={`Example result: ${STATES[active].chip}`} />
        </div>
      </div>
    </div>
  );
}
