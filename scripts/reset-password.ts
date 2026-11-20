// Dev only: give an existing account a new random password and save it to .data/test-account.txt.
// Stop the web server first when using embedded PGlite (it allows one process at a time).
// Usage: node scripts/reset-password.ts <email>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../lib/db/index.ts';

// PGlite allows one process at a time: opening it here while the web server runs corrupts the database.
const port = process.env.SUGAM_PORT || '3100';
const serverUp = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) }).then(() => true).catch(() => false);
if (serverUp && !process.argv.includes('--force')) { console.error(`The web server is running on port ${port}. Stop it first (embedded PGlite allows one process), or pass --force if you use a PostgreSQL DATABASE_URL.`); process.exit(1); }
// Same "salt:hash" scrypt format as hashPassword in lib/auth.ts (which imports next/headers).
function hashPassword(p: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(p, salt, 64).toString('hex')}`;
}

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('usage: node scripts/reset-password.ts <email>'); process.exit(1); }
const pw = crypto.randomBytes(9).toString('base64url');
const db = await getDb();
const rows = await db.update(schema.users).set({ passwordHash: hashPassword(pw) })
  .where(eq(schema.users.email, email)).returning({ id: schema.users.id });
if (!rows.length) { console.error('No account with that email.'); process.exit(1); }
await db.delete(schema.sessions).where(eq(schema.sessions.userId, rows[0].id)); // sign out everywhere
const out = path.join(process.cwd(), '.data', 'test-account.txt');
fs.writeFileSync(out, `Local test account (dev only)\nEmail: ${email}\nPassword: ${pw}\n`, { mode: 0o600 });
console.log('New password saved to', out);
process.exit(0);
