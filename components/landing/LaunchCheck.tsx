// "Launch check": the security half of the promise, in plain words, and the check-again loop that shows whether a fix worked and whether it
// broke anything else. Server-rendered and static: one example result, no interaction, no motion beyond the page's shared Reveal.
import { CheckCircle2, FileLock2, KeyRound, Database, Code2, RotateCcw } from 'lucide-react';
import { Reveal } from './Reveal.tsx';
import { kicker, h2 } from './Sections.tsx';

const ITEMS = [
  { icon: KeyRound, title: 'Secret keys in your code', body: 'Keys for services like Stripe or OpenAI that anyone can read in your page.' },
  { icon: FileLock2, title: 'Private files left public', body: 'Settings files, git folders and database backups that anyone can download.' },
  { icon: Code2, title: 'Your source code is public', body: 'Files that let anyone read your original code in full.' },
  { icon: Database, title: 'Customer data anyone can read', body: 'Supabase tables that a signed-out visitor can open.' },
] as const;
const OUTCOMES = [
  { label: 'Fixed', cls: 'bg-[#dcf3e7] text-[#174a32]', note: 'it passes now' },
  { label: 'Still open', cls: 'bg-[#f5efd6] text-[#4d3f0a]', note: 'not fixed yet' },
  { label: 'Newly broken', cls: 'bg-[#fbe0dc] text-[#8a1c14]', note: 'it was fine before' },
] as const;

export function LaunchCheck() {
  return (
    <section id="launch-check" aria-labelledby="lc-h" className="scroll-mt-6 px-5 pb-20 sm:px-10 lg:pb-32">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
        <div className="min-w-0">
          <p className={kicker}>Launch check</p>
          <h2 id="lc-h" className={`mt-4 text-balance ${h2}`}>Is your app leaking <span className="text-vio-deep">keys or customer data</span>?</h2>
          <p className="mt-5 text-xl leading-relaxed text-neutral-800">Visitors never see these mistakes, but <strong className="font-semibold text-ink">anyone who looks can find them</strong>. AI builders ship fast and sometimes leave them behind. Avara looks for four.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {ITEMS.map((x) => (
              <li key={x.title} className="flex min-w-0 gap-3 rounded-2xl border border-black/10 bg-white p-4">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#efe9ff] text-[#432099]"><x.icon className="size-4" /></span>
                <div className="min-w-0"><h3 className="text-lg font-semibold leading-snug text-ink">{x.title}</h3><p className="mt-1 text-base leading-snug text-neutral-800">{x.body}</p></div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-lg leading-relaxed text-neutral-800"><strong className="font-semibold text-ink">It only reads.</strong> It never changes your site, never signs in, and never keeps a full copy of your keys or any customer records. The deeper checks run only after you show the site is yours.</p>
        </div>

        <Reveal className="min-w-0">
          <figure aria-label="Example launch check result" data-testid="lc-example" className="hs-in min-w-0 rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_24px_50px_-40px_rgba(67,32,153,.6)] sm:p-6">
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"><p className="text-xl font-semibold">Don’t launch yet</p><p className="mt-1 text-base">A serious problem could expose your keys or your customers’ data.</p></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="flex items-start justify-between gap-3"><span className="font-semibold text-ink">Customer data anyone can read</span><span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Problem found</span></p>
              <p className="mt-2 text-base text-neutral-800">Anyone on the internet can read the records in these tables without signing in.</p>
              <p className="mt-3 text-sm font-semibold text-ink">Tell your AI builder</p>
              <p className="mt-1 break-words text-sm text-neutral-800">Turn on Row Level Security for every table, so a signed-in user can only read their own rows. Do not change anything else.</p>
            </div>
            <figcaption className="mt-3 text-sm text-neutral-700">Example result. The message is ready to paste.</figcaption>
          </figure>
        </Reveal>
      </div>

      <div className="mt-14 rounded-[2rem] bg-[#efe9ff] px-6 py-10 sm:px-10 lg:mt-20">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#432099]"><RotateCcw aria-hidden className="size-4" />Check again</p>
        <h3 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-4xl">Fixed it? Find out <span className="text-vio-deep">what else broke</span>.</h3>
        <p className="mt-4 max-w-3xl text-xl leading-relaxed text-ink">Paste the fix into your builder, then check again. Avara runs the same checks and tells you what changed, so a fix can’t quietly break something else.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="What a second check tells you">
          {OUTCOMES.map((o) => (<li key={o.label} className="rounded-2xl bg-white p-4"><span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${o.cls}`}>{o.label}</span><p className="mt-2 text-base text-neutral-800">{o.note}</p></li>))}
        </ul>
        <p className="mt-8 flex gap-3 text-lg leading-relaxed text-ink"><CheckCircle2 aria-hidden className="mt-1 size-5 shrink-0 text-[#3b7a00]" /><span>A single <strong className="font-semibold">Ready to launch?</strong> page joins your scan, your launch check and your saved flows into one answer, with the newly broken things first. Creator and Agency can also save short flows, like opening a menu or reaching a form, and see exactly which step fails.</span></p>
      </div>
    </section>
  );
}
