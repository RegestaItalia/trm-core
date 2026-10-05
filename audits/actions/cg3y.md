# `cg3y` workflow audit

Audit date: 2026-10-04
Entry point: [`cg3y`](../../src/actions/cg3y/index.ts#L48)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-84 — Low — Functional — Input and output validation gaps

- **Where:** [`cg3y/download.ts#L21`](../../src/actions/cg3y/download.ts#L21).
- **Failure:** released tasks or local requests without exports pass the checks and fail later with an unclear file error; empty buffers produce a ZIP of 0-byte entries reported as success.
- **Fix:** validate the transport number and request type, and reject empty files.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails open on non-`ClientError` failures ([ACT-2026-12](shared.md)). |
| 2 | `download` | Read-only and correct for released requests; validation gaps (ACT-2026-84). |

## Residual risk

The workflow has no rollback, which is appropriate because it is read-only. Its binary output is
summarized (not serialized) in workflow-finish logging since SHARED-01 was resolved in the
[shared audit](shared.md).
