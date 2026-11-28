# Product events

Avara counts one thing about how reports are used: that a fix was copied for a finding in a scan (`prompt_copied`).

- **Stored:** `product_events` has `id`, `kind`, `scan_id`, `finding_ref`, `created_at`. No user, address, prompt text or key. The row is deleted with its scan (foreign key, delete cascade): when the scan, the account or the workspace is deleted, and when an anonymous scan passes its retention period (`ANON_RETENTION_DAYS`, default 30).
- **Once per finding:** unique on (scan, kind, finding), so ten copies of one fix are one row. The funnel counts distinct findings, not clicks.
- **How it is sent:** the Copy button posts `{ kind, findingId }` to `/api/scans/:id/events` after a successful copy. First-party only, no cookie, no script, same-origin requests only, at most 1 KB, 60 per scan per 10 minutes. Failure is ignored. Shared (read-only) reports send nothing. The finding must belong to the scan (an issue, finding or recommendation id of that scan).
- **Not stored twice:** `scan_completed` is `scans.completed_at`; `rescan_started` is a scan whose `rescan_of` is the original; `finding_fixed` is `rescan_outcomes.outcome = 'fixed'`, which is written only when a comparable check confirms the fix.
- **Funnel:** `node --experimental-strip-types scripts/funnel.ts [--days 30]` (stop the app first, or point `PGLITE_DIR` at a copy). Counts per day: scans with findings, scans where a fix was copied, findings copied, rescans started, findings fixed.
- **Privacy page:** `app/(site)/privacy/page.tsx` names this data, its retention and its deletion.
