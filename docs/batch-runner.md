# Batch scan runner and labeling export

Measures how often each check is right. It runs the same code the product runs (the scanner and analysis for page checks, the exposure audit for
Launch checks), writes one row per finding for a person to label, and turns the labels into false-positive rates. It calls no AI.

```bash
npm run batch -- run <manifest.json> .data/batch [--allow-remote] [--allow-active] [--perf] [--delay <ms>]
npm run batch -- report .data/batch/<run id> [--labels <file.csv>]
```

Output goes to `.data/batch/<run id>/` (not committed): `findings.csv`, `checks_not_run.csv`, `sites.csv`, `run.json`, `screenshots/`, and later `report.md`.

## Manifest
`{ "sites": [{ "id", "url", "owned", "planted": [{ "check", "selector"?, "note"? }], "note" }] }`. See `batch/owned-sites.template.json`.
- Addresses that are not on this computer are refused without `--allow-remote`.
- `owned: true` on a remote address is refused without `--allow-active`. Say so only for sites you own.

## findings.csv: one row per finding
Columns: `finding_id, run_id, site_id, site_url, owned, kind (scan | avara | launch), check_id, check_title, bucket, severity, instance_count, selector, viewport, evidence, signal, screenshot, reviewer_verdict, reviewer_notes`.
- A row is one issue (rule) on one site. `selector`, `evidence` and `screenshot` show the first affected element; `instance_count` says how many there were.
- Page findings the analysis restates (the same check on the same site) appear once, as `scan`.
- **Fill in `reviewer_verdict`**: `correct`, `false_positive` or `unsure`. Blank means not reviewed yet. Write what you saw in `reviewer_notes`.
- Everything is masked before it is written, and a cell that starts with `=`, `+`, `-` or `@` is prefixed so a spreadsheet will not run it.

## checks_not_run.csv: tracked separately
One row per check that did not run on a site, with a category: `ownership_gated` (needs proof the site is ours), `could_not_check`, `failed`, `skipped` (switched off, for example performance without `--perf`), `limitation`. These are never counted as passes and never appear in `findings.csv`.

**Ownership-gated checks are not measured on sites we do not own.** Private files (SEC-012), source maps (SEC-013) and open database tables (SEC-014) are probed only when the manifest marks a site `owned`. Measure them on the deliberately broken test apps (`fixture/apps/leaky-app.mjs`) with planted bugs, where the right answer is known.

## report.md
- Per check, under the heading **False alarms among reviewed findings**: findings, unreviewed, confirmed (`correct`), false alarms (`false_positive`, the numerator), reviewed (confirmed + false alarms, the denominator), unsure, and the rate = false alarms ÷ reviewed with a Wilson 95% interval. It is shown only when the denominator is at least 10; otherwise the row says “insufficient labels”. Unsure and unreviewed findings are in neither the numerator nor the denominator.
- Checks that could not run, grouped by reason.
- Planted bugs: per check, how many listed problems were found, and a list of the missed ones. A planted bug counts as found when the site has a finding for that check (and one whose selector contains the entry's selector, if given).
- Verdicts other than the three above are listed and not counted (exit code 2 from the command).

## Tests
`test/batch-runner.mjs` runs on controlled fixtures only: manifest refusals, CSV safety, the statistics, the run, ownership gating, masking, the report, planted recall.
