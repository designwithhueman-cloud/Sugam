# Detector coverage report

> Superseded: this hand-written snapshot (77 rules) is out of date. The current, generated totals are in [coverage/coverage-matrix.md](coverage/coverage-matrix.md), which counts rules naming a detector (81) separately from detector ids listed as fixture-proven (98 of 135 named ids). "Detector-backed" below means the rule names a detector, not that it ran on every scan.

Generated from `src/detectors/detector-specs.json` and the rule files. "Detector-backed" means the rule names at least one detector that runs on every scan. "Exercised" means it was seen passing and flagging on test pages. "Not run" means no detector exists yet; those rules need a model, the owner, or a person.

**Detector-backed rules: 51 before, 77 now (+26). Rules in the library: 135 (125 canonical + 10 Differentiation). No detector was removed.**

| Category | Rules | Before | Now | Exercised | Not run | Share detector-backed |
|---|---:|---:|---:|---:|---:|---:|
| Product Clarity | 15 | 0 | 13 | 12 | 2 | 87% |
| UX & Workflow Quality | 20 | 3 | 4 | 3 | 16 | 20% |
| Mobile Responsiveness | 15 | 10 | 10 | 8 | 5 | 67% |
| Accessibility | 20 | 17 | 17 | 14 | 3 | 85% |
| Trust & Credibility | 15 | 5 | 5 | 5 | 10 | 33% |
| Design & Brand Quality | 15 | 3 | 5 | 5 | 10 | 33% |
| Conversion Readiness | 15 | 5 | 6 | 4 | 9 | 40% |
| Performance | 10 | 8 | 8 | 6 | 2 | 80% |
| Differentiation & Design Maturity | 10 | 0 | 9 | 6 | 1 | 90% |
| **All** | **135** | **51** | **77** | **63** | **58** | **57%** |

## What the customer-value detectors do

| Detector | Rule | Pass | Fail | Needs a person | Could not verify |
|---|---|---|---|---|---|
| `pc/hero-statement` | **PC-001** Clear Value Proposition | The opening contains a descriptor of what the product does or is for. | No h1 on the page. | see rule | A slogan with no descriptor: needs a person. Page structure not captured: could not verify. |
| `pc/audience-cue` | **PC-002** Audience Clarity | An audience term appears in the opening. | (never a failure) | see rule | No audience named: needs a person. No opening to read: not applicable. |
| `pc/feature-first` | **PC-003** Benefit-Focused Messaging | Fewer than 60% of headings are feature-led, or at least one promises a result. | (never a failure) | see rule | Feature-led headings and no outcome: needs a person. Fewer than 3 headings: not applicable. |
| `pc/unsupported-superlatives` | **PC-004** Differentiation Clarity | No unsupported superlative claim. | (never a failure) | see rule | An unsupported claim: needs a person. Real differentiation needs the owner positioning, which this cannot see. |
| `pc/headline-form` | **PC-005** Headline Effectiveness | The h1 has 4 to 14 words. | The h1 has over 24 or under 2 words. | see rule | 15 to 24 or 2 to 3 words: needs a person. No h1: not applicable. |
| `pc/subheadline` | **PC-006** Supporting Subheadline Quality | The supporting line has 8 to 35 words and is not a restatement. | Overlap with the h1 is 70% or more. | see rule | Too short or too long: needs a person. No supporting line: not applicable. |
| `pc/problem-signal` | **PC-007** Problem Statement Visibility | A problem word appears. | (never a failure) | see rule | None found: needs a person. Under 80 words: not applicable. |
| `pc/outcome-language` | **PC-008** Outcome-Oriented Messaging | A quantified outcome or an outcome verb appears. | (never a failure) | see rule | None found: needs a person. |
| `pc/buzzwords` | **PC-009** Jargon Detection | Fewer than 3 distinct buzzwords and under 6% of first-screen words. | (never a failure) | see rule | At or above either limit: needs a person (quotes shown). |
| `pc/first-screen` | **PC-010** Above-The-Fold Clarity | Heading and supporting line are in the first screen with 15 or more words. | The h1 starts below the first screen. | see rule | No supporting line or too little text: needs a person. No h1: not applicable. |
| `pc/offer-before-action` | **PC-011** Primary Offer Visibility | No call to action above the h1. | A call to action sits above the h1. | see rule | No h1 or no first-screen call to action: not applicable. |
| `pc/cta-context` | **PC-012** Call-to-Action Context | Every button has 6 or more words of explanation nearby. | (never a failure) | see rule | A button with fewer: needs a person. |
| `pc/claim-consistency` | **PC-013** Message Consistency | Claims of the same kind agree within 10%. | Two values for the same kind of claim differ by more than 10%. | see rule | No numeric claims: not applicable. |
| `conv/cta-saturation` | **CONV-004** CTA Hierarchy | 3 or fewer distinct filled buttons and no label repeated 6 or more times. | (never a failure) | see rule | More competing buttons or a heavily repeated label: needs a person. |
| `diff/template-sequence` | **DIFF-001** Template Similarity Detection | Fewer than 4 of the 7 template sections match in order. | 5 or more of the 7 match in order. | see rule | 4 match: needs a person. Fewer than 4 sections: not applicable. |
| `diff/default-styling` | **DIFF-002** Visual Distinctiveness | Fewer than 3 of 4 default-style signals. | (never a failure) | see rule | 3 or 4 signals: needs a person. |
| `diff/brand-assets` | **DIFF-003** Brand Memorability | Fewer than 3 gaps. | (never a failure) | see rule | 3 or more gaps: needs a person. |
| `diff/dashboard-pattern` | **DIFF-004** Dashboard Sameness | Fewer than 2 of the 3 stock dashboard parts. | Sidebar, 3+ stat cards and a chart all present. | see rule | Two parts: needs a person. No app UI on the page: not applicable. |
| `diff/layout-archetypes` | **DIFF-005** Layout Originality | Three or more distinct layouts. | (never a failure) | see rule | Two or fewer across 5+ sections: needs a person. |
| `diff/shape-and-icon-language` | **DIFF-006** Visual System Originality | Fewer than 2 of 3 default signals. | (never a failure) | see rule | 2 or 3 signals: needs a person. Too few cards or icons: not applicable. |
| `diff/section-rhythm` | **DIFF-007** Information Hierarchy Differentiation | Under 80% of sections share one structure. | (never a failure) | see rule | 80% or more: needs a person. Fewer than 5 sections: not applicable. |
| `diff/trust-pattern` | **DIFF-008** Trust Through Design | No unlinked logo band together with unlinked testimonials. | (never a failure) | see rule | Both present and unverifiable: needs a person. Neither section present: not applicable. |
| `diff/feature-grid-saturation` | **DIFF-009** Feature Grid Saturation | Fewer than 2 grids of repeated cards. | 3 or more grids of repeated cards. | see rule | 2 grids: needs a person. |

