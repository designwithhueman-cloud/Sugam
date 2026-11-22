// The header every project page shares: breadcrumb (workspace / Client projects / client / project), the page's H1, a short line under it,
// and the page's actions. Same look as the workspace pages (PageHead).
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { PageHead } from './PageHead.tsx';

export const projectMain = 'mx-auto w-full max-w-[76rem] px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8';

export async function ProjectHead({ org, project, current, title, sub, children }: { org: string; project: { id: string; name: string; organizationId: string; clientId: string }; current: string; title?: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  const db = await getDb();
  const [[o], [c]] = await Promise.all([
    db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, project.organizationId)),
    db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, project.clientId)),
  ]);
  const root = `/app/${org}`;
  return <PageHead crumbs={[{ label: o?.name ?? 'Workspace', href: root }, { label: 'Client projects', href: `${root}/projects` }, ...(c ? [{ label: c.name }] : []), { label: project.name, href: `${root}/projects/${project.id}` }]} current={current} title={title ?? current} sub={sub}>{children}</PageHead>;
}
