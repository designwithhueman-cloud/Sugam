# Sugam

AI-powered accessibility review for public websites built with Lovable, Bolt.new, v0, Framer, Webflow or custom code. Paste a URL, pick a compliance target, and get a split-screen report: numbered pins on real screenshots, linked to prioritised findings with fixes in three formats.

## Run it locally

```bash
npm install
npm run build
npm start                      # http://localhost:3100  (set SUGAM_SECRET in production)
```

No Postgres, Redis or cloud storage is needed for local use: the app falls back to embedded PGlite (`.data/pglite`), an in-process queue and local file storage (`.data/objects`). Scans use your installed Google Chrome through Playwright (`SUGAM_CHROME_CHANNEL` to change it).

To try the bundled test site with known defects:

```bash
node fixture/server.mjs &                                   # http://127.0.0.1:4200
ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 npm start                # then scan http://127.0.0.1:4200/
```

`ALLOW_PRIVATE_HOSTS` is for local testing only. Leave it unset in production.

Scanner without the web app: `node scanner/cli.ts <url> [standard] [outDir]` (raw output) or `node scanner/cli-analyze.ts <url>` (grouped issues).

## Production configuration

| Variable | Effect |
|---|---|
| `DATABASE_URL` | PostgreSQL server (migrations in `drizzle/` run on start) |
| `REDIS_URL` | Queue scans with BullMQ; run `npm run worker` as a separate process (needs `DATABASE_URL` too) |
| `SUGAM_AI=on` | Enable the Claude API layer (billed per scan). Credentials come from `ANTHROPIC_API_KEY` or an `ant auth login` profile |
| `SUGAM_AI_MODEL` | Default `claude-opus-5-5` |
| `SCAN_CONCURRENCY` | Scans run at once (default 2) |
| `SCAN_RATE_LIMIT` | Scans per 10 minutes per visitor. Default 5 for anonymous visitors and 20 for signed-in users; setting it overrides both |
| `TRUST_PROXY` | Set to `0` to ignore `x-forwarded-for` when rate limiting. Otherwise the last entry (added by your proxy) is used |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turns on "Continue with Google". Create an OAuth client (type Web application) in Google Cloud and add `<your site>/api/auth/google/callback` as an authorised redirect URI |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Turns on "Continue with GitHub". Create an OAuth app in GitHub developer settings with the callback `<your site>/api/auth/github/callback` |
| `SUGAM_URL` | Public address of the site (for example `https://sugam.example`), used to build the callback address behind a proxy. Defaults to the address of the request |
| `SUGAM_INSECURE_COOKIES=1` | Allow the session cookies over plain http when `NODE_ENV=production` (local testing only) |
| `STORAGE_DIR`, `PGLITE_DIR` | Where screenshots (default `.data/objects`) and the embedded database (default `.data/pglite`) live |

## How a scan works

