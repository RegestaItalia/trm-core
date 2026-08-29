# `cg3z` workflow audit

Audit date: 2026-08-27
Entry point: [`cg3z`](../../src/actions/cg3z/index.ts#L56)

## Findings

### CG3Z-01 — High — Partial upload/forward has no rollback

The upload writes the header and data separately, then forwards the transport. If the data write
or forwarding fails after the header was written, the workflow rejects but leaves partial files or
an uploaded transport behind. There is no `revert` handler ([upload sequence](../../src/actions/cg3z/upload.ts#L48)).

Recommendation: stage both files, clean them on failure, and add a rollback/delete path for a
transport that was uploaded but not successfully forwarded.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No workflow-specific issue found. See the [shared audit](shared.md). |
| 2 | `upload` | CG3Z-01. Archive cardinality and header/data identity are otherwise checked before mutation. The intentionally tolerated TMS-text refresh failure is logged ([source](../../src/actions/cg3z/upload.ts#L63)). |

## Resolved findings

### CG3Z-02 — Resolved — Unsupported `r3transOptions` input was removed

The public action input previously exposed `r3transOptions`, although no workflow step consumed it.
The unused field was removed from `CG3ZActionInput`, so callers are no longer led to believe that
those import options affect upload or forwarding ([source](../../src/actions/cg3z/index.ts#L8)).
