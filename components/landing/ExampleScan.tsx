'use client';
// Hero: "Try an example scan". One finding from our demo page (Forma Type is a made-up studio site we test on, not a
// customer), in three states the visitor switches themselves: Before, The fix, After. Nothing plays on its own. The same
// example carries on in How it works (the prompt to paste, and the phone after the rescan). The switch is a WAI-ARIA tablist
// (arrow keys, Home and End, roving tabindex); the phone is one image with a text alternative per state, and one sentence
// says what changed. The drawing keeps a fixed size so the card never jumps.
import * as React from 'react';
import { Check, Wrench, X } from 'lucide-react';
import { BookingPhone, type BookingStep } from './BookingPhone.tsx';

const STEPS: { id: BookingStep; label: string; alt: string; text: string }[] = [
  { id: 'before', label: 'Before', text: 'The bookings banner covers ‘Book a call’ on a phone.',
    alt: 'Phone screen. A Bookings open banner fixed to the bottom of the screen covers the Book a call button.' },
  { id: 'fix', label: 'The fix', text: 'Move the banner from the bottom of the screen to the top of the page.',
    alt: 'The same phone screen. The Bookings open banner now sits at the top of the page.' },
  { id: 'after', label: 'After', text: 'The button is visible and can be tapped.',
    alt: 'The same phone screen after the fix. The Book a call button is fully visible below the content.' },
];
const ICON = { before: [X, 'bg-[#b3261e]'], fix: [Wrench, 'bg-vio'], after: [Check, 'bg-[#2d5a1e]'] } as const;

export function ExampleScan() {
  const [step, setStep] = React.useState<BookingStep>('before');
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const i = STEPS.findIndex((s) => s.id === step);
  const s = STEPS[i];
  const go = (n: number) => { const k = (n + STEPS.length) % STEPS.length; setStep(STEPS[k].id); tabs.current[k]?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: STEPS.length - 1 };
    if (e.key in map) { e.preventDefault(); go(map[e.key]); }
  };
  const [Icon, tint] = ICON[step];
  return (
    <section aria-labelledby="try-ex-h" className="mx-auto w-full max-w-[30rem] rounded-[2rem] border border-black/10 bg-[#efe9ff] p-4 sm:p-6">
      <h2 id="try-ex-h" className="px-1 text-xl font-semibold tracking-tight text-ink">Try an example scan</h2>

      <div role="tablist" aria-label="Example scan steps" onKeyDown={onKey} className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white p-1">
        {STEPS.map((t, k) => {
          const on = t.id === step, prevOn = k > 0 && STEPS[k - 1].id === step;
          return (
            <button key={t.id} ref={(el) => { tabs.current[k] = el; }} type="button" role="tab" id={`try-tab-${t.id}`} aria-controls="try-panel" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setStep(t.id)}
              className={`relative min-h-11 rounded-lg px-2 text-base font-semibold ${on ? 'bg-ink text-white' : 'text-ink hover:bg-[#e3dbff]'}`}>
              {k > 0 && <span aria-hidden className={`absolute -left-[2.5px] top-2.5 bottom-2.5 w-px bg-ink/20 ${on || prevOn ? 'invisible' : ''}`} />}
              {t.label}
            </button>
          );
        })}
      </div>

      <div id="try-panel" role="tabpanel" aria-labelledby={`try-tab-${step}`} className="mt-4 rounded-[1.5rem] bg-white/70 px-3 pb-4">
        <div role="img" aria-label={s.alt} className="flex justify-center text-[14px] sm:text-[17px]">
          <BookingPhone step={step} className="shadow-[0.35em_0.35em_0_0_rgba(67,32,153,0.22)]" />
        </div>
        <p className="mt-4 flex min-h-[3.5rem] items-start gap-2.5 px-1 text-lg font-semibold leading-snug text-ink">
          <span aria-hidden className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white ${tint}`}><Icon className="size-3.5" strokeWidth={3} /></span>
          {s.text}
        </p>
      </div>
    </section>
  );
}
