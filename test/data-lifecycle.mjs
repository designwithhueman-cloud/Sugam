// Launch data handling, against a throwaway embedded database and storage folder (no server, no browser):
// - secret URL parameters are removed before an address is saved;
// - expired anonymous scans and their files are deleted, recent ones and account scans are kept;
// - deleting a scan removes its rows (cascade) and files;
// - deleting an account removes its own scans and solo workspaces, keeps shared workspaces, and refuses while it is the only owner of one;
// - after a restart, recent unfinished scans are queued again and old ones are marked interrupted.
// Run: node --experimental-strip-types test/data-lifecycle.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avara-life-'));
process.env.PGLITE_DIR = path.join(tmp, 'db'); process.env.STORAGE_DIR = path.join(tmp, 'objects'); process.env.ALLOW_PRIVATE_HOSTS = '127.0.0.1:4200';
delete process.env.DATABASE_URL; delete process.env.REDIS_URL;
const queued = []; globalThis.__sugamQueue = { add: async (id) => { queued.push(id); } };   // never start a real scan
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const { stripSecrets } = await import('../lib/net/url-privacy.ts');
const { checkUrl } = await import('../lib/net/guard.ts');
const s = (u) => stripSecrets(u).toString();
check('sign-in tokens, keys, codes, sessions and emails are removed from the query', s('https://shop.example/reset?token=abc&key=k&code=123&session=s&email=a%40b.c&utm_source=x&page=2') === 'https://shop.example/reset?utm_source=x&page=2', s('https://shop.example/reset?token=abc&key=k&code=123&session=s&email=a%40b.c&utm_source=x&page=2'));
check('names that contain a secret word are removed too (access_token, X-Amz-Signature, user_email)', s('https://x.example/?access_token=1&X-Amz-Signature=2&user_email=3&q=shoes') === 'https://x.example/?q=shoes');
check('a fragment that carries values is dropped, a plain anchor is kept', s('https://x.example/cb#access_token=abc&state=1') === 'https://x.example/cb' && s('https://x.example/page#pricing') === 'https://x.example/page#pricing');
check('an address with nothing secret is unchanged', s('https://x.example/a/b?lang=fr') === 'https://x.example/a/b?lang=fr');
check('checkUrl returns the cleaned address, so nothing secret reaches the database', (await checkUrl('http://127.0.0.1:4200/x?token=abc&id=7')).toString() === 'http://127.0.0.1:4200/x?id=7');

const { getDb, schema } = await import('../lib/db/index.ts');
const { putObject, getObject } = await import('../lib/storage.ts');
const { purgeExpiredScans, deleteScan, deleteAccount, canDeleteScan } = await import('../lib/deletion.ts');
const { recoverScans } = await import('../lib/startup.ts');
const { eq, inArray } = await import('drizzle-orm');
const db = await getDb();
const DAY = 86_400_000, now = Date.now();
const user = async (email) => (await db.insert(schema.users).values({ email, passwordHash: 'x:y' }).returning())[0];
const org = async (name, members) => { const [o] = await db.insert(schema.organizations).values({ name, slug: name.toLowerCase() }).returning(); for (const [u, role] of members) await db.insert(schema.memberships).values({ organizationId: o.id, userId: u.id, role }); const [c] = await db.insert(schema.clients).values({ organizationId: o.id, name: 'C' }).returning(); const [p] = await db.insert(schema.projects).values({ organizationId: o.id, clientId: c.id, name: 'P', liveUrl: 'https://p.example/' }).returning(); return { o, p }; };
const scan = async (v) => { const [r] = await db.insert(schema.scans).values({ url: 'https://s.example/', status: 'completed', ...v }).returning(); await putObject(`scans/${r.id}/desktop.jpg`, 'img'); await db.insert(schema.shareLinks).values({ scanId: r.id, tokenHash: r.id }); return r; };
const exists = async (id) => (await db.select({ id: schema.scans.id }).from(schema.scans).where(eq(schema.scans.id, id))).length === 1;
const file = async (id) => !!(await getObject(`scans/${id}/desktop.jpg`));

