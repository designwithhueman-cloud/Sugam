// Dev only, until billing is connected: set a workspace's plan.
// Stop the web server first when using embedded PGlite (it allows one process at a time).
// Usage: node scripts/set-plan.ts <workspace-slug> <free|site|agency>
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../lib/db/index.ts';

// PGlite allows one process at a time: opening it here while the web server runs corrupts the database.
const port = process.env.SUGAM_PORT || '3100';
const serverUp = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) }).then(() => true).catch(() => false);
if (serverUp && !process.argv.includes('--force')) { console.error(`The web server is running on port ${port}. Stop it first (embedded PGlite allows one process), or pass --force if you use a PostgreSQL DATABASE_URL.`); process.exit(1); }

const [slug, plan] = process.argv.slice(2);
if (!slug || !['free', 'site', 'agency'].includes(plan)) { console.error('usage: node scripts/set-plan.ts <workspace-slug> <free|site|agency>'); process.exit(1); }
const db = await getDb();
const rows = await db.update(schema.organizations).set({ plan: plan as 'free' | 'site' | 'agency' }).where(eq(schema.organizations.slug, slug)).returning({ name: schema.organizations.name });
if (!rows.length) { console.error('No workspace with that slug.'); process.exit(1); }
console.log(`${rows[0].name} is now on the ${plan} plan.`);
process.exit(0);