1. **Intake** (`app/api/scans`): validates the URL (public http/https, ports 80/443, no private or internal addresses) and queues a job.
2. **Scanner** (`scanner/scanner.ts`): headless Chrome at **desktop 1280×800** and **mobile reflow 320×640** (320 CSS px, equivalent to 400% zoom). For each viewport:
   - axe-core 4.14 with the target's tags, keeping both `violations` and `incomplete` (contrast over images and gradients is not thrown away), including `label-content-name-mismatch` (WCAG 2.5.3).
   - Heuristics for AI-built sites (`scanner/inpage.ts`): repeated ambiguous CTA labels, clickable `div`/`span` (detects inline, React and Vue click handlers), ARIA tablist structure plus a real arrow-key and Tab test, reduced-motion handling (animations still running with `prefers-reduced-motion: reduce`), and content that overflows 320px.
   - More WCAG checks axe-core does not run (`EXTRA` in `scanner/inpage.ts`), by the six ways people use the web. **Zoom:** text spacing that clips text (1.4.12), very small text. **Keyboard:** Tab that changes the page (3.2.1), drag-only controls (2.5.7), positive `tabindex` (2.4.3), `autofocus`, new-tab links with no warning. **Screen readers:** missing `<main>`, heading structure, vague link text ("click here"), placeholder-only fields (3.3.2). **Captions and motion:** autoplaying video with no controls (2.2.2). **Voice control:** spoken name that does not start with the visible words (2.5.3, best practice). **High contrast:** field outlines under 3:1 (1.4.11) and `forced-color-adjust: none`. **Sign-in:** blocked paste, autofill off and CAPTCHAs (3.3.8). Most land in "Needs Human Verification"; only blocked paste and a Tab that navigates away are confirmed. Each has a planted defect and an accessible look-alike in `fixture/site` (`test/scanner-accuracy.mjs`).
   - Speech in media: `<audio>` and `<video>` with no transcript link nearby (silent background videos are skipped), and embedded YouTube, Vimeo, Wistia, Loom and podcast players, which run in their own frame and are sent to a person for a captions check.
   - Keyboard trace: 25 Tab presses, recording the focused element, focus-indicator CSS (element, pseudo-elements and parent, focused vs blurred) and whether fixed or sticky content covers it (WCAG 2.4.11).
   - Full-page screenshot plus `getBoundingClientRect()` document coordinates for every flagged element.
   - All browser traffic goes through a local **egress proxy** (`scanner/egress-proxy.ts`) that resolves and checks every destination, including redirect hops, and connects to the checked IP, so a site cannot steer the scanner at internal services or cloud metadata.
3. **Analysis** (`analysis/analyze.ts`): merges instances across viewports, groups repeats by markup shape into one component issue, assigns Critical/Serious/Moderate/Minor, and sorts everything into **Confirmed Failures**, **Needs Human Verification** and **Verified Passes**. Findings outside the selected standard (for example WCAG 2.1 criteria under AODA) are excluded and counted.
4. **Fixes** (`analysis/fixes.ts`): for each issue an AI-builder prompt (Lovable, Bolt.new, v0, Cursor), Framer and Webflow steps, and a native-HTML-first before/after patch. "Before" is always the verbatim extracted HTML; `[bracketed]` placeholders mark wording only the owner can supply. Contrast fixes compute a real compliant colour from axe's measurements.
5. **AI layer** (`analysis/claude.ts`, optional): sends the grouped findings, verbatim HTML, keyboard trace and viewport screenshots to Claude with the `web-accessibility-audit` skill (`skills/`) as instructions, using structured output. Claude may refine explanations, severity and fixes; it cannot add issues, change buckets, or replace the extracted HTML.

## Categories and pillars

`lib/groups.ts` sorts every issue into one of 11 groups, rolled up into four pillars (Reports has a pillar filter; the dashboard shows open issues per pillar):

| Pillar | Groups |
|---|---|
| Visual and contrast | Colors and contrast, Layout and zoom, Motion and timing |
| Speech and voice | Voice and speech (label in name 2.5.3, captions, transcripts, embedded media) |
| Keyboard and tab flow | Keyboard and focus |
| Screen readers and semantics | Names and labels, Images, Forms, Links, Structure, Language and page |

## Public site

`/` is the landing page and every other public page (`/website-accessibility-checker`, `/login`, `/signup`, `/scans/[id]`, `/share/[token]`, `/upgrade`, `/privacy`, `/terms`) lives in the `app/(site)` route group, which wraps it in the same Sunbeam frame, header and footer (`components/landing/Shell.tsx`). The dashboard under `/app` has its own sidebar, on the same colour tokens. The old forest-green names (`pine-*`) in `app/globals.css` are now a neutral ramp, so existing classes follow the new design; violet is the focus ring everywhere.

