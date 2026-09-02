# `cg3z` workflow audit

Audit date: 2026-08-27
Entry point: [`cg3z`](../../src/actions/cg3z/index.ts#L56)

## Findings

No active CG3Z-specific findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No workflow-specific issue found. See the [shared audit](shared.md). |
| 2 | `upload` | No issue found. Archive cardinality and header/data identity are checked before mutation. The transport is tracked before upload and deleted on rollback when SAP reports it as modifiable. The intentionally tolerated TMS-text refresh failure is logged. |

## Resolved findings

### CG3Z-01 — Resolved — Partial upload/forward is rolled back

The upload step now registers the identified transport in workflow runtime state before writing its
binary files. If upload or forwarding fails, its revert handler checks whether SAP still considers
the transport modifiable and deletes it, following the rollback pattern used by generated publish
transports ([source](../../src/actions/cg3z/upload.ts)).

### CG3Z-02 — Resolved — Unsupported `r3transOptions` input was removed

The public action input previously exposed `r3transOptions`, although no workflow step consumed it.
The unused field was removed from `CG3ZActionInput`, so callers are no longer led to believe that
those import options affect upload or forwarding ([source](../../src/actions/cg3z/index.ts#L8)).
