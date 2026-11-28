'use client';
// How it works card: the whole product in one short story, played once, using the same booking example as the hero demo.
// Scan (a URL and a progress bar), Review (the banner covering Book a call),
// Fix (the same fix in three forms, chosen with tabs that each carry an icon: AI builder prompt, Editor steps, Code patch), Resolved (the same phone after the rescan, with the button in reach). The animation
// is CSS only, finishes in about 4.5 seconds and never repeats; the base styles are the finished state, so with reduced
// motion, or before styles load, every part is shown at once. The fix text comes from example-fix.ts, shared with
// "How it works". Tabs are Radix tabs: arrow keys move between them. Copy buttons are real buttons. The story waits at its
// first frame until the card scrolls into view, then plays once.
import * as React from 'react';
import { Check, Code2, MousePointerClick, Smartphone, Wand2 } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { EXAMPLE_EDITORS, EXAMPLE_FRAMEWORKS, EXAMPLE_PATCH, EXAMPLE_PATCH_LINES, EXAMPLE_PROMPT } from './example-fix.ts';
import { BookingPhone } from './BookingPhone.tsx';

const STEPS = [['Scan', 0.2], ['Review', 1.4], ['Fix', 2.4], ['Resolved', 3.9]] as const;
const TABS = [['prompt', 'AI builder prompt', Wand2], ['steps', 'Editor steps', MousePointerClick], ['patch', 'Code patch', Code2]] as const;
type Tab = typeof TABS[number][0];
const at = (s: number) => ({ animationDelay: `${s}s` });
const stepsText = (i: number) => EXAMPLE_EDITORS[i][1].map((x, n) => `${n + 1}. ${x}`).join('\n');

const trigger = 'flex min-h-12 flex-col justify-center gap-1 rounded-lg px-2 py-1.5 text-center text-sm font-medium leading-tight text-ink hover:bg-white/70 sm:flex-row sm:gap-2 sm:px-3 sm:text-base data-[state=active]:bg-[#d9f56e] data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-none';

