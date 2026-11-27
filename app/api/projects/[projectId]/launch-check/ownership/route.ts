import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.ts';
import { canManage, projectAccess, sameOrigin } from '@/lib/access.ts';
import { checkOwnership, recordVerification } from '@/lib/security/ownership.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Looks for the verification line on the live site and, if it is there, records that this project controls that address. */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  if (!sameOrigin(req)) return err(403, 'bad_origin', 'Request refused.');
  const { projectId } = await ctx.params;
  const user = await currentUser(); if (!user) return err(401, 'unauthorised', 'Sign in first.');
  const access = await projectAccess(user, projectId); if (!access) return err(404, 'not_found', 'Project not found.');
  if (!canManage(access.role)) return err(403, 'forbidden', 'Only an owner or admin can confirm site ownership.');
  if (!access.project.liveUrl) return err(400, 'no_url', 'Add your live address to the project first.');
  const r = await checkOwnership(projectId, access.project.liveUrl);
  if (!r.ok) return NextResponse.json({ verified: false, message: r.message });
  await recordVerification(projectId, r.origin, r.method, user.id);
  return NextResponse.json({ verified: true, method: r.method });
}
