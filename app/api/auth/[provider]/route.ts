// Start of "Continue with Google / GitHub": remember the state and PKCE verifier in a short-lived cookie, then send the visitor to
// the provider. Unknown or unconfigured providers go back to the sign-in page with a plain message.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { provider, newFlow, authorizeUrl, redirectUri, type ProviderId } from '@/lib/oauth.ts';
import { tooManyAttempts } from '@/lib/auth.ts';
import { clientIp } from '@/lib/ip.ts';

export const dynamic = 'force-dynamic';
const safeNext = (n: string | null) => (n && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : '/app');

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: p } = await params; const url = new URL(req.url); const origin = process.env.SUGAM_URL || url.origin;
  const conf = provider(p);
  if (!conf) return NextResponse.redirect(`${origin}/login?error=provider`);
  if (tooManyAttempts('oauth:' + clientIp(req.headers), 30)) return NextResponse.redirect(`${origin}/login?error=rate`);
  const { state, verifier, challenge } = newFlow();
  (await cookies()).set('sugam_oauth', JSON.stringify({ s: state, v: verifier, n: safeNext(url.searchParams.get('next')), p }), { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path: '/api/auth', maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(p as ProviderId, conf, redirectUri(url.origin, p as ProviderId), state, challenge));
}
