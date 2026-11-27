// Runs the exposure checks for a project and keeps each run, so a later run can be compared with the one before it.
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { auditSite, compareExposure, verdict, type ExposureResult } from '../../packages/security-exposure/index.ts';
import { BlockedUrlError, checkUrl } from '../net/guard.ts';
import { isVerified, originOf } from './ownership.ts';

const last = new Map<string, number>();   // one run per project every 20 seconds, in this process
export type RunOut = { ok: true; run: { id: string; at: string; active: boolean; results: ExposureResult[] }; verdict: ReturnType<typeof verdict>; changes: ReturnType<typeof compareExposure>; previousAt: string | null } | { ok: false; status: number; error: string; message: string };

export async function runExposureCheck(project: { id: string; liveUrl: string | null }, userId: string): Promise<RunOut> {
  if (!project.liveUrl) return { ok: false, status: 400, error: 'no_url', message: 'Add your live address to the project first.' };
  try { await checkUrl(project.liveUrl); } catch (e) { if (e instanceof BlockedUrlError) return { ok: false, status: 400, error: 'blocked_url', message: e.message }; throw e; }
  if (Date.now() - (last.get(project.id) ?? 0) < 20_000) return { ok: false, status: 429, error: 'too_soon', message: 'Please wait a few seconds before checking again.' };
  last.set(project.id, Date.now());
  const db = await getDb();
  const active = await isVerified(project.id, originOf(project.liveUrl));   // the extra requests run only for a verified owner
  const testBase = process.env.ALLOW_PRIVATE_HOSTS ? process.env.LC_TEST_SUPABASE_BASE : undefined;   // tests only: points the database check at a fixture; unset in production
  const results = await auditSite(project.liveUrl, { active, ...(testBase ? { supabaseBaseFor: () => testBase } : {}) });
  const [prev] = await db.select().from(schema.exposureRuns).where(eq(schema.exposureRuns.projectId, project.id)).orderBy(desc(schema.exposureRuns.createdAt)).limit(1);
  const [row] = await db.insert(schema.exposureRuns).values({ projectId: project.id, url: project.liveUrl, active, results: results as unknown as Record<string, unknown>[], createdBy: userId }).returning();
  const changes = prev && prev.url === project.liveUrl ? compareExposure(prev.results as unknown as ExposureResult[], results) : [];
  return { ok: true, run: { id: row.id, at: row.createdAt.toISOString(), active, results }, verdict: verdict(results), changes, previousAt: prev && prev.url === project.liveUrl ? prev.createdAt.toISOString() : null };
}

export async function latestRuns(projectId: string, n = 5) {
  const rows = await (await getDb()).select().from(schema.exposureRuns).where(eq(schema.exposureRuns.projectId, projectId)).orderBy(desc(schema.exposureRuns.createdAt)).limit(n);
  return rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), url: r.url, active: r.active, results: r.results as unknown as ExposureResult[] }));
}
