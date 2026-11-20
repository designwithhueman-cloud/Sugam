import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { siteStats } from '@/lib/dashboard.ts';
import { createProjectAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { STANDARDS } from '@/lib/standards.ts';
import { SEV_STATUS, SEV_ICON } from '@/components/dashboard/SegmentedBar.tsx';

export const dynamic = 'force-dynamic';
export default async function AllSites({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const db = await getDb();
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.organizationId, a.org.id)).orderBy(asc(schema.clients.name));
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.organizationId, a.org.id)).orderBy(asc(schema.projects.name));
  const stats = await Promise.all(projects.map(async (p) => ({ p, s: await siteStats(p.id) })));
  return (
    <main id="main" className="w-full max-w-[1440px] px-4 py-6 lg:px-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
      <h1 className="text-3xl font-bold text-[#111111]">All sites</h1>
      <p className="mt-1 text-slate-600">{a.org.name} · {projects.length} site{projects.length === 1 ? '' : 's'} across {clients.length} client{clients.length === 1 ? '' : 's'}</p>
      {projects.length > 0 && (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {stats.map(({ p, s }) => (
            <li key={p.id}><Link href={`/app/${org}/projects/${p.id}`} className="block rounded-2xl border border-stone-line bg-white p-5 transition-colors hover:border-pine-400 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-500">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-semibold text-pine-700">{clients.find((c) => c.id === p.clientId)?.name}</p><p className="text-lg font-semibold text-[#111111]">{p.name}</p><p className="truncate text-sm text-slate-600">{p.liveUrl || p.stagingUrl}</p></div>
                <div className="text-right"><p className="text-3xl font-extrabold tabular-nums text-[#111111]">{s.latest?.score ?? '–'}</p><p className="text-xs text-slate-600">Sugam score</p></div>
              </div>
              {s.bySeverity ? (
                <ul className="mt-4 flex flex-wrap gap-3 text-sm" aria-label="Open issues by severity">{(['critical', 'serious', 'moderate', 'minor'] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><span aria-hidden style={{ color: SEV_STATUS[k] }}>{SEV_ICON[k]}</span><b className="tabular-nums">{s.bySeverity![k]}</b> {k}</li>)}</ul>
              ) : <p className="mt-4 text-sm text-slate-600">No scans yet.</p>}
              {s.undecided > 0 && <p className="mt-2 text-xs font-semibold text-amber-800">{s.undecided} waiting for human review</p>}
            </Link></li>
          ))}
        </ul>
      )}
      {projects.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-stone-line bg-white p-6 text-slate-700">No sites yet. Add one with the form to run its first scan.</p>}
      </div>
      <section className="rounded-2xl xl:sticky xl:top-6 border border-stone-line bg-white p-6" aria-labelledby="add-h">
        <h2 id="add-h" className="text-xl font-bold text-[#111111]">{projects.length ? 'Add a site' : 'Add your first site'}</h2>
        <p className="mt-1 text-sm text-slate-600">A site belongs to a client. Add its live URL, its staging URL, or both, so you can compare before you ship.</p>
        <ActionForm action={createProjectAction} submit="Add site" className="mt-4">
          <input type="hidden" name="org" value={org} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {clients.length > 0 && <Field label="Existing client" htmlFor="p-client"><select id="p-client" name="clientId" className={inputCls}><option value="">Create a new client below</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <Field label={clients.length ? 'Or new client name' : 'Client name'} htmlFor="p-cname" hint="Use your own company name for your own sites."><input id="p-cname" name="clientName" className={inputCls} aria-describedby="p-cname-hint" /></Field>
            <Field label="Site name" htmlFor="p-name"><input id="p-name" name="name" className={inputCls} /></Field>
            <Field label="Compliance target" htmlFor="p-std"><select id="p-std" name="standard" className={inputCls}>{Object.entries(STANDARDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="Live URL" htmlFor="p-live"><input id="p-live" name="liveUrl" inputMode="url" placeholder="https://example.com" className={inputCls} /></Field>
            <Field label="Staging URL" htmlFor="p-staging"><input id="p-staging" name="stagingUrl" inputMode="url" placeholder="https://staging.example.com" className={inputCls} /></Field>
          </div>
        </ActionForm>
      </section>
      </div>
    </main>
  );
}
