# Redaction: how secret values are kept out of reports

Avara scans other people's pages. A page can show or contain a secret by accident (a key in a script, a token in a link, a password in a text box).
Avara never needs the value, so it hides it before it is stored, sent to a model, exported, logged or shown.

## What is detected

Pattern-based only. There is no entropy rule, so UUIDs, hashes, image data and ordinary long strings are never touched. The one table is
`packages/security-exposure/patterns.ts`; the Launch check uses it to find leaks and redaction uses it to hide values.

| Hidden as | Examples |
|---|---|
| `sk_live_••••`, `rk_live_••••`, `sk_test_••••` | Stripe secret and restricted keys |
| `sk-••••`, `sk-proj-••••`, `sk-ant-••••` | OpenAI and Anthropic keys |
| `AKIA••••`, `ghp_••••`, `xoxb-••••`, `sb_secret_••••` | AWS, GitHub, Slack, Supabase secret keys |
| `eyJ••••` | **Every** JWT, including Supabase `anon` and user session tokens |
| `AIza••••` | Google API keys (hidden in stored evidence, but not reported as a leak) |
| `[private key removed]` | A whole private key block |
| `?name=[removed]` | The value of an address parameter with a secret-looking name (`token`, `key`, `api_key`, `session`, `email`, ...) |

Only the well-known prefix is kept. Never any character after it. Public-by-design keys (`pk_live_`, `sb_publishable_`) are not hidden.
**A recognisable prefix alone does not make a value a leak.** The Launch check reports a leak only for real secrets (service keys, `sk_`, `sb_secret_`, private keys...),
never for a Supabase `anon` key or a Google `AIza` key, even though both are hidden in stored evidence.

## Classify first, then mask

Findings are computed on the real page, then values are replaced in place, so a finding and its location (selector, file, field) survive and only the value is gone.
The Launch check classifies on the raw text and reports kind, location and a masked form (`Stripe live secret key: sk_live_•••• (in /assets/app.js)`).
A scan that hid values says so in its notes ("5 values that look like secrets were hidden in the stored evidence. Findings and their locations are unchanged"), never what they were.

## Where it is applied

- **Inside the scanner, before `scanUrl` returns:** the whole scan output is masked (`redactScanOutput`), including the early-blocker data handed out while the scan runs.
- **Submitted addresses:** `stripSecrets` removes secret parameters, and any key in a path segment, a parameter value or the fragment. The optional goal text is masked too.
- **Model requests:** every request to Gemini or Claude is masked once more right before it is sent.
- **Stored records and logs:** failed-scan messages, flow run records (console text, request addresses, step messages) and every `console.error` that can carry page content.
- **Saved flows:** a `fill` value that looks like a key, token or private key, a card number (valid check digit), a national ID number, or any value typed into a password, card or secret field, is refused before the flow is saved. Ordinary inputs stay replayable.
- **Reading old data:** the report, review, launch, unlocked-fix loaders, the scan, review and diagnostics APIs, and the CSV and SARIF exports mask on the way out, so rows stored before this existed show masked.

## Screenshots

Just before each screenshot (desktop, phone, the 320px pass, and the early phone screenshot) the scanner hides **visible** secret text: text nodes, input values and placeholders,
CSS generated content (`::before`, `::after`), open shadow roots and same-origin frames. It checks that nothing secret-shaped is left, takes the image, and puts the page back, so
measurements and findings still use the real page. **If a secret was detected and could not be hidden, no image of the page is kept:** a plain notice is stored in its place
(the same image for every page) and the scan says so. The early screenshot is simply not produced.

## What redaction does not cover

- **Pixels.** A secret drawn inside an image, a canvas, a video or a PDF, or in a cross-origin frame, closed shadow root or browser plug-in, cannot be detected or hidden.
- **A page that fights back.** A page that rewrites the browser's own string functions before the check can make the in-page check lie. (A page that only blocks text changes is caught: the image is omitted.)
- **Formats we do not know.** Detection is by pattern. A secret in a format not in the table is not recognised.
- **Screenshots and rows stored before this change.** Old text rows are masked on read but stay raw in the database until they are scrubbed (no scrub script exists). Old screenshots are not changed.
- **The browser worker's own console.** The worker's logs and answers are masked in source (`services/browser-worker/server.ts`). Verified in the rebuilt Docker image with synthetic canaries (`test/browser-worker-container.mjs`) and as a plain process (`test/worker-logs.mjs`). Containers started from an older image still log unmasked.
- **Error monitoring.** None is installed. `test/redaction.mjs` fails if an error-monitoring package appears, so it is wired through `redactDeep` first.
- **A user's own flow values.** A saved flow's `fill` text is the user's own input; secrets in it are refused, other text is stored as typed.

## Tests

`test/redaction.mjs` (unit, every kind, idempotence, untouched values, flows), `test/redaction-pipeline.mjs` (real scanner, job, database, simulated model, screenshots) and
`test/redaction-server.mjs` (report page, APIs, exports, share link). They use synthetic canary secrets assembled at run time (`test/support/canaries.mjs`), so no key-shaped text is in the repository.
- Dashboard lists (site dashboard, quick scans, workspace overview, scanner list, compare, scan page) mask legacy scan addresses and titles on read; the stored rows stay raw.
