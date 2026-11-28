// The booking example used across the landing page (hero demo, How it works): the lower part of a phone showing our demo
// page (Forma Type, a made-up studio site), where a "Bookings open" banner fixed to the bottom of the screen covers the
// "Book a call" button. Three states: before (covered), fix (banner moved to the top, outlined), after (button in reach).
// Drawn in em units so one drawing works at any size: set the font size on the parent. Decorative: callers give the
// image role and text alternative. Banner movement is a short transition that reduced motion turns off.
import { ArrowUp, Check, Menu, X } from 'lucide-react';

export type BookingStep = 'before' | 'fix' | 'after';

export function BookingPhone({ step, className = '' }: { step: BookingStep; className?: string }) {
  const top = step !== 'before';
  return (
    <div aria-hidden className={`relative h-[16em] w-[18em] overflow-hidden rounded-b-[2.2em] border-[0.19em] border-t-0 border-ink bg-[#faf5e1] ${className}`}>
      <div className="absolute inset-0 flex flex-col">
        {/* Banner in the page flow at the top (fix, after) */}
        <div className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${top ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="min-h-0">
            <div className={`flex h-[2.2em] items-center justify-between bg-[#e8a98c] px-[1em] text-[0.85em] font-semibold text-ink ${step === 'fix' ? 'outline outline-[0.2em] -outline-offset-[0.2em] outline-vio' : ''}`}>
              Bookings open<span className="grid size-[1.4em] place-items-center rounded-full bg-ink/10"><X className="size-[0.85em]" strokeWidth={3} /></span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-[1em] pt-[0.7em]"><b className="text-[0.9em] text-ink">Forma Type</b><Menu className="size-[1.1em] text-ink" /></div>
        <p className="mx-[1em] mt-[0.5em] text-[1.45em] font-semibold leading-[1.1] tracking-tight text-ink">Studio visits, every Saturday</p>
        <i className="mx-[1em] mt-[0.6em] h-[0.45em] w-3/4 rounded-full bg-ink/20" />
        <div className="relative mx-[1em] mt-[0.9em]">
          <span className={`flex h-[2.9em] items-center justify-center rounded-[0.6em] bg-ink text-[1em] font-semibold text-white ${step === 'after' ? 'ring-[0.2em] ring-[#9bd13a] ring-offset-[0.15em] ring-offset-[#faf5e1]' : ''}`}>Book a call</span>
          {step === 'after' && <span className="absolute -top-[0.9em] right-[0.4em] inline-flex items-center gap-[0.25em] rounded-[0.4em] bg-[#2d5a1e] px-[0.6em] py-[0.2em] text-[0.72em] font-semibold text-white"><Check className="size-[1em]" strokeWidth={3} />Can be tapped</span>}
        </div>
        {step === 'fix' && <span className="mx-auto mt-[0.9em] inline-flex items-center gap-[0.3em] rounded-[0.4em] bg-vio px-[0.7em] py-[0.25em] text-[0.72em] font-semibold text-white"><ArrowUp className="size-[1em]" strokeWidth={3} />Banner moved to the top</span>}
      </div>
      {/* Banner fixed to the bottom of the screen (before), on top of the button */}
      <div className={`absolute inset-x-0 bottom-0 flex h-[6.8em] items-start justify-center border-t-[0.12em] border-ink bg-[#e8a98c] pt-[1.6em] text-[1em] font-bold text-ink transition-transform duration-300 ease-out ${top ? 'translate-y-full' : 'translate-y-0'}`}>Bookings open</div>
      {step === 'before' && (
        <span className="absolute bottom-[5.35em] left-[0.75em] right-[0.75em] h-[2.9em] rounded-[0.5em] border-[0.16em] border-dashed border-[#b3261e]">
          <span className="absolute -top-[1em] right-[0.3em] inline-flex items-center gap-[0.25em] rounded-[0.4em] bg-[#b3261e] px-[0.6em] py-[0.2em] text-[0.72em] font-semibold text-white"><X className="size-[1em]" strokeWidth={3} />Covered</span>
        </span>
      )}
      {/* The phone's top edge is cropped: fade it out */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[0.6em] bg-gradient-to-b from-[#faf5e1] to-transparent" />
    </div>
  );
}
