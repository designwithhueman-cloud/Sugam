# Known intermittent issues

## redaction-pipeline: “the same findings at the same locations as the same page without secrets”
- **Seen:** once, on 2026-11-28, in a run of `test/redaction-pipeline.mjs` straight after a rebuild (the check compares the findings stored for the canary page with those for the same page without secrets). The printed detail was cut off, so the differing findings were not recorded. The list it printed included `sugam/reflow-320|#c` and `sugam/form-auto…`.
- **Not reproduced:** 11 later runs passed (3 in a row first, then 8 in a row while other tests used the same computer).
- **Cause: not established.** The two pages are scanned one after the other with real timing (layout at 320px and the in-page form capture), so a late layout or capture on one of them is the likeliest explanation. That is a guess, not a finding.
- **What was changed to catch it:** on a mismatch the check now prints which findings appear only with the secrets and which only without. If it fails again, that line names the rule and selector.

## Flows: “1 console error(s) on the page” on a passing flow
- **Cause (measured):** the browser requested `/favicon.ico` and the test site answered 404. The site's request log showed that as the only 404, and the run recorded the console message “Failed to load resource: … 404 (Not Found)”. The run's failed-requests list stayed empty, because the browser's own favicon request is not reported there.
- **Effect:** a site without a favicon shows this console error on every flow run, even when the flow passes. Not changed here.
