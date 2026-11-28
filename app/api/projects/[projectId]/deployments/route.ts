// Bearer-authenticated webhook: "the preview for deployment X is ready". Authorization: Bearer <project deployment token>.
// POST {"deploymentId": "...", "previewUrl": "..."} → 202 with the comparison ids (the same ids again for a repeated delivery). GET (signed in): recent deployments.
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { hasFeature } from '@/lib/plans.ts';
import { projectFlowAccess } from '@/lib/flows/access.ts';
import { acceptDeployment, dispatchPending, listDeployments, verifyDeployToken } from '@/lib/flows/deployments.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });
const recent = new Map<string, number[]>();   // per project, in this process: 30 deliveries in 10 minutes
const MAX_BODY = 4096;

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const a = await projectFlowAccess((await ctx.params).projectId); if ('res' in a) return a.res;
  return NextResponse.json({ deployments: await listDeployments(a.project.id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const token = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const project = token ? await verifyDeployToken(projectId, token) : null;
  if (!project) return err(401, 'unauthorised', 'A valid deployment token is required.');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return err(413, 'too_large', 'The request is too large.');
  const raw = await req.text(); if (raw.length > MAX_BODY) return err(413, 'too_large', 'The request is too large.');
  const [org] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, project.organizationId));
  if (!hasFeature(org?.plan ?? 'free', 'saved_flows')) return err(403, 'plan_required', 'Saved flows are part of the Creator and Agency plans.');
  const now = Date.now(); const mine = (recent.get(projectId) ?? []).filter((t) => now - t < 600_000); if (mine.length >= (Number(process.env.DEPLOY_EVENTS_PER_WINDOW) || 30)) return err(429, 'rate_limited', 'Too many deployment events. Try again in a few minutes.');
  mine.push(now); recent.set(projectId, mine);
  let body: { deploymentId?: unknown; previewUrl?: unknown }; try { body = JSON.parse(raw); } catch { return err(400, 'bad_json', 'The body must be JSON.'); }
  const id = typeof body.deploymentId === 'string' ? body.deploymentId.trim() : '';
  if (!/^[\w.:@/+=-]{1,120}$/.test(id)) return err(400, 'bad_deployment_id', 'deploymentId must be 1 to 120 letters, digits or . _ : @ / + = -');
  let origin: string; try { origin = new URL(String(body.previewUrl)).origin; } catch { return err(400, 'bad_preview_url', 'previewUrl must be a web address.'); }
  let staging: string | null = null; try { staging = project.stagingUrl ? new URL(project.stagingUrl).origin : null; } catch { /* none */ }
  if (origin !== staging) return err(400, 'preview_not_staging', 'previewUrl must be on the project’s preview (staging) address. Avara compares only the addresses saved on the project.');
  const r = await acceptDeployment(projectId, id); if (!r.ok) return err(r.status, r.error, r.message);
  void dispatchPending();
  return NextResponse.json({ eventId: r.eventId, deploymentId: r.deploymentId, duplicate: r.duplicate, comparisons: r.comparisons, skipped: r.skipped }, { status: 202 });
}
