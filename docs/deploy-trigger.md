# Preview-ready trigger (bearer-authenticated webhook)

When a preview deployment is ready, a CI step or deploy hook can tell Avara. Avara then runs the same published-vs-preview comparison as the
"Compare preview with published" button for the project's saved flows, and shows each verdict on the project's Flows page without a click.

## Set up
1. The project needs both a live address and a preview (staging) address.
2. A workspace **owner or admin** creates the token: `POST /api/projects/<projectId>/deploy-token` (signed in). It is returned once; only its SHA-256 is
   stored. Calling it again replaces the token; the old one stops working at once.
3. Call the webhook after each preview deploy:

```bash
curl -X POST https://<avara>/api/projects/<projectId>/deployments \
  -H "Authorization: Bearer <token>" -H "content-type: application/json" \
  -d '{"deploymentId":"rel-2026-11-28.1","previewUrl":"https://preview.example.com/"}'
```

This is a bearer-authenticated webhook: anyone holding the token can start comparisons for that project. It is not a signed payload.

## What happens
- **Accepted atomically.** In one transaction Avara saves the event, one *pending* comparison per flow (the approved version and both addresses pinned) and
  the reasons for flows that were not compared. The answer is `202` with the comparison ids. Nothing has run yet.
- **Duplicates.** The same `deploymentId` for the same project is accepted once. A repeat (even concurrent, or after a restart) answers `202`,
  `duplicate: true`, with the same ids, and creates nothing.
- **Dispatched afterwards**, one comparison at a time. A comparison left running by a process that died is put back to pending at the next start
  (or after `DEPLOY_STALE_MS`, default 10 minutes) and run again. Keep `AVARA_BACKGROUND=off` on any second web instance, as for scan recovery.
- **At most 5 flows per deployment** (the oldest five). The rest are listed on the page as not compared, with the reason; compare them by hand.
  Manual comparison limits are unchanged.
- **Same verdicts** as the manual comparison, including "Comparison inconclusive" when the preview cannot be opened or a safety rule stops a step.

## Limits and honest wording
- `previewUrl` must be on the project's saved staging address. The event cannot send the worker anywhere new.
- Results are labelled **"Triggered by deployment X"**: the staging address is fixed, so it may serve something different by the time the comparison runs.
  Avara does not claim the verdict is for that exact build.
- Only the deployment id is stored (up to 120 characters; secret-looking values are masked). Body limit 4 KB; 30 events per project per 10 minutes.
- Not built: host-specific payloads (Vercel, GitHub), per-deployment preview addresses on a different origin, a button to create the token.
