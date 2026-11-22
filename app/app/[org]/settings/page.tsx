import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug, canManage } from '@/lib/access.ts';
import { createClientAction, updateBrandingAction, addMemberAction, deleteAccountAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { DangerDelete } from '@/components/forms/DangerDelete.tsx';
import Link from 'next/link';
import { hasFeature, planName } from '@/lib/plans.ts';

export const dynamic = 'force-dynamic';
export default async function Settings({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}/settings`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const db = await getDb(); const manage = canManage(a.role);
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.organizationId, a.org.id)).orderBy(asc(schema.clients.name));
  const members = await db.select({ email: schema.users.email, name: schema.users.name, role: schema.memberships.role }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.organizationId, a.org.id));
  const card = 'rounded-2xl border border-stone-line bg-white p-6';
  const agency = hasFeature(a.org.plan, 'share_links');
  return (
    <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-8 lg:px-8">
      <h1 className="text-4xl font-bold text-pine-900">Workspace settings</h1>
      <section className={card} aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-lg font-semibold">Plan</h2>
        <p className="mt-1 text-bark">This workspace is on the <b>{planName(a.org.plan)}</b> plan. <Link className="font-semibold text-pine-800 underline" href={`/upgrade?plan=${a.org.plan}`}>Compare plans</Link></p>
      </section>
      <section className={card} aria-labelledby="brand-h">
        <h2 id="brand-h" className="text-lg font-semibold">Name and branding</h2>
        <p className="text-sm text-slate-600">Shown on the read-only report links you share with clients.</p>
        {manage ? (
          <ActionForm action={updateBrandingAction} submit={agency ? 'Save branding' : 'Save name'} className="mt-4">
            <input type="hidden" name="org" value={org} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Workspace name" htmlFor="b-name"><input id="b-name" name="name" defaultValue={a.org.name} className={inputCls} /></Field>
              {agency && <><Field label="Brand name on reports" htmlFor="b-brand"><input id="b-brand" name="brandName" defaultValue={a.org.brandName ?? ''} className={inputCls} /></Field>
              <Field label="Primary colour" htmlFor="b-primary"><input id="b-primary" name="brandPrimaryColor" type="color" defaultValue={a.org.brandPrimaryColor ?? '#2b2a27'} className="h-11 w-full rounded-lg border border-slate-400 bg-white" /></Field>
              <Field label="Accent colour" htmlFor="b-accent"><input id="b-accent" name="brandAccentColor" type="color" defaultValue={a.org.brandAccentColor ?? '#0d9488'} className="h-11 w-full rounded-lg border border-slate-400 bg-white" /></Field></>}
            </div>
            {!agency && <p className="text-sm text-bark">Report branding for client links is part of the Agency Pro plan.</p>}
          </ActionForm>
        ) : <p className="mt-2 text-sm text-slate-600">Only owners and admins can change branding.</p>}
      </section>
      <section className={card} aria-labelledby="mem-h">
        <h2 id="mem-h" className="text-lg font-semibold">Members</h2>
        <table className="mt-3 w-full text-sm"><caption className="sr-only">Workspace members</caption><thead className="text-left text-slate-600"><tr><th className="py-2">Person</th><th className="py-2">Role</th></tr></thead>
          <tbody>{members.map((m) => <tr key={m.email} className="border-t border-slate-100"><td className="py-2">{m.name ? `${m.name} (${m.email})` : m.email}</td><td className="py-2">{m.role}</td></tr>)}</tbody></table>
        {manage && !agency && <p className="mt-3 text-sm text-bark">Adding team members is part of the Agency Pro plan.</p>}
        {manage && agency && (
          <ActionForm action={addMemberAction} submit="Add member" className="mt-4" resetOnOk refreshOnOk>
            <input type="hidden" name="org" value={org} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email of an existing Avara user" htmlFor="m-email"><input id="m-email" name="email" type="email" className={inputCls} /></Field>
              <Field label="Role" htmlFor="m-role"><select id="m-role" name="role" className={inputCls}><option value="member">Member: view and run scans</option><option value="admin">Admin: also branding and members</option></select></Field>
            </div>
          </ActionForm>
        )}
      </section>
      <section className={card} aria-labelledby="cl-h">
        <h2 id="cl-h" className="text-lg font-semibold">Clients</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">{clients.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <ActionForm action={createClientAction} submit="Add client" className="mt-4 max-w-md">
          <input type="hidden" name="org" value={org} />
          <Field label="Client name" htmlFor="c-name"><input id="c-name" name="name" className={inputCls} /></Field>
        </ActionForm>
      </section>
      <section className={card} aria-labelledby="acct-h">
        <h2 id="acct-h" className="text-lg font-semibold">Your account</h2>
        <p className="mt-1 text-sm text-slate-700">Signed in as {user.email}.</p>
        <div className="mt-4"><DangerDelete id="del-acct" summary="Delete my account" explain="Deletes your account, the scans you ran yourself, and every workspace where you are the only member, with its projects, scans, screenshots and share links. Workspaces you share with others stay; you are removed from them. This cannot be undone." action={deleteAccountAction} hidden={{}} confirmLabel="Type your email address to confirm" submit="Delete my account permanently" /></div>
      </section>
    </main>
  );
}
