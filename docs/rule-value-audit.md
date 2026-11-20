# Rule value audit

Every rule was asked one question: **would a failure here change a launch decision?** Tier 1 would; Tier 2 changes quality or risk but rarely blocks launch alone; Tier 3 is polish; Tier 4 would not influence a launch decision (a summary, a taste call, or a check that cannot fail in a way that matters).

Tiers are stored on each rule as `valueTier` and drive its weight: Tier 1 = 10, Tier 2 = 6, Tier 3 = 3, Tier 4 = 1, rollups and the Differentiation category = 0. Weights were previously set by check type, which ranked a measurable-but-trivial check above a decisive judgement. Category weights (the 100% split) are unchanged.

## Summary

| Category | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Rules |
|---|---:|---:|---:|---:|---:|
| Product Clarity | 5 | 7 | 3 | 0 | 15 |
| UX & Workflow Quality | 3 | 7 | 10 | 0 | 20 |
| Mobile Responsiveness | 3 | 8 | 1 | 3 | 15 |
| Accessibility | 5 | 13 | 2 | 0 | 20 |
| Trust & Credibility | 4 | 7 | 2 | 2 | 15 |
| Design & Brand Quality | 2 | 2 | 5 | 6 | 15 |
| Conversion Readiness | 4 | 7 | 3 | 1 | 15 |
| Performance | 3 | 3 | 3 | 1 | 10 |
| Differentiation & Design Maturity | 0 | 6 | 4 | 0 | 10 |
| **All** | **29** | **60** | **33** | **13** | **135** |

## Findings

