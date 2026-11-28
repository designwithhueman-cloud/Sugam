// The product funnel, from data Avara already keeps. Counts only. Used by scripts/funnel.ts and the tests.
import { sql } from 'drizzle-orm';
import { getDb } from './db/index.ts';

export type FunnelDay = { day: string; scansWithFindings: number; scansWithFixCopied: number; findingsCopied: number; rescansStarted: number; findingsFixed: number };
/** One row per day (the day the scan finished). A fix copied twice counts once; a rescan is not itself counted as an original scan. */
export async function funnel(days = 30): Promise<FunnelDay[]> {
  const db = await getDb();
  const rows = (await db.execute(sql`
    with s as (select id, date(completed_at) d from scans where completed_at is not null and completed_at > now() - (${days} || ' days')::interval and rescan_of is null),
         withf as (select s.id, s.d from s where exists (select 1 from issues i where i.scan_id = s.id and i.bucket <> 'verified_pass')),
         copied as (select e.scan_id, count(distinct e.finding_ref) n from product_events e where e.kind = 'prompt_copied' group by e.scan_id),
         resc as (select distinct rescan_of id from scans where rescan_of is not null),
         fixed as (select previous_scan_id id, count(*) n from rescan_outcomes where outcome = 'fixed' group by previous_scan_id)
    select withf.d::text as day, count(*)::int as a, count(copied.scan_id)::int as b, coalesce(sum(copied.n), 0)::int as c, count(resc.id)::int as d, coalesce(sum(fixed.n), 0)::int as e
    from withf left join copied on copied.scan_id = withf.id left join resc on resc.id = withf.id left join fixed on fixed.id = withf.id group by withf.d order by withf.d desc`)).rows as { day: string; a: number; b: number; c: number; d: number; e: number }[];
  return rows.map((r) => ({ day: r.day, scansWithFindings: r.a, scansWithFixCopied: r.b, findingsCopied: Number(r.c), rescansStarted: r.d, findingsFixed: Number(r.e) }));
}