// Retention
const oldAnon = await scan({ createdAt: new Date(now - 31 * DAY) }), newAnon = await scan({ createdAt: new Date(now - 2 * DAY) });
const ana = await user('ana@example.com'); const oldMine = await scan({ createdBy: ana.id, createdAt: new Date(now - 90 * DAY) });
const n = await purgeExpiredScans(now);
check('an anonymous scan past 30 days is deleted with its files and share links', n === 1 && !(await exists(oldAnon.id)) && !(await file(oldAnon.id)) && (await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.scanId, oldAnon.id))).length === 0, `deleted ${n}`);
check('a recent anonymous scan and an old account scan are kept', (await exists(newAnon.id)) && (await file(newAnon.id)) && (await exists(oldMine.id)));
process.env.ANON_RETENTION_DAYS = '1'; await purgeExpiredScans(now); delete process.env.ANON_RETENTION_DAYS;
check('ANON_RETENTION_DAYS shortens the period', !(await exists(newAnon.id)));

// Who may delete
const bo = await user('bo@example.com'), cy = await user('cy@example.com');
const shared = await org('Shared', [[bo, 'owner'], [cy, 'member']]);
const projScan = await scan({ projectId: shared.p.id, createdBy: cy.id });
check('a workspace owner may delete a project scan; a plain member may not', (await canDeleteScan(bo, projScan, false)) && !(await canDeleteScan(cy, projScan, false)));
check('a personal scan: only the person who ran it', (await canDeleteScan(ana, oldMine, false)) && !(await canDeleteScan(bo, oldMine, false)) && !(await canDeleteScan(null, oldMine, true)));
const anon = await scan({});
check('an anonymous scan: only the browser that started it', (await canDeleteScan(null, anon, true)) && !(await canDeleteScan(null, anon, false)) && !(await canDeleteScan(bo, anon, false)));
await deleteScan(anon.id);
check('deleting a scan removes the row, its share links and its files', !(await exists(anon.id)) && !(await file(anon.id)));

// Account deletion
const solo = await org('Solo', [[ana, 'owner']]); const soloScan = await scan({ projectId: solo.p.id, createdBy: ana.id });
await db.insert(schema.memberships).values({ organizationId: shared.o.id, userId: ana.id, role: 'member' });
await db.insert(schema.waitlist).values({ email: 'ana@example.com', plan: 'site' });
const r1 = await deleteAccount(ana);
check('deleting an account removes its personal scans, its solo workspace and that workspace’s scans and files', r1.ok && !(await exists(oldMine.id)) && !(await exists(soloScan.id)) && !(await file(soloScan.id)) && (await db.select().from(schema.organizations).where(eq(schema.organizations.id, solo.o.id))).length === 0, JSON.stringify(r1));
check('…and the user, their memberships and waiting-list entries; a shared workspace stays', (await db.select().from(schema.users).where(eq(schema.users.id, ana.id))).length === 0 && (await db.select().from(schema.memberships).where(eq(schema.memberships.userId, ana.id))).length === 0 && (await db.select().from(schema.waitlist)).length === 0 && (await exists(projScan.id)));
const r2 = await deleteAccount(bo);
check('the only owner of a workspace with other members is refused, and nothing is deleted', !r2.ok && /only owner/.test(r2.reason) && (await db.select().from(schema.users).where(eq(schema.users.id, bo.id))).length === 1 && (await exists(projScan.id)));

// Restart recovery
const running = await scan({ status: 'running', createdAt: new Date(now - 20 * 60_000) }), waiting = await scan({ status: 'queued', createdAt: new Date(now - 5 * 60_000) }), stale = await scan({ status: 'analyzing', createdAt: new Date(now - 7 * 3600_000) });
const rec = await recoverScans(now);
const st = Object.fromEntries((await db.select({ id: schema.scans.id, status: schema.scans.status, error: schema.scans.error, startedAt: schema.scans.startedAt }).from(schema.scans).where(inArray(schema.scans.id, [running.id, waiting.id, stale.id]))).map((x) => [x.id, x]));
check('recent unfinished scans are queued again, oldest first', rec.requeued === 2 && queued.join() === [running.id, waiting.id].join() && st[running.id].status === 'queued' && st[waiting.id].status === 'queued', JSON.stringify(rec));
check('the re-queue time is recorded, so the 10-minute stale check does not cancel them', +st[running.id].startedAt === now);
check('a scan older than 6 hours is marked interrupted instead', st[stale.id].status === 'failed' && st[stale.id].error?.code === 'interrupted');
process.env.REDIS_URL = 'redis://unused'; const rec2 = await recoverScans(now); delete process.env.REDIS_URL;
check('with Redis, BullMQ keeps its own jobs and nothing is re-queued here', rec2.requeued === 0 && rec2.interrupted === 0);

fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
