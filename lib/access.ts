// Authorisation rules. A report is visible to the person who ran it (personal scans) or to
// members of the organization that owns its project. Branding and members: owner/admin only.
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import type { User } from './auth.ts';

export type Role = 'owner' | 'admin' | 'member';
export async function roleIn(userId: string, organizationId: string): Promise<Role | null> {
  const db = await getDb();
  const [m] = await db.select({ role: schema.memberships.role }).from(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.organizationId, organizationId)));
  return m?.role ?? null;
}
export async function orgForSlug(user: User, slug: string) {
  const db = await getDb();
  const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
  if (!o) return null;
  const role = await roleIn(user.id, o.id);
  return role ? { org: o, role } : null;
}
export async function projectAccess(user: User, projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const db = await getDb();
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return null;
  const role = await roleIn(user.id, p.organizationId);
  return role ? { project: p, role } : null;
}
export async function canViewScan(user: User | null, scanId: string): Promise<boolean> {
  if (!user || !/^[0-9a-f-]{36}$/i.test(scanId)) return false;
  const db = await getDb();
  const [s] = await db.select({ createdBy: schema.scans.createdBy, projectId: schema.scans.projectId }).from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!s) return false;
  if (s.projectId) return !!(await projectAccess(user, s.projectId));
  return s.createdBy === user.id;
}
export const canManage = (r: Role | null) => r === 'owner' || r === 'admin';

// Mutating API routes: refuse cross-site requests (cookie sessions + SameSite=Lax + this check).
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin'); if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}
export function slugify(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace'; }
