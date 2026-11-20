// What we check, as four small scenes: each group of people (low vision, voice control, keyboard, screen readers) is shown as a
// tiny picture of the thing Sugam checks, failing and passing, with one line underneath saying what happens to them, then one strip for what still needs a
// person. No tabs and no motion, so there is nothing to operate or pause. The pictures are decorative (aria-hidden); the
// titles and the lines under them carry the meaning. Server-rendered.
import { SHOW_PERSON_NOTE } from './flags.ts';
import { AudioLines, Check, Contrast, Image as ImageIcon, Keyboard, Mic, UserCheck, X } from 'lucide-react';

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
function Speak() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="rounded-2xl rounded-bl-sm bg-vio px-4 py-2 text-base font-semibold text-white">“Click Sign up”</span>
      <span className="flex items-center gap-2.5"><span className="rounded-full bg-ink px-5 py-2.5 text-base font-semibold text-white">Sign up</span><Chip pass>Matches</Chip></span>
    </div>
  );
}
function Tab() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="flex gap-2">{['Home', 'Pricing', 'Book'].map((n, i) => <span key={n} className={`rounded-full bg-white px-3.5 py-2 text-base font-semibold text-ink ${i === 1 ? 'ring-4 ring-vio/70' : ''}`}>{n}</span>)}</span>
      <span className="flex items-center gap-2.5"><span className="rounded-md border-2 border-ink/60 bg-white px-2.5 py-0.5 text-sm font-bold text-ink">Tab</span><Chip pass>Focus visible</Chip></span>
    </div>
  );
}
function Listen() {
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-14 place-items-center rounded-2xl border-2 border-ink bg-white text-ink"><ImageIcon className="size-7" /></span>
      <span className="flex flex-col gap-2"><Chip>says “image”</Chip><Chip pass>says “Team photo”</Chip></span>
    </div>
  );
}

const PILLARS = [
  { icon: Contrast, q: 'Low vision', text: 'Someone zooms in to read your pricing. The text is faint, or the page breaks.', Scene: Read, tint: 'bg-[#f3fbd9]' },
  { icon: Mic, q: 'Voice control', text: 'Someone says “click Sign up”, but the button has a different name, so nothing happens.', Scene: Speak, tint: 'bg-[#efe9ff]' },
  { icon: Keyboard, q: 'Keyboard users', text: 'Someone tabs through your page and can’t see where they are, or a sticky bar hides the button.', Scene: Tab, tint: 'bg-[#f3fbd9]' },
  { icon: AudioLines, q: 'Screen readers', text: 'Someone listens to your page. A button is read as just “button”, and a photo as “image”.', Scene: Listen, tint: 'bg-[#efe9ff]' },
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
      {SHOW_PERSON_NOTE && (<p className="mt-5 flex items-start gap-4 rounded-[1.75rem] bg-[#efe9ff] px-6 py-5 text-lg leading-relaxed text-ink">
        <UserCheck aria-hidden className="mt-0.5 size-7 shrink-0 text-vio-deep" />
        <span><b>Still needs a person:</b> whether alt text is accurate, whether the tab order makes sense for a real task, whether captions are right, and text over photos.</span>
      </p>)}
    </div>
  );
}
