import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { listRuns, startRun } from '@/lib/flows/service.ts';
import { flowAccess } from '@/lib/flows/access.ts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  const runs = await listRuns(a.flow.id);
  return NextResponse.json({ runs: runs.map((r) => ({ id: r.id, status: r.status, error: r.error, startedAt: r.startedAt, finishedAt: r.finishedAt, result: r.result })) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  const r = await startRun(a.flow.id, a.user.id);
  return r.ok ? NextResponse.json({ runId: r.runId }, { status: 202 }) : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
}
