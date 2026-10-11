# `check-sap-entries` workflow audit

Audit date: 2026-10-04
Entry point: [`checkSapEntries`](../../src/actions/checkSapEntries/index.ts#L90)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

No active findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. |
| 2 | `analyze` | No issue found. Only an empty read counts as missing; table-probe and entry read errors abort the check with the table or entry and the original message. Entry conditions are escaped and validated, and invalid entries are thrown rather than reported missing. The table probe uppercases the name and accepts tables and views. Printed rows stay aligned with the header and output statuses follow declaration order. |
| — | install wrapper `check-sap-entries` | Skips on `noSapEntries`; logs each missing entry at error level, with its table and field values, before aborting. |

## Resolved findings
### ACT-2026-69 — Resolved — Medium — Technical — Connector swallows every SAP-entry error (SAPCHK-02 ineffective)

Previously `SystemConnectorBase.checkSapEntryExists` returned `false` on any error, so a missing
authorization or a dropped connection reported every table "not found" and install aborted with
"requirements are not met" instead of the real cause; the SAPCHK-02 rethrow and the entry `Unknown`
branch never ran. The connector now propagates read errors and returns `false` only when the read
returns no row; both clients already map `TABLE_WITHOUT_DATA` to an empty result
([source](../../src/systemConnector/SystemConnectorBase.ts#L432)). The TADIR probe error is
re-thrown with the table name, and an entry read error is now re-thrown with the entry and table
instead of being recorded as an `Unknown` status logged only in debug
([source](../../src/actions/checkSapEntries/analyze.ts#L97)), matching the action's documented
contract of throwing when the system cannot be queried.

### ACT-2026-70 — Resolved — Medium — Technical — SAP-entry where clause is built unsafely

Previously `checkSapEntryExists` interpolated field names and values into the where clause without
escaping or validation. A value such as `O'NEIL`, an invalid field name, an empty entry, a value
containing " AND "/" OR " (which the read-table option splitter breaks on), or a condition longer
than the 72-character option line all failed inside the swallowed read and surfaced as `NOT FOUND`.
Conditions are now built by `getSapEntryConditions`
([source](../../src/manifest/sapEntries.ts#L12)), which uppercases and validates field names,
escapes `'` as `''`, accepts only string or number values, rejects " AND "/" OR " values and
conditions over 72 characters, and rejects empty entries. The connector calls it before the read,
outside the error-swallowing block, so an invalid entry throws instead of reading as missing
([source](../../src/systemConnector/SystemConnectorBase.ts#L432)). `Manifest.normalize` validates
the whole `sapEntries` map, including table names, and rejects an invalid declaration
([source](../../src/manifest/Manifest.ts#L519)); the publish editor for SAP entries applies the same
validation ([source](../../src/actions/publish/setManifestValues.ts#L495)).

### ACT-2026-71 — Resolved — Medium — Functional — Table probe is case-sensitive and TABL-only

Previously the TADIR existence probe sent the manifest table key as written and matched only
`OBJECT = 'TABL'`, so a lowercase key or a database view was reported "table was not found" and
blocked install, although the entry read itself uppercases the table name. The probe now trims and
uppercases the name and checks `TABL` and then `VIEW`
([source](../../src/actions/checkSapEntries/analyze.ts#L65)). The missing-table message reads
"table or view was not found". Statuses are still keyed by the table name as declared in the manifest.

### ACT-2026-72 — Resolved — Low — Functional — Missing entries are hidden and the status table is misaligned

Previously the install wrapper printed the missing entries only in debug output, as a single JSON
string without table names, so a user saw only "N system requirements are not met". It now logs
each missing entry at error level as `Required entry not found in table <table>: <field> = <value>, …`
([source](../../src/actions/install/checkSapEntries.ts#L42)). Printed table rows were built with
`splice`, which shifted values into the wrong columns when an entry lacked one of the table's
fields; each row is now built from the header, leaving missing fields blank
([source](../../src/actions/checkSapEntries/analyze.ts#L116)).

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

> **2026-10-04 audit:** this fix was ineffective because `SystemConnectorBase.checkSapEntryExists` swallowed every error and returned `false`, so the rethrow never ran. Tracked as ACT-2026-69, now resolved: the connector propagates read errors, so this rethrow is effective.
