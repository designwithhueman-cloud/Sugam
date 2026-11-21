// "What else could get in their way?": the four areas every scan checks, as four cards built the same way. Each card has
// a picture of one concrete problem Avara finds (decorative, aria-hidden), the question as its heading, the categories it
// covers as tags, and one plain sentence on why visitors leave or get stuck. No tabs and no motion, so there is nothing to
// operate or pause. Server-rendered.
import { SHOW_PERSON_NOTE } from './flags.ts';
import { Menu, UserCheck, Volume2, X } from 'lucide-react';

// A red issue tag, the same in every picture
const Flag = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#b3261e] px-2.5 py-1 text-[0.8rem] font-semibold leading-none text-white shadow-sm ${className}`}>
    <X aria-hidden className="size-3" strokeWidth={3} />{children}
  </span>
);
// A small page in a frame, so every picture reads as "a website"
const Frame = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative w-full max-w-[13rem] rounded-xl border border-black/15 bg-white shadow-[4px_4px_0_0_rgba(17,17,17,0.08)] ${className}`}>
    <div className="flex items-center gap-1 border-b border-black/10 px-2.5 py-1.5"><i className="size-1.5 rounded-full bg-[#e08f84]" /><i className="size-1.5 rounded-full bg-[#e3c273]" /><i className="size-1.5 rounded-full bg-[#8fcf9a]" /></div>
    {children}
  </div>
);

// Product clarity and trust: a headline that could be anyone's, and no way to check who is behind it
function Offer() {
  return (
    <Frame>
      <div className="px-3 pb-3 pt-2.5">
        <p className="text-[1.05rem] font-semibold leading-tight text-ink">Welcome to the future of work</p>
        <i className="mt-2 block h-1.5 w-5/6 rounded-full bg-ink/15" />
        <span className="mt-3 inline-block rounded-md bg-ink px-3 py-1.5 text-[0.7rem] font-semibold text-white">Learn more</span>
      </div>
      <Flag className="absolute -bottom-3 left-3">Doesn’t say what it does</Flag>
    </Frame>
  );
}
// UX and conversion: four buttons of equal weight, so there is no clear next step
function Action() {
  return (
    <Frame>
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-4 pt-3">
        {['Learn more', 'Get started', 'Sign up', 'Book a demo'].map((b) => <span key={b} className="rounded-md bg-ink py-1.5 text-center text-[0.68rem] font-semibold text-white">{b}</span>)}
      </div>
      <Flag className="absolute -bottom-3 left-3">No clear next step</Flag>
    </Frame>
  );
}
// Mobile and accessibility: an icon-only menu button that a screen reader announces as just "button"
function Everyone() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-xl border-[3px] border-[#b3261e] bg-ink text-white"><Menu className="size-7" /></span>
        <span className="relative rounded-2xl rounded-bl-sm border border-black/15 bg-white px-3.5 py-2 shadow-[3px_3px_0_0_rgba(17,17,17,0.08)]">
          <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-neutral-700"><Volume2 className="size-3.5" />Screen reader</span>
          <span className="mt-0.5 block text-lg font-semibold italic text-ink">“Button”</span>
        </span>
      </div>
      <Flag>No accessible name</Flag>
    </div>
  );
}
// Performance and design: the main content is still loading, the layout jumps, placeholder text is left in
function Ready() {
  return (
    <Frame>
      <div className="px-3 pb-4 pt-2.5">
        <div className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e4e1d8]"><span className="block h-full w-2/5 rounded-full bg-vio" /></span><span className="text-[0.75rem] font-semibold tabular-nums text-ink">4.8 s</span></div>
        <span className="mt-3 block h-10 rounded-md bg-[#ecebe6]" />
        <span className="mt-2 block h-2 w-3/4 rounded-full bg-[#ecebe6]" />
      </div>
      <Flag className="absolute -bottom-3 left-3">Still loading at 4.8 s</Flag>
    </Frame>
  );
}

const CARDS = [
  { q: 'Is the offer clear?', tags: ['Product clarity', 'Trust'], text: 'A first-time visitor can’t tell what you do or why to trust you, so they leave.', Scene: Offer, tint: 'bg-[#efe9ff]' },
  { q: 'Can visitors take action?', tags: ['UX', 'Conversion'], text: 'The main button is hard to find or competes with others, so visitors give up.', Scene: Action, tint: 'bg-[#fbe9df]' },
  { q: 'Can everyone use it?', tags: ['Mobile', 'Accessibility'], text: 'Faint text, unnamed buttons or no keyboard access shut people out before they start.', Scene: Everyone, tint: 'bg-[#eef8cf]' },
  { q: 'Does the page feel ready?', tags: ['Performance', 'Design'], text: 'A slow, jumpy or unfinished-looking page makes visitors doubt you and leave.', Scene: Ready, tint: 'bg-[#efe9ff]' },
] as const;

export function Pillars() {
  return (
    <div>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => (
          <li key={c.q} className="flex flex-col rounded-[2rem] border border-black/10 bg-white p-3">
            <div aria-hidden className={`grid h-44 place-items-center overflow-hidden rounded-[1.5rem] px-4 pb-3 ${c.tint}`}><c.Scene /></div>
            <div className="flex flex-1 flex-col px-3 pb-3 pt-5">
              <h3 className="text-[1.6rem] font-bold leading-tight tracking-tight text-ink sm:min-h-[2.5em]">{c.q}</h3>
              <div className="mt-2.5 flex flex-wrap gap-1.5"><span className="sr-only">Checks: </span>
                {c.tags.map((t, k) => <span key={t} className="rounded-lg border border-vio-deep/25 bg-[#f6f3ff] px-2.5 py-0.5 text-sm font-semibold text-vio-deep">{t}{k < c.tags.length - 1 && <span className="sr-only">, </span>}</span>)}
              </div>
              <p className="mt-3 text-lg leading-snug text-neutral-800">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
      {SHOW_PERSON_NOTE && (<p className="mt-5 flex items-start gap-4 rounded-[1.75rem] bg-[#efe9ff] px-6 py-5 text-lg leading-relaxed text-ink">
        <UserCheck aria-hidden className="mt-0.5 size-7 shrink-0 text-vio-deep" />
        <span><b>Still needs a person:</b> whether your claims are true, whether the flow makes sense for a real task, whether alt text and captions are right, and text over photos.</span>
      </p>)}
    </div>
  );
}
