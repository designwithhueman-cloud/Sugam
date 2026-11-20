import Link from 'next/link';
import { CopyButton } from '@/components/CopyButton.tsx';
import { Resource } from '@/components/landing/Resource.tsx';
import { AI_RULES } from '@/lib/ai-rules.ts';

export const metadata = { title: 'Accessibility rules for AI builders | Sugam', description: 'A short rules file to paste into Lovable, Bolt.new, v0, Cursor or any AI builder so new pages start accessible.' };

export default function Page() {
  return (
    <Resource cta={{ title: 'Rules stop new problems. A scan finds the old ones.', text: 'Your pages already exist. Scan one to see what is wrong today, with a fix for each issue.' }} kicker="Free tool" title="Accessibility rules for your AI builder" lede="Paste this into your project once, and every page the builder writes starts from the same rules. It is short on purpose, so it does not cost you much on every prompt.">
      <div className="rounded-[2rem] border border-black/10 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">The rules</h2>
          <CopyButton text={AI_RULES} label="rules" className="border-0 bg-[#d9f56e] text-ink hover:bg-[#cdee5c]" />
        </div>
        <pre tabIndex={0} aria-label="Accessibility rules" className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-[#1e1e1e] p-5 font-mono text-[15px] leading-relaxed text-white [overflow-wrap:anywhere]">{AI_RULES}</pre>
      </div>
      <h2 className="mt-12 text-2xl font-semibold tracking-tight text-ink">Where to put it</h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-lg leading-relaxed text-neutral-800">
        <li>Where your tool keeps standing instructions: project knowledge in Lovable, project rules in Cursor, project instructions in v0 and Bolt.new. Names change, so look for the setting that applies to every prompt.</li>
        <li>If your tool has no such setting, paste it at the top of your first prompt for each new page.</li>
        <li>For a site you already have, run a scan first. The rules stop new problems. They do not fix old ones.</li>
      </ul>
      <p className="mt-8 text-lg leading-relaxed text-neutral-800">Want the reasons behind each rule? Read <Link href="/learn/accessibility-in-ai-built-sites" className="font-semibold text-ink underline underline-offset-4">accessibility in sites built with AI tools</Link>.</p>
    </Resource>
  );
}
