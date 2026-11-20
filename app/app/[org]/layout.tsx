import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { orgForSlug } from '@/lib/access.ts';
import { PLANS } from '@/lib/plans.ts';
import { Sidebar } from '@/components/dashboard/Sidebar.tsx';

export const dynamic = 'force-dynamic';
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await requireUser(`/app/${org}`);
  const a = await orgForSlug(user, org); if (!a) notFound();
  const db = await getDb();
  const rows = await db.select({ id: schema.projects.id, name: schema.projects.name, live: schema.projects.liveUrl, staging: schema.projects.stagingUrl, client: schema.clients.name })
    .from(schema.projects).innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId)).where(eq(schema.projects.organizationId, a.org.id)).orderBy(asc(schema.projects.name));
  const workspaces = await db.select({ slug: schema.organizations.slug, name: schema.organizations.name }).from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId)).where(eq(schema.memberships.userId, user.id)).orderBy(asc(schema.organizations.name));
  return (
    <div className="flex min-h-screen flex-col bg-sand lg:flex-row">
      <Sidebar org={org} orgName={a.org.name} planName={PLANS.find((p) => p.id === a.org.plan)?.name ?? a.org.plan} workspaces={workspaces} user={{ email: user.email, name: user.name }} sites={rows.map((r) => ({ id: r.id, name: r.name, url: r.live || r.staging, client: r.client }))} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
