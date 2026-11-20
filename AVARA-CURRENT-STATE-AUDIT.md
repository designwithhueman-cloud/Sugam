# Avara / Sugam — Current State Audit

Audit date: 2026-11-20. Method: test run (chain9), Python rule inventory against `detector-specs.json` and `_manifest.json`, code reading of scan-service, review of `.data/objects/scans/` (1,046 stored scans).

---

## 1. Capability Summary

| Capability | Status | Evidence |
|---|---|---|
| URL submission → scan (Playwright, desktop + 320px) | **Implemented — verified** | `scanner-accuracy`, `detectors`, `avara` test suites pass |
| axe-core accessibility audit | **Implemented — verified** | axe 4.14 in scanner, A11Y rules exercised on fixtures |
| 25-press keyboard trace | **Implemented — verified** | `avara.mjs` trace assertions pass |
| Lighthouse performance (LCP, CLS, resources) | **Implemented — verified on fixtures** | Lighthouse 13.6 in scanner; needs Chrome binary in production |
| Page structure capture (`STRUCTURE_CONTEXT`) | **Implemented — verified** | Captured into `pageContext.structure`; exercised by Product Clarity and DIFF detectors |
| Form validation probe (`VALIDATION_PROBE`) | **Implemented — unverified on real sites** | `reportValidity()` only (no submit); detectors not yet exercised on real forms |
| Rule engine — 135 rules, 9 categories, hot reload | **Implemented — verified** | `rule-engine.mjs` passes 1,135-rule stress test; 0 spec/code mismatches |
| Ranked findings with one-sentence reason | **Implemented — verified** | `avara.mjs`, `bookcall.mjs` pass |
| Rescan with per-finding comparison | **Implemented — verified** | Fixed / Still present / Couldn't verify confirmed on fixture cases |
| Fix generation (Lovable, Bolt, v0, Cursor, Framer, Webflow, code) | **Implemented — verified in UI and gating** | Never tried in a real AI builder |
| Plan gating (free=1 fix, site=full, agency=share links) | **Implemented — verified** | `gating.mjs` free/site/agency all pass |
| Pattern Intelligence (emerging → pattern → high-confidence) | **Implemented — verified on synthetic data** | Never scored; never run on real scan data |
| AI judgement path (`AVARA_AI=on`) | **Built — never called** | No `ANTHROPIC_API_KEY` configured; model never invoked |
| Scores / overall launch-readiness | **Built as provisional** | No rule is score-eligible yet; labels say "provisional" |
| Postgres production path | **Planned — untested** | All testing on embedded PGlite; migrations 0005/0006 not run on Postgres |
| Whole-site scanning | **Planned** | Marked in UI; not implemented |
| Payments / billing | **Not connected** | Plans set by local script |

**Fixture vs real-site boundary:** Everything marked "verified" passed on purpose-built pages in `analysis/avara/fixtures/`. Real-site validation has never run on the new Product Clarity and Differentiation detectors. The `audit-real-sites.mjs` test suite exists but has not been executed against the new detectors.

---

## 2. Rule Inventory

135 rules across 9 categories. 0 spec/code mismatches (spec `implementation.status` aligns with detector presence in `derived.ts`). No rule is score-eligible.

### By category

| Category | Rules | Detectors built | Exercised on fixtures | Weight | Score-eligible |
|---|---:|---:|---:|---:|---:|
| Product Clarity | 15 | 13 | 12 | 15% | 0 |
| UX & Workflow Quality | 20 | 4 | 3 | 15% | 0 |
| Mobile Responsiveness | 15 | 10 | 8 | 10% | 0 |
| Accessibility | 20 | 17 | 14 | 10% | 0 |
| Trust & Credibility | 15 | 5 | 5 | 10% | 0 |
| Design & Brand Quality | 15 | 5 | 5 | 10% | 0 |
| Conversion Readiness | 15 | 6 | 4 | 15% | 0 |
| Performance | 10 | 8 | 6 | 15% | 0 |
| Differentiation & Design Maturity | 10 | 9 | 6 | 0% | 0 |
| **Total** | **135** | **77** | **63** | **100%** | **0** |

### Rules without a detector (58 rules)

Grouped by why:

- **Needs model judgement (33):** PC-013, PC-014, PC-015, UX-003, UX-004, UX-005, UX-006, UX-007, UX-008, UX-009, UX-010, UX-011, UX-012, UX-013, UX-015, UX-018, UX-019, UX-020, TRUST-003, TRUST-004, TRUST-005, TRUST-012, TRUST-013, TRUST-014, TRUST-015, CONV-003, CONV-007, CONV-010, CONV-011, CONV-012, CONV-015, DESIGN-004, DESIGN-007
- **Needs person / owner input (15):** UX-016, UX-017 (error recovery), TRUST-001, TRUST-002, TRUST-006–TRUST-011, DESIGN-011, DESIGN-013, DESIGN-014, DESIGN-015, CONV-013, CONV-014
- **Deterministically buildable now (10):** UX-001 (navigation), UX-014 (single task per screen), MOB-008 (target size), A11Y-013 (timeout warning), A11Y-017 (focus visible on focus), DESIGN-002/006/009/010/012 (spacing, contrast, font count, icon consistency, motion)

