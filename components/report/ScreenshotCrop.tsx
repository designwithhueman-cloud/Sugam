// The part of the page where the problem is, cropped from the stored screenshot and outlined. Plain CSS: the full image is positioned inside a clipped frame, so
// no image processing happens and the picture still comes from the plan-gated screenshot route. The text location always sits beside it. With `callout`, the
// first outline's label also sits to the right of the frame on wide screens, joined to the element by a line, so the picture says what is wrong where.
import type { Shot } from '@/lib/review-view.ts';

const b0x = (s: Shot) => s.boxes[0].box.x - s.crop.x + s.boxes[0].box.width / 2;
export function ScreenshotCrop({ shot, n = 1, callout = false }: { shot: Shot; n?: number; callout?: boolean }) {
  const { crop: c, pageWidth } = shot; const phone = shot.viewport !== 'desktop';   // the 390px phone or the 320px pass
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const b = shot.boxes[0]?.box; const side = callout && !!b;
  const midPct = b ? Math.min(92, Math.max(8, ((b.y + b.height / 2 - c.y) / c.height) * 100)) : 0;
  const rightPct = b ? Math.min(100, ((b.x + b.width - c.x) / c.width) * 100) : 0;
  return (
    <figure className={`m-0 ${phone ? 'w-full max-w-[17rem]' : side ? 'w-full max-w-[30rem]' : 'w-full max-w-[34rem]'}`} data-testid="shot">
      <div className="rounded-2xl border border-black/15 bg-white shadow-[0_18px_40px_-24px_rgba(40,20,90,.45)]">
        <div aria-hidden className="flex items-center gap-1.5 rounded-t-2xl border-b border-black/10 bg-[#f6f4ef] px-3 py-2"><span className="size-2.5 rounded-full bg-[#ff6b5e]" /><span className="size-2.5 rounded-full bg-[#ffc233]" /><span className="size-2.5 rounded-full bg-[#33c75a]" /><span className="ml-2 h-4 flex-1 rounded-full bg-black/[.06]" /></div>
        <div className="relative" style={{ aspectRatio: `${c.width} / ${c.height}` }}>
          <div className="absolute inset-0 overflow-hidden rounded-b-2xl bg-[#f1f0ec]" role="img" aria-label={shot.alt}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.src} alt="" className="absolute max-w-none select-none" style={{ width: pct(pageWidth, c.width), left: `-${pct(c.x, c.width)}`, top: `-${(c.y / c.height) * 100}%`, height: 'auto' }} />
            {shot.boxes.map((x, i) => (
              <span key={i} aria-hidden className={`absolute rounded-[3px] ${x.kind === 'affected' ? 'border-[3px] border-[#5b2fd0] bg-[#5b2fd0]/10' : 'border-[3px] border-dashed border-[#c2410c] bg-[#c2410c]/10'}`}
                style={{ left: pct(x.box.x - c.x, c.width), top: `${((x.box.y - c.y) / c.height) * 100}%`, width: pct(x.box.width, c.width), height: `${(x.box.height / c.height) * 100}%` }} />
            ))}
            {b && (() => { const topPct = ((b.y - c.y) / c.height) * 100; const below = topPct < 22; const leftPct = Math.min(94, Math.max(6, (b0x(shot) / c.width) * 100));
              return <span aria-hidden className={`absolute z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full bg-[#5b2fd0] text-sm font-bold text-white shadow-lg ring-2 ring-white ${below ? 'translate-y-[2px] rotate-45 rounded-tl-none' : '-translate-y-[calc(100%-2px)] -rotate-45 rounded-bl-none'}`} style={{ left: `${leftPct}%`, top: `${below ? ((b.y + b.height - c.y) / c.height) * 100 : topPct}%` }}><span className={below ? '-rotate-45' : 'rotate-45'}>{n}</span></span>; })()}
          </div>
          {side && <>
            <span aria-hidden className={`absolute z-10 hidden h-0 border-t-2 border-[#5b2fd0] ${phone ? 'lg:block' : 'xl:block'}`} style={{ left: `${rightPct}%`, right: '-2.5rem', top: `${midPct}%` }} />
            <span aria-hidden className={`absolute z-10 hidden size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5b2fd0] ring-2 ring-white ${phone ? 'lg:block' : 'xl:block'}`} style={{ left: `${rightPct}%`, top: `${midPct}%` }} />
            <span className={`absolute left-[calc(100%+2.5rem)] z-10 hidden w-max max-w-[15rem] -translate-y-1/2 rounded-full border-2 border-[#5b2fd0] bg-[#f6f2ff] px-4 py-1.5 text-sm font-semibold text-[#432099] ${phone ? 'lg:block' : 'xl:block'}`} style={{ top: `${midPct}%` }} data-testid="callout">{shot.boxes[0].label}</span>
          </>}
        </div>
      </div>
      <figcaption className={`mt-2 text-sm text-neutral-700 ${side ? (phone ? 'lg:sr-only' : 'xl:sr-only') : ''}`}>
        {shot.boxes.length === 0 && <span>Top of the page. This issue has no single spot to outline.</span>}
        {shot.boxes.map((x, i) => <span key={i} className="mr-4 inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block size-3 rounded-sm border-2 ${x.kind === 'affected' ? 'border-[#5b2fd0]' : 'border-dashed border-[#c2410c]'}`} />{x.label}</span>)}
      </figcaption>
    </figure>
  );
}
