import { Legal, H, UL } from '@/components/landing/Legal.tsx';

export const metadata = { title: 'Privacy | Avara', description: 'What Avara stores, what its scanner does with the page you give it, and which cookies it sets.' };
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
// Read at request time so the page names the provider this deployment actually uses.
export const dynamic = 'force-dynamic';
const providerOn = () => {
  const p = (process.env.AVARA_AI_PROVIDER || 'claude').trim().toLowerCase();
  if (p === 'gemini') return process.env.GEMINI_API_KEY ? 'on, using Gemini (Google)' : 'off';
  if (p === 'claude') return process.env.ANTHROPIC_API_KEY ? 'on, using Claude (Anthropic)' : 'off';
  return 'off';
};
const ruleAi = () => (process.env.AVARA_AI === 'on' ? providerOn() : 'off');
const fixAi = () => (process.env.SUGAM_AI === 'on' ? providerOn() : 'off');

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="15 November 2026">
      <p>This page says plainly what Avara does with information today. It describes how the product behaves, so it will change as the product does.</p>
      <section><H>What the scanner does with the page you give it</H>
        <UL items={[
          'It loads the public page you enter in a headless browser, at a desktop and a phone width, and presses Tab and arrow keys to test keyboard use.',
          'It does not sign in to your site and does not submit forms.',
          'It records the issues it finds, the code of the flagged elements, and screenshots of the page. A screenshot shows whatever was visible on the page, so scan pages that do not show personal information.',
          'It refuses addresses that point to private or internal networks.',
        ]} />
      </section>
      <section><H>What we store</H>
        <UL items={[
          'If you make an account: your email address, your name if you give one, and a salted hash of your password (never the password itself).',
          'Workspaces, clients and sites you create, the scans you run, their results and screenshots, share links you create (stored as hashes), and the review notes you write.',
          'If you join the waiting list for paid plans: your email address and the plan you asked about.',
          'Your internet address is used to limit how many scans one visitor can start. That limit is kept in memory and is not written to the database.',
        ]} />
      </section>
      <section><H>Cookies</H>
        <p className="mb-3">Avara sets two cookies, both HttpOnly and used only to make the product work:</p>
        <UL items={[
          <><b className="text-ink">sugam_session</b>: keeps you signed in.</>,
          <><b className="text-ink">sugam_claims</b>: a signed list of the anonymous scans started in this browser, so you can see your own results without an account.</>,
        ]} />
        <p className="mt-3">There are no advertising or analytics scripts on the site, and the fonts are served from Avara itself.</p>
      </section>
      <section><H>The AI step</H>
        <p>Avara can ask an AI model to refine explanations and fixes. This is off unless the operator turns it on. When it is on, the findings, the code of flagged elements, the keyboard trace and the screenshots for that scan are sent to the provider below to produce the result.</p>
        <p className="mt-3">Separately, Avara can ask an AI model to judge the rules that need judgement, such as whether the headline is clear, whether the page shows trust signals and whether the main button is obvious. This is also off unless the operator turns it on. When it is on, a small part of the page is sent: the title, headings, button labels, an excerpt of the visible text and, for some rules, up to two screenshots. The model can only judge rules Avara already has; it cannot add issues.</p>
        <UL items={[
          <><b className="text-ink">Claude (Anthropic)</b> is the default provider for both steps.</>,
          <><b className="text-ink">Gemini (Google)</b> can be chosen instead. On Google&apos;s free tier, Google may use what is sent to improve its products, so the free tier should only be used for scans of public demo pages.</>,
        ]} />
        <p className="mt-3">On this site the rule review is {ruleAi()}, and the fix step is {fixAi()}.</p>
      </section>
      <section><H>Deleting your data</H>
        <p>Self-service deletion of accounts and scans is not built yet.{CONTACT ? <> To have your data deleted, email <a className="font-semibold text-ink underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : ' Until it is, ask the operator of this site to delete your data.'}</p>
      </section>
    </Legal>
  );
}
