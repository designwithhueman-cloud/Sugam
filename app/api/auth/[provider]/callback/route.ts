// Return from the provider: check the state, trade the code for a verified email, then sign in (or create the account).
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { provider, fetchProfile, redirectUri, type ProviderId } from '@/lib/oauth.ts';
import { signInWithProfile } from '@/lib/accounts.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: p } = await params; const url = new URL(req.url); const origin = process.env.SUGAM_URL || url.origin;
  const back = (e: string) => NextResponse.redirect(`${origin}/login?error=${e}`);
  const jar = await cookies(); const raw = jar.get('sugam_oauth')?.value; jar.delete({ name: 'sugam_oauth', path: '/api/auth' });
  const conf = provider(p); if (!conf) return back('provider');
  if (url.searchParams.get('error')) return back('cancelled');
  let saved: { s: string; v: string; n: string; p: string };
  try { saved = JSON.parse(raw || ''); } catch { return back('expired'); }
  const given = url.searchParams.get('state') || ''; const code = url.searchParams.get('code') || '';
  const same = given.length === saved.s.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(saved.s));
  if (!same || saved.p !== p || !code) return back('expired');
  let profile; try { profile = await fetchProfile(p as ProviderId, conf, code, saved.v, redirectUri(url.origin, p as ProviderId)); } catch { return back('noemail'); }
  const result = await signInWithProfile(profile.email, profile.name);
  if (result === 'password-account') return back('password');
  return NextResponse.redirect(`${origin}${/^\/(?!\/)[\w\-/?=&%.]*$/.test(saved.n) ? saved.n : '/app'}`);
}
