import { Legal, H, UL } from '@/components/landing/Legal.tsx';

export const metadata = { title: 'Terms | Avara', description: 'The rules for using Avara, in plain language.' };

export default function Terms() {
  return (
    <Legal title="Terms" updated="15 November 2026">
      <p>These are the plain-language terms for using Avara. Using the site means you accept them.</p>
      <section><H>What Avara is</H>
        <p>Avara is an automated accessibility review tool. It finds some accessibility barriers on the public page you give it and suggests fixes. It does not certify that a site meets any law or standard, it does not replace testing with real assistive technology, and some findings need a person to decide.</p>
      </section>
      <section><H>Scan only what you may scan</H>
        <UL items={[
          'Scan pages you own, run, or have permission to test.',
          'Do not use Avara to put load on a site, to probe it for weaknesses, or to reach private networks. Scans are rate limited, and addresses on private networks are refused.',
          'Do not share report links with information you are not allowed to share. Anyone with a link can read that report until it expires (90 days).',
        ]} />
      </section>
      <section><H>Accounts</H>
        <p>Keep your password safe. You are responsible for what happens in your account and workspaces, including what people you add can do. We may limit or close accounts that break these terms.</p>
      </section>
      <section><H>Plans and prices</H>
        <p>Online checkout is not open yet, and the prices shown on the site are planned prices. Nothing is charged today. If that changes, the plan, price and billing terms will be shown before you pay.</p>
      </section>
      <section><H>No guarantees</H>
        <p>Avara is provided as it is. Scores, findings and suggested fixes may be incomplete or wrong, and you should check a fix before you publish it. To the extent the law allows, Avara is not liable for losses from using the results.</p>
      </section>
    </Legal>
  );
}
