import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, count, eq } from 'drizzle-orm';
import { ArrowRight, Plus, Lock, LogOut } from 'lucide-react';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { createOrgAction, logoutAction } from '@/app/actions.ts';
import { quickScans } from '@/lib/overview.ts';
import { PLANS } from '@/lib/plans.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { Wordmark } from '@/components/landing/Header.tsx';
import { Initials, Panel, btnOutline } from '@/components/dashboard/bits.tsx';
import { QuickScanTable, EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspaces | Avara' };
const QUICK = 5;

// With one workspace there is nothing to choose, so this page goes straight to its overview. It stays reachable for
// people in several workspaces, and for making a new one (?new=workspace, linked from the workspace switcher).
export default async function Workspaces({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser('/app');
  const creating = (await searchParams).new === 'workspace';
  const db = await getDb();
  const orgs = await db.select({ org: schema.organizations, role: schema.memberships.role }).from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId)).where(eq(schema.memberships.userId, user.id)).orderBy(asc(schema.organizations.name));
  if (orgs.length === 1 && !creating) redirect(`/app/${orgs[0].org.slug}`);
  const projectCounts = new Map((await Promise.all(orgs.map(async ({ org }) => [org.id, Number((await db.select({ n: count() }).from(schema.projects).where(eq(schema.projects.organizationId, org.id)))[0].n)] as const))));
  const quick = await quickScans(user.id, QUICK);
  const home = orgs[0] ? `/app/${orgs[0].org.slug}` : null;
  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-stone-line bg-[#f7f6f2]">
        <div className="mx-auto flex max-w-[60rem] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={home ?? '/app'} className="rounded-lg"><Wordmark className="text-[1.4rem]" /><span className="sr-only">: home</span></Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-sm text-pine-600 sm:inline">{user.email}</span>
            <form action={logoutAction}><button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-pine-700 hover:bg-pine-100 hover:text-ink"><LogOut aria-hidden className="size-4" />Sign out</button></form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[60rem] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.5rem]">Your workspaces</h1>
            <p className="mt-1 max-w-xl text-pine-700">A workspace holds your clients and their projects. Everyone in it sees its reports.</p></div>
        </div>

        <Panel aria-labelledby="ws-h" className="mt-6 p-2">
          <h2 id="ws-h" className="sr-only">Workspaces</h2>
          {orgs.length ? (
            <ul className="divide-y divide-stone-line">
              {orgs.map(({ org, role }) => {
                const n = projectCounts.get(org.id) ?? 0;
                return (
                  <li key={org.id}>
                    <Link href={`/app/${org.slug}`} className="group flex items-center gap-4 rounded-xl px-3 py-3.5 hover:bg-pine-50">
                      <Initials name={org.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-semibold text-ink">{org.name}</span>
                        <span className="block text-sm text-pine-600">{PLANS.find((p) => p.id === org.plan)?.name ?? org.plan} · {n} project{n === 1 ? '' : 's'} · you are {role === 'owner' ? 'the owner' : `a${role === 'admin' ? 'n' : ''} ${role}`}</span>
                      </span>
                      <span className="hidden items-center gap-1.5 text-sm font-semibold text-ink sm:inline-flex">Open<ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                      <ArrowRight aria-hidden className="size-5 text-ink sm:hidden" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="p-4 text-pine-700">You are not in a workspace yet. Create one below.</p>}
          <details open={creating || !orgs.length} className="group border-t border-stone-line px-3 pb-3 pt-3">
            <summary className={`${btnOutline} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><Plus aria-hidden className="size-4" />New workspace</summary>
            <div className="mt-4 max-w-md">
              <p className="text-sm text-pine-600">For a separate agency or team. Its projects, clients and plan are kept apart from your other workspaces.</p>
              <ActionForm action={createOrgAction} submit="Create workspace" className="mt-3">
                <Field label="Workspace name" htmlFor="ws-name" hint="For example your agency's name."><input id="ws-name" name="name" className={inputCls} aria-describedby="ws-name-hint" autoFocus={creating} /></Field>
              </ActionForm>
            </div>
          </details>
        </Panel>

        <Panel aria-labelledby="quick-h" className="mt-6 px-4 pb-2 pt-5 sm:px-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3"><Lock aria-hidden className="mt-1 size-5 shrink-0 text-pine-600" />
              <div><h2 id="quick-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">My quick scans</h2><p className="text-sm text-pine-600">Outside client projects. Only you see these.</p></div></div>
            {home && quick.total > QUICK && <Link href={`${home}/quick-scans`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-ink underline underline-offset-4 hover:text-vio">View all {quick.total}<span className="sr-only"> quick scans</span><ArrowRight aria-hidden className="size-4" /></Link>}
          </div>
          {quick.scans.length ? <QuickScanTable rows={quick.scans} caption="Your most recent quick scans" />
            : <div className="pb-4"><EmptyNote>No quick scans yet. <Link href="/website-accessibility-checker" className="font-semibold text-ink underline underline-offset-4">Scan any page</Link> to check it without adding a project.</EmptyNote></div>}
        </Panel>
      </main>
    </div>
  );
}
