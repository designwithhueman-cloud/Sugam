// Numbers for the workspace overview: one row per client project, the single finding that most needs attention,
// and the signed-in person's own quick scans. Everything is read from stored scans and human decisions; nothing is estimated.
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { scanSummaryView } from './scan-summary.ts';
import { getDb, schema } from './db/index.ts';
import { hasFeature, type PlanId } from './plans.ts';
import type { Shot } from './review-view.ts';

type Sev = 'critical' | 'serious' | 'moderate' | 'minor';
const RANK: Record<Sev, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export type ProjectRow = {
  id: string; name: string; client: string; url: string | null;
  scanId: string | null; lastScanAt: Date | null; confirmed: number | null; waiting: number | null; running: boolean;
};
export type Attention = {
  issueId: string | null; scanId: string; title: string; levelLabel: string; location: string; whatToChange: string;
  project: { id: string; name: string; client: string }; page: string; environment: string; completedAt: Date | null;
  shot: Shot | null; otherConfirmed: number;
};

/** The page a scan looked at, as a reader would name it: its title, else its path. */
export function pageLabel(s: { pageTitle: string | null; url: string; finalUrl?: string | null }) {
  if (s.pageTitle) return s.pageTitle;
  try { const u = new URL(s.finalUrl || s.url); return u.pathname === '/' ? u.host : u.host + u.pathname; } catch { return s.url; }
}

export async function workspaceOverview(orgId: string, plan: PlanId) {
  const db = await getDb();
  const projects = await db.select({ id: schema.projects.id, name: schema.projects.name, live: schema.projects.liveUrl, staging: schema.projects.stagingUrl, client: schema.clients.name })
    .from(schema.projects).innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId)).where(eq(schema.projects.organizationId, orgId));
  const rows: ProjectRow[] = []; const candidates: { row: ProjectRow; scan: typeof schema.scans.$inferSelect; lead: import('./review-view.ts').Item; label: string; recommended: number }[] = [];
  for (const p of projects) {
    const recent = await db.select().from(schema.scans).where(eq(schema.scans.projectId, p.id)).orderBy(desc(schema.scans.createdAt)).limit(20);
    const done = recent.filter((s) => s.status === 'completed').sort((a, b) => +(b.completedAt ?? b.createdAt) - +(a.completedAt ?? a.createdAt));
    // Same choice as the site dashboard: the latest live scan when there is one, else the latest of any environment.
    const latest = done.find((s) => s.environment === 'live') ?? done[0] ?? null;
    const row: ProjectRow = { id: p.id, name: p.name, client: p.client, url: p.live || p.staging, scanId: latest?.id ?? null, lastScanAt: latest ? latest.completedAt ?? latest.createdAt : null, confirmed: null, waiting: null, running: recent.some((s) => s.status === 'queued' || s.status === 'running' || s.status === 'analyzing') };
    if (latest) {
      const sv = await scanSummaryView(latest.id);
      if (sv) { row.confirmed = sv.recommended; row.waiting = sv.observations; if (sv.lead) candidates.push({ row, scan: latest, lead: sv.lead, label: sv.levelLabel ?? '', recommended: sv.recommended }); }
    }
    rows.push(row);
  }
  // Most recent scan first; projects that were never scanned go last, alphabetically.
  rows.sort((a, b) => +(b.lastScanAt ?? 0) - +(a.lastScanAt ?? 0) || a.name.localeCompare(b.name));

  // What needs attention: the report's own first fix, from the most recently finished scan that has one (the most urgent level breaks ties).
  const ORDER: Record<string, number> = { Critical: 0, 'Before launch': 1, Improve: 2 };
  candidates.sort((a, b) => +(b.scan.completedAt ?? b.scan.createdAt) - +(a.scan.completedAt ?? a.scan.createdAt) || (ORDER[a.label] ?? 9) - (ORDER[b.label] ?? 9));
  const pick = candidates[0];
  let attention: Attention | null = null;
  if (pick) {
    const { scan, lead, row, label } = pick;
    attention = {
      issueId: lead.issueId ?? null, scanId: scan.id, title: lead.title, levelLabel: label, location: lead.location,
      // Repair text is redacted from free reports (lib/entitlements.ts), so it stays off the free dashboard too.
      whatToChange: hasFeature(plan, 'full_report') ? lead.sentence : '',
      project: { id: row.id, name: row.name, client: row.client }, page: pageLabel(scan), environment: scan.environment, completedAt: scan.completedAt,
      // The report's own crop of the affected element, already plan-gated by loadReport.
      shot: hasFeature(plan, 'full_report') ? lead.shot : null,
      otherConfirmed: candidates.reduce((n, c) => n + c.recommended, 0) - 1,
    };
  }
  return { rows, attention };
}

