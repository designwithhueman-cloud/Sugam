# Avara Rule Library v1 · Claude Code implementation brief

Implement this library in the existing Sugam repository as the rule foundation for Avara, the AI-native launch readiness platform. Register 125 canonical review topics in eight categories. Several topics are evidence summaries or participant research tasks. Keep all 125 addressable while scoring each underlying repair once. Build on the current scanner, fix panel, entitlements and rescan history. Report the difference between catalogued, implemented, exercised on fixtures, and executed on the current URL.

## Category weights

| Category | Canonical IDs | Count | Weight |
|---|---|---:|---:|
| Product Clarity | PC | 15 | 15% |
| UX & Workflow Quality | UX | 20 | 15% |
| Mobile Responsiveness | MOB | 15 | 10% |
| Accessibility | A11Y | 20 | 10% |
| Trust & Credibility | TRUST | 15 | 10% |
| Design & Brand Quality | DESIGN | 15 | 10% |
| Conversion Readiness | CONV | 15 | 15% |
| Performance | PERF | 10 | 15% |

## Rule record and publishing requirements

Store ruleId, version, category, title, source, sourceType, sourceUrl, sourceSection, additionalReferences, confidence, confidenceBasis, heuristicTags, applicability, exclusions, requiredEvidence, pass/fail/inconclusive conditions, evaluation method, implementation status, score eligibility, fix guidance and rescan criteria. Source confidence is an editorial assessment with a documented basis. Store finding confidence separately. Keep unverified sources and numeric confidence nullable in drafts. Enable scoring only after an exact passage supports the operational interpretation, exclusions are documented, and the check has appropriate validation. A broad source in the catalog is a starting reference.

Each finding records rule version, goal, URL, viewport, input mode, page state, element identity, expected and observed behaviour, evidence, impact, severity, confidence, root cause, verification method, and history. Keep raw observations for every tested state. Use observed pass, observed failure, needs human review, inconclusive and not applicable. Separate unimplemented and not-run checks from all five results.

**Catalog modes.** M = measurable or mixed (automate only the supported part). H = heuristic review requiring contextual evidence. U = user, owner, or assistive-technology session as specified. R = rollup with zero independent deduction. Source key OWNER means a product hypothesis or owner-specific requirement awaiting relevant research or supplied evidence. DESIGN means a scoped brand/design-system reference is needed. Neither is a verified universal rule. Give editorial hypotheses an advisory status.

## Source index

- HOME: NN/g, Homepage Design principles — https://www.nngroup.com/articles/homepage-design-principles/
- NN1–NN10: numbered Nielsen heuristic — https://www.nngroup.com/articles/ten-usability-heuristics/
- Heuristic review method — https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- READ: NN/g, scanning content — https://www.nngroup.com/articles/how-users-read-on-the-web/
- W: W3C WCAG 2.2. Link the exact success criterion, level and exceptions in each executable subcheck — https://www.w3.org/TR/WCAG22/
- APG: W3C pattern-specific authoring guidance. Modal example — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ . Use the actual widget pattern. Store axe engine version, emitted rule ID and helpUrl separately.
- ST: Stanford Web Credibility Guidelines — https://credibility.stanford.edu/guidelines/ . Verify the specific guideline and application. This research supplies general credibility guidance. Terms, privacy, customer logos and security assertions require their own context.
- BAYF: Baymard checkout form research — https://baymard.com/research-articles/checkout-flow-average-form-fields
- BAYR: Baymard required/optional field markings — https://baymard.com/research-articles/required-optional-form-fields
- CXL: form optimization research and experiments — https://cxl.com/blog/web-form-optimization/
- REF: Refactoring UI, hierarchy in label/value pairs — https://refactoringui.com/previews/labels-are-a-last-resort . Verify a separate source when extending beyond this example.
- VITALS: metric definitions — https://web.dev/articles/vitals . Use field p75 by device with URL/origin and time window. Good bands are LCP ≤2.5s, CLS ≤0.1, INP ≤200ms. Keep Lighthouse lab results separate.
- CHROME: Chrome Performance Insights — https://developer.chrome.com/docs/performance/insights . Register the specific diagnostic reference and installed Lighthouse version used.
- Additional source families: UX Content Collective for content design, UX Matters for practitioner UX guidance, Growth.Design for behavioural case studies, Google Fonts for typography, Apple HIG, Material Design and Android Accessibility for platform guidance. Locate the exact supporting article before activation. Keep native points and dp distinct from web CSS pixels. OWASP belongs to a future security review outside these 125 topics.

