# Web Accessibility Audit Report

**Target:** [URL / Application Name]  
**Audit Date:** [YYYY-MM-DD]  
**Compliance Standard:** [WCAG 2.2 Level AA / ADA Title II / EAA / AODA]  
**Assessment Method:** Automated DOM/ARIA scan (`axe-core`), viewport reflow (`1280px` & `320px`), keyboard traversal trace, visual screenshot inspection, and manual verification triage.

---

## 1. Executive Summary & Scorecard

| Severity | Confirmed Issues | Affected Components | Primary User Groups Impacted |
| --- | --- | --- | --- |
| **Critical** | [0] | [List] | [Screen reader / Keyboard users] |
| **Serious** | [0] | [List] | [Low vision / Voice control / Keyboard] |
| **Moderate** | [0] | [List] | [All assistive tech users] |
| **Minor** | [0] | [List] | [Usability / Best practice] |

### Conformance Status Breakdown
- **Confirmed Failures:** [Count] issues verified via DOM, keyboard, or visual evidence.
- **Verified Passes:** [Summary of passed automated & structural checks].
- **Needs Human Verification:** [List checks requiring manual review: e.g., video captions, alt-text semantic accuracy, real NVDA/VoiceOver screen-reader testing, complex cognitive flows].

---

## 2. Prioritized Findings & Code Remediation

### [ISSUE-01] [Short Descriptive Title]
- **Severity:** [Critical / Serious / Moderate / Minor]
- **WCAG Criterion:** [e.g., SC 2.5.3 Label in Name (Level A)]
- **Affected Component / Selector:** `[verbatim CSS selector or component name]` ([X] instances)
- **User Impact:** [Explain clearly how this blocks or degrades experience for visual, speech/voice-control, keyboard, screen-reader, or cognitive users.]
- **Verbatim Evidence:**
  ```html
  <!-- Paste exact HTML snippet or computed accessibility tree output from scan -->
  ```
- **What to Change:** [Concise plain-English summary of the required fix.]
- **How to Fix It (Recommended Code):**
  ```html
  <!-- Native-HTML-first accessible implementation -->
  ```

---

## 3. Manual & Assistive Technology Verification Checklist

- [ ] **Screen Reader Flow (NVDA / VoiceOver / JAWS):** Verify headings, landmarks, modals, and dynamic error announcements read logically.
- [ ] **Media Alternatives (`1.2.1`–`1.2.5`):** Verify synchronized captions and audio descriptions on all video/audio content.
- [ ] **Alt-Text & Contrast Context (`1.1.1`, `1.4.3`):** Verify informative images have meaningful descriptions and text over hero/gradient images meets 4.5:1 contrast.
- [ ] **Cognitive & Authentication (`3.3.8`):** Verify login/MFA flows allow password paste/passkeys without mandatory puzzle CAPTCHAs.
