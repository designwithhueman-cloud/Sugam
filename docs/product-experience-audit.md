# Avara product experience audit

**Audit question:** can a first-time builder understand what Avara will do with their URL, get a useful fix, apply it, and check the result?

**Short answer:** yes, for a single public page, with three caveats. Nothing is scored yet. The AI review depends on a free-tier Gemini key that is slow and often rate-limited. Several pricing-page promises are marked "Planned" or exist only in part. The isolation between workspaces held up under every test we ran. Three serious gaps were found and fixed. When Gemini rewrote a fix, the builder lost the "How to check it" step. Share links could not be revoked. Anonymous scans were not limited in practice. The remaining items are deployment and policy decisions for the owner (section 8).

## 1. What was tested

| | |
|---|---|
| Repository | `sugam/`, branch `dashboard-redesign` |
| Base revision | `7ee1639` |
| Working tree | Not committed. 62 modified and 17 untracked paths on top of `7ee1639`. These cover strict scoring, report-first AI, the early blocker, the progress page, the not-run reasons, Gemini, the brand, the checker page, tests, and this audit's fixes. `_d2.mjs` and `.claude/` belong to other sessions and were left alone. |
| Build | `next build` (Next.js 16.4.6), production `next start` |
| Database | PGlite. Each test server used its own disposable copy (`db-sec`, `db-final`). The shared dev DB was never mutated by the security tests. |
| Accounts | Synthetic only: `agency-test@` (Agency Pro, workspace `test-agency`), `site-test@` (Creator / Startup) and `free-test@` (Free), all `@example.com`, plus an anonymous browser context |
| Target pages | Local fixture site on `127.0.0.1:4200` (`fixture/site`). Only the timing runs used a real site. |
| AI | Test servers ran with `AVARA_AI=off`, or against a local Gemini stub (`test/support/gemini-stub.mjs`, 4 s per call). The live Gemini figures come from the shared server on port 3100 with the real key (model `gemini-3.5-flash`, free tier). |
| Live or stubbed | **Live:** browser, axe-core, keyboard trace, detectors, storage, auth, plan gates, share links, URL guard, egress proxy. **Stubbed:** Gemini in the automated tests. **Not present:** PageSpeed Insights (it lives in another session's worktree, not in this build). |

## 2. Feature inventory

Statuses: **Verified** means a test in this tree exercises it against a running server. **Partial** means it works but is incomplete, or is checked only by reading the code. **Planned** means it is promised in copy or the schema but not built. **Unverified** means it was not exercised.

| Area | What exists | Routes / files | Evidence | Status |
|---|---|---|---|---|
| Landing | Hero scan box, four "what we check" cards, example repair, pricing, FAQ, footer with the new logo and tag line | `app/page.tsx`, `components/landing/*` | `test/landing.mjs` (110 checks, desktop and mobile) | Verified |
| Checker page | Scan box, facts strip, tabbed "four questions" explorer generated from the rule library, result labels, standards, steps, FAQ | `app/(site)/website-accessibility-checker/page.tsx`, `CheckExplorer.tsx`, `lib/check-catalog.ts` | `landing.mjs` checker section; keyboard tablist checked by hand | Verified |
| Pricing | Free, Creator / Startup ($19, marked "Planned: whole-site scanning"), Agency Pro ($149); waiting list | `lib/plans.ts`, `waitlist` table | `landing.mjs`, `gating.mjs` | Verified (copy). No payment exists: plans are assigned in the DB. |
| Accounts | Email and password (salted hash), sessions, login and sign-up throttles; Google and GitHub OAuth with state, PKCE and verified email only | `app/actions.ts`, `lib/auth.ts`, `lib/oauth.ts`, `app/api/auth/[provider]/*` | `test/auth.mjs` (fake provider); OAuth code reviewed | Verified (password). OAuth is Partial: tested only against the fake provider, since no real client IDs are configured. |
| Workspaces | Organisations, roles (owner, admin, member), clients, projects, branding (name and colour) | `lib/access.ts`, `app/app/[org]/*` | `workspace-evidence.mjs`, `security.mjs` | Verified. Brand logo upload: Planned (`brandLogoKey` is unused). |
| Dashboard | Overview, projects, reports table, shared reports, settings | `app/app/[org]/*`, `components/dashboard/*` | `workspace-evidence.mjs`, `gating.mjs` | Verified |
| Scanner | Headless Chromium at 1280px and 320px; axe-core for the chosen standard; 25-step keyboard trace; Avara detectors; screenshots; egress proxy | `scanner/scanner.ts`, `scanner/egress-proxy.ts`, `scanner/avara*.ts` | `scanner-accuracy` (72), `detectors` (43), `value-detectors` (59), `cta-regression`, `detector-pack*` | Verified |
| Early blocker | A covered main action at 320px is saved and shown, with its fix, while the scan is still running | `lib/jobs.ts` `saveEarlyBlocker`, `app/api/scans/[id]/early-shot`, `ScanProgress.tsx` | `report-first.mjs`: blocker at 2.8 s | Verified |
| Rule engine | 10 explicit not-run reasons with remedies; AI rules marked pending, then filled in | `lib/avara/*`, `RuleEvaluator.ts`, `lib/coverage-copy.ts` | `rule-engine` (31), `not-run-reasons` (10), `coverage` (29) | Verified |
| Scoring | Strict eligibility. Today no rule is score-eligible, so every surface shows "Not scored" with a reason. | `lib/avara/scoring.ts`, `lib/score-display.ts` | `scoring.mjs` (9), `journey.mjs` | Verified (behaves as designed). Product decision D1. |
| AI (Gemini) | Rule judgement and fix writing; report first, AI after; 15-minute timeout; "no answer" and "unavailable" reasons | `GeminiClient.ts`, `analysis/claude.ts` | `gemini-path.mjs` (10) with the stub; live runs on port 3100 | Verified against the stub. Live: Partial (free-tier 429s). |
| Reports | Review board: tabs per category, severity filter, the first fix, why-not-run lists | `components/report/*`, `lib/report.ts`, `lib/review-view.ts` | `journey`, `fixpanel` (10), `workspace-evidence` | Verified |
| Fixes | Prompt for the builder, code, and "How to check it" | `analysis/fixes.ts`, `FixPanel` | `fixpanel`, `journey` | Verified |
| Rescans | Rescan with Fixed only on positive evidence; the original report is unchanged | `scanner/avara-verify.ts`, `app/api/scans/[id]/rescan` | `journey.mjs`: the covered button is Fixed and the original is unchanged | Verified |
| Compare | Before and after for two scans of a project | `lib/compare.ts` | `gating.mjs` "before and after" | Verified (gate). Content: Partial. |
| Sharing | Agency-only read-only links; token stored as a hash; 90 days; **revocable (new)** | `app/api/scans/[id]/share`, `app/(site)/share/[token]`, `app/app/[org]/shared` | `security.mjs` (create, open, made-up token, revoke, cross-origin) | Verified |
| Exports | CSV and SARIF for paid plans | `app/api/scans/[id]/export` | `gating.mjs`, `security.mjs` | Verified (CSV). SARIF: Partial (route only). |
| Knowledge / patterns | Cross-scan aggregate patterns; public read API of percentages and rule IDs | `knowledge`, `patterns`, `app/api/knowledge/patterns` | Code reviewed | Partial |
| Usage analytics | None | | | Planned (asked earlier; not built) |
| PageSpeed Insights | Not in this build; Lighthouse runs locally through the egress proxy | `scanner/perf.ts` | | Planned for this branch |
| Account and scan deletion | None; the privacy page says so | | | Planned. Decision D4. |

## 3. Journeys

| Journey | Desktop | Mobile (375 / 320) | Loading | Empty | Error | Success | Evidence |
|---|---|---|---|---|---|---|---|
| Signed-out visitor: landing, scan, progress, report, first fix | ✓ | ✓ | Stage list with percent and animation; early blocker card | n/a | Bad URL gives a plain 422 message; blocked redirect is now reported as blocked (F3) | One fix open with prompt and "How to check it"; totals visible | `landing`, `journey`, `report-first` |
| Free builder: own report | ✓ | ✓, no horizontal scroll | as above | | Locked items say "paid plan" | **One finding opened with its fix, plus the totals: "16 issues", "7 recommended fixes", "9 observations"** | `gating free` (12), manual run below |
| Free builder: screenshots, export, share | | | | | All answer **402** from the server; the review API withholds evidence | | `security.mjs` |
| Paid member (Creator / Startup) | ✓ | | | Empty projects, reports and shared pages show a note | | Every row opens its fixes; screenshots and CSV are 200; share is 402 (Agency only) | `gating site` (11) |
| Agency member | ✓ | | | "No reports shared yet." | | Share, open read-only, revoke | `gating agency` (12), `security.mjs` |
| Rescan after a fix | ✓ | | | | | Fixed on positive evidence; original unchanged | `journey.mjs` |

Manual free-plan run on port 3400 (scan `149ac034…`) at 1280 and 375 px: header "7 recommended fixes · 9 observations · not scored"; one "Fix this first" card; category tabs with counts (All 16); no horizontal scroll at 375 px.

## 4. Speed

Time to the first usable fix is measured separately from time to the final report.

| Condition | First usable fix (early blocker) | Report usable | AI review complete |
|---|---|---|---|
| Fixture page with a covered "Book a call", Gemini stub 4 s per call (`report-first.mjs`, final build) | **2.8 s** (scan still running) | 20.3 s | 37.6 s |
| Same, real Gemini free tier, port 3100 | 3.7 s | 18 s | 48 s |
| Before report-first (earlier in this session, real site) | none until the end | about 3.7 min | about 3.7 min |

Conditions: one MacBook, local fixture, one scan at a time, warm browser. Real sites are slower, and free-tier Gemini adds 429 retries. A page with no covered main action has no early blocker, so its first fix arrives with the report.

## 5. Findings

Ordered by severity. "Fixed" items have before and after evidence in section 6.

| # | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F0 | High | Fix and verify journey | When the AI step was on, Gemini's free-form `ai_builder_prompt` replaced Avara's structured prompt. The `Element:`, `Change:` and `Verify:` lines disappeared, so the fix panel's **"How to check it" was empty** and the copied prompt no longer named the element. This breaks "apply it and verify the result" for every AI-enriched fix. It was caught only because the final suite ran with the live Gemini key (`fixpanel`: "330 characters", "Copy prompt copies the whole prompt" both failed). | **Fixed:** the model may reword the `Change:` line only; Fix, Element and Verify always stay (`analysis/claude.ts` `apply`). New offline test `test/fix-enrichment.mjs`. |
| F1 | High | Abuse | The anonymous scan limit (5 per 10 minutes per IP) could be bypassed by sending a different `X-Forwarded-For` value on each request. `clientIp` trusts the header unless `TRUST_PROXY=0`. Each scan launches a browser, so this is a cheap way to exhaust the server. | **Fixed (bounded):** a per-process ceiling on all anonymous scans (`ANON_SCAN_CEILING`, default 60). The header trust itself is decision D2. |
| F2 | High | Privacy | Share links could not be revoked. `revokedAt` existed and was enforced, but nothing set it. A client link sent by mistake stayed live for 90 days. | **Fixed:** "Stop sharing" on Shared reports; revoked links and their screenshots return 404 |
| F3 | Medium | Scanner | A redirect to a private address was blocked by the egress proxy, but the scanner looked for the old "Sugam egress policy" text. The builder saw "the site answered 403" instead of "blocked". | **Fixed** (`scanner/scanner.ts`) |
| F4 | Medium | Security | The export route checked the plan before access. A non-member got 402 instead of 404, which confirmed that a scan ID existed. | **Fixed** (`app/api/scans/[id]/export/route.ts`) |
| F5 | Medium | Abuse | Project scans (dashboard "Scan now") had no rate limit. | **Fixed:** 20 per user per 10 minutes, with a plain message |
| F6 | Medium | Content | Landing, scan box, FAQ and pricing promised "your score". With strict scoring every scan says "Not scored". | **Fixed:** copy now promises the issue count, severity and one fix |
| F7 | Low | Content | The report heading "Scores and issues by category / see its score" appeared when nothing is scored. | **Fixed:** says "Issues by category" until a category has a score |
| F8 | Low | Brand | Three user-facing strings still said "Sugam" ("Why Sugam thinks so", "Sugam marks a finding fixed", and the default Verify line "scan the page again with Sugam"). | **Fixed** |
| F9 | Low | Privacy | The pre-scan text did not mention that screenshots are saved. | **Fixed:** one sentence under the scan box |
| F10 | Medium | Privacy | Full URLs, including query strings, are stored and shown in reports and share links. A URL like `?token=…` or `?email=…` is kept as typed. | **Fixed (launch work):** secret-bearing parameters and value-carrying fragments are removed before saving (`lib/net/url-privacy.ts`, applied in `checkUrl`, project scans, rescans and the final address after redirects). Rows saved before this change keep their original address. |
| F11 | Medium | Privacy | The live key is a free-tier Gemini key. The privacy page itself says Google may use free-tier inputs to improve its products, and that the free tier is for public demo pages only. Beta users will scan real pages. | Open. Decision D5. |
| F12 | Medium | Privacy | No retention limit and no self-service deletion for scans, screenshots or accounts. The privacy page says so honestly. | **Fixed (launch work):** anonymous scans are deleted after 30 days (`ANON_RETENTION_DAYS`); "Delete this scan" for owners, admins, the person who ran it and the browser that started an anonymous scan; "Delete my account" in Settings; the privacy page states retention. |
| F13 | Low | Security | Sign-up and add-member messages reveal whether an email has an account. | Open. Decision D6. |
| F14 | Low | Security | `sameOrigin` accepts requests with no `Origin` header. Browsers send one on cross-site POSTs, server actions have their own origin check, and cookies are SameSite=Lax, so the risk is low. | Open. Recommend requiring Origin or `Sec-Fetch-Site` on the scan, share and rescan POSTs. |
| F15 | Low | Ops | Rate limits are in memory per process: they reset on restart and are not shared across instances. | Open (fine for a single-instance beta) |
| F16 | Low | Brand | Cookie names still start with `sugam_`. Renaming them signs everyone out. | Open. Low value; do it together with the next breaking change. |
| F17 | Low | Content | The report explains "no score" three times (header, summary, category line). The wording is correct but repetitive. | Open. Design suggestion: keep one explanation and link the others to it. |
| F19 | Low | Tests | `test/auth.mjs` was stale after the dashboard redesign: it counted sidebar sub-links as extra workspaces. `test/security.mjs` could pick a scan cut off by a server restart. Neither was a product bug: one workspace per OAuth account was confirmed, and interrupted scans are marked "did not finish" after 10 minutes. | **Fixed** (tests only) |
| F20 | Low | Ops | With the in-process queue (no `REDIS_URL`), scans running when the server restarts are lost. Builders wait up to 10 minutes before seeing "did not finish". | **Fixed (launch work):** on start, scans from the last 6 hours are queued again and older ones are marked interrupted (`lib/startup.ts`, `instrumentation.ts`). A queued scan may now wait 60 minutes, not 10, before it is called stale. |
| F18 | Info | Product | Pricing lists white-label links (only name and colour are applied; no logo), SARIF export (route only, not tested end to end) and before/after (gated; content not reviewed). | Open. Decision D7. |

Checked with no problems found: workspace isolation on every scan route (scan, review, export, desktop and mobile screenshots, early shot, diagnostics, share, rescan, report page) for another workspace, a free account and an anonymous visitor; share tokens (random, hashed, expiring, revocable); cross-origin share POST; the URL guard (localhost, 10.x, 169.254.169.254, [::1], credentials, file:, port 22, single-label hosts all return 422); DNS rebinding (the egress proxy re-resolves every request, Lighthouse included); OAuth (state compared in constant time, PKCE S256, verified email only, a password account is not linked silently, `next` restricted to local paths); sessions (HttpOnly, SameSite=Lax, Secure in production, hashed in the DB, 30 days); no secrets in git history; `.env` git-ignored and mode 600; logs record scan IDs and errors, not page content.

## 6. Fixes with before and after

| Fix | Before | After |
|---|---|---|
| F1 anonymous ceiling | 11 anonymous POSTs, each with a new `X-Forwarded-For`: `422 ×11`, never limited | Same 11 with `ANON_SCAN_CEILING=8`: `422 ×8, 429 ×3`. One client without spoofing still gets `429` after 5. |
| F2 revoke | No control; a link worked until it expired | `security.mjs`: "a revoked share link and its screenshot answer 404 (404,404)"; "the revoked link is listed as Revoked" |
| F3 egress message | Redirect to a private IP reported as the site's 403 | Reported as `blocked` with the guard's message |
| F4 export order | Non-member export returned `402` | `404` for another workspace, a free account and anonymous (`security.mjs`) |
| F5 project scans | Unlimited | `tooManyAttempts('project-scan:'+user, 20)` in `startProjectScanAction` |
| F0 AI prompt | Gemini-enriched fix: prompt of about 330 characters with no `Verify:`; "How to check it" empty; Copy prompt did not start with `Fix:` | `fix-enrichment.mjs` 7/7; `fixpanel.mjs` 10/10 against the Gemini stub |
| F6–F9 copy | "you get your score…"; "Scores and issues by category"; "Why Sugam thinks so"; no screenshot notice | "you see how many issues we found…"; "Issues by category"; "Why Avara thinks so"; "Screenshots of the page are saved with the results." |

Files changed by this audit: `analysis/claude.ts` (`apply` keeps the prompt structure; exported for the test), `analysis/fixes.ts` (Verify wording), `app/api/scans/route.ts`, `app/actions.ts` (`revokeShareAction`, project-scan limit), `app/app/[org]/shared/page.tsx`, `components/forms/ActionForm.tsx` (`submitLabel` gives each row's button a distinct accessible name), `app/api/scans/[id]/export/route.ts`, `scanner/scanner.ts`, `components/landing/{LandingPage,ScanBar,faq-data}.tsx`, `lib/plans.ts`, `components/report/{ReviewBoard,AvaraPanel}.tsx`, `README.md` (`ANON_SCAN_CEILING`), `test/security.mjs` (new), `test/fix-enrichment.mjs` (new), `test/landing.mjs`, `test/auth.mjs`, and `docs/coverage/*` (regenerated).

## 7. Privacy data flow

| Data | Why | Where stored | Who can see it | Sent to a third party | Retention and deletion | Matches privacy page? |
|---|---|---|---|---|---|---|
| Scanned URL, **including the query string** | To load the page and label the report | `scans.url` (DB) | Creator; workspace members; anyone with a share link | Gemini (in the page context) when AI is on | Kept indefinitely; no deletion | Partly. The page says "the scans you run" but does not mention query strings (F10). |
| Page text: title, headings, button labels, a visible-text excerpt, link targets | Rule judgement, clarity and trust checks | Scan result JSON (`pageContext`), `knowledge` rows | Same as above | Gemini, when AI is on | Indefinite; `knowledge` rows cascade if the scan is deleted | Yes ("a small part of the page is sent") |
| Element HTML (outerHTML, capped at about 260 characters) | Evidence and fixes | Findings tables | Paid members of the workspace; free users get it only for the one unlocked finding | Gemini (fix writer) | Indefinite | Yes |
| Screenshots (desktop, mobile, early blocker) | Evidence and pins | `.data/objects/scans/{id}/…` | Paid members; share-link holders; free users get 402 | Gemini (up to two per rule; fix writer) | Indefinite; no deletion | Yes, and the scan box now says so |
| Keyboard trace | Keyboard checks | Scan result | As above | Gemini (fix writer) | Indefinite | Yes |
| Account: email, name, password hash | Sign-in | `users` | The user; workspace co-members see email and name | Google or GitHub only during OAuth sign-in | Indefinite; deletion by request to the operator | Yes |
| Session and claim cookies | Stay signed in; see your own anonymous scans | Browser; `sessions` (hashed) | The user | None | 30 days; claims 7 days | Yes. Names still `sugam_` (F16). |
| Share-link token | Read-only client access | Hash only, in `share_links` | Anyone with the link | None | 90 days, or until revoked (new) | Yes |
| Waiting-list email and plan | Notify when a plan opens | `waitlist` | Operator | None | Indefinite | Yes |
| IP address | Rate limiting | Memory only | No one | None | 10-minute window; lost on restart | Yes |
| Aggregate patterns | Cross-scan insights | `patterns` | **Public** (`/api/knowledge/patterns`: percentages and rule IDs only) | None | Indefinite | Not mentioned. Low risk, since it contains no URLs, but the page should say it (D8). |
| PageSpeed Insights | Not in this build | | | Not sent | | Not applicable |

Provider settings we cannot verify from the code: Gemini data use and retention on the user's key and tier (D5), and the Google AI Studio region and logging settings. Legal questions for the owner: whether a privacy page with no retention period, operator, contact address or lawful basis is enough for EU or Canadian beta users. Set `NEXT_PUBLIC_CONTACT_EMAIL` at minimum.

## 8. Decisions needed

| # | Decision | Recommendation | Impact if left |
|---|---|---|---|
| D1 | No rule is score-eligible, so every report says "Not scored". Ship the beta without a score? | Yes for the beta, and keep the copy (now fixed) promising counts and fixes, not a score. Choose the first few measured rules to make eligible after beta data comes in. | Builders who expect a score may feel short-changed. |
| D2 | `X-Forwarded-For` trust. Behind one proxy that appends the client IP, the current default is right. Exposed directly, it is spoofable. | Decide the host. Directly exposed: set `TRUST_PROXY=0`. Vercel or Fly: keep the default. The new ceiling bounds the damage either way. | Per-IP fairness is unreliable without a proxy. |
| D3 | Store and show query strings? | Strip known secret-bearing parameters (`token`, `key`, `code`, `email`, `session`, `auth`) before saving, and keep the rest. | A pasted URL with a token is kept and shared. |
| D4 | Retention and deletion | Delete anonymous scans and screenshots after 30 days, and add "Delete scan" for workspace owners before a public launch. | Indefinite storage of third-party page screenshots. |
| D5 | Gemini free tier for real users | Move to a paid Gemini tier (or Claude) before inviting builders who scan real pages, and rotate the key that was pasted in chat. | The privacy page's own warning applies to every beta scan. |
| D6 | Account-existence messages | Use a generic sign-up message ("check your email"), and keep add-member explicit, since that one is only for owners and admins. | Minor email enumeration. |
| D7 | Pricing claims that are only partial (white-label logo, SARIF, before/after) | Mark them "Coming soon" or finish them before charging. | Paying customers find gaps. |
| D8 | Public aggregate patterns API | Keep it public, mention it on the privacy page, or put it behind sign-in. | Low. |

## 9. Test results (final build)

The production build was run after all fixes, on disposable DB copies. 31 test files; three were not run because they mutate accounts, scan real sites or need a fixed port (`setup-test-account`, `audit-real-sites`, `crawl`).

| Server | AI | Tests | Result |
|---|---|---|---|
| Port 3500, full suite (`suite.sh`) | Live Gemini (read from `.env`) | journey 8, landing 111, gating agency 12, site 11, free 12, workspace-evidence, diff-002-api 11, tools 9, avara 18, security 21 | Pass |
| Port 3500 | Live Gemini | fixpanel | **Failed 2/10. Led to F0.** After the fix: 10/10 against the stub. |
| Port 3301 | Gemini stub, 4 s per call | report-first 8 (blocker 5.1 s, report 24.4 s, AI 41.1 s), fixpanel 10, security 21 | Pass |
| Port 3600 | Off, OAuth fake provider | auth 10 | Pass (after the F19 test fix) |
| Offline | n/a | fix-enrichment 7, rule-engine 31, not-run-reasons 10, scoring 9, coverage 29, coverage-matrix 5, gemini-path 10, scanner-accuracy 72, detectors 43, value-detectors 59, detector-pack 9, detector-pack-v3 18, detector-spec 8, detector-trace 6, batch-detectors 5, cta-regression 9, tracks 12, diff-002 19, avara-catalog 19 | Pass |
| Static | | `tsc --noEmit` | 0 errors |
| Static | | coverage matrix `--check` | Current (regenerated) |

Ad hoc checks (not in the suite): the anonymous ceiling (section 6, F1) and the free report at 1280 and 375 px (section 3).

Not covered: real Google or GitHub OAuth; real-site timing on the final build; screen-reader passes (VoiceOver or NVDA); a multi-instance deployment; Gemini behaviour under sustained 429s beyond the "no answer" reason; SARIF and compare content.

## 10. Launch work (after the audit)

Done on 21 November 2026, on top of the audit fixes, still uncommitted:

| Item | What changed | Evidence |
|---|---|---|
| Secret URL parameters | `token`, `key`, `code`, `session`, `password`, `email` and similar names (including `access_token`, `X-Amz-Signature`) and value-carrying `#fragments` are removed before an address is saved | `test/data-lifecycle.mjs` (5 checks); `test/delete-flow.mjs`: `?token=…&lang=en` is saved as `?lang=en` |
| Retention and deletion | `lib/deletion.ts`, `lib/startup.ts`, `components/forms/DangerDelete.tsx`; delete buttons on the report and in Settings, each needing a typed confirmation and styled as destructive | `data-lifecycle.mjs` (11 checks: retention, permissions, cascade and files, account rules); `delete-flow.mjs` (8 checks in a browser) |
| Restart recovery | Recent unfinished scans are queued again on boot; jobs skip scans already given up on | `data-lifecycle.mjs` (4 checks); a real boot logged "1 queued again, 8 marked interrupted" |
| Deployment | `deploy/` (Dockerfile, docker-compose with Postgres and Caddy, env example, smoke test, nightly backup) and `docs/deploy.md` | **Not run here:** Docker and Postgres are not installed on this machine. Run `deploy/smoke.sh` after the first deploy. |
| Pricing | Paid plans already said "Coming soon" with a waiting list. White-label now says "your name and colour (logo coming soon)". The SARIF export names the real site instead of `avara.local`. | Code review |
| Privacy page | Who runs the site (`AVARA_OPERATOR`), contact (`AVARA_CONTACT_EMAIL`, read at request time: `NEXT_PUBLIC_*` would have been frozen empty in the Docker build), retention periods, URL cleaning, the public patterns, self-service deletion | Page review |

Still open for launch: the Postgres code path is untested on this machine; there is no payment system (paid plans are set by hand, see `docs/deploy.md`); the Gemini tier and key rotation (D5); legal review of the privacy page and terms.