## Canonical catalog

### Product Clarity

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| PC-001 | Clear Value Proposition | H HOME | Quote the introduction. Can a newcomer identify the offer? |
| PC-002 | Audience Clarity | H HOME | Look for cues about who benefits when audience specificity matters. |
| PC-003 | Benefit-Focused Messaging | H HOME | Inspect how a named feature answers a visitor need. |
| PC-004 | Differentiation Clarity | H OWNER | Compare an explicit positioning claim with the owner’s supplied positioning. External market comparison requires research. |
| PC-005 | Headline Effectiveness | H HOME | Evaluate the headline’s contribution in context. Supporting copy may supply the detail. |
| PC-006 | Supporting Subheadline Quality | H HOME | When present, check whether supporting copy resolves ambiguity. Optional component. |
| PC-007 | Problem Statement Visibility | H HOME | Identify a recognizable visitor need when the offer depends on it. Accept an implicit need. |
| PC-008 | Outcome-Oriented Messaging | H HOME | Look for a concrete outcome behind a promised benefit. Share the repair with PC-003 when appropriate. |
| PC-009 | Jargon Detection | H NN2 | Quote an unexplained term and identify the audience that might misunderstand it. |
| PC-010 | Above-The-Fold Clarity | H HOME | Capture the initial viewport and what a first-time visitor can infer. |
| PC-011 | Primary Offer Visibility | H HOME | Locate the actual offer in the page sequence. Distinguish offer from action. |
| PC-012 | Call-to-Action Context | H HOME | Check the explanation surrounding a request. Button wording belongs to CONV-001. |
| PC-013 | Message Consistency | H NN4 | Compare two claims about the same offer and cite the discrepancy. |
| PC-014 | Feature Prioritization | H NN8 | Compare feature order to the owner-confirmed job. Require a concrete conflict. |
| PC-015 | First 5-Second Comprehension | U OWNER | Timed exposure with target users, followed by unaided recall of offer and audience. Record responses. |

### UX & Workflow Quality

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| UX-001 | Navigation Discoverability | H NN6 | Attempt to locate a named destination from the starting state. |
| UX-002 | Primary Task Visibility | H NN6 | Locate the entry point to the confirmed visitor task. |
| UX-003 | Workflow Simplicity | H NN8 | Trace a redundant or avoidable step and explain why it can be removed. |
| UX-004 | Cognitive Load | H NN6 | Identify information the visitor must mentally combine at a particular step. |
| UX-005 | Clear Next Step | H NN1 | After a transition, establish whether the next available action is understandable. |
| UX-006 | Progressive Disclosure | H NN8 | Inspect conditional or advanced controls that obscure the immediate task. |
| UX-007 | Choice Overload | H NN8 | Identify competing choices without a usable distinction. A count alone is insufficient. |
| UX-008 | Recognition Over Recall | H NN6 | Capture information shown earlier that must now be remembered or re-entered. |
| UX-009 | Information Architecture | H NN2 | Test the destination grouping for a specific information-seeking task. |
| UX-010 | Scannability | H READ | Compare section headings with the content users need to find. |
| UX-011 | Interaction Feedback | M NN1 | Capture before/action/after, including selected, pending, and completed states. |
| UX-012 | Form Simplicity | H BAYF | Review grouping and order in a scoped form. Checkout research applies directly to checkout. |
| UX-013 | Onboarding Friction | H NN7 | Identify an avoidable prerequisite before the first useful action. |
| UX-014 | User Journey Continuity | M NN3 | Trace safe transitions, back paths, revisions and dismissals. Record last observed state. |
| UX-015 | Empty State Guidance | H NN10 | Capture an empty state and available explanation or recovery action. |
| UX-016 | Error Prevention | H NN5 | Inspect prerequisites, format guidance, and safeguards before a foreseeable mistake. |
| UX-017 | Error Recovery | M NN9 | Trigger a safe error and capture identification, correction guidance and retry. |
| UX-018 | Feature Discoverability | H NN6 | Attempt to find a named secondary feature from its expected context. |
| UX-019 | Task Completion Confidence | U NN1 | Compare completion feedback with actual outcome and participant interpretation. |
| UX-020 | Time To First Value | U OWNER | Define first value with the owner. Time representative sessions to that event. |

