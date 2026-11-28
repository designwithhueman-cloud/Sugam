// "For agencies": what the Agency plan gives the people who answer to a client. Server-rendered. The two cards on the
// right are a decorative drawing of the layout with generic placeholders (Client A, no counts), not real data.
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Layers, Link2, ListChecks, Palette } from 'lucide-react';
import { kicker, h2 } from './Sections.tsx';

const POINTS = [
  { icon: Link2, title: 'Read-only client links', text: 'Send a link anyone can open for 90 days. No account for your client, and they cannot change anything.' },
  { icon: Palette, title: 'Your name and colours', text: 'Shared reports and exports can carry your agency name and brand colours.' },
  { icon: Layers, title: 'One workspace per client', text: 'Group each client’s sites together. Agency Pro covers up to 15 sites.' },
  { icon: ListChecks, title: 'Decisions carry across scans', text: 'Mark a finding “not an issue” once, with a note, and it stays that way next time.' },
] as const;

function Chip({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded-lg px-3 py-1 text-sm font-semibold text-ink ${tone}`}>{label}</span>;
}

export function Agencies() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
      <div>
        <p className={kicker}>For agencies</p>
        <h2 id="agencies-h" className={`mt-4 ${h2}`}>Show clients what you found, <span className="text-vio-deep">and what you fixed</span></h2>
        <p className="mt-5 max-w-xl text-xl leading-relaxed text-neutral-800">Run the review, fix what you can, and send a clean read-only report under your own name.</p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[#d9f56e] text-ink"><p.icon className="size-5" /></span>
              <span><b className="block text-lg font-semibold text-ink">{p.title}</b><span className="mt-1 block text-lg leading-snug text-neutral-800">{p.text}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/upgrade?plan=agency" className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800">Join the Agency waiting list<ArrowRight aria-hidden className="size-5" /></Link>
          <Link href="/#pricing" className="inline-flex min-h-11 items-center text-lg font-semibold text-ink underline underline-offset-4">See Agency pricing</Link>
        </div>
      </div>

      {/* A branded client report and a client list, drawn with placeholders. */}
      <div aria-hidden className="relative mx-auto w-full max-w-xl">
        <div className="absolute inset-x-6 -inset-y-4 rounded-[2.5rem] bg-[#e6f9b6]" />
        <div className="relative grid gap-4 p-4 sm:p-8">
          <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 border-b border-black/10 pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-vio-deep text-sm font-bold text-white">YA</span>
              <span><b className="block text-base text-ink">Your Agency</b><span className="text-sm text-neutral-700">Website review · Client A</span></span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><Chip label="Critical" tone="bg-[#ffd9d4]" /><Chip label="Serious" tone="bg-[#ffe9b8]" /><Chip label="To check" tone="bg-[#e6dcff]" /></div>
            <ul className="mt-4 space-y-2.5 text-base text-ink">
              <li className="flex items-center gap-2.5"><CheckCircle2 className="size-5 text-[#2d6a00]" />Buttons with no name <span className="ml-auto rounded-lg bg-[#d9f56e] px-2.5 py-0.5 text-sm font-semibold">Fixed</span></li>
              <li className="flex items-center gap-2.5"><span className="grid size-5 place-items-center"><span className="size-3.5 rounded-full border-2 border-dashed border-neutral-500" /></span>Low-contrast text <span className="ml-auto rounded-lg bg-[#eceae4] px-2.5 py-0.5 text-sm font-semibold">Open</span></li>
            </ul>
            <p className="mt-4 flex items-center gap-2 border-t border-black/10 pt-3 text-sm text-neutral-700"><Link2 className="size-4" />Read-only link · opens without an account</p>
          </div>
          <div className="ml-auto w-full max-w-sm rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm sm:-mt-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-vio-deep">Clients</p>
            <ul className="mt-2 divide-y divide-black/10 text-base text-ink">
              {[['Client A', 'Open'], ['Client B', 'Open'], ['Client C', 'All fixed']].map(([n, s]) => <li key={n} className="flex items-center justify-between py-2"><span>{n}</span><span className="text-sm font-semibold text-neutral-700">{s}</span></li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
