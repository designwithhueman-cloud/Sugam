# Testing

One command runs everything that can run on a developer machine:

```bash
npm run build        # the server and docker groups run the built app
npm run test:all     # all three groups
npm run test:list    # show what would run, and what is skipped, without running anything
```

Options (after `--`): `--group in-process,server,docker`, `--only <text>` (substring of a test id), `--reseed` (rebuild the seeded test database).
Exit code: `0` everything that ran passed, `1` a test failed or timed out, `2` a group could not start (for example, no build).
Logs are in `.data/test-run/logs/`, a summary in `.data/test-run/results.json`.

## The three groups

| Group | What it needs | How it runs |
|---|---|---|
| **in-process** (40) | A browser. The runner starts the fixture site (`fixture/server.mjs`, port 4200) itself. | One test at a time, no app server. |
| **server** (25 runs) | A browser, a built app (`npm run build`), and the seeded database (built on first use). | Every test gets its **own** app server (port 3390) on a **fresh copy** of the seeded database, so scan rate limits and leftover data from one test cannot fail the next. Includes the AI tests against the simulated model (`test/support/gemini-stub.mjs`) and the Launch check test. |
| **docker** (2) | Docker running and the `avara-browser-worker` image. | `browser-worker-container` needs only Docker; `flows-api` also gets its own app server. If Docker or the image is missing, these are printed as `SKIP` with the reason. They are never dropped silently. |

## Tests that are never run by `test:all`

Always printed at the end of every run:

- `audit-real-sites`: scans real public sites over the network. Run by hand, sparingly: `node test/audit-real-sites.mjs <outDir>`.
- `gemini-path (live case)`: sends one real Gemini request. Needs `GEMINI_API_KEY` and `GEMINI_LIVE=1`. The stub cases of this test still run in the in-process group.
- `auth`: needs a server started with fake sign-in provider variables (see the header of `test/auth.mjs`).
- `setup-test-account`: not a test. The runner uses it to seed the database.

`test/test-all-runner.mjs` fails if a new file in `test/` is not in a group or in this list.

## The seeded test database

On first use the runner builds `.data/test-snapshot` (about 3 minutes): three accounts (agency, free, site plans), each with one project and a first scan.
It reuses the email, password and workspace of your existing `.data/test-account.txt`, `.data/test-free.txt` and `.data/test-site.txt` if they exist, and never changes those files.
If they do not exist, they are created with random passwords. `.data/` is git-ignored. Rebuild with `npm run test:all -- --reseed`.

## Browsers

Many tests launch Playwright's own Chromium. If it is not installed, the runner detects that and uses your installed **Google Chrome** instead (through `test/support/use-chrome.mjs`),
so you do not need to download anything. It prints which browser it used. If neither is available, the run is `BLOCKED` (exit code 2).

To install Playwright's own browser instead (needed if you do not have Chrome, or to run a test file by hand without the runner):

```bash
npx playwright install --only-shell chromium   # about 102 MB: the headless shell the tests use (101 MB + 1 MB ffmpeg)
npx playwright install chromium                # about 294 MB: the full browser too (192 MB more)
```

Sizes are the compressed downloads for macOS arm64 at Playwright 1.65.1; they land in `~/Library/Caches/ms-playwright`.

## Docker image

```bash
docker build -f services/browser-worker/Dockerfile -t avara-browser-worker .   # 3.67 GB image
```

## Running one test by hand

Most tests need the fixture site and a private-address allowance, for example:

```bash
node fixture/server.mjs &
ALLOW_PRIVATE_HOSTS=127.0.0.1:4200,localhost:4200 node --experimental-strip-types test/flow-engine.mjs
```

The header of each test file says what else it needs.