### Mobile Responsiveness

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| MOB-001 | Responsive Layout Integrity | M W | Compare bounding boxes and clipped content at mobile and desktop widths. Use SC 1.4.10 where applicable. |
| MOB-002 | Horizontal Scroll Detection | M W | Locate causal element at 320 CSS px. Apply SC 1.4.10 exceptions including two-dimensional content. |
| MOB-003 | Touch Target Size | M W | Measure target and neighbours. Apply SC 2.5.8 exceptions, including spacing. |
| MOB-004 | Button Accessibility | R W | Mobile button summary from measured targeting, naming and operability checks. |
| MOB-005 | Mobile Typography Readability | H READ | Inspect reading conditions at the tested width. Separate measured contrast or resizing defects. |
| MOB-006 | Content Scaling | M W | At increased text size, check for lost content or controls under SC 1.4.4; also test text-spacing overrides under 1.4.12. |
| MOB-007 | Image Responsiveness | M OWNER | Compare rendered image bounds at widths; identify distortion, cropping of meaningful content or overflow. |
| MOB-008 | Navigation Accessibility | M APG | Exercise the mobile menu, keyboard interaction, and return path. Apply pattern guidance to the actual widget. |
| MOB-009 | Mobile Form Usability | M NN5 | Trace input, local validation, and field navigation at the mobile viewport. |
| MOB-010 | Mobile CTA Visibility | M OWNER | Record visibility, occlusion, reachability, and activation of the primary action on mobile. |
| MOB-011 | Viewport Adaptation | M W | Inspect effective layout under resize/orientation; use SC 1.3.4 or 1.4.10 only when applicable. |
| MOB-012 | Spacing Consistency | H DESIGN | Compare mobile spacing for equivalent controls; show the affected task. |
| MOB-013 | Sticky UI Interference | M W | Measure overlap and exercise the control. Apply SC 2.4.11 only if author content entirely hides keyboard focus. |
| MOB-014 | Mobile Task Completion | R OWNER | Replay the task on mobile. Attribute any failed step to its specific cause. |
| MOB-015 | Mobile Performance Usability | R VITALS | Show mobile measurements from PERF with their observed task context. |

### Accessibility

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| A11Y-001 | Color Contrast | M W | SC 1.4.3 for text, 1.4.11 for relevant non-text elements. Apply exceptions and distinguish unresolved backgrounds. |
| A11Y-002 | Alt Text Presence | M W | SC 1.1.1. Inspect purpose and accessible equivalent. Decorative images may use empty alt. |
| A11Y-003 | Accessible Form Labels | M W | SC 1.3.1, 3.3.2, 4.1.2, and 2.5.3 where applicable. Compare visible label, association and computed name. |
| A11Y-004 | Keyboard Navigation | M W | SC 2.1.1 and 2.1.2. Exercise relevant keys and outcome. A bounded Tab trace alone cannot establish failure. |
| A11Y-005 | Visible Focus States | M W | SC 2.4.7. Record actual rendered focused state, including custom indicators. |
| A11Y-006 | Semantic Structure | M W | SC 1.3.1. Compare visual grouping and programmatic relationships; specific heading/table defects use their own owners. |
| A11Y-007 | Heading Hierarchy | M W | SC 1.3.1 and 2.4.6. Check actual relationships and descriptive purpose. A skipped level alone is insufficient. |
| A11Y-008 | Landmark Regions | M W | Inspect navigation mechanisms and SC 2.4.1 where relevant. Missing landmark alone is advisory. |
| A11Y-009 | Accessible Links | M W | SC 2.4.4 and 4.1.2. Evaluate purpose with permitted context, including linked images. |
| A11Y-010 | Form Error Identification | M W | SC 3.3.1 plus 3.3.3 when applicable. Capture safe invalid state and associated message. |
| A11Y-011 | Zoom Support | M W | SC 1.4.4 and 1.4.10. Test actual zoom/reflow and loss of function. |
| A11Y-012 | Accessible Tables | M W | SC 1.3.1. Verify data cells can be associated with the relevant headers. |
| A11Y-013 | Reading Order | M W | SC 1.3.2. Verify a meaningful sequence where sequence affects understanding. |
| A11Y-014 | Accessible Media | M W | Select applicable SC 1.2.x by live/prerecorded, audio/video and described content. Record alternatives checked. |
| A11Y-015 | ARIA Usage | M APG | Inspect names, roles, states and actual widget keyboard behaviour. Consult SC 4.1.2 separately. |
| A11Y-016 | Motion Sensitivity | M W | Inspect SC 2.2.2 and 2.3.1 with their conditions; movement triggered by interaction is separately scoped under AAA 2.3.3. |
| A11Y-017 | Error Prevention | M W | SC 3.3.4 for covered legal, financial, data and test submissions. Inspect reversibility, checking or confirmation. |
| A11Y-018 | Screen Reader Compatibility | U W | Run task with named assistive technology/browser pair. Automated tree inspection supplies partial evidence only. |
| A11Y-019 | Accessible Navigation | M W | Assess bypass mechanisms, focus order, and consistent navigation under 2.4.1, 2.4.3, 3.2.3 as applicable. |
| A11Y-020 | Color Independence | M W | SC 1.4.1. Check whether meaning conveyed by colour also has an effective alternative cue. |

