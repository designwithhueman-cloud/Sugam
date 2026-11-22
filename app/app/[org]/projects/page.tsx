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
import { Panel, IconBadge } from '@/components/dashboard/bits.tsx';
import { Layers, Plus } from 'lucide-react';
import { SearchBar, Pager, listPage } from '@/components/dashboard/ListNav.tsx';
import { PageHead } from '@/components/dashboard/PageHead.tsx';
import { ProjectTable, EmptyNote } from '@/components/dashboard/Tables.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client projects | Avara' };
export default async function Projects({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { org } = await params; const sp = await searchParams;
  const user = await requireUser(`/app/${org}/projects`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const db = await getDb();
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.organizationId, a.org.id)).orderBy(asc(schema.clients.name));
  const { rows } = await workspaceOverview(a.org.id, a.org.plan);
  const limit = LIMITS[a.org.plan].sites; const full = rows.length >= limit;
  const base = `/app/${org}/projects`; const L = listPage(rows, (r) => [r.name, r.client, r.url], sp);
  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <PageHead crumbs={[{ label: a.org.name, href: `/app/${org}` }]} current="Client projects" title="Client projects" />
      <div className="grid gap-6">
        <Panel aria-labelledby="list-h" className="px-4 pb-1 pt-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><IconBadge icon={Layers} tone="lilac" />
              <div><h2 id="list-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">{rows.length} of {limit} project{limit === 1 ? '' : 's'}</h2><p className="text-sm text-pine-600">Latest scan of each client site.</p></div></div>
            {rows.length > 0 && <SearchBar base={base} q={L.q} label="Search client projects" placeholder="Search by project, client or address" />}
          </div>
          {L.rows.length ? <ProjectTable org={org} rows={L.rows} caption="Client projects, with recommended fixes and observations from each project's latest scan" /> : <div className="pb-4"><EmptyNote>{rows.length ? 'No projects match that search.' : 'No client projects yet. Add one with the form.'}</EmptyNote></div>}
          {rows.length > 0 && <Pager base={base} q={L.q} page={L.page} pages={L.pages} matched={L.matched} noun="project" />}
        </Panel>
        <Panel aria-labelledby="add-project" className="scroll-mt-6 p-5 sm:p-6">
          <h2 id="add-project" tabIndex={-1} className="flex items-center gap-3 text-[1.375rem] font-semibold tracking-tight text-ink"><IconBadge icon={Plus} tone="green" />{rows.length ? 'Add a project' : 'Add your first project'}</h2>
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
