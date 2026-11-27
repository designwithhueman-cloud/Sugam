// Anonymous free scans. The browser that started a scan gets a signed claim in an HttpOnly
// cookie; it can follow progress and see the teaser. Signing up or logging in attaches every
// claimed scan to the account. Claims are HMAC-signed, so they cannot be forged for other scans.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { and, inArray, isNull } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';

const COOKIE = 'sugam_claims';
let cached: string | null = null;
function secret(): string {
  if (process.env.SUGAM_SECRET) return process.env.SUGAM_SECRET;
  if (cached) return cached;
  const p = path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'secret');
  try { cached = fs.readFileSync(p, 'utf8').trim(); } catch { cached = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, cached, { mode: 0o600 }); }
  return cached;
}
const sign = (id: string) => crypto.createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 32);

export async function claimedScanIds(): Promise<string[]> {
  const raw = (await cookies()).get(COOKIE)?.value || '';
  return raw.split('|').map((c) => c.split('.')).filter(([id, sig]) => /^[0-9a-f-]{36}$/i.test(id || '') && sig && crypto.timingSafeEqual(Buffer.from(sign(id).padEnd(32)), Buffer.from(sig.padEnd(32).slice(0, 32)))).map(([id]) => id);
}
export async function addClaim(scanId: string) {
  const ids = [...new Set([scanId, ...(await claimedScanIds())])].slice(0, 5);
  (await cookies()).set(COOKIE, ids.map((id) => `${id}.${sign(id)}`).join('|'), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 86400, secure: process.env.NODE_ENV === 'production' && process.env.SUGAM_INSECURE_COOKIES !== '1' });
}
export async function claimForUser(userId: string) {
  const ids = await claimedScanIds();
  if (!ids.length) return;
  const db = await getDb();
  await db.update(schema.scans).set({ createdBy: userId }).where(and(inArray(schema.scans.id, ids), isNull(schema.scans.createdBy), isNull(schema.scans.projectId)));
  (await cookies()).delete(COOKIE);
}
export async function isClaimed(scanId: string) { return (await claimedScanIds()).includes(scanId); }

export { secret as appSecret };   // also used to sign site-ownership tokens
