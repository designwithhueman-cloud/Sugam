import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { currentUser } from '../auth.ts';
import { projectAccess } from '../access.ts';
import { hasFeature } from '../plans.ts';
import { getFlow } from './service.ts';

const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Resolves a flow the signed-in user may use: a member of its project, on a plan with saved flows. Anything else is "not found". */
export async function flowAccess(flowId: string) {
  const user = await currentUser(); if (!user) return { res: err(401, 'unauthorised', 'Sign in to use saved flows.') };
  const flow = await getFlow(flowId); const access = flow ? await projectAccess(user, flow.projectId) : null;
  if (!flow || !access) return { res: err(404, 'not_found', 'Flow not found.') };
  const [org] = await (await getDb()).select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, access.project.organizationId));
  if (!hasFeature(org?.plan ?? 'free', 'saved_flows')) return { res: err(403, 'plan_required', 'Saved flows are part of the Creator and Agency plans.') };
  return { user, flow, role: access.role };
}

