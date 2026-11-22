// DIFF-002: this page's first screen beside the reference it resembles, with the resemblance in plain words. The page's screenshot comes from the
// plan-gated screenshot route (absent when the plan keeps screenshots back); the reference is a licensed template or a labelled project fixture.
import type { HeroCompareData } from '@/lib/review-view.ts';
import { ScreenshotCrop } from './ScreenshotCrop.tsx';

export function HeroCompare({ c }: { c: HeroCompareData }) {
  return (
    <section className="mt-4 space-y-3" data-testid="hero-compare" aria-label={`This page's first screen beside ${c.name}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-2 text-sm font-semibold text-neutral-700">This page</p>
          {c.scanned ? <ScreenshotCrop shot={c.scanned} /> : <p className="rounded-xl bg-[#f6f5f1] p-3 text-sm text-neutral-800" data-testid="hero-compare-locked">The screenshot of this page is part of a paid plan.</p>}</div>
        <figure className="m-0"><figcaption className="mb-2 text-sm font-semibold text-neutral-700">Reference {c.kind === 'fixture' ? 'fixture' : 'template'}: {c.name}</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.src} alt={`First screen of the reference ${c.kind === 'fixture' ? 'fixture' : 'template'} ${c.name}`} width={1280} height={800} className="h-auto w-full rounded-2xl border border-black/15" data-testid="hero-compare-ref" />
          <p className="mt-1 text-xs text-neutral-700 [overflow-wrap:anywhere]">{c.origin} · {c.license}</p></figure>
      </div>
      {c.shared.length > 0 && <ul className="list-disc space-y-1 pl-5 text-base text-neutral-900" data-testid="hero-compare-shared">{c.shared.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      <p className="text-sm text-neutral-700">This compares layout and appearance only. It does not say the page was copied, is unoriginal, or how it was made.</p>
    </section>
  );
}
