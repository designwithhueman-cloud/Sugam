// The three audiences as three plain cards: a lime icon circle, the audience, one line about what they get.
// Server-rendered; the icons are decorative.
import { Rocket, Building2, Landmark } from 'lucide-react';

const WHO = [
  { icon: Rocket, label: 'AI builders and vibe coders', text: 'Paste a plain-language fix into Lovable, Bolt.new, v0 or Cursor. No coding needed.' },
  { icon: Building2, label: 'Agencies', text: 'Send clients a read-only report and show what changed after each fix.' },
  { icon: Landmark, label: 'Enterprise teams', text: 'Keep up to 15 sites in one workspace, with team roles and shared review decisions.' },
] as const;

export function Who() {
  return (
    <ul className="grid gap-6 lg:grid-cols-3 lg:gap-8">
      {WHO.map((c) => (
        <li key={c.label} className="rounded-[2rem] border border-black/10 bg-white p-8">
          <span aria-hidden className="grid size-16 place-items-center rounded-full bg-[#d9f56e] text-ink"><c.icon className="size-7" /></span>
          <h3 className="mt-10 text-2xl font-semibold leading-tight tracking-tight text-ink">{c.label}</h3>
          <p className="mt-3 text-lg leading-relaxed text-neutral-800">{c.text}</p>
        </li>
      ))}
    </ul>
  );
}
