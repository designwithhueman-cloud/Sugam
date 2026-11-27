import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { currentUser } from '@/lib/auth.ts';
import { projectAccess, sameOrigin } from '@/lib/access.ts';
import { hasFeature } from '@/lib/plans.ts';
import { createFlow, listFlows } from '@/lib/flows/service.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

async function gate(projectId: string) {
  const user = await currentUser(); if (!user) return { res: err(401, 'unauthorised', 'Sign in to use saved flows.') };
  const access = await projectAccess(user, projectId); if (!access) return { res: err(404, 'not_found', 'Project not found.') };   // not a member: same answer as a missing project
  const [org] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, access.project.organizationId));
  if (!hasFeature(org?.plan ?? 'free', 'saved_flows')) return { res: err(403, 'plan_required', 'Saved flows are part of the Creator and Agency plans.') };   // enforced here, on the server
  return { user };
}

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params; const g = await gate(projectId); if ('res' in g) return g.res;
  return NextResponse.json({ flows: await listFlows(projectId) });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(req)) return err(403, 'bad_origin', 'Request refused.');
  const { projectId } = await ctx.params; const g = await gate(projectId); if ('res' in g) return g.res;
  if (Number(req.headers.get('content-length') ?? 0) > 65536) return err(413, 'too_large', 'The flow is too large.');
  const body = await req.json().catch(() => null); if (!body) return err(400, 'invalid_flow', 'The body is not valid JSON.');
  const r = await createFlow(projectId, g.user.id, body);
  return r.ok ? NextResponse.json({ id: r.id }, { status: 201 }) : err(r.status, r.error, r.message);
}
