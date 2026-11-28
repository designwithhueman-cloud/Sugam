import { Legal, H, UL } from '@/components/landing/Legal.tsx';
import { ANON_RETENTION_DAYS } from '@/lib/deletion.ts';

export const metadata = { title: 'Privacy | Avara', description: 'What Avara stores, what its scanner does with the page you give it, and which cookies it sets.' };
// Read at request time (not inlined at build), so one image serves any deployment: the operator, the contact, the retention period and
// the AI provider shown are this site's own. NEXT_PUBLIC_CONTACT_EMAIL is still read for older setups.
export const dynamic = 'force-dynamic';
const env = (k: string) => (process.env[k] || '').trim();
const contact = () => env('AVARA_CONTACT_EMAIL') || env('NEXT_PUBLIC_CONTACT_EMAIL');
const operator = () => env('AVARA_OPERATOR');
const providerOn = () => {
  const p = (process.env.AVARA_AI_PROVIDER || 'claude').trim().toLowerCase();
  if (p === 'gemini') return process.env.GEMINI_API_KEY ? 'on, using Gemini (Google)' : 'off';
  if (p === 'claude') return process.env.ANTHROPIC_API_KEY ? 'on, using Claude (Anthropic)' : 'off';
  return 'off';
};
const ruleAi = () => (process.env.AVARA_AI === 'on' ? providerOn() : 'off');
const fixAi = () => (process.env.AVARA_AI === 'on' || process.env.SUGAM_AI === 'on' ? providerOn() : 'off');

export default function Privacy() {
  const CONTACT = contact(), OPERATOR = operator(), DAYS = ANON_RETENTION_DAYS();
  const mail = CONTACT ? <a className="font-semibold text-ink underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> : null;
  return (
    <Legal title="Privacy" updated="21 November 2026">
      <p>This page says plainly what Avara does with information today. It describes how the product behaves, so it will change as the product does.</p>
      <section><H>Who runs this site</H>
        <p>{OPERATOR ? <>This site is run by <b className="text-ink">{OPERATOR}</b>, who decides what happens to the information described here.</> : 'This site is run by its operator, who decides what happens to the information described here.'}{mail ? <> Questions and requests: {mail}.</> : null}</p>
      </section>
      <section><H>What the scanner does with the page you give it</H>
        <UL items={[
          'It loads the public page you enter in a headless browser, at a desktop and a phone width, and presses Tab and arrow keys to test keyboard use.',
          'It does not sign in to your site and does not submit forms.',
          'It records the issues it finds, the code of the flagged elements, and screenshots of the page. A screenshot shows whatever was visible on the page, so scan pages that do not show personal information.',
          'It refuses addresses that point to private or internal networks.',
          'Before an address is saved, Avara removes parts that usually carry secrets: query parameters such as token, key, code, session, password or email, and a #fragment that carries values. The page is scanned without them, and they are never stored, shown in reports or sent anywhere.',
        ]} />
      </section>
      <section><H>What we store</H>
        <UL items={[
          'If you make an account: your email address, your name if you give one, and a salted hash of your password (never the password itself).',
          'Workspaces, clients and sites you create, the scans you run, their results and screenshots, share links you create (stored as hashes), and the review notes you write.',
          'If you join the waiting list for paid plans: your email address and the plan you asked about.',
          'When you copy a fix from a report: a record that a fix was copied for that finding of that scan, and when. It holds only the scan’s and the finding’s identifiers. See “What we count” below.',
          'Your internet address is used to limit how many scans one visitor can start. That limit is kept in memory and is not written to the database.',
        ]} />
      </section>
      <section><H>How long we keep it</H>
        <UL items={[
          `Scans started without an account, with their screenshots and results, are deleted automatically after ${DAYS} days.`,
          'Scans in an account or a workspace are kept until you delete them, or delete the account or workspace.',
          'Share links stop working after 90 days, or as soon as you stop sharing them.',
          'Sign-in sessions last 30 days. The list of anonymous scans in your browser lasts 7 days.',
          'Backups of the database and screenshots are kept for up to 14 days, so deleted data leaves the backups within 14 days.',
        ]} />
      </section>
      <section><H>What we count</H>
        <p className="mb-3">To learn whether the fixes Avara writes are used, Avara records one thing: that a fix was copied for a finding in a scan. This is counted by Avara’s own server, with no cookie, no tracking script and no third party.</p>
        <UL items={[
          'Each record holds the scan’s identifier, the finding’s identifier and the time. It does not hold your name, email, account, internet address, the address of your site, the text you copied, or any key.',
          'Copying the same fix again does not add a record, so the count is of findings, not clicks.',
          'The record belongs to the scan. It is deleted when the scan is deleted: when you delete it, when you delete your account or workspace, and, for scans started without an account, automatically after the same number of days as the scan itself.',
          'Whether a scan was finished, whether it was rescanned, and whether a rescan found a finding fixed are not extra records: they are part of the scan’s own results, and are deleted with it.',
          'Shared (read-only) reports do not record anything.',
        ]} />
      </section>
      <section><H>What is public</H>
        <p>Avara publishes overall patterns across all scans, such as the share of scanned pages where a check failed. These contain percentages and rule names only: no addresses, page content, screenshots or account details.</p>
      </section>
      <section><H>Cookies</H>
        <p className="mb-3">Avara sets two cookies, both HttpOnly and used only to make the product work:</p>
        <UL items={[
          <><b className="text-ink">sugam_session</b>: keeps you signed in.</>,
          <><b className="text-ink">sugam_claims</b>: a signed list of the anonymous scans started in this browser, so you can see your own results without an account.</>,
        ]} />
        <p className="mt-3">There are no advertising or analytics scripts on the site, and the fonts are served from Avara itself. The one count described above is made by Avara’s own server and sets no cookie.</p>
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
        <UL items={[
          'Any scan you can manage has a Delete this scan button at the end of its report. It removes the report, findings, fixes, screenshots and share links at once.',
          'An anonymous scan can be deleted from the browser that started it.',
          'You can delete your account in Settings. That removes your scans and every workspace where you are the only member. Workspaces you share with others stay, without you.',
          <>{mail ? <>For anything else, or if you cannot use these buttons, email {mail}.</> : 'For anything else, ask the operator of this site.'}</>,
        ]} />
      </section>
    </Legal>
  );
}
