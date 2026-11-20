# Sugam / Avara: product-owner report

Audit date: 2026-11-18. Method: I read the repository, ran every test suite against a freshly built server, re-ran the two that had been skipped (plan gating, site crawl), and corrected two test expectations that the latest change made stale. Every statement below is either backed by a test run today or marked **not verified**.

## 1. Bottom line

- **Demonstrable today:** paste one public URL, get a ranked "what to fix first" list across accessibility, mobile, workflow and performance, copy a fix for your tool, apply it, rescan, and see each finding come back **Fixed / Still present / Couldn't verify** with before and after. This works end to end, in the real UI, on controlled pages.
- **Built but only partly proven:** the rule engine (135 rules as JSON, 74 with a working detector), the customer-value detectors (Product Clarity, template sameness, trust and call-to-action patterns) and Pattern Intelligence. They pass their tests on purpose-built pages. They have **not** been checked against real websites, so their false-positive rate is unknown.
- **Not usable yet:** any AI judgement (no model has ever been called), published scores (nothing is score-eligible), whole-site scanning, payments, production deployment on Postgres/Redis with the new features.
- **Biggest risks:** there is **no version control and no backup**; the report page of an accessibility product has its own axe violations; the customer-value detectors are unvalidated on real sites.

## 2. What exists

| Area | What it is | Status |
|---|---|---|
| Scanner | Chrome via Playwright at desktop and 320px, axe-core, a 25-press keyboard trace, ~37 Sugam checks, main-action probe, 200% text, landscape, link checks, page structure capture | Verified (scanner-accuracy, detectors, value-detectors) |
| Performance | Lighthouse 13.6, mobile, lab LCP/CLS plus resource findings; INP reported as unavailable | Verified on fixtures. Needs Chrome in production |
| Ranking | Findings grouped by shared repair, top five in three tiers, one-sentence reason tied to the visitor goal | Verified (avara, bookcall) |
| Fixes | Lovable, Bolt, v0, Cursor, Framer, Webflow, code; free plan opens the top action's fix only | Verified in UI and gating. **Never tried in a real AI builder** |
| Rescan | New scan linked to the original (never edited); per-finding comparable re-check; "Fixed" only on a positive check | Verified: repaired, still present, renamed element, two faults on one button |
| Rule engine | `src/rules/*.json` (135 rules, 9 categories), loader with hot reload, 9 category evaluators, scorer, finding generator | Verified (rule-engine: also 1,135 rules in one run) |
| Customer-value detectors | 13 Product Clarity, call-to-action saturation, 9 Differentiation, rule-driven word lists | Verified on fixtures only |
| Pattern Intelligence | Patterns from stored reviews, labelled Emerging Observation / Pattern Identified / High Confidence Pattern; never a score | Verified on synthetic data |
| Context store | Products, findings, evidence, recommendations, fixes, rescan outcomes, rule snapshots, knowledge, patterns, category scores | Verified on embedded PGlite. **Postgres not tested** |
| Product site | Landing, pricing (waiting-list wording), free checker, tools, learn pages, auth (email, Google, GitHub), dashboard, share links, exports | Verified (landing, auth earlier, gating, crawl) |

Size: about 9,000 lines of application code, 2,000 lines of tests, 34 fixture pages, 7 migrations, 12 API routes, 20 pages.

## 3. Evidence: tests run today

All green on the current build: catalog, rule-engine, detector-spec, detectors (technical), value-detectors, avara (main, bookcall, failed-analyzer), landing, scanner-accuracy, fixpanel, tools, **gating for free, site and agency**, crawl (46 page views).

Not run today: `auth.mjs` (Google/GitHub sign-in, last passed before Avara), `audit-real-sites.mjs` (real public sites, never run against the new detectors).

## 4. Library coverage

135 rules (125 canonical + 10 Differentiation). 74 have a detector, 60 were exercised on both a clean and a flagged page, 61 do not run.

| Category | Rules | With a detector | Share |
|---|---:|---:|---:|
| Product Clarity | 15 | 13 | 87% |
| UX & Workflow Quality | 20 | 3 | 15% |
| Mobile Responsiveness | 15 | 10 | 67% |
| Accessibility | 20 | 17 | 85% |
| Trust & Credibility | 15 | 5 | 33% |
| Design & Brand Quality | 15 | 3 | 20% |
| Conversion Readiness | 15 | 6 | 40% |
| Performance | 10 | 8 | 80% |
| Differentiation & Design Maturity | 10 | 9 | 90% |

The 61 that do not run: 33 need a model with a person confirming, 15 need a person or the owner (or are summaries), 13 can still be built deterministically (UX-001, UX-014, UX-016, UX-017, MOB-008, A11Y-013, A11Y-017, DESIGN-002/006/009/010/012, PERF-003).

## 5. Demo readiness