/** A crop around the finding's first visible element, preferring the phone view. Null when the element was not located. */
async function shotFor(scanId: string, issueId: string, label: string): Promise<Shot | null> {
  const db = await getDb();
  const inst = await db.select({ id: schema.issueInstances.id }).from(schema.issueInstances).where(eq(schema.issueInstances.issueId, issueId)).limit(10);
  if (!inst.length) return null;
  const boxes = (await db.select().from(schema.boundingBoxes).where(inArray(schema.boundingBoxes.instanceId, inst.map((i) => i.id)))).filter((b) => b.visible && b.width > 0 && b.height > 0);
  const box = boxes.find((b) => b.viewport === 'mobile') ?? boxes[0];
  if (!box) return null;
  const [v] = await db.select().from(schema.scanViewports).where(and(eq(schema.scanViewports.scanId, scanId), eq(schema.scanViewports.viewport, box.viewport)));
  if (!v || box.y + box.height > v.pageHeight) return null;
  const phone = box.viewport === 'mobile'; const pad = 28;
  const w = Math.min(v.pageWidth, Math.max(phone ? v.pageWidth : 640, box.width + pad * 2)); const h = Math.min(v.pageHeight, Math.max(phone ? 260 : 300, box.height + pad * 2));
  const cx = Math.max(0, Math.min(v.pageWidth - w, box.x + box.width / 2 - w / 2)); const cy = Math.max(0, Math.min(v.pageHeight - h, box.y + box.height / 2 - h / 2));
  return {
    src: `/api/scans/${scanId}/screenshot/${box.viewport}`, pageWidth: v.pageWidth, pageHeight: v.pageHeight, viewport: box.viewport,
    crop: { x: Math.round(cx), y: Math.round(cy), width: Math.round(w), height: Math.round(h) },
    boxes: [{ box: { x: box.x, y: box.y, width: box.width, height: box.height }, kind: 'affected', label }],
    alt: `${phone ? 'Phone' : 'Desktop'} screenshot (${v.viewportWidth}px wide) with the affected element outlined`,
  };
}

export async function quickScans(userId: string, limit?: number) {
  const db = await getDb();
  const where = and(eq(schema.scans.createdBy, userId), isNull(schema.scans.projectId));
  const q = db.select().from(schema.scans).where(where).orderBy(desc(schema.scans.createdAt));
  const [scans, [{ n }]] = await Promise.all([limit ? q.limit(limit) : q, db.select({ n: count() }).from(schema.scans).where(where)]);
  return { scans, total: Number(n) };
}

export async function sharedReports(orgId: string) {
  const db = await getDb();
  const rows = await db.select({ link: schema.shareLinks, scan: schema.scans, project: schema.projects.name, projectId: schema.projects.id })
    .from(schema.shareLinks).innerJoin(schema.scans, eq(schema.scans.id, schema.shareLinks.scanId)).innerJoin(schema.projects, eq(schema.projects.id, schema.scans.projectId))
    .where(eq(schema.projects.organizationId, orgId)).orderBy(desc(schema.shareLinks.createdAt)).limit(100);
  const now = Date.now();
  return rows.map((r) => ({ ...r, state: r.link.revokedAt ? 'Revoked' as const : r.link.expiresAt && +r.link.expiresAt < now ? 'Expired' as const : 'Active' as const }));
}