- **Free result:** score, severity counts, the top issues in plain language (`lib/plain.ts`), and **one finding opened completely**: its first three elements, a builder prompt and the code change (`lib/unlocked.ts`, `components/report/UnlockedFixCard.tsx`). A free account lists every issue type. Everything else needs a paid plan.
- **Waiting list:** checkout is not connected, so `/upgrade` takes an email (`waitlist` table, `joinWaitlistAction`). Prices in `lib/plans.ts` are placeholders.
- **Legal:** `/privacy` and `/terms` describe what the software does today. Set `NEXT_PUBLIC_CONTACT_EMAIL` to show a deletion contact. Have a lawyer review both before launch.
- **Motion:** the hero intro plays once and ends within 5 seconds, and small icons pop in as they scroll into view. The one looping animation is the "Fix it where you build" row, which has a visible Pause button, pauses on hover, and under `prefers-reduced-motion` does not move at all (the tools wrap into a static grid and the button is hidden).
- **"Fix it where you build" row (`lib/platforms.ts`, a static list):** only platforms with a basis stay. Real sites on WordPress, Webflow, Framer, Shopify, Next.js, React, Astro, Vue and Svelte were scanned end to end; Wix, Squarespace and Replit were removed until a real site on each has been scanned.

## Plans and entitlements

`lib/plans.ts` is the single source for plan names, prices, limits and what each plan unlocks; the pricing table, the upgrade page and the locked views all read it. `lib/entitlements.ts` applies it on the server: `loadReport` redacts a free-plan report (no elements, HTML, screenshots or repairs) before it reaches any page, and screenshots, exports, share links, review decisions, branding, members, before/after and site and client counts are checked in their routes and actions.

| Plan | Unlocks |
|---|---|
| Free instant check | Issue types, severity, element counts, WCAG criteria, who an issue may affect. One site. |
| Creator / Startup ($19, placeholder) | Exact elements and screenshots, repairs in three formats, rescans with before/after, review decisions, CSV and SARIF. One site. |
| Agency Pro ($149, placeholder) | Up to 15 sites across client workspaces, branded read-only client links, team members. |

Checkout is not connected: a workspace's plan is set with `node scripts/set-plan.ts <slug> <free|site|agency>`. **Stop the web server first.** Embedded PGlite allows one process at a time; opening it from two processes corrupts it.

## Tests

