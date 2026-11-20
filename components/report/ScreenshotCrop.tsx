// The part of the page where the problem is, cropped from the stored screenshot and outlined. Plain CSS: the full image is positioned inside a clipped frame, so
// no image processing happens and the picture still comes from the plan-gated screenshot route. The text location always sits beside it.
import type { Shot } from '@/lib/review-view.ts';

export function ScreenshotCrop({ shot }: { shot: Shot }) {
  const { crop: c, pageWidth, pageHeight } = shot; const phone = shot.viewport === 'mobile';
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <figure className={`m-0 ${phone ? 'w-full max-w-[17rem]' : 'w-full max-w-[34rem]'}`} data-testid="shot">
      <div className="relative overflow-hidden rounded-xl border border-black/20 bg-[#f1f0ec]" style={{ aspectRatio: `${c.width} / ${c.height}` }} role="img" aria-label={shot.alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.src} alt="" className="absolute max-w-none select-none" style={{ width: pct(pageWidth, c.width), left: `-${pct(c.x, c.width)}`, top: `-${(c.y / c.height) * 100}%`, height: 'auto' }} />
        {shot.boxes.map((b, i) => (
          <span key={i} aria-hidden className={`absolute rounded-[3px] ${b.kind === 'affected' ? 'border-[3px] border-[#5b2fd0] bg-[#5b2fd0]/10' : 'border-[3px] border-dashed border-[#c2410c] bg-[#c2410c]/10'}`}
            style={{ left: pct(b.box.x - c.x, c.width), top: `${((b.box.y - c.y) / c.height) * 100}%`, width: pct(b.box.width, c.width), height: `${(b.box.height / c.height) * 100}%` }} />
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-neutral-700">
        {shot.boxes.map((b, i) => <span key={i} className="mr-4 inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block size-3 rounded-sm border-2 ${b.kind === 'affected' ? 'border-[#5b2fd0]' : 'border-dashed border-[#c2410c]'}`} />{b.label}</span>)}
      </figcaption>
    </figure>
  );
}
