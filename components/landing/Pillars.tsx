// What we check, as four small scenes: each area of the review (product clarity, mobile, conversion, accessibility) is shown as a
// tiny picture of the thing Sugam checks, failing and passing, with one line underneath saying what happens to them, then one strip for what still needs a
// person. No tabs and no motion, so there is nothing to operate or pause. The pictures are decorative (aria-hidden); the
// titles and the lines under them carry the meaning. Server-rendered.
import { SHOW_PERSON_NOTE } from './flags.ts';
import { Check, Contrast, MessageSquareText, MousePointerClick, Smartphone, ShieldCheck, UserCheck, X } from 'lucide-react';

const Chip = ({ pass, children }: { pass?: boolean; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold ${pass ? 'bg-[#d9f56e] text-ink' : 'bg-[#fde0dc] text-[#7a1710]'}`}>
    {pass ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <X aria-hidden className="size-3.5" strokeWidth={3} />}{children}
  </span>
);

const Lines = ({ c }: { c: string }) => <span className="flex w-12 flex-col gap-1.5"><i className={`h-2 w-full rounded-full ${c}`} /><i className={`h-2 w-4/5 rounded-full ${c}`} /><i className={`h-2 w-3/5 rounded-full ${c}`} /></span>;
function Read() {
  return (
    <div className="flex items-end gap-5">
      <div className="flex flex-col items-center gap-2"><span className="grid size-[4.5rem] place-items-center rounded-2xl bg-white"><Lines c="bg-[#d4d4cf]" /></span><Chip>2.1 : 1</Chip></div>
      <div className="flex flex-col items-center gap-2"><span className="grid size-[4.5rem] place-items-center rounded-2xl bg-white"><Lines c="bg-ink" /></span><Chip pass>7.8 : 1</Chip></div>
    </div>
  );
}
function Clarity() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="flex items-center gap-2.5"><span className="rounded-xl bg-white px-3.5 py-2 text-base font-semibold text-neutral-500">“Welcome”</span><Chip>Unclear</Chip></span>
      <span className="flex items-center gap-2.5"><span className="rounded-xl bg-white px-3.5 py-2 text-base font-semibold text-ink">“Invoices in 2 clicks”</span></span>
      <Chip pass>Says what it does</Chip>
    </div>
  );
}
function Phone() {
  return (
    <div className="flex items-end gap-5">
      <div className="flex flex-col items-center gap-2"><span className="grid h-[4.5rem] w-11 place-items-center overflow-hidden rounded-xl bg-white"><span className="h-2 w-16 rounded-full bg-[#d4d4cf]" /></span><Chip>Scrolls sideways</Chip></div>
      <div className="flex flex-col items-center gap-2"><span className="grid h-[4.5rem] w-11 place-items-center rounded-xl bg-white"><Lines c="bg-ink" /></span><Chip pass>Fits</Chip></div>
    </div>
  );
}
function Action() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="flex items-center gap-2.5"><span className="rounded-full bg-ink px-5 py-2.5 text-base font-semibold text-white">Start free</span><Chip pass>In view</Chip></span>
      <Chip>Hidden behind a banner</Chip>
    </div>
  );
}

const PILLARS = [
  { icon: MessageSquareText, q: 'Product clarity', text: 'A first-time visitor can’t tell what you do, who it’s for or what to do next within a few seconds.', Scene: Clarity, tint: 'bg-[#f3fbd9]' },
  { icon: Smartphone, q: 'Mobile', text: 'At phone width the page scrolls sideways, the text is tiny or a fixed bar covers the button.', Scene: Phone, tint: 'bg-[#efe9ff]' },
  { icon: MousePointerClick, q: 'Usability', text: 'The main button is hard to find, hidden, or competes with too many others, so visitors give up.', Scene: Action, tint: 'bg-[#f3fbd9]' },
  { icon: Contrast, q: 'Accessibility', text: 'Faint text, buttons a screen reader calls just “button”, or a page you can’t use by keyboard.', Scene: Read, tint: 'bg-[#efe9ff]' },
] as const;

export function Pillars() {
  return (
    <div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p) => (
          <li key={p.q} className="flex flex-col rounded-[2rem] border border-black/10 bg-white p-4">
            <div aria-hidden className={`grid h-36 place-items-center overflow-hidden sm:h-44 rounded-[1.5rem] px-3 ${p.tint}`}><p.Scene /></div>
            <div className="px-3 pb-3 pt-5">
              <h3 className="flex items-center gap-2.5 text-2xl font-semibold leading-tight tracking-tight text-ink"><p.icon aria-hidden className="size-6 shrink-0 text-vio-deep" />{p.q}</h3>
              <p className="mt-2 text-lg leading-snug text-neutral-800">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-start gap-4 rounded-[1.75rem] bg-[#f3fbd9] px-6 py-5 text-lg leading-relaxed text-ink">
        <ShieldCheck aria-hidden className="mt-0.5 size-7 shrink-0 text-vio-deep" />
        <span><b>Trust and launch readiness:</b> placeholder text left in, missing privacy or contact details, and gaps that make a new visitor hesitate.</span>
      </p>
      {SHOW_PERSON_NOTE && (<p className="mt-3 flex items-start gap-4 rounded-[1.75rem] bg-[#efe9ff] px-6 py-5 text-lg leading-relaxed text-ink">
        <UserCheck aria-hidden className="mt-0.5 size-7 shrink-0 text-vio-deep" />
        <span><b>Still needs a person:</b> whether your claims are true, whether the flow makes sense for a real task, whether alt text and captions are right, and text over photos.</span>
      </p>)}
    </div>
  );
}
