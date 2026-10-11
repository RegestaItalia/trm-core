# `cg3y` workflow audit

Audit date: 2026-10-04
Entry point: [`cg3y`](../../src/actions/cg3y/index.ts#L48)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

No active findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `download` | Read-only. Validates the transport number format, rejects tasks, unreleased and local (no target system) requests, and empty export files before building the ZIP. |

## Resolved findings

### ACT-2026-84 — Resolved — Input and output validation gaps

- **Where:** [`cg3y/download.ts`](../../src/actions/cg3y/download.ts).
- **Was:** released tasks or local requests without exports passed the checks and failed later with an unclear file error; empty buffers produced a ZIP of 0-byte entries reported as success.
- **Fix:** the step now trims/uppercases the input and requires the `<SID>K<6 digits>` format (which also keeps it out of the `E070` `WHERE` clause unchecked), rejects tasks (`TRFUNCTION` `S`/`R`/`Q`/`X`), rejects requests with an empty `TARSYSTEM` (read by `Transport.getE070`), and fails when the header or data file is missing or empty. Covered by [`download.test.ts`](../../src/actions/cg3y/download.test.ts).

## Residual risk

The workflow has no rollback, which is appropriate because it is read-only. Its binary output is
summarized (not serialized) in workflow-finish logging since SHARED-01 was resolved in the
[shared audit](shared.md).
