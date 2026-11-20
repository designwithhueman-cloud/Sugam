import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Check } from 'lucide-react';
import { getDb, schema } from '@/lib/db/index.ts';
import { currentUser } from '@/lib/auth.ts';
import { PLANS, planName } from '@/lib/plans.ts';
import { WaitlistForm } from '@/components/landing/WaitlistForm.tsx';
import { kicker } from '@/components/landing/Sections.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans | Sugam' };

// Checkout is not connected yet, so this page says so and takes an email instead of pretending
// to take payment. Workspaces are moved between plans with scripts/set-plan.ts for now.
export default async function Upgrade({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const chosen = plan === 'agency' ? 'agency' : 'site';
  const p = PLANS.find((x) => x.id === chosen)!;
  const user = await currentUser();
  const workspaces = user ? await (await getDb()).select({ name: schema.organizations.name, slug: schema.organizations.slug, plan: schema.organizations.plan }).from(schema.memberships).innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId)).where(eq(schema.memberships.userId, user.id)) : [];
  return (
    <main id="main" className="px-5 pb-20 pt-12 sm:px-10 sm:pt-16">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className={kicker}>Plans</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">{p.name} is <span className="text-vio-deep">almost ready</span></h1>
          <p className="mt-5 text-xl leading-relaxed text-neutral-800">Online checkout is not open yet, and nothing is charged. Leave your email and we will tell you once when it opens.</p>
          <WaitlistForm plan={chosen} />
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-lg">
            {PLANS.filter((x) => x.id !== 'free' && x.id !== chosen).map((x) => <Link key={x.id} href={`/upgrade?plan=${x.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">See {x.name} instead</Link>)}
            <Link href={user ? '/app' : '/website-accessibility-checker'} className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">{user ? 'Back to your dashboard' : 'Run a free scan'}</Link>
          </p>
        </div>
        <div className="space-y-5">
          <section aria-labelledby="plan-h" className="rounded-[2rem] border border-ink bg-white p-8 shadow-[0_10px_0_-2px_#d9f56e]">
            <h2 id="plan-h" className="text-2xl font-semibold tracking-tight text-ink">{p.name}</h2>
            <p className="mt-3"><span className="text-5xl font-semibold tracking-tight text-ink">{p.price}</span> <span className="text-lg text-neutral-700">{p.period}</span> <span className="ml-1 text-base text-neutral-700">(planned price)</span></p>
            <p className="mt-3 text-lg font-medium text-ink">{p.summary}</p>
            <ul className="mt-5 space-y-3">{p.features.map((f) => <li key={f} className="flex gap-3 text-lg leading-snug text-neutral-800"><Check aria-hidden className="mt-1 size-5 shrink-0 text-[#2d6a00]" />{f}</li>)}</ul>
          </section>
          {workspaces.length > 0 && (
            <section aria-labelledby="ws-h" className="rounded-[1.75rem] border border-black/10 bg-white p-6">
              <h2 id="ws-h" className="text-xl font-semibold text-ink">Your workspaces</h2>
              <ul className="mt-2 divide-y divide-black/10">{workspaces.map((w) => <li key={w.slug} className="flex flex-wrap items-center justify-between gap-2 py-3"><Link className="font-semibold text-ink underline" href={`/app/${w.slug}`}>{w.name}</Link><span className="rounded-full bg-[#f1f0ec] px-3 py-1 text-base font-semibold text-ink">{planName(w.plan)}</span></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
