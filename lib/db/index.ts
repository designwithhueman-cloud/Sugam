// Database access. DATABASE_URL -> PostgreSQL server (node-postgres).
// Otherwise -> embedded PGlite in .data/pglite (single process only; use a real Postgres
// server whenever a separate BullMQ worker runs).
import path from 'node:path';
import * as schema from './schema.ts';

type DB = ReturnType<typeof import('drizzle-orm/pglite').drizzle<typeof schema>>;
const g = globalThis as unknown as { __sugamDb?: Promise<DB> };
const MIGRATIONS = path.join(process.cwd(), 'drizzle');

async function open(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pglite');
  const fs = await import('node:fs');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__sugamDb) g.__sugamDb = open();
  return g.__sugamDb;
}
export { schema };
