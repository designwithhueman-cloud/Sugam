# Journey discovery

From one address (the project's live or staging address), Avara finds candidate journeys, shows each one's purpose, observed steps and suggested success, and lets the owner accept or edit it as a saved flow.

- **Where it runs:** `POST /discover` on the isolated browser worker (same token and limits as a flow run). The app never opens a browser itself.
- **Bounds** (`packages/flow-engine/journeys.ts`, `LIMITS`): same origin only, at most 8 pages, 2 clicks deep, 25 links per page, 45 seconds. Links only: no forms, buttons or sign-in. Links that look like an action that changes something (delete, buy, log out, subscribe and similar words or addresses), links to other sites, mail and phone links, new-tab links, anchors and files are skipped, and the skips are reported with a count.
- **De-duplication:** query, fragment, trailing slash and case are ignored; numeric and uuid path segments collapse to one kind of page; links to the same page merge and the shortest path is kept; a journey that is only the first part of a longer one with the same purpose is dropped.
- **Success:** suggested from what a visitor would notice (the address, the main heading, a key element such as a calendar or form). The owner can untick, edit the “page says” text, add text, and rename. Nothing is saved until they press Save as flow.
- **Versions:** `flows.definition` is the approved version and is what runs. Every approval (first save, an edit of success, an accepted change) adds a row to `flow_versions`.
- **Rediscovery:** compares with saved flows that came from journeys (`flows.journey_key`). It writes a proposal (`flow_proposals`) and never edits a flow. The owner approves it as the next version, or keeps the approved flow. A journey that can no longer be found is reported as missing and can only be dismissed.
- **Runs and versions:** a run records the version it started with (`flow_runs.version`) and keeps that definition even if a newer version is approved while it is in flight. Runs are compared only with earlier runs of the same version, so changing what success means starts a fresh baseline (the first run of a new version is shown as such, never as a regression).
- **Approving a proposal:** the proposal is claimed with one conditional update before anything is created, so simultaneous or repeated approvals make exactly one version. A proposal found for an older version of the flow is refused as stale. If creating the version fails, the proposal goes back to pending.
- **Not covered:** journeys behind a sign-in or a form, journeys that need a button click, and sites that build their links only after user input.

API: `POST/GET /api/projects/:id/discoveries`, `GET /api/discoveries/:id`, `POST /api/discoveries/:id/accept`, `GET/POST /api/flows/:id/versions`, `POST /api/proposals/:id`.
