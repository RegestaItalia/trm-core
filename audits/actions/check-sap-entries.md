# `check-sap-entries` workflow audit

Audit date: 2026-10-04
Entry point: [`checkSapEntries`](../../src/actions/checkSapEntries/index.ts#L90)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-69 — Medium — Technical — Connector swallows every SAP-entry error (SAPCHK-02 ineffective)

- **Where:** [`SystemConnectorBase.ts#L432`](../../src/systemConnector/SystemConnectorBase.ts#L432) returns `false` on any error, so the rethrow at [`analyze.ts#L70`](../../src/actions/checkSapEntries/analyze.ts#L70) and the "Unknown" branch are dead.
- **Failure:** missing authorization or a dropped connection reports every table "not found" and aborts install with "requirements are not met" instead of the real cause.
- **Fix:** propagate read errors; treat only true absence as `false`.

### ACT-2026-70 — Medium — Technical — SAP-entry where clause is built unsafely

- **Where:** [`SystemConnectorBase.ts#L435`](../../src/systemConnector/SystemConnectorBase.ts#L435).
- **Failure:** values are not quote-escaped (`O'NEIL`), field names are unvalidated, an empty entry throws, and a single condition over the 72-character option line cannot be split; all surface as `NOT FOUND`.
- **Fix:** escape `'`, validate fields and lengths, reject empty entries in `Manifest.normalize`.

### ACT-2026-71 — Medium — Functional — Table probe is case-sensitive and TABL-only

- **Where:** [`analyze.ts#L65`](../../src/actions/checkSapEntries/analyze.ts#L65).
- **Failure:** a lowercase table key or a database view is reported "table was not found" and blocks install.
- **Fix:** uppercase table names and probe DD02L (or TABL plus VIEW).

### ACT-2026-72 — Low — Functional — Missing entries are hidden and the status table is misaligned

- **Where:** [`install/checkSapEntries.ts#L30`](../../src/actions/install/checkSapEntries.ts#L30) prints entries only in debug; `splice` at [`analyze.ts#L118`](../../src/actions/checkSapEntries/analyze.ts#L118) shifts values when an entry lacks a column.
- **Fix:** log each missing entry at error level; build rows as `header.map(h => entry[h] ?? '')`.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. |
| 2 | `analyze` | Error handling dead (ACT-2026-69); unsafe where clause (ACT-2026-70); case-sensitive, TABL-only probe (ACT-2026-71); hidden and misaligned output (ACT-2026-72). Output statuses follow declaration order. |

## Resolved findings
### ACT-2026-73 — Resolved — Low — Technical — Output order and unused imports

Previously `sapEntriesStatus` listed every found entry before every missing one, so its order no
longer matched the manifest. The grouping did not make failures more visible in the CLI: printed
tables are built row by row in declaration order, and the install wrapper filters failed entries
itself. Statuses are now emitted per table in declaration order
([source](../../src/actions/checkSapEntries/analyze.ts#L135)), and the unused `inspect` and
`Logger` imports were removed from `index.ts`.

### SAPCHK-01 — Resolved — Missing tables produce failed statuses for every required row

When a required table is absent, every declared row is now added to the failed-entry collection.
Output construction therefore emits `status: false` results under the missing table name, and the
install wrapper reliably rejects the unmet requirements
([source](../../src/actions/checkSapEntries/analyze.ts#L74)).

### SAPCHK-02 — Resolved — Table-probe failures propagate with table context

The TADIR existence probe now treats only a `false` result as table absence. Exceptions are
re-thrown with the affected table name and original message, preserving the distinction between a
missing table and an authorization, connection, or response failure
([source](../../src/actions/checkSapEntries/analyze.ts#L63)).

> **2026-10-04 audit:** this fix is ineffective because `SystemConnectorBase.checkSapEntryExists` swallows every error and returns `false`, so the rethrow never runs. Tracked as active finding ACT-2026-69 in the [README](README.md).