**Ready (use the controlled pages; they are the reliable story):**
1. Book a call: a fixed banner covers the button on phones. One action, one owner rule (MOB-013), fix copied, rescan shows Fixed.
2. Two faults on one button: banner fixed, name mismatch still present. Shows grouping does not hide real problems.
3. Template page versus distinctive page: the section order found, the evidence, impact and fix.
4. Free versus paid: first fix open, the rest locked on the server; category reviews visible on both.

**Demo with caveats:** scanning a real public site works, but the new Product Clarity and Differentiation findings on real sites are unvalidated. Run it privately first.

**Do not demo:** an overall launch-readiness score, AI-judged findings, "compared with Lovable/Bolt/v0" claims, whole-site scanning, payments.

## 6. Needs verification

1. **Real websites.** Run the customer-value detectors on 20 to 30 real pages and have a person mark each finding right or wrong. Until then, treat them as "needs a person" evidence, not verdicts.
2. **A real AI builder.** The generated prompts have never been pasted into Lovable, Bolt, v0 or Cursor. Everything is fixture proof.
3. **The AI path.** Rules that need judgement have only run against a stub. No `ANTHROPIC_API_KEY` is configured.
4. **Production stack.** The Postgres path with migrations 0005 and 0006, and the BullMQ worker running the new review, have not been run. All testing was embedded PGlite in one process.
5. **Source passages.** All 135 rules cite a source URL; none has had its exact passage verified. That is why no rule is score-eligible and no overall score is published.
6. **Link-check isolation.** Scanner link checks pass each address through the public-address check, but I did not prove the Playwright request client also uses the egress proxy. Verify before exposing publicly.
7. **Auth providers** re-run after the latest changes.

## 7. Risks and honest gaps

- **No version control, no backup.** The folder is not a git repository. One bad command loses everything. This is the most urgent item.
- **The report page fails its own standard.** Axe finds problems on `/scans/<id>`: two `aria-valid-attr-value` on the Radix tabs, four `color-contrast` on the pin number badges, and the crawl reports `label-content-name-mismatch` on 11 pins. These are in the original report viewer, not the new panels. For an accessibility product this is a credibility problem.
- **Two AI switches.** The README documents `SUGAM_AI=on`; the new rule engine reads `AVARA_AI=on`. They need to be one setting.
- **README does not mention Avara,** the rule files, the new tests, or `ALLOW_PRIVATE_HOSTS=...,localhost:4200` for the new fixtures.
- **Scores are provisional.** Category scores count only decided rules and show coverage; the overall number is labelled provisional. Product Clarity now scores from measurements, which changes how it compares with earlier output.
- **Weights changed.** Rule weights now follow a value tier (10/6/3/1). Category weights (the 100% split) did not change. Say if you want the old weights back.
- **Impact statements are hypotheses.** User and business impact text is authored and labelled as such. No conversion or visitor behaviour is measured.
- **Differentiation = Avara's own pattern, not a comparison with named products.** No reference set of Lovable/Bolt/v0 output exists here, so the findings never claim a match with any of them.
- **Dashboards:** only dashboards visible on a public page can be assessed.
- **Brand:** the product is still Sugam publicly; Avara appears only in the new report sections, docs and code.
- **Billing is not connected;** plans are set by a local script. Whole-site scanning is marked Planned.
- **Scan time rose:** each scan now also runs Lighthouse (one run, three on rescans), link checks and extra page probes. Not yet load-tested.
- **The spec you referred to at the start ("Avara Product Specification v1.0") was never attached;** I worked from the milestone text you pasted.

## 8. Recommended next steps, in order

1. **Put the project under version control and make a backup.** Hours, not days. Everything else depends on it.
2. **Fix the report viewer's own accessibility** (tab panel references, badge contrast, pin names). Small and removes the most embarrassing demo risk.
3. **Validate on real sites.** Scan 20 to 30 real pages, have a person grade each finding, tune the word lists in the rule files, and record the false-positive rate per detector. This turns "built" into "trustworthy".
4. **Turn on the AI path once, with a spending cap,** after merging the two switches. Check the quoted-evidence guard against real model output.
5. **Run the Postgres and worker path** with the new migrations and the review step.
6. **Try one generated prompt in a real AI-builder project** and record the outcome, separate from fixture results.
7. **Pilot scoring:** verify the exact passages for the 29 Tier 1 rules first, then enable score-eligibility for those only.
8. **Build the 13 remaining deterministic detectors,** starting with UX-017 (error recovery) and UX-001 (navigation), which affect launch decisions most.
9. Update the README and the unified settings table.

## 9. Decisions only you can make

- Publish an overall score before sources are verified, or keep it hidden? (Currently shown as provisional with coverage.)
- Give the Differentiation category a weight, or keep it observation-only?
- Keep the tier-based rule weights?
- Remove the seven summary rules and other Tier 4 rules, or keep them as views?
- When does the public brand change from Sugam to Avara?
- Who is the first real user, and which AI-builder project do you want the fixes tried in?