**Weak rules (cannot run, or too generic to produce a defensible finding):** PC-014 (needs the owner's confirmed job), DESIGN-002 and DESIGN-006 (need a design system), DESIGN-012 (needs brand references), CONV-009 (needs documented objections), and every human-session rule (PC-015, UX-019, UX-020, A11Y-018, DESIGN-014, CONV-013, CONV-015). They stay in the library as human tests and are never scored automatically.

**Rules that were too generic before this audit:** all of Product Clarity. They asked a model to "judge" a statement. They now have objective criteria, a named evidence record and a recommendation that quotes the evidence (see Phase 2 below).

**Redundant or overlapping (resolved so one defect is never scored twice):**

- MOB-001 shared a detector with MOB-010. MOB-001 now has its own (clipped content at 320px).
- UX-002, CONV-002 and MOB-010 all describe "the entry point". Each now reads a different fact: first-screen position (UX-002), desktop availability (CONV-002), phone usability (MOB-010).
- DESIGN-014 (visual distinctiveness) is the human review of what DIFF-002 now detects automatically.
- DESIGN-001, DESIGN-004 and DIFF-007 all touch hierarchy: type scale, emphasis, and repeated section rhythm respectively.
- TRUST-005, TRUST-006, TRUST-012 and DIFF-008: element-level attribution versus pattern-level "can this be checked". The Differentiation category carries weight 0, so there is no double deduction.
- UX-012, CONV-005 and CONV-006 describe one form; CONV-006 owns field count, UX-012 owns order and grouping.
- PC-001, PC-005 and PC-006 are one repair (rewrite the opening); they stay separate checks with different facts (descriptor present, headline length, supporting-line content).
- MOB-012 duplicates DESIGN-010; DESIGN-015 duplicates DESIGN-004 when it harms comprehension.

**Low value (Tier 4, would not influence a launch decision):** seven rollups that add no independent result (MOB-004, MOB-014, MOB-015, TRUST-004, DESIGN-013, CONV-011, PERF-010), TRUST-006 (absence is neutral by design), DESIGN-002 (nothing to compare with), DESIGN-003 and DESIGN-007 (taste), DESIGN-014 (redundant) and DESIGN-015 (aesthetic).

**Not changed in this pass:** no rule was deleted. Tier 4 rules keep a weight of 1 so they still appear; the rollups have none. Removing them is a decision for the owner.

## Product Clarity

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **PC-001** Clear Value Proposition | 1 Launch Critical | `pc/hero-statement` | Keep. Sharpen. If a newcomer cannot say what this is, nothing else on the page matters. Was subjective; now has an objective opening-statement check. |
| **PC-002** Audience Clarity | 1 Launch Critical | `pc/audience-cue` | Keep. Sharpen. Visitors who cannot see themselves in the page leave. Now checks for a named audience in the opening. |
| **PC-003** Benefit-Focused Messaging | 1 Launch Critical | `pc/feature-first` | Keep. Sharpen. Shares a repair with PC-008. Feature-first copy is the most common positioning weakness. Now compares feature-led and outcome-led headings. |
| **PC-004** Differentiation Clarity | 2 Important | `pc/unsupported-superlatives` | Keep. Narrow. Real differentiation needs the owner's positioning; the page-only check is limited to unsupported superlatives. |
| **PC-005** Headline Effectiveness | 2 Important | `pc/headline-form` | Keep. Merge repair with PC-001. Headline length and form are measurable; effectiveness is not. |
| **PC-006** Supporting Subheadline Quality | 3 Nice To Have | `pc/subheadline` | Keep as detail. Useful when a subheadline exists; one repair with PC-001 and PC-005. |
| **PC-007** Problem Statement Visibility | 2 Important | `pc/problem-signal` | Keep. Advisory. Problem framing helps some offers and is unnecessary for others; never a failure on its own. |
| **PC-008** Outcome-Oriented Messaging | 1 Launch Critical | `pc/outcome-language` | Keep. Sharpen. Outcomes decide whether the offer feels worth it. Now looks for concrete, quantified outcomes. |
| **PC-009** Jargon Detection | 2 Important | `pc/buzzwords` | Keep. Rebuilt. Was generic jargon detection; now a data-driven buzzword lexicon (including AI buzzwords) with quoted evidence. |
| **PC-010** Above-The-Fold Clarity | 1 Launch Critical | `pc/first-screen` | Keep. Sharpen. The first screen decides most bounces. Now checks the heading, a supporting line and enough text are visible without scrolling. |
| **PC-011** Primary Offer Visibility | 2 Important | `pc/offer-before-action` | Keep. An action asked for before the offer is stated is a measurable ordering fault. |
| **PC-012** Call-to-Action Context | 2 Important | `pc/cta-context` | Keep. Narrow. A button with no explanation nearby is measurable; wording belongs to CONV-001. |
| **PC-013** Message Consistency | 2 Important | `pc/claim-consistency` | Keep. Contradictory numbers destroy trust quickly and are objectively checkable. |
| **PC-014** Feature Prioritization | 3 Nice To Have | none | Weak. Cannot run without the owner's confirmed job. Needs a supplied job-to-be-done; until then it cannot produce a finding. |
| **PC-015** First 5-Second Comprehension | 3 Nice To Have | none | Keep as a human test. A five-second test is the right method and cannot be automated. |

## UX & Workflow Quality

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **UX-001** Navigation Discoverability | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-002** Primary Task Visibility | 1 Launch Critical | `ux/primary-task-visible` | Keep. If the entry point to the task is not visible, the task cannot start. |
| **UX-003** Workflow Simplicity | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-004** Cognitive Load | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-005** Clear Next Step | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-006** Progressive Disclosure | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-007** Choice Overload | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-008** Recognition Over Recall | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-009** Information Architecture | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-010** Scannability | 3 Nice To Have | `ux/scannability` | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-011** Interaction Feedback | 1 Launch Critical | `workflow/action-no-response` | Keep. No feedback after an action makes visitors repeat or abandon it. |
| **UX-012** Form Simplicity | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-013** Onboarding Friction | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-014** User Journey Continuity | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-015** Empty State Guidance | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-016** Error Prevention | 2 Important | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-017** Error Recovery | 1 Launch Critical | none | Keep. An error with no recovery path ends the task. |
| **UX-018** Feature Discoverability | 3 Nice To Have | none | Keep. Affects how smoothly the task goes; a launch usually proceeds with a fix queued. |
| **UX-019** Task Completion Confidence | 3 Nice To Have | none | Needs participants. Human test. |
| **UX-020** Time To First Value | 3 Nice To Have | none | Needs the owner. Time to first value must be defined by the owner. |

## Mobile Responsiveness

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **MOB-001** Responsive Layout Integrity | 2 Important | `mobile/layout-integrity` | Keep. Own detector. Previously shared MOB-010's detector and would have scored one defect twice. |
| **MOB-002** Horizontal Scroll Detection | 1 Launch Critical | `mobile/horizontal-scroll` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-003** Touch Target Size | 2 Important | `target-size` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-004** Button Accessibility | 4 Low Value | none | Rollup. Not a rule. Summary of other mobile checks. |
| **MOB-005** Mobile Typography Readability | 2 Important | `mobile/typography` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-006** Content Scaling | 2 Important | `mobile/content-scaling` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-007** Image Responsiveness | 2 Important | `mobile/image-responsiveness` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-008** Navigation Accessibility | 2 Important | none | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-009** Mobile Form Usability | 2 Important | `mobile/form-usability` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-010** Mobile CTA Visibility | 1 Launch Critical | `mobile/primary-action-missing`, `mobile/primary-action-unusable` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-011** Viewport Adaptation | 2 Important | `mobile/orientation` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-012** Spacing Consistency | 3 Nice To Have | none | Redundant with DESIGN-010. Spacing consistency on mobile is the same polish check. |
| **MOB-013** Sticky UI Interference | 1 Launch Critical | `mobile/sticky-ui-interference` | Keep. Affects phone visitors; blocking only when the main action is lost. |
| **MOB-014** Mobile Task Completion | 4 Low Value | none | Rollup. Not a rule. Replay of the task; owners score the cause. |
| **MOB-015** Mobile Performance Usability | 4 Low Value | none | Rollup. Not a rule. Summary of PERF results. |

## Accessibility

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **A11Y-001** Color Contrast | 1 Launch Critical | `color-contrast`, `sugam/non-text-contrast` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-002** Alt Text Presence | 2 Important | `image-alt`, `input-image-alt` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-003** Accessible Form Labels | 1 Launch Critical | `label`, `select-name` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-004** Keyboard Navigation | 1 Launch Critical | `sugam/keyboard-trap`, `sugam/non-semantic-clickable` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-005** Visible Focus States | 1 Launch Critical | `sugam/focus-not-visible`, `sugam/focus-obscured` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-006** Semantic Structure | 2 Important | `list`, `listitem` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-007** Heading Hierarchy | 2 Important | `heading-order`, `empty-heading` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-008** Landmark Regions | 3 Nice To Have | `region`, `landmark-one-main` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-009** Accessible Links | 2 Important | `link-name`, `sugam/vague-link-text` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-010** Form Error Identification | 2 Important | `sugam/form-error-not-linked` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-011** Zoom Support | 1 Launch Critical | `sugam/reflow-320`, `sugam/text-spacing` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-012** Accessible Tables | 2 Important | `td-headers-attr`, `th-has-data-cells` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-013** Reading Order | 2 Important | none | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-014** Accessible Media | 2 Important | `sugam/embedded-media`, `sugam/media-transcript` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-015** ARIA Usage | 2 Important | `button-name`, `aria-allowed-attr` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-016** Motion Sensitivity | 2 Important | `sugam/autoplay-no-pause`, `sugam/reduced-motion` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-017** Error Prevention | 2 Important | none | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-018** Screen Reader Compatibility | 3 Nice To Have | none | Needs assistive technology. Human test with a named screen reader. |
| **A11Y-019** Accessible Navigation | 2 Important | `bypass`, `sugam/focus-context-change` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |
| **A11Y-020** Color Independence | 2 Important | `link-in-text-block` | Keep. A barrier for some visitors; the specific criterion decides how urgent it is. |

## Trust & Credibility

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **TRUST-001** Contact Information Visibility | 1 Launch Critical | `trust/contact-route` | Keep. No way to reach the company is a common reason not to commit. |
| **TRUST-002** Privacy Policy Presence | 1 Launch Critical | `trust/privacy-link` | Keep. A broken or missing privacy link next to a data request is a launch blocker for many teams. |
| **TRUST-003** Terms of Service Presence | 2 Important | `trust/terms-link` | Keep. Matters when terms are referenced; legal applicability is a separate review. |
| **TRUST-004** Social Proof Availability | 4 Low Value | none | Rollup. Not a rule. Adds no independent result; keep as a view of TRUST-005/006/012. |
| **TRUST-005** Testimonial Quality | 2 Important | none | Keep. Needs corroboration. Testimonial attribution is checkable; authenticity is not. |
| **TRUST-006** Customer Logos | 4 Low Value | none | Low value. Absence is neutral by design, so the rule can almost never fail in a way that matters. Superseded by DIFF-008 at pattern level. |
| **TRUST-007** Founder Visibility | 3 Nice To Have | none | Nice to have. Matters only when the offer rests on a person. |
| **TRUST-008** Team Transparency | 2 Important | none | Keep. Claimed expertise without people or credentials is a trust gap. |
| **TRUST-009** Security Messaging | 1 Launch Critical | none | Keep. Security assurance placement near a payment or data request influences completion. |
| **TRUST-010** Trust Signal Placement | 2 Important | none | Keep. Overlaps TRUST-009. Placement is the measurable half of TRUST-009; one repair. |
| **TRUST-011** Authenticity Indicators | 2 Important | none | Keep. Inconsistent business identity is a strong negative signal. |
| **TRUST-012** Review Visibility | 3 Nice To Have | `trust/review-route` | Nice to have. Reviews are optional; only claims without a route matter. |
| **TRUST-013** Proof Over Claims | 1 Launch Critical | none | Keep. Unsupported material claims are the core credibility failure. |
| **TRUST-014** Support Accessibility | 2 Important | `trust/support-route` | Keep. Support reachable for a specific problem reduces fear of committing. |
| **TRUST-015** Risk Reduction Messaging | 2 Important | none | Keep. Explaining consequences and remedies lowers commitment risk. |

## Design & Brand Quality

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **DESIGN-001** Typography Hierarchy | 2 Important | `design/typography-hierarchy` | Keep. Overlaps DESIGN-004. Type scale is measurable; overall hierarchy (DESIGN-004) is the same family. |
| **DESIGN-002** Typography Consistency | 4 Low Value | none | Low value without a design system. Cannot run without approved tokens; nothing to compare against. |
| **DESIGN-003** Font Pairing Quality | 4 Low Value | none | Low value. Font pairing is taste; only a specific legibility conflict matters, which A11Y rules already catch. |
| **DESIGN-004** Visual Hierarchy | 1 Launch Critical | none | Keep. If the page emphasises the wrong thing, the main action is lost. |
| **DESIGN-005** CTA Emphasis | 1 Launch Critical | `design/cta-emphasis` | Keep. A secondary action louder than the primary is a measurable decision fault. |
| **DESIGN-006** Color Consistency | 3 Nice To Have | none | Nice to have. Needs tokens. Colour consistency needs a token set to compare with. |
| **DESIGN-007** Color Simplicity | 4 Low Value | none | Low value. Universal palette limits do not exist; collisions that hide meaning are caught by contrast rules. |
| **DESIGN-008** Component Consistency | 2 Important | `design/component-consistency` | Keep as advisory. Inconsistent buttons erode polish; always a judgement. |
| **DESIGN-009** Layout Consistency | 3 Nice To Have | none | Nice to have. Needs several pages. |
| **DESIGN-010** Spacing Rhythm | 3 Nice To Have | none | Nice to have. Spacing rhythm is polish. |
| **DESIGN-011** Icon Consistency | 3 Nice To Have | none | Nice to have. Icon consistency is polish; superseded in part by DIFF-006. |
| **DESIGN-012** Brand Consistency | 3 Nice To Have | none | Needs brand references. Cannot run without a brand kit. |
| **DESIGN-013** Design Maturity | 4 Low Value | none | Rollup. Not a rule. Adds no independent result. |
| **DESIGN-014** Visual Distinctiveness | 4 Low Value | none | Redundant with DIFF-002. Visual distinctiveness now has an automated owner (DIFF-002); this stays as the human review. |
| **DESIGN-015** Visual Balance | 4 Low Value | none | Low value. Aesthetic balance stays advisory unless it harms comprehension, which DESIGN-004 covers. |

## Conversion Readiness

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **CONV-001** Primary CTA Clarity | 1 Launch Critical | none | Keep. A button that promises one thing and does another loses the visitor at the decision. |
| **CONV-002** CTA Visibility | 1 Launch Critical | `conv/cta-visible` | Keep. Desktop only; mobile belongs to MOB-010. The conversion entry point must be available; split from MOB-010 to avoid double counting. |
| **CONV-003** CTA Consistency | 2 Important | `conv/cta-consistency` | Keep. Narrowed. Different labels for one destination confuse; the duplicate-label accessibility check belongs to A11Y-009. |
| **CONV-004** CTA Hierarchy | 2 Important | `conv/cta-saturation` | Keep. Sharpened. Competing actions dilute the decision. Now counts first-screen actions and repeated calls to action. |
| **CONV-005** Form Friction | 2 Important | none | Keep. Overlaps UX-012. A concrete obstacle at conversion matters; form simplicity (UX-012) is the same repair. |
| **CONV-006** Field Count Optimization | 2 Important | `sugam/form-required-not-marked`, `conv/field-count` | Keep. Every extra field costs completions; necessity needs the owner. |
| **CONV-007** Pricing Clarity | 1 Launch Critical | none | Keep. Hidden price or conditions at the decision point is a conversion and trust failure. |
| **CONV-008** Offer Clarity | 2 Important | none | Keep. What the visitor receives for this commitment must be stated. |
| **CONV-009** Objection Handling | 2 Important | none | Keep. Needs evidence. Only meaningful with documented objections. |
| **CONV-010** Value Reinforcement | 3 Nice To Have | none | Nice to have. Reinforcement helps; rarely decisive. |
| **CONV-011** Trust Before Conversion | 4 Low Value | none | Rollup. Not a rule. Adds no independent result. |
| **CONV-012** Conversion Path Continuity | 1 Launch Critical | `workflow/first-field-unreachable` | Keep. An action that does not reach the next state is a funnel break. |
| **CONV-013** User Motivation Alignment | 3 Nice To Have | none | Needs participants. Human test; cannot run automatically. |
| **CONV-014** Trial Visibility | 2 Important | `conv/trial-visibility` | Keep. A trial that cannot be found is a lost conversion. |
| **CONV-015** Conversion Confidence | 3 Nice To Have | none | Needs participants. Human test; cannot run automatically. |

## Performance

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **PERF-001** Largest Contentful Paint | 1 Launch Critical | `perf/lcp`, `perf/lcp-image-lazy` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-002** Cumulative Layout Shift | 1 Launch Critical | `perf/cls`, `perf/cls-unsized-images` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-003** Interaction To Next Paint | 1 Launch Critical | none | Keep. Field data only. INP needs field data; lab Total Blocking Time must never stand in for it. |
| **PERF-004** Image Optimization | 2 Important | `perf/image-optimization` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-005** Font Optimization | 3 Nice To Have | `perf/font-optimization` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-006** JavaScript Efficiency | 2 Important | `perf/javascript-efficiency` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-007** CSS Efficiency | 3 Nice To Have | `perf/css-efficiency` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-008** Render Blocking Assets | 2 Important | `perf/render-blocking` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-009** Third-Party Script Impact | 3 Nice To Have | `perf/third-party` | Keep. Measured speed; matters when it is poor enough to cost visitors. |
| **PERF-010** Mobile Performance | 4 Low Value | none | Rollup. Not a rule. Summary of PERF-001 to 009. |

## Differentiation & Design Maturity

| Rule | Tier | Detector today | What to do, and why |
|---|---|---|---|
| **DIFF-001** Template Similarity Detection | 2 Important | `diff/template-sequence` | New. Detects the common AI-SaaS section order from the page itself. |
| **DIFF-002** Visual Distinctiveness | 2 Important | `diff/default-styling` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-003** Brand Memorability | 3 Nice To Have | `diff/brand-assets` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-004** Dashboard Sameness | 2 Important | `diff/dashboard-pattern` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-005** Layout Originality | 3 Nice To Have | `diff/layout-archetypes` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-006** Visual System Originality | 3 Nice To Have | `diff/shape-and-icon-language` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-007** Information Hierarchy Differentiation | 2 Important | `diff/section-rhythm` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-008** Trust Through Design | 2 Important | `diff/trust-pattern` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-009** Feature Grid Saturation | 2 Important | `diff/feature-grid-saturation` | Keep. Pattern observation about sameness; advisory, not scored yet. |
| **DIFF-010** Visual Commodity Risk | 3 Nice To Have | none | Rollup. Not a rule. Adds no independent result. |

## Phase 2: Product Clarity upgrade

Each Product Clarity rule now has objective evaluation criteria, a required-evidence list, a recommendation that quotes the evidence, and an authored user and business impact (labelled as hypotheses). 13 of the 15 have a deterministic detector; PC-014 needs the owner and PC-015 is a human test. The lexicons (buzzwords, audience nouns, outcome verbs, superlatives, problem words) are **data in each rule's `parameters`**, so they can be tuned without code.

| Rule | Detector | Objective check |
|---|---|---|
| **PC-001** | `pc/hero-statement` | Within the first screen a newcomer can tell what the product is. Objective check: the opening (the h1 plus the line under it) contains a descriptor of what the product does or is for (a verb phrase such as 'helps', 'lets' or 'turns', an 'is a' statement, or a 'for' phrase), not only a slogan. |
| **PC-002** | `pc/audience-cue` | The opening names who the product is for. Objective check: the h1, subheadline or first-screen text names an audience (a role, team or business type) in a 'for …' or 'helps …' phrase, or addresses one directly. |
| **PC-003** | `pc/feature-first` | Messaging leads with what the visitor gets, not with what the product has. Objective check: among the section headings, count the feature-led ones (feature nouns, 'AI-powered', 'advanced') and the outcome-led ones (outcome verbs, numbers with units). Flag when at least 60% are feature-led and none is outcome-led. |
| **PC-004** | `pc/unsupported-superlatives` | Claims of being best are backed by something. Objective check: sentences in the opening that use a superlative or category claim (best, leading, all-in-one, the future of) with no number, customer or source in the same sentence. Real differentiation also needs the owner's positioning, which this check cannot see. |
| **PC-005** | `pc/headline-form` | The headline is a usable length. Objective check: the h1 has 4 to 14 words; 15 to 24 needs a person; over 24 or under 2 fails. |
| **PC-006** | `pc/subheadline` | When a subheadline exists it adds information. Objective check: 8 to 35 words, and not a restatement of the h1 (word overlap under 70%). |
| **PC-007** | `pc/problem-signal` | The page names a problem the visitor recognises when the offer depends on one. Objective check: the hero and the next section use problem words (struggle, manual, wasted, without…). Absence is advisory, never a failure. |
| **PC-008** | `pc/outcome-language` | The page promises a concrete result. Objective check: the hero and headings contain an outcome (an outcome verb, or a number with a unit such as '2x', '10 minutes', '40%'). A quantified outcome is the strongest pass. |
| **PC-009** | `pc/buzzwords` | Copy avoids vague buzzwords (including AI buzzwords) that say nothing specific. Objective check: count distinct buzzwords from a maintained lexicon in the h1, subheadline, first-screen text and headings. Flag at 3 or more distinct, or when they make up at least 6% of the first-screen words. |
| **PC-010** | `pc/first-screen` | The first screen on its own explains the offer. Objective check: the h1 is inside the first screen, and so is a supporting line, with at least 15 words of text in the first screen. |
| **PC-011** | `pc/offer-before-action` | The offer is stated before the page asks for action. Objective check: no call to action sits above the h1 in the first screen. |
| **PC-012** | `pc/cta-context` | A request for commitment is explained nearby. Objective check: each call to action in the first screen has at least 6 words of explanation in its surrounding block. |
| **PC-013** | `pc/claim-consistency` | The page does not contradict itself about the offer. Objective check: the same kind of numeric claim (customers, users, teams, reviews) is stated with two different values in the text. |
| **PC-014** | none | Features are ordered by the confirmed job to be done. Needs the owner's confirmed job; without it this rule cannot produce a finding. |
| **PC-015** | none | Five-second test: show target users the page for five seconds, then ask for unaided recall of the offer and audience. Needs participants. |
