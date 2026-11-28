# Review sources

The paid AI review grades each criterion against a named source. Every criterion in `src/rules/*.json` carries a `criterion` record with its source URL, section, whether that section was read on the source page, its applicability, the evidence it accepts, its exceptions and the tests that cover it. This page lists the sources by category.

**Verified** means the page was fetched on 22 November 2026 and the section heading was read on it. **Not verified** means the page could not be read (blocked, rendered by script, or moved), so it is kept as a reference only and never quoted as a passage.

## Primary sources

| Category | Source | Section used | Status |
|---|---|---|---|
| Product Clarity | [NN/g, Homepage Design: 5 Fundamental Principles](https://www.nngroup.com/articles/homepage-design-principles/) | Principle 2: Communicate Who You Are and What You Do; Principle 3: Reveal Content Through Examples | Verified |
| Product Clarity | [GOV.UK, Writing to GOV.UK standards](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/) | Plain English | Not verified (the old URL now redirects) |
| UX & Workflow | [NN/g, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | One heading per heuristic, 1 to 10, with anchors | Verified |
| UX & Workflow | [NN/g, How to Conduct a Heuristic Evaluation](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) | Step 2: Evaluate Independently; Step 3: Consolidate Identified Issues | Verified |
| Mobile | [W3C, Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Reflowing websites and web applications | Verified |
| Mobile | [W3C, Understanding 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Exceptions: Spacing, Equivalent, Inline, User agent control, Essential | Verified |
| Accessibility | [W3C, WCAG 2.2](https://www.w3.org/TR/WCAG22/) | One success criterion per rule (10 passages verified word for word) | Verified |
| Accessibility | [W3C, ACT Rules](https://www.w3.org/WAI/standards-guidelines/act/rules/) | Rules by guideline; 6-character rule IDs | Verified (no axe-core mapping on the page) |
| Conversion | [ONS Design System, Button](https://service-manual.ons.gov.uk/design-system/components/button) | How to use this component; Primary (default) | Verified |
| Conversion | [GOV.UK Design System, Button](https://design-system.service.gov.uk/components/button/) | When to use this component; Start buttons | Verified |
| Conversion | [UK Parliament Design System, Button](https://designsystem.parliament.uk/components/button/) | | Not verified (HTTP 403) |
| Trust | [Stanford Guidelines for Web Credibility](https://credibility.stanford.edu/guidelines/index.html) | Guidelines 1 to 10 (exact wording; the page has no anchors) | Verified |
| Design & Brand | [Material Design 3, Applying type](https://m3.material.io/styles/typography/applying-type) | Type roles | Not verified (rendered by script) |
| Design & Brand | NN/g heuristic 4: Consistency and Standards | | Verified |
| Performance | [Chrome, Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) | How the Performance score is weighted; Why your score fluctuates | Verified |
| Performance | [web.dev, Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) | Largest Contentful Paint; Interaction to Next Paint; Choice of percentile | Verified |
| Performance | [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) | Field INP from Event Timing on real interactions | Verified |
| Differentiation | [Ipsos, Getting Brand Assets Right (2018)](https://www.ipsos.com/en/getting-brand-assets-right) | No sub-sections | Verified |
| Differentiation | [Ehrenberg-Bass, Building Distinctive Brand Assets (book listing)](https://marketingscience.info/learn-with-us/books) | Fame and Uniqueness grid is in the book, not on a public page | Not verified |

## Supplementary guidance (not cited as sources)

| Resource | Licence | Used for |
|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | critique and audit structure; typeset, layout and clarify as review lenses |
| [Vercel Agent Skills, web-design-guidelines](https://github.com/vercel-labs/agent-skills) | MIT | accessibility, focus, forms, typography, images, touch and interaction checklists |
| [Marketing Skills, cro and copywriting](https://github.com/coreyhaines31/marketingskills) | MIT | value proposition, headline, CTA, trust signals and objection handling order |

## Further credible sources to consider (not fetched in this session)

| Category | Source | Why |
|---|---|---|
| UX, Conversion | Baymard Institute, large-scale e-commerce and form usability research | Benchmarked findings for forms and checkout (already referenced by form rules) |
| Accessibility, Mobile | W3C WAI-ARIA Authoring Practices Guide | Expected keyboard and state behaviour for menus, dialogs and tabs (already used by MOB-008) |
| Conversion, UX | GOV.UK Design System, Error message and Error summary | Plain, specific error wording and placement |
| Trust | B. J. Fogg, Prominence-Interpretation Theory (Stanford Persuasive Technology Lab) | Why visible credibility cues matter only when noticed |
| Performance | Chrome UX Report (CrUX) methodology | How real-visitor (field) data is collected and aggregated |
| UX | ISO 9241-110, Interaction principles | International standard behind several heuristics (paywalled) |

Before any of these is cited by a criterion, fetch it, read the exact section and record it with `sectionVerified: true`.
