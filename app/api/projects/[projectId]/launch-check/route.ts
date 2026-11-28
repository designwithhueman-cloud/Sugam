import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.ts';
import { projectAccess, sameOrigin } from '@/lib/access.ts';
import { isVerified, metaTag, originOf, ownershipToken } from '@/lib/security/ownership.ts';
import { latestRuns, runExposureCheck } from '@/lib/security/service.ts';
import { verdict } from '@/packages/security-exposure/index.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

async function gate(projectId: string) {
  const user = await currentUser(); if (!user) return { res: err(401, 'unauthorised', 'Sign in to run a launch check.') };
  const access = await projectAccess(user, projectId); if (!access) return { res: err(404, 'not_found', 'Project not found.') };   // not a member: same answer as a missing project
  return { user, project: access.project, role: access.role };
}

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params; const g = await gate(projectId); if ('res' in g) return g.res;
  const origin = originOf(g.project.liveUrl); const token = origin ? ownershipToken(projectId, origin) : null;
  const runs = await latestRuns(projectId);
  return NextResponse.json({ liveUrl: g.project.liveUrl, origin, verified: await isVerified(projectId, origin), token, tag: token ? metaTag(token) : null, runs, verdict: runs[0] ? verdict(runs[0].results) : null });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(req)) return err(403, 'bad_origin', 'Request refused.');
  const { projectId } = await ctx.params; const g = await gate(projectId); if ('res' in g) return g.res;
  const r = await runExposureCheck(g.project, g.user.id);
  return r.ok ? NextResponse.json(r) : err(r.status, r.error, r.message);
}
