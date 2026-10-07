# `cg3z` workflow audit

Audit date: 2026-10-04
Entry point: [`cg3z`](../../src/actions/cg3z/index.ts#L50)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-85 — High — Technical — Upload rollback is ineffective (CG3Z-01 ineffective)

- **Where:** [`cg3z/upload.ts#L72`](../../src/actions/cg3z/upload.ts#L72); the unit test mocks `Transport` entirely.
- **Failure:** uploaded foreign transports have no E070 row in the target, so the revert (which since ACT-2026-86 skips deletion without an E070 row) cleans up nothing for a new transport: its cofile/data files and any TMS buffer entry remain. Even with E070, `deleteTrkorr` removes neither. Overwritten files are restored (ACT-2026-86).
- **Fix:** track header/data/forward progress, remove the buffer entry with `deleteTmsTransport`, restore or delete only files written by this run, and never call `deleteTrkorr` here.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `upload` | Upload/forward works for well-formed archives; the standard stop warning is shown before the first SAP write, and the TMS text is refreshed only for an overwritten transport (a non-fatal refresh failure is logged with its error message). Archive entries are matched by case-insensitive basename (`K`/`R` + number + `.` + 3-character SID), directories and unrelated files are ignored, and the transport number is uppercased. Before writing, an existing transport (E070 entry, header or data file) is detected and overwritten only per `uploadData.overwrite`, after a confirmation prompt, or never with `noInquirer`; overwritten files are snapshotted and restored on rollback, and a request that existed before the run is never deleted. Rollback of newly uploaded transports is still ineffective (ACT-2026-85). |

## Resolved findings

### ACT-2026-86 — Resolved — Existing transport files are overwritten

- **Where:** [`cg3z/upload.ts`](../../src/actions/cg3z/upload.ts), [`cg3z/index.ts`](../../src/actions/cg3z/index.ts).
- **Was:** a colliding transport number (shared trial SIDs, re-upload to the source) overwrote cofile/data, losing import history; a forward failure could then delete an unrelated modifiable request with the same number.
- **Fix:** the action input gained `contextData.noInquirer` and `uploadData.overwrite`. Before writing, the step checks E070 and reads the existing header/data files (`Transport.readBinaryFiles`). If anything exists, a boolean `overwrite` is applied as given; otherwise the user is asked (default *no*), and with `noInquirer` the upload is aborted. The previous files are kept in `runtime.overwritten`; the revert never deletes a request that had an E070 entry before the run, deletes a request created by the run only if it now has a modifiable E070 entry, and restores the snapshotted files only after that cleanup succeeded, continuing past a failed file and rethrowing the first error. Covered by [`upload.test.ts`](../../src/actions/cg3z/upload.test.ts).
- **Missing-file detection:** `Transport.readBinaryFiles` treats only a `NOT_FOUND` failure (RFC exception key, or the REST reason carried in the HTTP status text) and an empty file as absent; any other read error aborts the upload before anything is written. [`Transport.readBinaryFiles.test.ts`](../../src/transport/Transport.readBinaryFiles.test.ts) covers both.
- **Backend dependency:** `/ATRM/CL_UTILITIES=>get_binary_file` raises `NOT_FOUND` with the path and OS message and wraps `CX_SY_FILE_ACCESS_ERROR`, and `/ATRM/GET_BINARY_FILE` declares the `NOT_FOUND` exception (REST already reported it as the HTTP reason). On trm-server ≤ 6.4.1 a missing file over RFC ends in a runtime error, so every new upload aborts at the existence check; `trmDependencies` must be raised to the trm-server release that contains this change.


### ACT-2026-87 — Resolved — Archive entry-name handling is fragile

- **Where:** [`cg3z/upload.ts`](../../src/actions/cg3z/upload.ts).
- **Was:** lowercase `k900001.npl` yielded `nplK900001` and tp could not find the cofile; any `R*`/`K*` entry (e.g. `README.txt`) or folder prefix triggered a misleading cardinality error.
- **Fix:** `parseTransportArchive` skips directory entries, takes each entry's basename (`/` or `\` separators), uppercases it and accepts only `^[KR][A-Z0-9]{6,}\.[A-Z0-9]{3}$`; other files are ignored. The cardinality error reports how many header and data files were found, and the mismatch error names both transport numbers. Covered by [`upload.test.ts`](../../src/actions/cg3z/upload.test.ts).


### ACT-2026-88 — Resolved — Diagnostics and stop warning

- **Where:** [`cg3z/upload.ts`](../../src/actions/cg3z/upload.ts).
- **Was:** the refresh-text error was discarded entirely (typo "Coudln't"); cg3z changed SAP data without the standard stop warning.
- **Fix:** the step calls `stopWarning('cg3z')` after the archive is parsed and before the upload, and the refresh warning now includes the transport number and the error message. Covered by [`upload.test.ts`](../../src/actions/cg3z/upload.test.ts).

### CG3Z-01 — Resolved — Partial upload/forward is rolled back

The upload step now registers the identified transport in workflow runtime state before writing its
binary files. If upload or forwarding fails, its revert handler checks whether SAP still considers
the transport modifiable and deletes it, following the rollback pattern used by generated publish
transports ([source](../../src/actions/cg3z/upload.ts)).

> **2026-10-04 audit:** this fix is ineffective in practice (uploaded transports have no E070 row, so `canBeDeleted()` throws, and files/TMS buffer are never cleaned). Tracked as active finding ACT-2026-85 in the [README](README.md).

### CG3Z-02 — Resolved — Unsupported `r3transOptions` input was removed

The public action input previously exposed `r3transOptions`, although no workflow step consumed it.
The unused field was removed from `CG3ZActionInput`, so callers are no longer led to believe that
those import options affect upload or forwarding ([source](../../src/actions/cg3z/index.ts#L8)).
