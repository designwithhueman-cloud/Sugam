import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { canManage, sameOrigin } from '@/lib/access.ts';
import { flowAccess } from '@/lib/flows/access.ts';

export const dynamic = 'force-dynamic';
const err = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  return NextResponse.json({ id: a.flow.id, name: a.flow.name, definition: a.flow.definition });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return err(403, 'bad_origin', 'Request refused.');
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  if (!canManage(a.role)) return err(403, 'forbidden', 'Only owners and admins can delete flows.');
  await (await getDb()).delete(schema.flows).where(eq(schema.flows.id, a.flow.id));
  return NextResponse.json({ ok: true });
}
