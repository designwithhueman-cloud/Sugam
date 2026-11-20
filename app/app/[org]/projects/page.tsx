import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { workspaceOverview } from '@/lib/overview.ts';
import { LIMITS } from '@/lib/plans.ts';
import { createProjectAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { STANDARDS } from '@/lib/standards.ts';
import { Panel } from '@/components/dashboard/bits.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { ProjectTable, EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client projects | Sugam' };
export default async function Projects({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}/projects`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const db = await getDb();
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.organizationId, a.org.id)).orderBy(asc(schema.clients.name));
  const { rows } = await workspaceOverview(a.org.id, a.org.plan);
  const limit = LIMITS[a.org.plan].sites; const full = rows.length >= limit;
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Client projects" title="Client projects" />
      <div className="grid gap-6">
        <Panel aria-labelledby="list-h" className="px-4 pb-2 pt-5 sm:px-6">
          <h2 id="list-h" className="mb-3 text-[1.375rem] font-semibold tracking-tight text-ink">{rows.length} of {limit} project{limit === 1 ? '' : 's'}</h2>
          {rows.length ? <ProjectTable org={org} rows={rows} caption="Client projects, with confirmed issues from each project's latest scan" /> : <div className="pb-4"><EmptyNote>No client projects yet. Add one with the form.</EmptyNote></div>}
        </Panel>
        <Panel aria-labelledby="add-project" className="scroll-mt-6 p-5 sm:p-6">
          <h2 id="add-project" tabIndex={-1} className="text-xl font-semibold text-ink">{rows.length ? 'Add a project' : 'Add your first project'}</h2>
          {full ? <p className="mt-2 text-[15px] text-pine-700">This workspace holds {limit} project{limit === 1 ? '' : 's'} on its plan, and all {limit === 1 ? 'of it is' : 'are'} in use.</p> : <>
          <p className="mt-1 text-sm text-pine-600">A project is one client site. Add its live URL, its staging URL, or both, so you can compare before you ship.</p>
          <ActionForm action={createProjectAction} submit="Add project" className="mt-4">
            <input type="hidden" name="org" value={org} />
            <div className="grid max-w-3xl gap-x-4 gap-y-3 sm:grid-cols-2">
              {clients.length > 0 && <Field label="Existing client" htmlFor="p-client"><select id="p-client" name="clientId" className={inputCls}><option value="">Create a new client below</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
              <Field label={clients.length ? 'Or new client name' : 'Client name'} htmlFor="p-cname" hint="Use your own company name for your own sites."><input id="p-cname" name="clientName" className={inputCls} aria-describedby="p-cname-hint" /></Field>
              <Field label="Project name" htmlFor="p-name"><input id="p-name" name="name" className={inputCls} /></Field>
              <Field label="Compliance target" htmlFor="p-std"><select id="p-std" name="standard" className={inputCls}>{Object.entries(STANDARDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
              <Field label="Live URL" htmlFor="p-live"><input id="p-live" name="liveUrl" inputMode="url" placeholder="https://example.com" className={inputCls} /></Field>
              <Field label="Staging URL" htmlFor="p-staging"><input id="p-staging" name="stagingUrl" inputMode="url" placeholder="https://staging.example.com" className={inputCls} /></Field>
            </div>
          </ActionForm></>}
        </Panel>
      </div>
    </main>
  );
}
