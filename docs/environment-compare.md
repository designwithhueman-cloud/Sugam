# Compare preview with published

A saved flow's approved version can be run on the project's published (live) address and on its preview (staging) address, with only the origin changed. Manual only: no publish trigger, schedule or alert.

- **Setup:** the project needs both addresses, and the flow must start on one of them. The start address and any `goto` step move to the other origin; selectors and expected results do not change. Both runs use one definition, read once, so they are the same version.
- **Verdicts** (`packages/flow-engine/environments.ts`): Passed on both; **Preview regression** (published passes, preview fails); **Existing failure on both** (same step, same failed assertion); fails differently (both failures shown, no shared verdict); **Passing on preview** (published fails, preview passes; production recovery needs a later production run); **Comparison inconclusive**.
- **Inconclusive** means a side cannot be used as evidence: a safety rule stopped it, the run errored, it gave different answers when repeated, or its start page could not be opened. The reason is shown, no verdict is claimed, and the other side's observed result is kept and shown.
- **Evidence:** each side shows its environment, its steps, the failed step in plain words, and for a failed assertion what was expected and what was observed (the same step list the run result uses).
- **Not rerun history:** the two runs are stored with an environment and are left out of the flow's run history, rerun comparisons and readiness.
- **API:** `POST/GET /api/flows/:id/comparisons`. At most 5 comparisons per user in 10 minutes.
- **Scope:** replays the saved steps only. It does not discover or follow other links.