### Trust & Credibility

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| TRUST-001 | Contact Information Visibility | H ST | Find a relevant contact route before commitment. Accept working alternatives. |
| TRUST-002 | Privacy Policy Presence | M ST | Where personal information is requested, inspect the disclosure link and observed destination. Record availability only. |
| TRUST-003 | Terms of Service Presence | M OWNER | When terms are referenced or owner-required, inspect access before commitment. Legal applicability requires separate review. |
| TRUST-004 | Social Proof Availability | R ST | Summarize relevant proof observed. A site may legitimately have none. |
| TRUST-005 | Testimonial Quality | H ST | For an existing testimonial, inspect context and attribution. Authenticity requires corroboration. |
| TRUST-006 | Customer Logos | H OWNER | Inspect existing logo claims and evidence of relationship if supplied. Absence is neutral. |
| TRUST-007 | Founder Visibility | H ST | When founder identity underpins an offer, check whether the visitor can identify the person. Optional. |
| TRUST-008 | Team Transparency | H ST | When expertise is claimed, inspect relevant people, credentials or equivalent organizational evidence. |
| TRUST-009 | Security Messaging | H ST | Quote the assurance near a sensitive request. Underlying security requires independent evidence. |
| TRUST-010 | Trust Signal Placement | H ST | Map relevant assurance to the point a visitor takes a risk. |
| TRUST-011 | Authenticity Indicators | H ST | Identify a concrete inconsistency in business identity or provenance. |
| TRUST-012 | Review Visibility | H ST | If independent reviews are claimed, inspect the route to them. |
| TRUST-013 | Proof Over Claims | H ST | Trace one material factual claim to evidence. Record scope and broken references. |
| TRUST-014 | Support Accessibility | M ST | Exercise discovery and safe navigation to support for a specific problem. |
| TRUST-015 | Risk Reduction Messaging | H ST | Compare the commitment requested with the available explanation of consequences or remedies. |

