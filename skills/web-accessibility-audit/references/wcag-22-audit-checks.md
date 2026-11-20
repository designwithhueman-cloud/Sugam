# WCAG 2.2 Level A & AA + Interactive Widget Reference

> **Important:** WCAG 2.2 removed **SC 4.1.1 (Parsing)**. Do not cite 4.1.1 as a failure under WCAG 2.2.

---

## 1. Key Legal & Regulatory Baselines

| Jurisdiction / Law | Technical Standard | Key Scope |
| --- | --- | --- |
| **US ADA Title II** (State & Local Gov) | **WCAG 2.1 Level AA** | Public entities (compliance deadlines phased 2026–2027 by population) |
| **US Section 508** | **WCAG 2.0 Level AA** (aligning toward 2.1/2.2) | Federal agencies & contractors |
| **EU European Accessibility Act (EAA)** | **EN 301 549** (harmonized to WCAG 2.1/2.2 AA) | E-commerce, banking, transport, e-books, telecoms in the EU |
| **Ontario AODA (IASR)** | **WCAG 2.0 Level AA** (excluding live captions/audio desc) | Public & large private/non-profit orgs (50+ employees) in Ontario |

---

## 2. WCAG 2.2 New Criteria (Added in 2.2)

- **2.4.11 Focus Not Obscured (Minimum) (AA):** When a UI component receives keyboard focus, it is not entirely hidden by author-created content (sticky headers, footers, chat widgets, cookie banners).
- **2.5.7 Dragging Movements (AA):** Any functionality that uses dragging (sliders, kanban boards, map panning) must also work via single-pointer clicks/buttons without dragging.
- **2.5.8 Target Size (Minimum) (AA):** Interactive targets must be at least **24x24 CSS pixels**, or have sufficient spacing so a 24px circle centered on the target does not intersect adjacent targets (exceptions: inline links in text blocks, native unstyled controls).
- **3.2.6 Consistent Help (A):** If help mechanisms (contact link, chat, FAQ, phone) appear across multiple pages, they must appear in the same relative order.
- **3.3.7 Redundant Entry (A):** Information previously entered in the same multi-step process must be auto-populated or selectable rather than re-typed.
- **3.3.8 Accessible Authentication (Minimum) (AA):** Login flows must not require cognitive function tests (e.g., transcribing distorted CAPTCHAs or memorizing passwords without paste support) unless an alternative (passkeys, magic link, copy-paste, password manager support) is provided.

---

## 3. Speech & Voice Control Rules (WCAG 2.5.3 Label in Name)

- **Rule:** For any component with a visible text label (or image of text), the programmatic accessible name (`aria-label`, `aria-labelledby`, `<button>` text) **must contain the exact visible text string**.
- **Apple Voice Control Best Practice:** Visible text should appear at the **beginning** of the accessible name (e.g., `aria-label="Learn more about pricing"` passes when visible text is `"Learn more"`, whereas `aria-label="Pricing details - Learn more"` can fail prefix voice matching).
- **Automated Rule:** `axe-core` v4.14.0+ runs `label-content-name-mismatch` by default.

---

## 4. WAI-ARIA 1.2 APG Interactive Widget Contracts

### Tabs (`role="tablist"`, `role="tab"`, `role="tabpanel"`)
- **When to use ARIA Tabs vs. Links:** Use `role="tablist"` only when switching panels in-place without page navigation. If tabs navigate to separate URLs, use `<nav><ul><li><a href="..." aria-current="page">`.
- **Required Attributes:**
  - Container: `role="tablist"` (plus `aria-label` or `aria-labelledby`).
  - Each tab button: `role="tab"`, `aria-selected="true"` (active) or `"false"` (inactive), `aria-controls="<panel-id>"`, and **roving `tabindex`** (`tabindex="0"` on active tab, `tabindex="-1"` on inactive tabs).
  - Each panel: `role="tabpanel"`, `aria-labelledby="<tab-id>"`, `tabindex="0"` (if panel has no focusable children).
- **Keyboard Behavior:**
  - `Tab` enters the active tab, then next `Tab` moves into the active `tabpanel` (do NOT make users tab through every inactive tab).
  - `ArrowRight` / `ArrowLeft` (horizontal) or `ArrowDown` / `ArrowUp` (vertical) moves focus between tabs; `Home` / `End` jumps to first/last tab.

### Modal Dialogs (`role="dialog"`, `aria-modal="true"`)
- Moves focus inside the modal on open (`aria-labelledby` pointing to modal title).
- Traps `Tab` and `Shift+Tab` inside the modal until closed.
- Closes on `Escape` and restores focus to the trigger button that opened it.

### Comboboxes / Custom Dropdowns (`role="combobox"`)
- Input has `role="combobox"`, `aria-expanded="true|false"`, `aria-controls="<listbox-id>"`, and `aria-activedescendant="<active-option-id>"`.
- `ArrowDown` / `ArrowUp` highlights options (`aria-selected="true"`) and calls `scrollIntoView({ block: 'nearest' })`; `Enter` selects; `Escape` closes.

### Forms & Error Recovery (`3.3.1`, `3.3.2`, `3.3.3`, `4.1.3`)
- Every input has a programmatic `<label for="...">` (placeholder text alone fails `3.3.2`).
- Invalid fields set `aria-invalid="true"` and link error text via `aria-describedby="<error-id>"`.
- Dynamic error banners or toast alerts inject text into a **pre-mounted** `role="alert"` or `aria-live="polite"` container (`4.1.3`).
