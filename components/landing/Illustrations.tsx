// Pillar artwork: small UI scenes built from the page's own pieces (lime panel, violet focus
// ring, black pill buttons, the Tab key), not characters. Decorative and hidden from assistive
// technology; the text beside each one says the same thing.
import { ArrowRight, AudioLines, TriangleAlert } from 'lucide-react';

const panel = 'relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[1.75rem] bg-[#e6f9b6] p-6';
const ring = 'ring-4 ring-vio ring-offset-[3px] ring-offset-[#e6f9b6]';

export function VisualArt({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`${panel} ${className}`}>
      <div className="relative w-full max-w-[21rem]">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <span className="block h-3.5 w-2/3 rounded-full bg-neutral-300" />
          <span className="mt-3 block h-2.5 w-full rounded-full bg-neutral-200" />
          <span className="mt-2 block h-2.5 w-5/6 rounded-full bg-neutral-200" />
          <span className="mt-2 block h-2.5 w-3/4 rounded-full bg-neutral-200" />
        </div>
        <div className="absolute -right-4 -top-6 grid size-28 place-items-center rounded-full border-[5px] border-vio bg-white shadow-md"><span className="text-4xl font-semibold text-ink">Aa</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-[#fde7e1] px-3 py-1 text-sm font-semibold text-[#7a1f0b]">2.1:1 too low</span><span className="rounded-full bg-[#d9f56e] px-3 py-1 text-sm font-semibold text-ink">7.8:1 passes</span></div>
      </div>
    </div>
  );
}

export function VoiceArt({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`${panel} ${className}`}>
      <div className="flex flex-col items-center">
        <div className="flex h-12 items-center gap-1.5">{[14, 28, 44, 30, 18, 36, 22].map((h, i) => <span key={i} className="w-2 rounded-full bg-vio" style={{ height: h }} />)}</div>
        <div className="relative mt-4 rounded-full bg-white px-7 py-3 text-xl font-semibold text-ink shadow-sm">“Click Sign up”<span className="absolute -bottom-1.5 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-white" /></div>
        <span className="mt-6 h-7 border-l-2 border-dashed border-vio" />
        <span className={`rounded-full bg-ink px-9 py-3 text-xl font-semibold text-white ${ring}`}>Sign up</span>
      </div>
    </div>
  );
}

export function KeyboardArt({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`${panel} ${className}`}>
      <div className="flex flex-col items-center gap-8">
        <div className="relative h-28 w-44 -rotate-6">
          <div className="absolute inset-x-0 bottom-0 h-20 rounded-[1.6rem] bg-[#8cc424] shadow-[0_20px_26px_-10px_rgba(60,90,0,0.35)]" />
          <div className="absolute inset-x-0 top-0 h-24 rounded-[1.6rem] bg-[#c2ee4c] shadow-[inset_0_4px_0_rgba(255,255,255,0.6),inset_0_-8px_12px_rgba(80,120,0,0.2)]">
            <span className="absolute left-6 top-6 text-2xl font-medium tracking-tight text-ink">Tab</span>
            <ArrowRight className="absolute right-6 top-7 size-7 text-ink" strokeWidth={1.6} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white px-5 py-2.5 text-lg font-semibold text-ink shadow-sm">Home</span>
          <span className={`rounded-full bg-white px-5 py-2.5 text-lg font-semibold text-ink shadow-sm ${ring}`}>Pricing</span>
          <span className="rounded-full bg-white px-5 py-2.5 text-lg font-semibold text-ink shadow-sm">Sign in</span>
        </div>
      </div>
    </div>
  );
}

export function ScreenReaderArt({ className = '' }: { className?: string }) {
  const row = 'flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-lg font-medium text-ink shadow-sm';
  return (
    <div aria-hidden className={`${panel} ${className}`}>
      <div className="w-full max-w-[20rem] space-y-2.5">
        <div className="flex items-center gap-2 pb-1"><span className="grid size-9 place-items-center rounded-full bg-vio text-white"><AudioLines className="size-5" /></span><span className="text-base font-semibold text-ink">What it hears</span></div>
        <div className={row}><span className="size-2.5 rounded-full bg-vio" />heading, level 1</div>
        <div className={row}><span className="size-2.5 rounded-full bg-vio" />link, Pricing</div>
        <div className={row}><span className="size-2.5 rounded-full bg-vio" />button, Menu</div>
        <div className="flex items-center gap-3 rounded-2xl bg-[#fde7e1] px-4 py-2.5 text-lg font-semibold text-[#7a1f0b]"><TriangleAlert className="size-5 shrink-0" />button, no name</div>
      </div>
    </div>
  );
}