### Design & Brand Quality

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| DESIGN-001 | Typography Hierarchy | H REF | Compare heading, supporting text and action emphasis within one task. |
| DESIGN-002 | Typography Consistency | H DESIGN | Compare equivalent text roles with the approved design system. |
| DESIGN-003 | Font Pairing Quality | H DESIGN | Inspect a specific legibility or brand conflict. Font count and taste alone do not qualify. |
| DESIGN-004 | Visual Hierarchy | H REF | Identify the element attracting emphasis and the intended priority. |
| DESIGN-005 | CTA Emphasis | H REF | Compare visual emphasis of primary and secondary actions in the same state. |
| DESIGN-006 | Color Consistency | H DESIGN | Compare equivalent semantic tokens and uses. Contrast failures have a separate owner. |
| DESIGN-007 | Color Simplicity | H DESIGN | Record a colour collision that obscures meaning. Avoid a universal palette limit. |
| DESIGN-008 | Component Consistency | H NN4 | Compare the same control and state in equivalent contexts. |
| DESIGN-009 | Layout Consistency | H NN4 | Compare repeated regions against an established pattern across observed pages or states. |
| DESIGN-010 | Spacing Rhythm | H DESIGN | Compare equivalent groups and identify spacing that implies an incorrect relationship. |
| DESIGN-011 | Icon Consistency | H NN4 | Compare the meaning and representation of the same action. |
| DESIGN-012 | Brand Consistency | H DESIGN | Check supplied brand references; mark unknown when required references are unavailable. |
| DESIGN-013 | Design Maturity | R DESIGN | Summarize specific evidenced issues. No standalone maturity deduction. |
| DESIGN-014 | Visual Distinctiveness | U DESIGN | Review with brand owner and audience against a supplied brief. Avoid invented benchmarks. |
| DESIGN-015 | Visual Balance | H REF | Identify a specific alignment or weight issue affecting comprehension. Aesthetic preference stays advisory. |

### Conversion Readiness

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| CONV-001 | Primary CTA Clarity | H HOME | Inspect what the button label promises and its actual destination. |
| CONV-002 | CTA Visibility | M OWNER | Test availability of the conversion entry point in the intended state; use MOB-010 for the same mobile observation. |
| CONV-003 | CTA Consistency | H NN4 | Compare CTA labels/destinations for the same conversion goal. |
| CONV-004 | CTA Hierarchy | H NN8 | Identify competing actions that obscure the intended decision. |
| CONV-005 | Form Friction | H CXL | Identify a concrete obstacle at the point of conversion; link form and accessibility evidence. |
| CONV-006 | Field Count Optimization | H BAYF | Identify a candidate unnecessary field and confirm its business need. Audit required/optional markings with BAYR. |
| CONV-007 | Pricing Clarity | H OWNER | Compare price, billing interval and material conditions shown at the decision point. |
| CONV-008 | Offer Clarity | H HOME | Inspect what the visitor receives for this specific commitment. |
| CONV-009 | Objection Handling | H OWNER | Check an objection documented in research or support evidence against available answers. |
| CONV-010 | Value Reinforcement | H OWNER | Inspect benefit information at a consequential conversion step. Tie advice to evidence. |
| CONV-011 | Trust Before Conversion | R ST | Show relevant trust observations in conversion context. |
| CONV-012 | Conversion Path Continuity | M NN3 | Trace action to expected next state. Record last observed step; use controlled fixtures for submissions. |
| CONV-013 | User Motivation Alignment | U OWNER | Compare expectations reported by target visitors with the actual offer. |
| CONV-014 | Trial Visibility | M OWNER | Only when a trial is offered, inspect its entry point and discoverable conditions. |
| CONV-015 | Conversion Confidence | U OWNER | Capture participant understanding of the commitment and outcome. Measured conversion lift requires outcome data. |

### Performance

| Canonical ID | Rule | Mode / source | Evaluation boundary |
|---|---|---|---|
| PERF-001 | Largest Contentful Paint | M VITALS | Record lab/field source, value, conditions and LCP element when available. |
| PERF-002 | Cumulative Layout Shift | M VITALS | Record shift clusters, affected elements and observation window. |
| PERF-003 | Interaction To Next Paint | M VITALS | Use appropriate interaction evidence; for field assessment record p75, device and scope. Never substitute TBT. |
| PERF-004 | Image Optimization | M CHROME | Trace a specific image, transferred size, rendered size and evidenced opportunity. |
| PERF-005 | Font Optimization | M CHROME | Trace a specific font request and measured delay, invisible text or layout shift. |
| PERF-006 | JavaScript Efficiency | M CHROME | Tie a script to measured execution cost or unused payload under the tested interaction. |
| PERF-007 | CSS Efficiency | M CHROME | Identify blocking or unused CSS in context. A single-page trace cannot prove safe removal everywhere. |
| PERF-008 | Render Blocking Assets | M CHROME | Show the resource, critical path and rendering consequence. |
| PERF-009 | Third-Party Script Impact | M CHROME | Identify origin and observed main-thread or network cost; compare equivalent runs if claiming improvement. |
| PERF-010 | Mobile Performance | R VITALS | Summarize measured mobile outcomes from PERF-001–009. Preserve field/lab boundaries. |

