// Product events (Step 5): one first-party record, "a fix was copied for this finding in this scan", ids only, deleted with the scan.
// Real scans on a temporary database, then the event function, the deletion paths, the funnel counts and the failure path.
// Run: node --experimental-strip-types --import ./test/support/use-chrome.mjs test/events.mjs      (about 1 minute)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const PORT = 4371, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'events-'));
Object.assign(process.env, { PGLITE_DIR: path.join(tmp, 'db'), STORAGE_DIR: path.join(tmp, 'objects'), ALLOW_PRIVATE_HOSTS: `127.0.0.1:${PORT}`, AVARA_PERF: 'off', AVARA_LAUNCH: 'off', AVARA_AI: 'off', ANON_RETENTION_DAYS: '30' });
delete process.env.DATABASE_URL; delete process.env.REDIS_URL;
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Events page</title></head><body><main><h1>Events</h1><img id="i1" src="/x.png"><button id="b1"></button><a href="/z">click here</a></main></body></html>`;
const server = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(page); }); await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const { getDb, schema } = await import('../lib/db/index.ts'); const { runScanJob } = await import('../lib/jobs.ts'); const { recordEvent } = await import('../lib/events.ts'); const { funnel } = await import('../lib/funnel.ts');
const { deleteScan, deleteAccount, purgeExpiredScans } = await import('../lib/deletion.ts'); const { loadReport } = await import('../lib/report.ts'); const { eq } = await import('drizzle-orm'); const { sql } = await import('drizzle-orm');
const db = await getDb(); const { makeCanaries, RAW } = await import('./support/canaries.mjs'); const C = makeCanaries();
const scan = async (extra = {}) => { const [s] = await db.insert(schema.scans).values({ url: `http://127.0.0.1:${PORT}/?k=${C.stripe}`, standard: 'wcag22aa', status: 'queued', ...extra }).returning(); await runScanJob(s.id); return s.id; };
const events = async (id) => db.select().from(schema.productEvents).where(id ? eq(schema.productEvents.scanId, id) : sql`true`);

// ---- an anonymous scan: nothing is recorded by the scan itself ----
const A = await scan(); const B = await scan();
const issuesA = await db.select().from(schema.issues).where(eq(schema.issues.scanId, A)); const issuesB = await db.select().from(schema.issues).where(eq(schema.issues.scanId, B));
const recsA = await db.select().from(schema.recommendations).where(eq(schema.recommendations.scanId, A));
check('(setup) the scans finished with findings', issuesA.filter((i) => i.bucket !== 'verified_pass').length >= 2 && issuesB.length > 0 && recsA.length > 0, `${issuesA.length} issues, ${recsA.length} recommendations`);
check('scanning, reading the report and finishing a scan record no event at all (only a copy does)', (await events()).length === 0 && !!(await loadReport(A)));

// ---- recording ----
const open = issuesA.filter((i) => i.bucket !== 'verified_pass');
const r1 = await recordEvent(A, 'prompt_copied', open[0].id); check('a copy for a finding of the scan is recorded', r1.ok && r1.recorded === true && (await events(A)).length === 1);
for (let i = 0; i < 9; i++) await recordEvent(A, 'prompt_copied', open[0].id);
check('ten copies of the same finding are still one row (findings counted, not clicks)', (await events(A)).length === 1);
const r2 = await recordEvent(A, 'prompt_copied', open[1].id); check('a different finding makes a second row', r2.ok && r2.recorded && (await events(A)).length === 2);
const r3 = await recordEvent(A, 'prompt_copied', recsA[0].id); check('a recommendation of the scan is accepted too (the report copies fixes at both levels)', r3.ok && (await events(A)).length === 3);
const other = await recordEvent(A, 'prompt_copied', issuesB[0].id); check('a finding of another scan is refused and nothing is written', !other.ok && other.status === 404 && (await events(A)).length === 3 && (await events(B)).length === 0);
check('an unknown kind, a bad id and a missing scan are refused', (await recordEvent(A, 'scan_completed', open[0].id)).status === 400 && (await recordEvent(A, 'prompt_copied', 'nope')).status === 400 && (await recordEvent('nope', 'prompt_copied', open[0].id)).status === 400 && (await recordEvent('00000000-0000-4000-8000-000000000000', 'prompt_copied', open[0].id)).status === 404);