With the app running (`npm start`) and Chrome installed: `node test/scanner-accuracy.mjs` (false positives and planted defects, needs the fixture server), `node test/crawl.mjs` (every page, desktop and phone: console errors, overflow, axe), `node test/audit-real-sites.mjs <outDir>` (the real-site accuracy audit; run sparingly), `node test/landing.mjs` (both journeys: submitting a URL and completing the sample repair, on desktop, at 320px and with the keyboard only; reduced motion; how-it-works steps; copy actions) and `node test/gating.mjs <free|site|agency>` (what the server returns for the test workspace's plan). `node test/setup-test-account.mjs` creates the local test account, a site and a first scan.

## Design

Earth palette defined in `app/globals.css`: canvas `#FAF8F5`, card surface `#F1EDE4` with `#D5CFC2` borders, Deep Forest Pine `#143326` (Tailwind `pine-900`), Moss `#23533E` (`pine-700`), Terracotta `#9E472A` for critical, ink `#1C2420`. Every focusable element gets a 3px pine outline with a 2px sand gap (inverted inside `.on-dark` surfaces). Landing page pricing (`app/page.tsx`, `PLANS`) is placeholder copy; billing is not built.

## Data model

`drizzle/0000_init.sql` (from `lib/db/schema.ts`): `organizations` (with white-label brand fields) → `clients` → `projects` (live and staging URLs) → `scans` → `scan_viewports` (screenshots, keyboard trace, raw axe JSON pointer) → `issues` (component-level) → `issue_instances` (verbatim HTML) → `bounding_boxes` (per viewport). Plus `share_links` (hashed tokens) and `exports`.

## Public site

- `/`: landing page. `/website-accessibility-checker`: free checker. Both let anyone start a scan without an account.
- An anonymous scan is tied to the browser by an HMAC-signed, HttpOnly claim cookie (`SUGAM_SECRET`, or a random secret saved in `.data/secret`). That browser sees progress and a teaser (score, severity counts, top three issues). Signing up or logging in attaches the scan to the account and opens the full report. A claim never unlocks screenshots, exports or share links.

## Accounts and dashboard

- Email and password accounts (scrypt), sessions as hashed tokens in an HttpOnly, SameSite=Lax cookie; server actions plus an Origin check on mutating API routes.
- Sign-up creates a personal workspace. Workspaces hold clients and sites (projects) with live and staging URLs; members are owner, admin or member.
- `/app/[org]`: dark sidebar with a site switcher. **All sites** overview, **Dashboard** per site (verification coverage, fix-first list, issues by fix type and severity, change since last scan), **Reports** (Issues and Pages tabs; Group, Severity, Fix type, WCAG and Result filters; sortable table; each row expands to the AI-builder prompt, Framer/Webflow steps and code patch; share full or filtered read-only links; CSV and SARIF), **Accessibility scanner**, **Before and after**, and **Workspace settings** (branding, members, clients).
- **Human verification:** anyone in the workspace can mark a finding "real issue" or "not an issue" with a note. Decisions are stored per site and component, so they carry over to later scans, and they drive the dashboard's "Human verified" level.

## Report UI

`/scans/[id]`: the Visual Pin Viewer on the left (desktop/mobile switch, numbered colour-coded boxes, dashed outlines for items needing review) and findings on the right. Clicking a pin focuses its card; "Show on screenshot" scrolls to the pin and pulses it; multi-instance issues step through instances. Pins are real buttons with labels, and changes are announced to screen readers. `/share/[token]` is the same report read-only, for clients. CSV and SARIF 2.1.0 exports are at `/api/scans/[id]/export?format=csv|sarif`.

## Verified so far

**Fixture site.** Every planted defect is found at the expected viewports in about 8 seconds, the full job runs on PGlite, and private addresses, non-standard ports and a redirect to `169.254.169.254` are blocked. `node test/scanner-accuracy.mjs` also scans `fixture/site/accurate.html`, a page built to trip the false positives listed below, and requires zero findings from them.

**Real sites (accuracy audit).** 32 public pages were scanned once each (government, news, docs, SaaS, ecommerce, AI-builder marketing sites); 30 completed, and 2 refused automated browsers with HTTP 403 (the scan reports that plainly). Reading the evidence by hand found these false-positive classes, all fixed:

| Class | Cause | Fix |
|---|---|---|
| "No visible focus" on web components (MDN) | Focus stays on the shadow host; the ring is drawn inside | Evaluate the real focused element inside the shadow root |
| "Clickable element is not a button" on wrappers (Stripe, Linear, Slack) | A click handler on a container around a real link or button (delegation, tooltips) | Skip containers that hold a focusable control; skip roving-tabindex radios, options and menu items |
| Repeated button labels (MDN, Wikipedia) | A menu button and a link sharing a label, or one destination written two ways | Compare links with links and buttons with buttons; ignore a trailing slash or #fragment |
| Focus style missed on script-driven rings | The unfocused style was read before the page updated | Wait a frame after blur |
| 50 to 120 "needs review" contrast items per page | One item per element for contrast axe could not measure | One item per reason (image, gradient, overlap); digits and symbols are not text |

Before and after on the same pages: MDN 36 to 67, Stripe 9 to 17, Vercel 39 to 61, and "needs review" types dropped from 119 to 34 (Linear), 61 to 12 (Stripe) and 50 to 13 (Tailwind). That shows the fixes remove noise. It does not prove the rest is right: 4 to 5 findings per rule were read by hand, not every finding.

**Still unverified:** the Claude layer and the BullMQ path (no key, no Redis), sites behind sign-in, and anything beyond one page per site.

## Not built yet

- **Account recovery and invites.** No email verification, password reset or email invitations; members must already have an account.
- **Billing.** No plans or payments.
- **PDF and DOCX white-label exports.** Only CSV and SARIF exist; brand fields are shown on shared reports.
- **S3 storage driver.** Only the local driver exists; `lib/storage.ts` is the seam.
- **Not exercised:** the Claude API layer (no key was used, to avoid charges) and the BullMQ worker path (no Redis here). Real sites were audited once each (see Verified so far), not continuously.
- **Scanner limits:** single page per scan (no crawl); pages taller than 12,000px are cut off; fixed elements such as cookie banners appear once in full-page screenshots; content behind sign-in is not reachable.
