import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { sameOrigin } from '@/lib/access.ts';
import { flowAccess } from '@/lib/flows/access.ts';
import { decideProposal } from '@/lib/flows/discovery.ts';

export const dynamic = 'force-dynamic';
/** Accept or dismiss a change rediscovery found for a saved flow. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const id = (await ctx.params).id; const notFound = NextResponse.json({ error: 'not_found', message: 'Proposal not found.' }, { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound;
  const [p] = await (await getDb()).select({ flowId: schema.flowProposals.flowId }).from(schema.flowProposals).where(eq(schema.flowProposals.id, id)); if (!p) return notFound;
  const a = await flowAccess(p.flowId); if ('res' in a) return a.res;
  const b = (await req.json().catch(() => null)) as { decision?: unknown } | null; if (b?.decision !== 'accept' && b?.decision !== 'dismiss') return NextResponse.json({ error: 'invalid', message: 'Say accept or dismiss.' }, { status: 400 });
  const r = await decideProposal(id, a.user.id, b.decision);
  return r.ok ? NextResponse.json({ ok: true, version: r.version ?? null }) : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
}