## Heuristic evaluation workflow

Run a task walkthrough before reviewing individual interface details. Record the intended visitor, goal, starting state, input modes, expected outcome, observations and scope boundary. Evaluate each of the ten lenses below as applicable. Allow independent reviewers to record observations and reconcile them into the same finding groups. Disclose AI-assisted, expert-reviewed and participant-tested evidence separately. A model walkthrough alone cannot verify comprehension or conversion behaviour.

| Lens | Walkthrough question | Representative canonical owners |
|---|---|---|
| H1 System status | Can the visitor tell what just happened, what is pending, and whether the task finished? | UX-011, UX-019 |
| H2 Familiar language and real-world concepts | Do the terms, ordering and grouping make sense for this audience? | PC-009, UX-009 |
| H3 User control and freedom | Can the visitor dismiss, go back or revise a choice safely? | UX-014, A11Y-015 |
| H4 Consistency and standards | Do equivalent labels and controls behave consistently? | DESIGN-008, CONV-003 |
| H5 Error prevention | Are likely mistakes prevented before a consequential commitment? | UX-016, A11Y-017 |
| H6 Recognition over recall | Does the visitor have the information and choices needed at this step? | UX-008, UX-018 |
| H7 Flexibility and efficiency | Can a repeat visitor avoid unnecessary work? | UX-003, UX-013 |
| H8 Minimal and relevant presentation | Is competing information making the primary decision harder? | UX-006, DESIGN-004, CONV-004 |
| H9 Error recognition and recovery | Can the visitor identify and correct the specific problem? | UX-017, A11Y-010 |
| H10 Help and documentation | Can the visitor find useful help at the point of need? | UX-015, TRUST-014 |

Save heuristic observations with reviewer, heuristic, task step, evidence, impact and canonical finding link. A heuristic never introduces its own monetary, severity or score penalty. A review can also record no issue observed, untested, or inconclusive for a lens.

## Merge earlier catalog without ID collisions

Namespace old IDs by registry version before mapping. Previous UX-001 meant interaction feedback; current UX-001 means navigation discoverability. Preserve immutable historic reports, scores and detector IDs. Use a versioned mapping table with old ID, new ID, relation (same, narrower, split, or evidence only), subcheck key and review status. Resolve by the old definition and observed evidence. Old evidence with ambiguous meaning stays historical. Ranges below list destinations in original numeric order.

| Prior catalog | New owners in order |
|---|---|
| CLR-001–003 | PC-001, PC-012, UX-010 |
| UX-001–005 | UX-011 (action feedback), UX-011 (waiting), UX-011 (selection), PC-009, UX-014 (sequence) |
| UX-006–010 | A11Y-015 (modal exit), UX-014 (revision), CONV-003 for CTA labels or DESIGN-008 for other controls, UX-014 (expected outcome), UX-016 (format constraints) |
| UX-011–015 | UX-016 (costly action), UX-008 (choice recall), UX-008 (persistent instruction), UX-003 (repeat efficiency), DESIGN-004 |
| UX-016–020 | A11Y-010 (identified error), UX-017 (recovery), TRUST-014 or UX-015 according to support/empty-state context, A11Y-015 (focus entry), A11Y-015 (focus return) |
| MOB-001–003 | MOB-002, MOB-003, MOB-013 |
| A11Y-001–006 | A11Y-001, A11Y-004, A11Y-005, A11Y-003 for form controls or A11Y-009 for links or A11Y-015 for other widgets, same type-specific owners for visible-label/name comparison as a distinct SC 2.5.3 subcheck, A11Y-010 |
| TRU-001–003 | TRUST-011 (provider identity), TRUST-001, TRUST-013 |
| DES-001–003 | DESIGN-004, UX-010, MOB-006 (text spacing subcheck applies on desktop as well; attach accessibility evidence) |
| CON-001–003 | CONV-006 (required/optional markings), CONV-006 (field necessity), CONV-005 |
| PERF-001–003 | PERF-001, PERF-002, PERF-003, respectively |

