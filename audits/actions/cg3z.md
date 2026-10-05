# `cg3z` workflow audit

Audit date: 2026-10-04
Entry point: [`cg3z`](../../src/actions/cg3z/index.ts#L50)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-85 — High — Technical — Upload rollback is ineffective (CG3Z-01 ineffective)

- **Where:** [`cg3z/upload.ts#L72`](../../src/actions/cg3z/upload.ts#L72); the unit test mocks `Transport` entirely.
- **Failure:** uploaded foreign transports have no E070 row in the target, so `canBeDeleted()` throws `TypeError`; cofile/data files and any TMS buffer entry remain. Even with E070, `deleteTrkorr` removes neither.
- **Fix:** track header/data/forward progress, remove the buffer entry with `deleteTmsTransport`, restore or delete only files written by this run, and never call `deleteTrkorr` here.

### ACT-2026-86 — Medium — Functional — Existing transport files are overwritten

- **Where:** [`cg3z/upload.ts#L51`](../../src/actions/cg3z/upload.ts#L51); `Transport.upload` writes without an existence check.
- **Failure:** a colliding transport number (shared trial SIDs, re-upload to the source) overwrites cofile/data, losing import history; a forward failure may then delete an unrelated modifiable request with the same number.
- **Fix:** refuse (or require an overwrite flag) when E070 or files exist, and snapshot them for rollback.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails open on non-`ClientError` failures ([ACT-2026-12](shared.md)). |
| 2 | `upload` | Upload/forward works for well-formed archives; the standard stop warning is shown before the first SAP write, and a non-fatal text-refresh failure is logged with its error message. Archive entries are matched by case-insensitive basename (`K`/`R` + number + `.` + 3-character SID), directories and unrelated files are ignored, and the transport number is uppercased. Rollback ineffective (ACT-2026-85); overwrite gap (ACT-2026-86). |

## Resolved findings

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
