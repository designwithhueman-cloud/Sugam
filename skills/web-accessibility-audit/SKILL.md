---
name: web-accessibility-audit
description: Conduct structured WCAG 2.2 Level AA website accessibility audits combining automated Playwright/axe-core scans, keyboard/tab interaction checks, voice-control label-in-name validation, visual reflow inspection, and developer remediation patches. Use when auditing websites, web apps, UI components, or HTML/CSS/ARIA code for accessibility compliance (WCAG 2.2, ADA Title II, EU EAA / EN 301 549, Ontario AODA).
---

# Web Accessibility Audit Skill

Execute a thorough, evidence-grounded accessibility audit following the **W3C WCAG-EM 2.0** methodology and **WCAG 2.2 Level AA** standard.

## Core Operating Rules

1. **Evidence-Only Grounding:** Never invent DOM selectors, HTML snippets, contrast ratios, or WCAG criterion numbers. Every issue must cite verbatim HTML, computed accessible names, CSS properties, or screenshot evidence from the scan artifacts.
2. **Inspect Both `violations` and `incomplete`:** When reviewing `axe-core` output, evaluate both `violations` (confirmed deterministic failures) and `incomplete` (items needing contrast/contextual review, such as text over background images or gradients).
3. **Never Claim 100% Automated Conformance:** Automated rules cover roughly 30%–57% of accessibility barriers. Always categorize findings into:
   - **Confirmed Failure** (verified by deterministic rule, DOM inspection, keyboard trace, or screenshot)
   - **Verified Pass** (tested and confirmed working)
   - **Needs Human Verification** (subjective or real assistive-technology checks such as alt-text accuracy, caption quality, cognitive clarity, and live NVDA/VoiceOver/JAWS testing)
4. **Native HTML First:** Recommend semantic HTML (`<button>`, `<a href>`, `<label>`, `<nav>`, `<dialog>`) before adding ARIA attributes. Never recommend third-party accessibility overlay widgets as a compliance fix.
5. **WCAG 2.2 Currency:** Note that **SC 4.1.1 (Parsing)** was removed in WCAG 2.2; never cite 4.1.1 as a WCAG 2.2 failure.

---

## 5-Step Audit Workflow

### Step 1: Define Scope & Target Standard
Confirm or establish:
- **Target URL(s) / Templates:** Homepage, navigation/header/footer, search/listing views, interactive widgets (tabs, modals, dropdowns), and primary forms/checkout.
- **Compliance Baseline:** Default to **WCAG 2.2 Level AA** unless the user specifies **ADA Title II** (WCAG 2.1 AA), **EU EAA / EN 301 549**, or **Ontario AODA** (WCAG 2.0 AA).

### Step 2: Gather Deterministic & Visual Telemetry
- If running in an environment with Node.js and Playwright available, execute `scripts/audit-page.mjs <url> ./audit-output` to collect desktop (`1280x800`) and mobile reflow (`320x640`) `axe-core` JSON, tab-order traces, and PNG screenshots.
- If the user provides HTML/React/Vue code, `axe-core` JSON, Playwright accessibility trees, Guidepup screen-reader logs, or screenshots directly, inspect all attached artifacts before writing conclusions.

### Step 3: Evaluate Across All 6 Accessibility Pillars
Read `references/wcag-22-audit-checks.md` for exact criteria and keyboard contracts, then evaluate:
1. **Perceivable & Visual (`1.x`):** Alt text (`1.1.1`), headings/landmarks (`1.3.1`), meaningful sequence (`1.3.2`), color-only cues (`1.4.1`), text contrast 4.5:1 / 3:1 (`1.4.3`), non-text/UI component contrast 3:1 (`1.4.11`), text resize 200% (`1.4.4`), and 320px CSS reflow without 2D scrolling (`1.4.10`).
2. **Keyboard, Tabs & Focus (`2.1.x`, `2.4.x`):** Full keyboard operability (`2.1.1`), no keyboard traps (`2.1.2`), bypass blocks/skip link (`2.4.1`), logical focus order (`2.4.3`), descriptive link purpose (`2.4.4`), visible focus ring (`2.4.7`), and **Focus Not Obscured** behind sticky headers, modals, or cookie banners (`2.4.11`). Verify WAI-ARIA APG patterns for tabs (`role="tablist"`/`"tab"`/`"tabpanel"`, roving `tabindex`, Left/Right arrows vs. `<nav><a href>` route tabs), modals (focus trap + `Escape` + focus return), and comboboxes (`aria-activedescendant`).
3. **Speech & Voice Control (`2.5.3`, `2.5.7`, `2.5.8`):** Check **Label in Name (`2.5.3`)**—visible label text must appear inside the programmatic accessible name (`aria-label` / `aria-labelledby`), ideally at the start for Apple Voice Control compatibility. Check dragging alternatives (`2.5.7`) and minimum `24x24` CSS pixel target size/spacing (`2.5.8`).
4. **Understandable & Forms (`3.x`):** Page `lang` (`3.1.1`), predictable focus/input behavior (`3.2.1`, `3.2.2`), consistent help (`3.2.6`), visible labels/instructions (`3.3.2`), programmatic error identification (`3.3.1` via `aria-invalid="true"` + `aria-describedby`), error suggestions (`3.3.3`), and redundant entry avoidance (`3.3.7`).
5. **Robust & Screen Readers (`4.1.2`, `4.1.3`):** Valid roles, states, and accessible names on custom controls (`4.1.2`), and pre-mounted `aria-live` status regions for dynamic notifications (`4.1.3`).
6. **Manual Verification Checklist:** Flag items requiring human sign-off (video captions/audio description `1.2.x`, alt-text meaning, real NVDA/VoiceOver/JAWS screen-reader flow).

### Step 4: Triage Severity & Deduplicate by Component
Group repeated template errors (e.g., 40 product cards missing alt text = 1 component issue affecting 40 instances) and classify severity:
- **Critical:** Completely blocks task completion or traps keyboard/screen-reader users (e.g., keyboard trap, unlabeled submit button, inaccessible modal).
- **Serious:** Creates major barriers requiring difficult workarounds (e.g., missing focus indicator, contrast < 4.5:1 on primary text, voice-control label mismatch, unassociated form errors).
- **Moderate:** Causes friction or confusion (e.g., skipped heading levels, missing skip link, target size < 24x24px).
- **Minor:** Best-practice or low-impact polish issues.

### Step 5: Generate the Report & Code Fixes
Format the final output using `assets/audit-report-template.md`, providing an executive scorecard followed by component-level findings with exact **What to Change** and **How to Fix It (Before/After code)** instructions.