Audit all existing sugam/* and axe rules. Keep predicates, exclusions and stronger tests even when several subchecks share one owner. Preserve names and label-in-name checks for native buttons as well as custom widgets. Scope subchecks to the applicable component independently of their parent title.

## Finding identity, ownership and scoring

Construct an observation identity from the scoped product/page, task step, semantic element or component, predicate, viewport/input and state. Construct a separate repair group from the evidenced root cause, affected component and proposed change. Merge only when a single repair can reasonably address the observations. Similar titles or shared CSS selectors alone do not establish the same cause. Preserve independent defects on the same element. Carry the group across comparable rescans; uncertain matches remain unverified.

Assign one primary owner to each group using the most specific rule that directly explains the observed failure. Link other categories, heuristics, measurements and rollups as evidence. Record why the owner was chosen. For indistinguishable candidates use a stable, versioned tie-break. Examples:

| Overlap | Single repair or distinct observations |
|---|---|
| PC-001/003/005/006/008/010 | One vague hero claim with one copy change gets one owner; an independently contradictory price elsewhere remains separate. |
| UX-002, MOB-010/013/014, DESIGN-005, CONV-002/004 | A sticky banner covers the working CTA only on mobile: MOB-013 owns the repair. Discreet desktop styling is a separate issue only if independently evidenced. |
| UX-012, CONV-005/006, A11Y-003/010 | An unnecessary phone field and an inaccessible email label need different fixes. The former may be a hypothesis; the latter may be confirmed. |
| TRUST-004/005/006/012/013, CONV-011 | One unsupported customer endorsement has one owner. Absence of logos, founders, reviews or testimonials alone earns zero deductions. |
| DESIGN-001/004/005/013, CONV-004 | Use the specific evidenced change. Summaries contribute no penalties. |
| MOB-015, PERF-001/004/008/010 | Retain the measured LCP. If the trace attributes it to one hero asset, rank one repair with both metric and diagnostic attached. |
| UX-016 and A11Y-017 | Use the specific accessibility owner only if the action is covered by SC 3.3.4; generic error prevention has wider scope. |

Use the supplied category weights. Version both the scoring policy and source rule versions. Proposed provisional severity deductions for eligible independently confirmed groups: critical 40, major 15, minor 5. Category score = max(0, 100 − sum of its unique owned deductions). Overall = sum(category score × declared weight) / sum(weights of assessed applicable categories). Omit genuinely inapplicable categories with a visible explanation. Do not publish an overall number if any applicable category has incomplete required coverage or the denominator is zero. Define mandatory checks in a versioned coverage profile before running a scan. Exclude advisory and unsupported findings from deductions; show them separately. A confirmed task blocker always takes headline precedence over the numeric average. Report coverage, scope, and unverified steps beside any score. Pilot the penalty values before using numbers in launch claims.

## Acceptance tests and handoff

1. Registry contains exactly 125 unique versioned canonical IDs and the stated count for every category. Weights total 100%. All ten heuristics resolve to canonical owners without creating extra scored rules.
2. Every scoring-enabled rule has a precise verified citation, predicate, applicable exceptions, evidence requirements, pass and fail fixtures and an inconclusive path. Include an intentional horizontally scrollable table and a decorative image with empty alt as look-alikes.
3. Banner fixture yields one grouped repair, one category deduction, cross-category evidence and no additional heuristic penalty. Two unrelated faults on the same button remain distinct. Replaying identical evidence gives the same ranking and score.
4. A founder-free page with no testimonial, logos, price or trial receives no penalty from those absences alone. Five-second comprehension, perceived confidence and font preference stay advisory without the required human evidence.
5. Historical UX-001, A11Y-002 and MOB-003 records retain their old meaning. Reopen an old report and compare its labels, evidence and score before/after migration.
6. Rescan the specific repair and replay the main action. Record fixed, persistent, regressed, or unverified. Findings disappearing from the top five do not prove a repair.
7. At handoff show the catalog coverage, exact sources still awaiting validation, implementation status, test results and one actual scan with the evidence-to-repair-to-score trace. Preserve existing entitlements and page scope.
