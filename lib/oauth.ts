// "Continue with Google / GitHub": the OAuth 2.0 authorization-code flow, with a state value and PKCE, and nothing stored but the
// short-lived cookie that carries them. A provider only shows up when its client id and secret are set in the environment
// (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET). We ask for the email and name only, and
// only accept an email the provider says it has verified. SUGAM_OAUTH_TEST_BASE points every endpoint at a local fake provider
// for the tests; it is never set in production.
import crypto from 'node:crypto';

export type ProviderId = 'google' | 'github';
type Conf = { label: string; scope: string; authorize: string; token: string; profile: string; emails?: string; id?: string; secret?: string };

const TEST = process.env.SUGAM_OAUTH_TEST_BASE;
const REAL: Record<ProviderId, Omit<Conf, 'id' | 'secret'>> = {
  google: { label: 'Google', scope: 'openid email profile', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo' },
  github: { label: 'GitHub', scope: 'read:user user:email', authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', profile: 'https://api.github.com/user', emails: 'https://api.github.com/user/emails' },
};

export function provider(p: string): Conf | null {
  if (p !== 'google' && p !== 'github') return null;
  const key = p.toUpperCase(); const id = process.env[`${key}_CLIENT_ID`], secret = process.env[`${key}_CLIENT_SECRET`];
  if (!id || !secret) return null;
  const c = REAL[p];
  return TEST ? { ...c, id, secret, authorize: `${TEST}/${p}/auth`, token: `${TEST}/${p}/token`, profile: `${TEST}/${p}/profile`, emails: c.emails ? `${TEST}/${p}/emails` : undefined } : { ...c, id, secret };
}
export const providerList = (): { id: ProviderId; label: string; enabled: boolean }[] => (['google', 'github'] as const).map((id) => ({ id, label: REAL[id].label, enabled: !!provider(id) }));

export const redirectUri = (origin: string, p: ProviderId) => `${process.env.SUGAM_URL || origin}/api/auth/${p}/callback`;
const b64 = (b: Buffer) => b.toString('base64url');
export function newFlow() {
  const verifier = b64(crypto.randomBytes(32));
  return { state: b64(crypto.randomBytes(24)), verifier, challenge: b64(crypto.createHash('sha256').update(verifier).digest()) };
}
export function authorizeUrl(p: ProviderId, conf: Conf, redirect: string, state: string, challenge: string) {
  const u = new URL(conf.authorize);
  u.search = new URLSearchParams({ client_id: conf.id!, redirect_uri: redirect, response_type: 'code', scope: conf.scope, state, code_challenge: challenge, code_challenge_method: 'S256', ...(p === 'google' ? { prompt: 'select_account' } : {}) }).toString();
  return u.toString();
}

const getJson = async (url: string, init: RequestInit) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
};

// Code in, a verified email and a name out. Throws if the provider gives no verified email.
export async function fetchProfile(p: ProviderId, conf: Conf, code: string, verifier: string, redirect: string): Promise<{ email: string; name: string | null }> {
  const t = await getJson(conf.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ client_id: conf.id!, client_secret: conf.secret!, code, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }).toString() });
  const token = String(t.access_token || ''); if (!token) throw new Error('no access token');
  const auth = { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'Avara' };
  const me = await getJson(conf.profile, { headers: auth });
  if (p === 'google') {
    if (me.email_verified !== true || typeof me.email !== 'string') throw new Error('no verified email');
    return { email: me.email.toLowerCase(), name: typeof me.name === 'string' ? me.name.slice(0, 80) : null };
  }
  const list = (await (await fetch(conf.emails!, { headers: auth, signal: AbortSignal.timeout(10_000) })).json()) as { email: string; primary: boolean; verified: boolean }[];
  const e = Array.isArray(list) ? list.find((x) => x.primary && x.verified) || list.find((x) => x.verified) : undefined;
  if (!e) throw new Error('no verified email');
  return { email: e.email.toLowerCase(), name: typeof me.name === 'string' && me.name ? me.name.slice(0, 80) : typeof me.login === 'string' ? me.login : null };
}
