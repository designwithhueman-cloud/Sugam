// Accounts and sessions. Passwords: scrypt with a per-user salt. Sessions: random token in an
// HttpOnly, SameSite=Lax cookie; only its sha-256 is stored, so a database leak exposes no
// usable session.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';

const COOKIE = 'sugam_session';
const DAYS = 30;
export type User = { id: string; email: string; name: string | null };

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const a = crypto.scryptSync(pw, salt || 'x', 64); const b = Buffer.from(hash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Run a hash even when the account does not exist, so response time does not reveal it.
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const db = await getDb();
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));   // expired sessions would otherwise pile up forever
  await db.insert(schema.sessions).values({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + DAYS * 86400_000) });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.SUGAM_INSECURE_COOKIES !== '1', path: '/', maxAge: DAYS * 86400 });
}
export async function destroySession() {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (token) { const db = await getDb(); await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha(token))); }
  jar.delete(COOKIE);
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.sessions).innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha(token)), gt(schema.sessions.expiresAt, new Date())));
  return row ?? null;
}
export async function requireUser(next: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

// Simple in-memory attempt limiter for sign-in and sign-up.
const attempts = new Map<string, number[]>();
export function tooManyAttempts(key: string, limit = 10, windowMs = 600_000): boolean {
  const now = Date.now();
  if (attempts.size > 2000) for (const [k, v] of attempts) if (!v.length || now - v[v.length - 1] > windowMs) attempts.delete(k); const a = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  a.push(now); attempts.set(key, a); return a.length > limit;
}
