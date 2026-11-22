# Avara launch scanner extension

Use Node 22+ in the existing scan worker. This pack supplies original, offline review skills, nine existing DIFF rule adapters and seven additional detector adapters. All results have zero scoring weight. The host keeps authority over permissions, rule versions, strict scoring, deduplication and rescan comparability.

## Run

```sh
node --test test.mjs launch/test.mjs
node fixtures/browser.mjs
```

The second command requires a local Playwright installation and its Chromium browser. Set CHROMIUM_PATH if using a system installation. Browser tests cover one triggering and one clean page at desktop and phone sizes. The unit suites use snapshots and analyzer records.

## Worker integration

```js
import {inspectPage} from './scanner.mjs';

// page is the existing, already settled Playwright page in its initial state.
// Supply the axe result from this exact navigation and viewport.
const report = await inspectPage(page, {
  pageId: stablePageId, axe: axeResults, references: approvedReferences,
  mapping: {pageType:'marketing', goal: confirmedActionSelector},
  brief: {locale:'en',headingFonts:['Inter'],avoidPhrases:['effortlessly unlock']},
});
```

Run once per captured viewport. All options are optional. Omitting missing inputs keeps the relevant check undecided. The goal selector should cover equivalent instances of the same action in responsive layouts. Set locale to the document language tag used by the owner. A phrase match is restricted to that exact locale. Copy sampling covers visible headings, paragraphs and alerts, up to 180 characters per excerpt. Provide errorSelector for confirmed visible error containers or rely on aria-invalid fields linked with aria-errormessage. Keep raw capture inside the worker. Return only authorized, relevant evidence to the viewer.

The adapter derives semantic section candidates from the page, recognizes English headings using launch/capture.json, and detects grouped cards from common markup. It automatically uses structural counts only when all visible direct children of a main landmark are recognized sections. For other pages use the existing scanner’s section classifier. Pass mapping.sections as [{kind,selector,cardSelector}] and completeSections:true only for a verified, complete main-content inventory. The fixture test demonstrates explicit mapping. Section class hints and style resemblance alone cannot identify the site’s builder.

Other optional inputs:
- hero with selectors {hero,heading,action,visual} reuses the DIFF-002 geometry capture.
- mapping.components maps design roles to selectors. mapping.alternative, claim, proof and brandCue scope individual DIFF probes. For trust, map a single claim to its specific supporting evidence.
- A reference contains {id,pageId,version,rights,origin,snapshot,designComplete,task}. Use the same capture schema and viewport as the target. Supply task for dashboard comparisons. Keep separate reference sets by page purpose, state and language. See test.mjs and launch/test.mjs for executable examples. The production reference set starts empty.
- The optional pattern summary links DIFF-001 and DIFF-009 without adding another issue. Its threshold is an editorial hypothesis. Close geometry, ordering or tokens imply resemblance only.
- Each launch/rules.json entry maps to a host rule family. Confirm the exact current owner by underlying probe before wiring (especially button-name). An existing axe or mobile repair must retain its owner. Attach new evidence to that repair using viewport, state, target and repair identity. Never add detector counts to rule counts. Preserve existing DIFF-010.
- Keep observed, needs-review, needs-person, not-applicable and not-run distinct. analyzer-finding records a specific axe violation, subject to the host verification policy. Observed means the sampled property was measured. A declared font family does not prove the font file loaded. Pointer hit samples do not prove end-to-end activation.
- The LCP probe observes an image candidate in the current navigation. Existing Lighthouse measurements remain the performance record. Keep candidate identity, loading attribute, lab timing and field metrics distinct. Avara’s Gemini workflow can draft wording asynchronously from one authorized finding and its rule template. This pack calls no model.

## Source map

launch/sources.json records every requested repository and supporting resource. The executable mapping for the seven new checks is launch/rules.json. The nine DIFF definitions include their underlying research in rules.json. Taste Skill and Impeccable inform scoped pattern critique, shadcn/ui and daisyUI supply component examples and clean controls, and Awesome Design Tools serves as a directory. The source material was reviewed on November 21, 2026. No upstream skill or install script executes during a scan. Numeric thresholds are Avara policy candidates.

## Accuracy before publication

Use an owner-approved, versioned corpus spanning agencies, SaaS landing pages, stores and dashboards. Include clean conventional layouts, responsive equivalents, translated content, documented brand exceptions, and missing-data cases. Keep domains and template families separate between tuning and evaluation. Have two reviewers label each rule, target and viewport independently; adjudicate disagreements. Report true and false flags, missed issues, insufficient evidence and human disagreement per detector, with denominators. For repeat scans verify the same element, role, state and viewport. Treat brand recall, perceived trust, conversion impact and authorship as unmeasured until the appropriate evidence exists.

## Paste into Claude Code

Integrate scanner.mjs on the existing desktop and mobile capture path. Map outputs to current rule IDs and repair owners. Reuse equivalent detectors and the installed DIFF-002. Persist actual evidence, explicit skip reasons and the active rule version. Keep new checks observation-only and preserve free/paid evidence access across API, export and reports. Run both test commands, then use the normal scan endpoint on triggering and clean fixtures. Verify report, rescan and plan gates. Report changed files, measured timings, false positives and unverified paths.
