// "Scan it, see the pins, apply the fix": a light section under the problem statement. The animated card (scan,
// review, fix, resolved) lives here, so a visitor sees the story and can try all three formats (AI builder prompt, Editor
// steps, Code patch) right where the question "which one is for me?" is asked. Server-rendered shell around a client card.
import { MapPin, ScanSearch, Wand2 } from 'lucide-react';
import { HeroResult } from './HeroResult.tsx';

const OPTIONS = [
  [ScanSearch, '1. Scan your page', 'Paste a link. We open it on desktop and at phone width, like a visitor would.'],
  [MapPin, '2. See where it goes wrong', 'Each issue is pinned on your page and ranked, with a one-line reason a non-developer can follow.'],
  [Wand2, '3. Apply a plain-language fix', 'Copy a prompt for your AI builder, follow steps for your website editor, or hand a code patch to your developer.'],
] as const;

export function HowItWorks() {
  return (
    <div className="relative px-5 pb-20 sm:px-10 lg:pb-32">
      <span id="repair" aria-hidden className="absolute -top-6" /><span id="retest" aria-hidden className="absolute -top-6" />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep">How it works</p>
        <h2 id="how-h" className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">Scan it. See the pins. <span className="text-vio-deep">Apply the fix.</span></h2>
        <p className="mt-4 text-xl leading-relaxed text-neutral-800">No engineering background needed. Works for solo builders and for agencies checking client work.</p>
        <ul aria-label="How a scan works" className="mt-8 grid max-w-xl gap-6">
          {OPTIONS.map(([Icon, name, text]) => (
            <li key={name} className="flex items-start gap-5">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[#d9f56e] text-ink"><Icon className="size-6" /></span>
              <div>
                <h3 className="text-2xl font-semibold leading-tight tracking-tight text-ink">{name}</h3>
                <p className="mt-2 text-lg leading-relaxed text-neutral-800">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <HeroResult />
      </div>
    </div>
  );
}
