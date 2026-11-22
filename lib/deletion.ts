// Deleting data: one scan, every expired anonymous scan, or a whole account. A scan's rows go through the database's ON DELETE CASCADE
// (findings, evidence, fixes, share links, knowledge facts); its files (screenshots, raw results, diagnostics) are removed from storage.
// Cross-scan patterns are aggregates with no URL or page content; they are recomputed from the scans that remain after the next scan.
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { deletePrefix } from './storage.ts';
import { roleIn, canManage } from './access.ts';
import type { User } from './auth.ts';

export const ANON_RETENTION_DAYS = () => Math.max(1, Number(process.env.ANON_RETENTION_DAYS || 30));

type ScanRef = { id: string; projectId: string | null; createdBy: string | null };
/** Who may delete a scan: workspace owners and admins for a project scan; the person who ran it for a personal scan; and, for an
 * anonymous scan nobody has claimed with an account, the browser that started it. */
export async function canDeleteScan(user: User | null, scan: ScanRef, claimedHere: boolean): Promise<boolean> {
  if (scan.projectId) {
    if (!user) return false;
    const db = await getDb();
    const [p] = await db.select({ org: schema.projects.organizationId }).from(schema.projects).where(eq(schema.projects.id, scan.projectId));
    return !!p && canManage(await roleIn(user.id, p.org));
  }
  if (scan.createdBy) return !!user && user.id === scan.createdBy;
  return claimedHere;
}

async function removeScans(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 200) await db.delete(schema.scans).where(inArray(schema.scans.id, ids.slice(i, i + 200)));
  for (const id of ids) { try { await deletePrefix(`scans/${id}`); } catch (e) { console.error('scan files not removed', id, e); } }
  return ids.length;
}
// Rescans point at their original (rescan_of). Deleting an original keeps its rescans, which simply lose the link.
async function unlinkRescans(ids: string[]) {
  if (!ids.length) return; const db = await getDb();
  await db.update(schema.scans).set({ rescanOf: null }).where(inArray(schema.scans.rescanOf, ids));
}

export async function deleteScan(id: string): Promise<void> { await unlinkRescans([id]); await removeScans([id]); }

/** Anonymous scans (no account, no project) older than the retention period, with their files. Returns how many were removed. */
export async function purgeExpiredScans(now = Date.now()): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(now - ANON_RETENTION_DAYS() * 86_400_000);
  const rows = await db.select({ id: schema.scans.id }).from(schema.scans).where(and(isNull(schema.scans.createdBy), isNull(schema.scans.projectId), lt(schema.scans.createdAt, cutoff)));
  const ids = rows.map((r) => r.id); await unlinkRescans(ids); return removeScans(ids);
}

export type AccountDeletion = { ok: true; scans: number; workspaces: number } | { ok: false; reason: string };
/** Deletes an account: its personal scans, every workspace where it is the only member (with their projects and scans), its waiting-list
 * entries, and the user (sessions and memberships cascade). Refuses while it is the only owner of a workspace that has other members, so
 * nobody else loses a workspace without warning. */
export async function deleteAccount(user: User): Promise<AccountDeletion> {
  const db = await getDb();
  const mine = await db.select({ org: schema.memberships.organizationId, role: schema.memberships.role }).from(schema.memberships).where(eq(schema.memberships.userId, user.id));
  const solo: string[] = [];
  for (const m of mine) {
    const all = await db.select({ userId: schema.memberships.userId, role: schema.memberships.role }).from(schema.memberships).where(eq(schema.memberships.organizationId, m.org));
    if (all.length === 1) { solo.push(m.org); continue; }
    if (m.role === 'owner' && !all.some((x) => x.userId !== user.id && x.role === 'owner')) {
      const [o] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, m.org));
      return { ok: false, reason: `You are the only owner of “${o?.name ?? 'a workspace'}”, which has other members. Make another member an owner, or remove the members, then try again.` };
    }
  }
  const personal = (await db.select({ id: schema.scans.id }).from(schema.scans).where(and(eq(schema.scans.createdBy, user.id), isNull(schema.scans.projectId)))).map((r) => r.id);
  const inSolo = solo.length ? (await db.select({ id: schema.scans.id }).from(schema.scans).innerJoin(schema.projects, eq(schema.projects.id, schema.scans.projectId)).where(inArray(schema.projects.organizationId, solo))).map((r) => r.id) : [];
  const ids = [...new Set([...personal, ...inSolo])];
  await unlinkRescans(ids); const scans = await removeScans(ids);
  if (solo.length) await db.delete(schema.organizations).where(inArray(schema.organizations.id, solo));
  await db.delete(schema.waitlist).where(eq(schema.waitlist.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  return { ok: true, scans, workspaces: solo.length };
}
