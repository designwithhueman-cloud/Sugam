// "Your first fix, free": the one finding every scan opens completely. Built to be read in seconds: a plain title, one sentence
// about who it may affect, then the prompt in its own tinted area with a single action, Copy prompt. Everything a person might
// want to check (what to change, exact elements, measurements, the code) sits in one closed "Technical details" section. Long
// URLs, selectors and prompt lines wrap inside the panel instead of running past it, and the prompt scrolls inside its box so
// the Copy button never leaves the screen.
import { Unlock, TriangleAlert } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton.tsx';
import type { UnlockedFix } from '@/lib/unlocked.ts';
import { affectsSentence } from '@/lib/impact.ts';
import { splitFix, promptOnly } from '@/lib/fix-text.ts';

const wrap = '[overflow-wrap:anywhere]';
const codeCls = `max-w-full whitespace-pre-wrap rounded-2xl bg-[#f6f5f1] p-4 font-mono text-[15px] leading-relaxed text-ink ${wrap}`;

export function UnlockedFixCard({ fix, scanId }: { fix: UnlockedFix; scanId?: string }) {
  return (
    <section aria-labelledby="unlocked-h" className="min-w-0 rounded-[2rem] border-2 border-ink bg-white p-4 shadow-[0_10px_0_-2px_#d9f56e] sm:p-8">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d9f56e] px-3 py-1 text-ink"><Unlock aria-hidden className="size-4" />Your first fix, free</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fde7e1] px-3 py-1 capitalize text-[#7a1f0b]"><TriangleAlert aria-hidden className="size-4" />{fix.severity}</span>
        {fix.wcag.length > 0 && <span className="text-neutral-700">WCAG {fix.wcag.join(', ')}</span>}
      </p>

      <h2 id="unlocked-h" className={`mt-5 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-4xl ${wrap}`}>{fix.plain}</h2>
      <p className="mt-3 max-w-3xl text-xl leading-relaxed text-neutral-800">{affectsSentence(fix.impactGroups)}</p>

      {/* The prompt: its own area, one action */}
      <div className="mt-8 rounded-[1.75rem] border-2 border-[#9fcf3a] bg-[#f3fbd9] p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h3 className="text-xl font-semibold text-ink">Paste this into your AI builder</h3>
          <CopyButton text={promptOnly(fix.prompt)} track={scanId ? { scanId, findingId: fix.id } : undefined} label="prompt" className="min-h-12 w-full justify-center whitespace-nowrap rounded-full border-0 bg-ink px-4 text-lg text-white hover:bg-neutral-800 sm:w-auto" />
        </div>
        <pre tabIndex={0} role="region" aria-label="Prompt for your AI builder" className={`mt-4 max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-3 font-mono text-sm leading-relaxed text-ink sm:p-4 sm:text-[15px] ${wrap}`}>{promptOnly(fix.prompt)}</pre>
        {splitFix(fix.prompt).verify && <p className={`mt-3 text-base text-neutral-800 ${wrap}`} data-testid="how-to-check"><span className="font-semibold text-ink">How to check it: </span>{splitFix(fix.prompt).verify}</p>}
      </div>
      {fix.moreElements > 0 && <p className="mt-4 text-base text-neutral-700">{fix.moreElements} more element{fix.moreElements === 1 ? '' : 's'} on this page have this problem. A paid plan shows every one, pinned on screenshots.</p>}

      <details className="mt-6 rounded-2xl border border-black/15 p-4">
        <summary className="min-h-11 cursor-pointer text-lg font-semibold text-ink">Technical details</summary>
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-base font-semibold uppercase tracking-[0.1em] text-neutral-700">What to change</h3>
            <p className={`mt-2 text-lg leading-relaxed text-neutral-800 ${wrap}`}>{fix.whatToChange}</p>
            <p className={`mt-1 text-base text-neutral-700 ${wrap}`}>{fix.technical}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold uppercase tracking-[0.1em] text-neutral-700">Where it is</h3>
            <ul className="mt-3 space-y-4">
              {fix.elements.map((e) => (
                <li key={e.selector}>
                  <p className={`font-mono text-sm text-neutral-700 ${wrap}`}>{e.selector}</p>
                  <pre tabIndex={0} role="region" aria-label={`Code of ${e.selector}`} className={`${codeCls} mt-1 max-h-60 overflow-y-auto`}>{e.html}</pre>
                  {e.detail && <p className={`mt-2 text-sm text-neutral-700 ${wrap}`}>{e.detail}</p>}
                </li>
              ))}
            </ul>
          </div>
          {fix.code && fix.code.after && (
            <div>
              <h3 className="text-base font-semibold uppercase tracking-[0.1em] text-neutral-700">The code after the fix</h3>
              <pre tabIndex={0} role="region" aria-label="Code after the fix" className={`${codeCls} mt-2 max-h-60 overflow-y-auto`}>{fix.code.after}</pre>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
