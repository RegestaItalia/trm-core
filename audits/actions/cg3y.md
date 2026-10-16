# `cg3y` workflow audit

Audit date: 2026-10-16 (in-depth static review of input validation, file reads and ZIP output)
Entry point: [`cg3y`](../../src/actions/cg3y/index.ts#L48)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-109 — Low — Technical — A missing export file surfaces as a raw connector error

- **Where:** [`cg3y/download.ts`](../../src/actions/cg3y/download.ts#L54), [`Transport.download`](../../src/transport/Transport.ts#L290).
- **Failure:** the step's own message ("export files are missing or empty") only covers empty buffers. `Transport.download` reads both files with `SystemConnector.getBinaryFile`, which throws on a missing file. A released request whose cofile or data file was removed (for example after a transport-directory cleanup, or a release whose export failed) fails with the connector's error: over REST that is just `NOT_FOUND`, with no transport number or file name. ACT-2026-84 says the step fails with its own message when a file is missing or empty, but that only holds for empty files.
- **Fix:** read the files with `Transport.readBinaryFiles` (it already turns `NOT_FOUND` and empty files into `undefined`), or catch `NOT_FOUND` around `download()`. Then throw the existing message naming the missing file (header or data). Add a test for a missing file.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `download` | Read-only. Trims and uppercases the input and requires `<SID>K<6 digits>`, then rejects requests that are missing, are tasks, are not released (`R`/`N`), or are local requests (no target system). Empty export files are rejected with the step's message. A missing file fails with the raw connector error (ACT-2026-109). The ZIP is built in memory with the original `K`/`R` file names. |

## Resolved findings

### ACT-2026-84 — Resolved — Input and output validation gaps

- **Where:** [`cg3y/download.ts`](../../src/actions/cg3y/download.ts).
- **Was:** released tasks or local requests without exports passed the checks and failed later with an unclear file error; empty buffers produced a ZIP of 0-byte entries reported as success.
- **Fix:** the step now trims/uppercases the input and requires the `<SID>K<6 digits>` format (which also keeps it out of the `E070` `WHERE` clause unchecked), rejects tasks (`TRFUNCTION` `S`/`R`/`Q`/`X`), rejects requests with an empty `TARSYSTEM` (read by `Transport.getE070`), and fails when the header or data file is missing or empty. Covered by [`download.test.ts`](../../src/actions/cg3y/download.test.ts).

## Residual risk

The workflow has no rollback, which is appropriate because it is read-only. Its binary output is
summarized (not serialized) in workflow-finish logging since SHARED-01 was resolved in the
[shared audit](shared.md).
