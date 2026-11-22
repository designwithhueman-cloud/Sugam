# Avara Launch Scanner integration

Integrated 21 November 2026 on `dashboard-redesign`, uncommitted, on top of the earlier audit and launch work. The pack is in `vendor/avara-launch`, unchanged apart from `.claude/skills/` being moved to `skills/`.

## The 16 entries

The pack scores every entry at zero, and so does the integration. Launch rows are evidence stored beside a rule. They never count as a rule hit, a repair or part of a score.

| Entry (pack id) | Avara owner | Decision | Evidence | Test |
|---|---|---|---|---|
| DIFF-001 Template similarity | DIFF-001, `diff/template-sequence` | Blocked | Needs a complete section inventory and a documented reference page; the reference set is empty. Resemblance never implies AI authorship. | launch-pack, launch-integration ✓ |
| DIFF-002 Visual distinctiveness | DIFF-002 and the installed hero diagnostic | Reused | Hero geometry is kept; a comparison only runs against a reference at the same viewport | diff-002, diff-002-api ✓ |
| DIFF-003 Brand memorability | DIFF-003, `diff/brand-assets` | Reused | Recorded as "for a person": test unaided recall with intended visitors | launch-pack, launch-integration ✓ |
| DIFF-004 Dashboard sameness | DIFF-004, `diff/dashboard-pattern` | Blocked | Needs a confirmed page type and a dashboard reference for the same task | launch-pack ✓ |
| DIFF-005 Layout originality | DIFF-005, `diff/layout-archetypes` | Reused | The pack only counts layouts from a complete, recognised inventory; Avara's own read stays the record | value-detectors ✓ |
| DIFF-006 Visual system originality | DIFF-006 | Blocked | Needs mapped component roles and an approved reference | launch-pack, launch-integration ✓ |
| DIFF-007 Information hierarchy | DIFF-007 | Added | New evidence: the main action's area against competing actions on the same row. Competitors come from Avara's main-action probe. | launch-pack ✓ (not triggered on fixtures or bazzly.ai) |
| DIFF-008 Trust through design | DIFF-008 | Blocked | Needs one claim mapped to its own evidence | launch-integration ✓ |
| DIFF-009 Feature grid saturation | DIFF-009 (rule v1.1.0) | Improved | Repeated grids now go to a person, never a confirmed failure; pricing cards stay excluded | launch-integration (3 grids → needs a person; pricing → pass), value-detectors ✓ |
| `launch/button-name` (pack: A11Y-003) | **A11Y-015** (owns axe `button-name`) | Reused | The same axe run is used; A11Y-015 still reports it once | launch-integration (unnamed → analyzer finding; named → observed and pass) ✓ |
| `launch/lcp-image` (pack: PERF-004) | **PERF-001**, `perf/lcp-image-lazy` | Reused | Lighthouse stays the record; the in-page candidate is an observation only | launch-pack ✓ |
| `launch/font-role` | DESIGN-012 | Blocked | Needs the owner's brand brief (approved heading fonts) | launch-integration ✓ |
| `launch/voice` | PC-009, `pc/buzzwords` | Blocked | Needs the owner's phrases to avoid and the page locale | launch-integration ✓ |
| `launch/recovery` | UX-017 (rule v1.1.0) | Improved | Blaming wording ("you failed to") is flagged, matched on whole words, in visible linked errors | launch-integration (blaming → needs a person; calm → no wording flag) ✓ |
| `launch/cta` | CONV-001 (rule v1.1.0) | Improved | "learn more" and "go here" added to the vague-label list | launch-integration ("Learn more" → needs a person; specific → pass) ✓ |
| `launch/action-hit` | MOB-013 and the main-action repair (`action:*`) | Improved | The 320px pointer-hit sample is attached as evidence to the existing repair; it adds no finding | launch-integration (covered → needs review; hidden desktop copy with a mobile equivalent → observed, no block) ✓ |

## Fix writer

Rubrics are versioned data in `src/rubrics/fix-rubrics.json`:
- **copy-tone:** `button-name`, `link-name`, vague link text and similar rules.
- **visual-hierarchy:** looks-clickable, heading structure, small text and non-text contrast.

What is sent:
- Only rubric-mapped fixes are sent; technical fixes stay deterministic.
- Each request carries only the rubric in use, the visitor goal, the element, and a 300-character excerpt of its markup inside an untrusted `PAGE DATA` block.
- Screenshots are sent only for visual-hierarchy fixes. The keyboard trace is never sent.

What the model may change:
- The model may change the **Change** line only. Element, Verify, evidence, severity and outcome are kept.
- An answer is refused if it names an element, adds a check, contains a link, or is too short or too long.

When it runs:
- It runs after the report is saved.
- If Gemini is off, failing, slow (20 s timeout) or invalid, Avara's own fix stands, with a reason.

## Timings

All timings are taken on the same machine.

| Condition | First usable fix | Report complete | AI done |
|---|---|---|---|
| Fixture, Gemini stub at 4 s per call, **before** (3 runs) | 2.9–5.4 s | 20.9–24.0 s | 37.4–40.6 s |
| Same fixture and stub, **after** (3 runs) | 2.9 s | 15.7–16.5 s | 32.8–33.9 s |
| Fixtures with AI off, after (10 pages) | 3.4 s blocker on the covered page | 15.8–19.8 s | n/a |
| Real site bazzly.ai, live Gemini, after | no blocker on this page | 29.4 s | 31.5 s (free tier rate-limited: no AI verdicts) |

The launch pack itself takes 13–44 ms per viewport.

## Open items

- **Owner inputs:** the brand brief (heading fonts, phrases to avoid, locale), documented reference pages, claim-to-evidence mapping and a confirmed page type. Until they exist, these checks say "didn't run" with the reason.
- **Live Gemini not verified:** live Gemini rewording was not seen today because the free-tier quota was exhausted. It is verified with the stub only.
- **Share links:** they don't show launch checks. Exports don't include them.
- **Lighthouse:** it sometimes logs "Could not find any top level events" on tiny fixture pages. This happened before the integration too.
- **Accuracy corpus:** the pack calls for a labelled corpus with two reviewers before any threshold is trusted. That has not been done.
