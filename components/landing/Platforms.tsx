'use client';
// "Fix it where you build": one row of the tools Avara writes fixes for, scrolling slowly and smoothly in a
// continuous loop (two identical lists side by side, shifted by exactly one list).
// Motion rules: a visible Pause button (WCAG 2.2.2) that also names its state; the row also pauses while the
// pointer is over it; with prefers-reduced-motion it does not move at all and the tools wrap into a static,
// centred grid with no Pause button. For assistive technology the tools are one real list: the looping copy
// is aria-hidden. It sits on a full-width dark charcoal band: white logo marks and names, light tags (all above
// 7:1), and the `on-dark` class so focus rings stay visible. Avara does not connect to these tools; the person
// pastes the prompt or follows the steps.
import * as React from 'react';
import { Pause, Play } from 'lucide-react';
import { PLATFORMS, FIX_LABEL, type Platform, type FixKind } from '@/lib/platforms.ts';

const TAG: Record<FixKind, string> = { prompt: 'bg-[#d9f56e]', steps: 'bg-[#e6dcff]', patch: 'bg-[#eceae4]' };

function Logo({ p }: { p: Platform }) {
  return (
    <li className="flex shrink-0 flex-col items-center gap-2.5 px-8 text-center">
      <span className="flex min-h-8 items-center justify-center gap-2.5 text-xl font-semibold tracking-tight text-white">
        {p.icon ? <svg aria-hidden viewBox={p.viewBox ?? '0 0 24 24'} className={`shrink-0 fill-current ${p.viewBox ? 'h-7 w-auto' : 'size-7'}`}><path d={p.icon} /></svg> : null}
        {p.wordmark ? <span className="sr-only">{p.name}</span> : p.name}
      </span>
      <span className={`whitespace-nowrap rounded-lg px-3 py-1 text-sm font-semibold text-ink ${TAG[p.fix]}`}>{FIX_LABEL[p.fix]}<span className="sr-only"> for {p.name}</span></span>
    </li>
  );
}

export function Platforms() {
  const [paused, setPaused] = React.useState(false);
  return (
    <div className="on-dark min-w-0 border-t border-white/10 bg-[#1e1e1e] px-5 py-14 text-white sm:px-10 lg:py-20">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="platforms-h" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Fix it where you build</h2>
          <p className="mt-1 text-lg text-neutral-300">Avara doesn’t connect to these tools. Copy the fix across, publish, then rescan to check it’s fixed.</p>
        </div>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/50 px-4 text-base font-medium text-white hover:bg-white/10 motion-reduce:hidden">
          {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}{paused ? 'Play scrolling' : 'Pause scrolling'}
        </button>
      </div>
      <div className="logo-marquee relative mt-6 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)] motion-reduce:[mask-image:none]">
        <div className="logo-track flex w-max motion-reduce:w-full motion-reduce:justify-center" style={paused ? { animationPlayState: 'paused' } : undefined}>
          <ul aria-labelledby="platforms-h" className="flex shrink-0 items-start motion-reduce:min-w-0 motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-6">
            {PLATFORMS.map((p) => <Logo key={p.name} p={p} />)}
          </ul>
          <ul aria-hidden className="flex shrink-0 items-start motion-reduce:hidden">
            {PLATFORMS.map((p) => <Logo key={p.name} p={p} />)}
          </ul>
        </div>
      </div>
    </div>
  );
}
