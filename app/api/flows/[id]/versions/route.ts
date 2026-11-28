import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/access.ts';
import { flowAccess } from '@/lib/flows/access.ts';
import { listVersions } from '@/lib/flows/service.ts';
import { editSuccess } from '@/lib/flows/discovery.ts';

export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  const v = await listVersions(a.flow.id);
  return NextResponse.json({ current: a.flow.version, versions: v.map((x) => ({ version: x.version, note: x.note, approvedAt: x.approvedAt, definition: x.definition })) });
}
/** Edit what success means (the last step's expected results) and approve it as the next version. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad_origin', message: 'Request refused.' }, { status: 403 });
  const a = await flowAccess((await ctx.params).id); if ('res' in a) return a.res;
  const b = (await req.json().catch(() => null)) as { success?: unknown; note?: unknown } | null; if (!b) return NextResponse.json({ error: 'invalid', message: 'The body is not valid JSON.' }, { status: 400 });
  const r = await editSuccess(a.flow.id, a.user.id, b.success, typeof b.note === 'string' ? b.note.slice(0, 200) : null);
  return r.ok ? NextResponse.json({ version: r.version }, { status: 201 }) : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
}