Every detector returns one of four results: **pass**, **fail** (a confirmed, evidenced fact), **needs a person** (a pattern found that only a person can judge) or **could not verify** (the measurement did not run, or the page structure was not captured). A rule that does not apply to the page is reported as **not applicable**, never as a pass. Subjective calls are never a fail.

## Which rules still do not run

- **Product Clarity** (2): PC-014 (assisted), PC-015 (human)
- **UX & Workflow Quality** (16): UX-001 (partial), UX-003 (assisted), UX-004 (assisted), UX-005 (assisted), UX-006 (assisted), UX-007 (assisted), UX-008 (assisted), UX-009 (assisted), UX-012 (assisted), UX-013 (assisted), UX-014 (partial), UX-015 (assisted), UX-016 (partial), UX-018 (assisted), UX-019 (human), UX-020 (human)
- **Mobile Responsiveness** (5): MOB-004 (rollup), MOB-008 (partial), MOB-012 (assisted), MOB-014 (rollup), MOB-015 (rollup)
- **Accessibility** (3): A11Y-013 (partial), A11Y-017 (partial), A11Y-018 (human)
- **Trust & Credibility** (10): TRUST-004 (rollup), TRUST-005 (assisted), TRUST-006 (assisted), TRUST-007 (assisted), TRUST-008 (assisted), TRUST-009 (assisted), TRUST-010 (assisted), TRUST-011 (assisted), TRUST-013 (assisted), TRUST-015 (assisted)
- **Design & Brand Quality** (10): DESIGN-002 (partial), DESIGN-003 (assisted), DESIGN-006 (partial), DESIGN-007 (assisted), DESIGN-009 (partial), DESIGN-011 (assisted), DESIGN-012 (partial), DESIGN-013 (rollup), DESIGN-014 (human), DESIGN-015 (assisted)
- **Conversion Readiness** (9): CONV-001 (assisted), CONV-005 (assisted), CONV-007 (assisted), CONV-008 (assisted), CONV-009 (assisted), CONV-010 (assisted), CONV-011 (rollup), CONV-013 (human), CONV-015 (human)
- **Performance** (2): PERF-003 (partial), PERF-010 (rollup)
- **Differentiation & Design Maturity** (1): DIFF-010 (rollup)

Legend: `full` and `partial` can still be built deterministically; `assisted` needs a model with a person confirming; `human` needs participants or the owner; `rollup` is a summary of other rules.

## Honest limits

- The AI-SaaS template, default-styling and layout checks compare the page with patterns **Avara defines in data** (`DIFF-001` parameters). They do not compare against any named product (Lovable, Bolt, v0 and so on), because no reference set of those products' output exists in this repository.
- Differentiation rules carry **zero weight**. They produce findings but no score, so nothing in the Differentiation category can be counted twice with Product Clarity, Design or Trust.
- Patterns are statistics over stored reviews. Until enough pages exist they are labelled **Emerging Observation**; they never create a score.
- Dashboard checks only see dashboards that are visible in a public page. A dashboard behind a sign-in is not scanned.
- Fixture results only: none of this has been run against a real AI-builder project.
