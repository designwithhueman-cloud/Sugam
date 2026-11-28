// "Launch check": the security half of the promise in plain words, then the check-again loop as a scroll-linked timeline (LaunchCheckLoop).
import { CheckCircle2, FileLock2, KeyRound, Database, Code2, RotateCcw } from 'lucide-react';
import { LaunchCheckLoop } from './LaunchCheckLoop.tsx';
import { kicker, h2 } from './Sections.tsx';

const ITEMS = [
  { icon: KeyRound, title: 'Secret keys in your code', body: 'Keys for services like Stripe or OpenAI that anyone can read in your page.' },
  { icon: FileLock2, title: 'Private files left public', body: 'Settings files, git folders and database backups that anyone can download.' },
  { icon: Code2, title: 'Your source code is public', body: 'Files that let anyone read your original code in full.' },
  { icon: Database, title: 'Customer data anyone can read', body: 'Supabase tables that a signed-out visitor can open.' },
] as const;

export function LaunchCheck() {
  return (
    <section id="launch-check" aria-labelledby="lc-h" className="scroll-mt-6 px-5 pb-20 sm:px-10 lg:pb-32">
      <p className={kicker}>Launch check</p>
      <h2 id="lc-h" className={`mt-4 max-w-4xl text-balance ${h2}`}>Is your app leaking <span className="text-vio-deep">keys or customer data</span>?</h2>
      <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">Visitors never see these mistakes, but <strong className="font-semibold text-ink">anyone who looks can find them</strong>. AI builders ship fast and sometimes leave them behind. Avara looks for four.</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((x) => (
          <li key={x.title} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-black/10 bg-white p-5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[#efe9ff] text-[#432099]"><x.icon className="size-5" /></span>
            <div className="min-w-0"><h3 className="text-lg font-semibold leading-snug text-ink">{x.title}</h3><p className="mt-1 text-base leading-snug text-neutral-800">{x.body}</p></div>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-3xl text-lg leading-relaxed text-neutral-800"><strong className="font-semibold text-ink">It only reads.</strong> It never changes your site, never signs in, and never keeps a full copy of your keys or any customer records. The deeper checks run only after you show the site is yours.</p>

      <div className="mt-14 rounded-[2rem] bg-[#efe9ff] px-6 py-10 sm:px-10 lg:mt-20 lg:py-14">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#432099]"><RotateCcw aria-hidden className="size-4" />Check again</p>
        <h3 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-4xl">Fixed it? Find out <span className="text-vio-deep">what else broke</span>.</h3>
        <p className="mt-4 max-w-3xl text-xl leading-relaxed text-ink">Avara runs the same checks every time and compares with the last one, so a fix can’t quietly break something else.</p>
        <div className="mt-10 lg:mt-14"><LaunchCheckLoop /></div>
        <p className="mt-12 flex gap-3 text-lg leading-relaxed text-ink"><CheckCircle2 aria-hidden className="mt-1 size-5 shrink-0 text-[#3b7a00]" /><span>A single <strong className="font-semibold">Ready to launch?</strong> page joins your scan, your launch check and your saved flows into one answer, with the newly broken things first. Creator and Agency can also save short flows, like opening a menu or reaching a form, and see exactly which step fails. If a safety rule stops a flow, Avara shows which steps passed and what still needs checking.</span></p>
      </div>
    </section>
  );
}