### Key per-rule rows (selected)

| ID | Title | Tier | Detector status | Exercised |
|---|---|---|---|---|
| A11Y-001 | Missing alt text | T1 | partial | yes |
| A11Y-003 | Low contrast text | T1 | partial | yes |
| A11Y-005 | Keyboard trap | T1 | partial | yes |
| MOB-013 | Fixed element overlap | T1 | partial | yes |
| CONV-001 | CTA visible above fold | T1 | partial | yes |
| PC-001 | Clear value proposition | — | partial | yes |
| PC-005 | Headline effectiveness | — | partial | yes |
| PERF-001 | LCP above threshold | T1 | partial | yes |
| UX-001 | Navigation discoverability | — | not-built | — |
| UX-016 | Error recovery guidance | — | not-built | — |
| TRUST-007 | Contact info visible | — | not-built | — |
| DIFF-001–010 | Differentiation maturity (10 rules) | — | partial (9/10) | partial |

Source links: all 135 rules cite a source URL in the JSON. No passage has been individually verified, which is why no rule is score-eligible.

---

## 3. The incident.io "Get started for free" / 0% Visible Discrepancy

**What was claimed:** A previous product-owner report noted a discrepancy where "Get started for free" appeared at 0% visible in a scan finding, while the page screenshot showed the button fully rendered.

**What the evidence shows:**

No incident.io scan object exists in `.data/objects/scans/` (searched all 1,046 stored scans; 0 matched). The discrepancy was described from a screenshot of the report UI, not from directly inspecting saved scan JSON.

**What the code does:** `ctaVisible()` in `derived.ts:48–52` calls `mainAction()`, which scores candidate buttons and links and picks the highest-scoring one. It then checks `a.m.visibleRatio`. If that value is 0, the finding reads: `visible 0%`. The `visibleRatio` comes from the scanner's Playwright measurement of the element's intersection with the viewport at the time of capture.

**Likely causes of a 0% reading on a visible button:**
1. A cookie consent banner or overlay was open during the scan pass and covered the button's bounding rect.
2. `mainAction()` scored a hidden element higher than the visible one (e.g., a duplicate button in a mobile-hidden nav).
3. The element was inside a scroll container whose `overflow: hidden` caused Playwright to report zero intersection.

**What is unknown:** Without the saved scan JSON (specifically `pageContext.viewports.desktop.avara.mainAction`), it is not possible to confirm which cause applies. The scan data was never stored locally or is from a session before the current data directory was populated.

**Verdict:** Cannot confirm or refute from stored evidence. To investigate: re-scan `https://incident.io` with the current scanner, capture `pageContext.viewports.desktop.avara` from the raw scan output, and inspect `mainAction.m.visibleRatio` and `mainAction.m.box`.

---

## 4. Unresolved Gaps and Top 3 Priorities

### Unresolved gaps

| Gap | Severity | File / artifact |
|---|---|---|
| No version control, no backup | Critical | Entire project |
| 2 landing tests still failing | High | `test/landing.mjs` lines 38–45 (capitalization check for "Page review", text "more issue types on this page") |
| Report viewer has its own axe violations | High | `components/report/ReviewPage.tsx`, original `ReportView` — 2 `aria-valid-attr-value`, 4 `color-contrast`, 11 `label-content-name-mismatch` |
| 58 rules have no detector | Medium | `src/services/scan-service/derived.ts`; 10 are deterministically buildable now |
| Customer-value detectors unvalidated on real sites | Medium | `src/services/scan-service/derived.ts`, value-detectors test suite |
| AI path never invoked | Medium | `src/services/scan-service/review-step.ts`; `ANTHROPIC_API_KEY` not configured |
| Postgres path untested | Medium | `lib/db/`, migrations 0005–0006 |
| Two AI switches (`SUGAM_AI` / `AVARA_AI`) | Low | README, `src/services/scan-service/review-step.ts` |
| `audit-real-sites.mjs` never run on new detectors | Low | `test/audit-real-sites.mjs` |

### Top 3 priorities

**1. Put the project under version control (`src/`: `git init`, first commit, remote backup).**

File: entire working directory. Without version control, one bad edit loses everything. This is 30 minutes of work and a prerequisite for all other progress. See `docs/product-owner-report.md § 8.1`.

**2. Fix the 2 failing landing tests (`test/landing.mjs`).**

The failures are in the test assertions, not the product:
- "result page uses the Sunbeam frame" — test checks for `/Page review/i` capitalization; the rendered text may be "page review" lowercase.
- "the rest stays behind an account and paid plans" — test checks for a specific string that the new ReviewPage layout may not emit verbatim.

Fix: read `test/landing.mjs` lines 38–60, compare with what `ReviewPage` actually renders, update the string checks. Estimated: 30 minutes.

**3. Validate customer-value detectors on 20–30 real public pages.**

The Product Clarity and Differentiation detectors were built and pass on fixtures, but their false-positive rate on real sites is completely unknown. Run `test/audit-real-sites.mjs` with the current server, have a person grade each finding, and record precision per detector. Until this is done, the new detectors are "built" not "trustworthy" and cannot be shown to real users without risk. Estimated: 1–2 days including tuning word lists in `src/rules/product-clarity.json` and `src/rules/diff.json`.
