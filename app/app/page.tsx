import Link from 'next/link';
import { desc, eq, and, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { createOrgAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { ScanRow } from '@/components/ScanRow.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspaces | Sugam' };
export default async function Dashboard() {
  const user = await requireUser('/app');
  const db = await getDb();
  const orgs = await db.select({ org: schema.organizations, role: schema.memberships.role }).from(schema.memberships).innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId)).where(eq(schema.memberships.userId, user.id));
  const mine = await db.select().from(schema.scans).where(and(eq(schema.scans.createdBy, user.id), isNull(schema.scans.projectId))).orderBy(desc(schema.scans.createdAt)).limit(20);
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Your workspaces</h1>
      <p className="mt-1 text-slate-600">A workspace holds your clients and their projects. Everyone in a workspace sees its reports.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {orgs.map(({ org, role }) => (
          <li key={org.id}><Link href={`/app/${org.slug}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-pine-400">
            <span className="block text-lg font-semibold">{org.name}</span><span className="text-sm text-slate-600">Your role: {role}</span>
          </Link></li>
        ))}
      </ul>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="new-ws">
        <h2 id="new-ws" className="text-lg font-semibold">New workspace</h2>
        <ActionForm action={createOrgAction} submit="Create workspace" className="mt-3 max-w-md">
          <Field label="Workspace name" htmlFor="ws-name" hint="For example your agency's name."><input id="ws-name" name="name" className={inputCls} aria-describedby="ws-name-hint" /></Field>
        </ActionForm>
      </section>
      <section className="mt-10" aria-labelledby="quick">
        <h2 id="quick" className="text-xl font-semibold">Quick scans</h2>
        <p className="text-sm text-slate-600">Single-page scans you ran outside a project. <Link className="font-semibold text-pine-700 underline" href="/website-accessibility-checker">Run another</Link></p>
        {mine.length ? <div className="mt-3 overflow-x-auto rounded-xl" tabIndex={0} role="region" aria-label="Quick scans, scrolls sideways on small screens"><table className="w-full min-w-[34rem] overflow-hidden rounded-xl bg-white text-sm shadow-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-3">Page</th><th className="p-3">Score</th><th className="p-3">Confirmed issues</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead><tbody>{mine.map((s) => <ScanRow key={s.id} scan={s} />)}</tbody></table></div> : <p className="mt-3 text-sm text-slate-600">None yet.</p>}
      </section>
    </main>
  );
}
