# Project health review — 2026-11-20

Method: type check, import-graph script (unused deps, orphan modules, unreferenced exports), route probes against the running app, reading of docs/README against the code. Nothing was changed. Findings below are what was observed; "likely" marks inference.

## What exists
Next.js app (Sugam/Avara): URL → Playwright scan (desktop + 320px, axe, keyboard trace, Lighthouse, signals probe) → rule engine (135 rules, 9 categories, 81 with detectors, 0 score-eligible) → report, fix panel, rescan comparison, plan gating (free/site/agency), share links, AEO and security tracks (unscored), coverage matrix. 315 tracked files; PGlite store in `.data` (390 MB, 1,085 stored scans).

## Broken
1. `/old/[id]` returns 500 for a non-UUID id (DB error `invalid input syntax for type uuid`). The route is marked "TEMPORARY… deleted after the comparison" yet ships. `/scans`, `/share`, `/api/scans` correctly 404.
2. `test/auth.mjs` fails 2 checks (needs Google/GitHub OAuth credentials; no env configured). Environment blocker, not code.
3. `test/landing.mjs` and others fail on a fresh server unless `ALLOW_PRIVATE_HOSTS` and `SCAN_RATE_LIMIT` are set. This is undocumented in package.json; there is no `npm test`.
4. Build previously failed type checking in two of my files (fixed in this session; committed in d31b88c).

## Inconsistent
1. Two report UIs: `ReviewPage` (new) on `/scans/[id]`, but `/share/[token]` still renders the old `ReportView`. Shared links look different from the owner's page.
2. Two AI switches: `SUGAM_AI` (analysis/claude.ts, README) vs `AVARA_AI` (rule engine). Documented as a gap, still unresolved. README only mentions one.
3. Stale numbers in docs: `AVARA-CURRENT-STATE-AUDIT.md` and `docs/detector-coverage-report.md` say 77 detectors; the registry now says 81 (matrix is correct). `docs/product-owner-report.md` and `rule-value-audit.md` predate the new tracks.
4. Audit file still lists "no version control" and failing landing tests as open; both are done.
5. Two analysis stacks: legacy `analysis/` (analyze, fixes, claude, meta) and `src/` rule engine. `scanner/cli-analyze.ts` and `lib/jobs.ts` still bridge into `analysis/`.
6. `AVARA-CURRENT-STATE-AUDIT.md` sits in the repo root while other docs are in `docs/`.

## Inefficient
1. Rate limit is an in-memory `Map` per route (`api/scans`, `rescan`). It resets on restart and does not work across multiple instances.
2. Rule files, manifest and `tracks` specs are read with sync fs (`RuleLoader`, `tracks.ts`, `claims.ts`); fine if cached, but `tracks.ts` re-reads specs per call (likely; not measured).
3. `.data` holds 1,085 scans (207 MB objects, 184 MB PGlite) with no retention policy; most are test runs.
4. `fixture/site/detectors` carries about 1.8 MB of fixtures (hero-big.jpg, unused.js, unused.css), intentional for perf tests but large for git; `docs/redesign/*.png` adds about 4 MB of screenshots.
5. PGlite allows one process: setting a plan requires stopping the server. Postgres path is untested (migrations 0005/0006).

## Not needed / dead
- Orphan modules (nothing imports them): `components/landing/Illustrations.tsx`, `components/landing/Pop.tsx`, `src/context/products/index.ts`, `src/services/scoring-service/index.ts` (`loadScores` unused). `scanner/cli.ts`, `scanner/cli-analyze.ts`, `worker/run.ts` are entry points, not dead.
- Unreferenced exports worth pruning: `lib/access.ts roleIn`, `lib/claims.ts claimedScanIds`, `lib/entitlements.ts planForUser`, `lib/plans.ts PLAN_FEATURES`, `lib/impact.ts IMPACT_LABELS`, `lib/avara/scoring.ts SCORING_POLICY`, `src/engines/rule-engine/llm/ClaudeClient.ts aiConfigured`, `src/services/scan-service/index.ts detectorReports`, plus about 12 unused db enum exports in `lib/db/schema.ts`.
- `/old/[id]` route (temporary, see above) and `ScanTeaser` if nothing else uses it.
- Untracked clutter in the working directory: the `--help/` folder (accidental, ignored), `audit-output/`, `tsconfig.tsbuildinfo`, `.data/test-*.txt` (all gitignored, safe to delete).
- Dependencies flagged by the script (`react-dom`, `typescript`, `postcss`, `@types/*`) are false positives; no genuinely unused runtime dependency found.

## Verified clean
- `tsc --noEmit`: 0 errors. No `console.log`, 2 `any` uses, no TODO/FIXME in source.
- No duplicate rule IDs; spec and registry consistent (detector-spec test passes).
- Unauthenticated routes `api/rules` and `api/knowledge/patterns` expose only the rule library and aggregated patterns, no scan data.

## Not verified
- Real-site false-positive rate of the new detectors (needs `test/audit-real-sites.mjs` and a human grader).
- Production Postgres, billing, whole-site scanning (not built), AI judgement path (never invoked).

## Suggested order
1. Delete `/old/[id]` and the orphan modules; prune unused exports.
2. Move `/share/[token]` to `ReviewPage`, then delete `ReportView` if nothing else uses it.
3. Pick one AI switch and update README.
4. Add `npm test` that sets the required env and runs the suites.
5. Refresh stale doc counts (generate them from the matrix).
