import { Legal, H, UL } from '@/components/landing/Legal.tsx';

export const metadata = { title: 'Privacy | Sugam', description: 'What Sugam stores, what its scanner does with the page you give it, and which cookies it sets.' };
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="21 November 2026">
      <p>This page says plainly what Sugam does with information today. It describes how the product behaves, so it will change as the product does.</p>
      <section><H>What the scanner does with the page you give it</H>
        <UL items={[
          'It loads the public page you enter in a headless browser, at a desktop and a phone width, and presses Tab and arrow keys to test keyboard use.',
          'It does not sign in to your site and does not submit forms.',
          'It records the issues it finds, the code of the flagged elements, and screenshots of the page. A screenshot shows whatever was visible on the page, so scan pages that do not show personal information.',
          'It refuses addresses that point to private or internal networks.',
        ]} />
      </section>
      <section><H>Google PageSpeed Insights</H>
        <p>For the performance check, the address of the page you scan (only the address, nothing else from your account) is sent to Google&apos;s PageSpeed Insights service. Google then loads that page itself, on its own servers, and returns two things: real-visitor speed data from its Chrome UX Report, when Google has enough visits to the page or site, and its own lab test of the page. Google&apos;s handling of that request is covered by the <a className="font-semibold text-ink underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>. Only public addresses are sent; addresses on private or internal networks never are. The operator of this site can turn this off.</p>
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
        <p className="mb-3">Sugam sets two cookies, both HttpOnly and used only to make the product work:</p>
        <UL items={[
          <><b className="text-ink">sugam_session</b>: keeps you signed in.</>,
          <><b className="text-ink">sugam_claims</b>: a signed list of the anonymous scans started in this browser, so you can see your own results without an account.</>,
        ]} />
        <p className="mt-3">There are no advertising or analytics scripts on the site, and the fonts are served from Sugam itself.</p>
      </section>
      <section><H>The AI step</H>
        <p>Sugam can ask the Claude API to refine explanations and fixes. This is off unless the operator turns it on. When it is on, the findings, the code of flagged elements, the keyboard trace and the screenshots for that scan are sent to Anthropic to produce the result.</p>
      </section>
      <section><H>Deleting your data</H>
        <p>Self-service deletion of accounts and scans is not built yet.{CONTACT ? <> To have your data deleted, email <a className="font-semibold text-ink underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : ' Until it is, ask the operator of this site to delete your data.'}</p>
      </section>
    </Legal>
  );
}
