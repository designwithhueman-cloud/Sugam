// Sign-in with a provider: find the account for a verified email, or make one (with its first workspace, like email sign-up).
// An account made with a password is never signed into from a provider: Sugam does not verify emails at sign-up, so someone could
// have registered another person's address first, and a provider sign-in must not hand that account over.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { createSession } from './auth.ts';
import { claimForUser } from './claims.ts';
import { slugify } from './access.ts';

async function uniqueSlug(base: string) {
  const db = await getDb(); let slug = slugify(base); let n = 1;
  while ((await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, slug))).length) slug = `${slugify(base)}-${++n}`;
  return slug;
}

export async function signInWithProfile(email: string, name: string | null): Promise<'ok' | 'password-account'> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (u) {
    if (!u.passwordHash.startsWith('oauth:')) return 'password-account';
    await createSession(u.id); await claimForUser(u.id); return 'ok';
  }
  const [n] = await db.insert(schema.users).values({ email, name, passwordHash: `oauth:${crypto.randomBytes(24).toString('hex')}` }).returning();
  const label = name || email.split('@')[0];
  const [o] = await db.insert(schema.organizations).values({ name: `${label}'s workspace`, slug: await uniqueSlug(label) }).returning();
  await db.insert(schema.memberships).values({ organizationId: o.id, userId: n.id, role: 'owner' });
  await createSession(n.id); await claimForUser(n.id);
  return 'ok';
}