// ---- what a row can hold ----
const cols = (await db.execute(sql`select column_name from information_schema.columns where table_name = 'product_events' order by column_name`)).rows.map((r) => r.column_name);
check('the table has only: id, kind, scan_id, finding_ref, created_at (no user, address, text or key column)', cols.join() === 'created_at,finding_ref,id,kind,scan_id', cols.join());
const dump = JSON.stringify(await events()); check('the rows hold no address, no key and nothing but ids and a time', !RAW(C).some((v) => dump.includes(v)) && !/127\.0\.0\.1|http/.test(dump) && (await events()).every((e) => e.kind === 'prompt_copied' && /^[0-9a-f-]{36}$/.test(e.scanId) && /^[0-9a-f-]{36}$/.test(e.findingRef)));
check('an anonymous scan’s events carry no user (the scan has none, and the row has no way to name one)', (await db.select().from(schema.scans).where(eq(schema.scans.id, A)))[0].createdBy === null);

// ---- the funnel, from data that already exists ----
{ await db.update(schema.scans).set({ completedAt: new Date() }).where(eq(schema.scans.id, A));
  const [re] = await db.insert(schema.scans).values({ url: `http://127.0.0.1:${PORT}/`, standard: 'wcag22aa', status: 'completed', completedAt: new Date(), rescanOf: A }).returning();
  await db.insert(schema.rescanOutcomes).values({ scanId: re.id, previousScanId: A, findingId: open[0].id, outcome: 'fixed', comparable: true, before: {}, after: {}, reason: 'test' });
  await db.insert(schema.rescanOutcomes).values({ scanId: re.id, previousScanId: A, findingId: open[1].id, outcome: 'still_present', comparable: true, before: {}, after: {}, reason: 'test' });
  const f = await funnel(30); const t = f.reduce((a, d) => ({ s: a.s + d.scansWithFindings, c: a.c + d.scansWithFixCopied, n: a.n + d.findingsCopied, r: a.r + d.rescansStarted, x: a.x + d.findingsFixed }), { s: 0, c: 0, n: 0, r: 0, x: 0 });
  check('funnel: two original scans with findings (A and B), one with a copy (3 distinct findings), one rescan, one finding confirmed fixed (the other still present is not), and the rescan is not counted as an original scan', t.s === 2 && t.c === 1 && t.n === 3 && t.r === 1 && t.x === 1, JSON.stringify(t)); await db.delete(schema.scans).where(eq(schema.scans.id, re.id)); }

// ---- deletion: the events go with the scan ----
await deleteScan(A); check('deleting a scan deletes its events', (await events(A)).length === 0 && (await events()).length === 0);
{ const [u] = await db.insert(schema.users).values({ email: 'events@example.com', passwordHash: 'x:y' }).returning(); const mine = await scan({ createdBy: u.id }); const its = (await db.select().from(schema.issues).where(eq(schema.issues.scanId, mine)))[0];
  await recordEvent(mine, 'prompt_copied', its.id); check('(setup) a signed-in user’s scan has an event', (await events(mine)).length === 1);
  const d = await deleteAccount(u); check('deleting the account deletes the events of its scans', d.ok && (await events(mine)).length === 0 && (await events()).length === 0); }
{ const old = await scan(); const it = (await db.select().from(schema.issues).where(eq(schema.issues.scanId, old)))[0]; await recordEvent(old, 'prompt_copied', it.id);
  await db.update(schema.scans).set({ createdAt: new Date(Date.now() - 31 * 86400000) }).where(eq(schema.scans.id, old)); const n = await purgeExpiredScans(); check('an anonymous scan past its retention period is purged, and its events with it', n >= 1 && (await events()).length === 0); }

// ---- a broken events table never breaks the report or the caller ----
{ const keep = await scan(); const it = (await db.select().from(schema.issues).where(eq(schema.issues.scanId, keep)))[0]; await db.execute(sql`drop table product_events`);
  let threw = false, res = null; try { res = await recordEvent(keep, 'prompt_copied', it.id); } catch { threw = true; }
  check('with the events table gone, recording answers “unavailable” and does not throw, and the report still loads', !threw && res?.ok === false && res.status === 503 && !!(await loadReport(keep))); }

server.close(); const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
