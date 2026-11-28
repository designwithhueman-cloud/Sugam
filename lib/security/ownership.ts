// Proof that the person running the extra checks controls the site. The token is derived from the project and the address, so it needs no storage
// of its own, and it cannot be reused for another project or another site. It is public by design (it goes in the page).
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.ts';
import { appSecret } from '../claims.ts';
import { guardedGet } from '../../packages/security-exposure/index.ts';

export const originOf = (url: string | null | undefined) => { try { return url ? new URL(url).origin : null; } catch { return null; } };
export const ownershipToken = (projectId: string, origin: string) => 'avara-verify-' + crypto.createHmac('sha256', appSecret()).update(`ownership:${projectId}:${origin}`).digest('base64url').slice(0, 24);
export const metaTag = (token: string) => `<meta name="avara-site-verification" content="${token}">`;

/** Looks for the token in the home page's meta tag, then in /avara-verification.txt. */
export async function checkOwnership(projectId: string, liveUrl: string): Promise<{ ok: true; method: 'meta' | 'file'; origin: string } | { ok: false; origin: string | null; message: string }> {
  const origin = originOf(liveUrl); if (!origin) return { ok: false, origin: null, message: 'Add your live address to the project first.' };
  const token = ownershipToken(projectId, origin);
  const home = await guardedGet(liveUrl);
  if (!home) return { ok: false, origin, message: 'We could not reach your site to look for the verification line.' };
  const tags = [...home.body.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  if (tags.some((t) => /name=["']avara-site-verification["']/i.test(t) && t.includes(`content="${token}"`) || /name=["']avara-site-verification["']/i.test(t) && t.includes(`content='${token}'`))) return { ok: true, method: 'meta', origin };
  const file = await guardedGet(origin + '/avara-verification.txt');
  if (file && file.status === 200 && !/html/i.test(file.type) && file.body.trim() === token) return { ok: true, method: 'file', origin };
  return { ok: false, origin, message: 'We did not find the verification line on your live site yet. Publish the change, wait a minute, and try again.' };
}

export async function isVerified(projectId: string, origin: string | null): Promise<boolean> {
  if (!origin) return false;
  const [r] = await (await getDb()).select({ id: schema.siteVerifications.id }).from(schema.siteVerifications).where(and(eq(schema.siteVerifications.projectId, projectId), eq(schema.siteVerifications.origin, origin)));
  return !!r;
}
export async function recordVerification(projectId: string, origin: string, method: 'meta' | 'file', userId: string) {
  await (await getDb()).insert(schema.siteVerifications).values({ projectId, origin, method, verifiedBy: userId }).onConflictDoNothing();
}