export function HeroResult() {
  const [tab, setTab] = React.useState<Tab>('prompt'); const [ed, setEd] = React.useState(0); const [fw, setFw] = React.useState(0);
  const [text, label] = tab === 'prompt' ? [EXAMPLE_PROMPT, 'prompt'] : tab === 'steps' ? [stepsText(ed), 'steps'] : [EXAMPLE_PATCH, 'patch'];
  // Hold the story at its first frame until the card is on screen, then play it once.
  const box = React.useRef<HTMLDivElement>(null);
  const [wait, setWait] = React.useState(false);
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.6 && r.bottom > 0) return;
    setWait(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWait(false); io.disconnect(); } }, { threshold: 0.1, rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className={`relative w-full ${wait ? 'hs-wait' : ''}`}>
      <section aria-labelledby="hero-ex-h" className="relative rounded-[2rem] border border-black/10 bg-white p-6 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.25)] sm:p-8">
        {/* Full-width stepper: each step's line stretches to the next one */}
        <ol aria-label="How it works" className="flex w-full items-center text-sm font-semibold text-neutral-800 sm:text-base">
          {STEPS.map(([name, t], i) => (
            <li key={name} className={`flex items-center gap-2 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <span aria-hidden className="hs-dot grid size-8 shrink-0 place-items-center rounded-full border border-[#d9f56e] bg-[#d9f56e] text-base text-ink" style={at(t)}>{i + 1}</span>
              <span className="sr-only sm:not-sr-only">{name}</span>
              {i < STEPS.length - 1 && <span aria-hidden className="mx-1 block h-px min-w-3 flex-1 bg-black/20 sm:mx-2" />}
            </li>
          ))}
        </ol>

        <div className="mt-5 grid">
        <div>
        <div className="hs-in flex items-center gap-3 overflow-hidden rounded-xl border border-black/10 bg-[#f6f5f1] px-4 py-2.5" style={at(0.2)}>
          <span className="text-base text-neutral-800">yourwebsite.com</span>
          <span aria-hidden className="relative ml-auto block h-1.5 w-24 overflow-hidden rounded-full bg-black/10"><span className="hs-fill absolute inset-0 rounded-full bg-vio" style={at(0.3)} /></span>
        </div>

        <div className="hs-in mt-5 flex items-start gap-4" style={at(1.4)}>
          <span aria-hidden className="hs-ring grid size-12 shrink-0 place-items-center rounded-xl border-2 border-vio bg-white text-ink ring-4 ring-vio/20" style={at(1.6)}><Smartphone className="size-6" /></span>
          <div>
            <h3 id="hero-ex-h" className="text-xl font-semibold leading-snug text-ink">The bookings banner covers ‘Book a call’ on a phone</h3>
            <p className="mt-1 text-base leading-snug text-neutral-700">Visitors who scroll down tap the banner instead of the button.</p>
          </div>
        </div>

        </div>
        <div className="hs-in mt-5" style={at(2.4)}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList aria-label="Choose how to fix it" className="grid w-full grid-cols-3 gap-1 rounded-xl bg-[#f1f0ec] p-1">
              {TABS.map(([k, name, Icon]) => <TabsTrigger key={k} value={k} className={trigger}><Icon aria-hidden className="size-4 shrink-0 sm:size-[1.1rem]" />{name}</TabsTrigger>)}
            </TabsList>
            <div className="min-h-[13.5rem]">
              <TabsContent value="prompt" className="mt-3 rounded-2xl">
                <p className="text-base font-semibold text-neutral-700">Paste this into your AI builder</p>
                <p className="mt-2 rounded-2xl bg-[#f6f5f1] p-4 text-lg leading-relaxed text-ink">{EXAMPLE_PROMPT}</p>
              </TabsContent>
              <TabsContent value="steps" className="mt-3 rounded-2xl">
                <div className="flex flex-wrap items-center gap-2"><label htmlFor="hr-ed" className="text-base font-semibold text-neutral-700">Follow these steps in</label>
                  <select id="hr-ed" value={ed} onChange={(e) => setEd(Number(e.target.value))} className="min-h-10 rounded-lg border border-black/20 bg-white px-2 text-base font-semibold text-ink">{EXAMPLE_EDITORS.map(([t], i) => <option key={t} value={i}>{t}</option>)}</select></div>
                <ol className="mt-2 list-decimal space-y-1 rounded-2xl bg-[#f6f5f1] p-4 pl-9 text-base leading-snug text-ink">{EXAMPLE_EDITORS[ed][1].map((x) => <li key={x}>{x}</li>)}</ol>
              </TabsContent>
              <TabsContent value="patch" className="mt-3 rounded-2xl">
                <div className="flex flex-wrap items-center gap-2"><label htmlFor="hr-fw" className="text-base font-semibold text-neutral-700">Apply this change in</label>
                  <select id="hr-fw" value={fw} onChange={(e) => setFw(Number(e.target.value))} className="min-h-10 rounded-lg border border-black/20 bg-white px-2 text-base font-semibold text-ink">{EXAMPLE_FRAMEWORKS.map(([t], i) => <option key={t} value={i}>{t}</option>)}</select>
                  <span className="text-base text-neutral-700">in {EXAMPLE_FRAMEWORKS[fw][1]}</span></div>
                <pre tabIndex={0} role="region" aria-label="Code patch" className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-[#1e1e1e] p-4 font-mono text-[14px] leading-relaxed text-white [overflow-wrap:anywhere]">
                  <code>
                    {EXAMPLE_PATCH_LINES.map(([k, t], n) => k === ' '
                      ? <span key={n} className="block text-neutral-300">{'  '}{t}</span>
                      : <span key={n} className={`block ${k === '-' ? 'text-[#ffb4a0]' : 'text-[#c4f06a]'}`}><span aria-hidden className="select-none">{k} </span><span className="sr-only">{k === '-' ? 'Removed: ' : 'Added: '}</span>{t}</span>)}
                  </code>
                </pre>
              </TabsContent>
            </div>
          </Tabs>
        </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div role="img" aria-label="The same phone after the rescan: the Book a call button is fully visible." className="hs-in shrink-0 text-[7px]" style={at(3.6)}><BookingPhone step="after" /></div>
            <div>
              <span className="hs-pop inline-flex items-center gap-2 rounded-lg bg-[#2d5a1e] px-4 py-2 text-base font-semibold text-white" style={at(3.9)}><Check aria-hidden className="size-4" strokeWidth={2.6} />Resolved</span>
              <p className="hs-in mt-2 max-w-[15rem] text-base leading-snug text-neutral-800" style={at(3.9)}>After the rescan, the button is visible and can be tapped.</p>
            </div>
          </div>
          <span className="hs-in" style={at(3.4)}><CopyButton key={tab} text={text} label={label} className="min-h-12 whitespace-nowrap rounded-xl border-0 bg-[#d9f56e] px-5 text-ink hover:bg-[#cdee5c] sm:px-6" /></span>
        </div>
      </section>
    </div>
  );
}
