# `check-sap-entries` workflow audit

Audit date: 2026-08-27
Entry point: [`checkSapEntries`](../../src/actions/checkSapEntries/index.ts#L90)

## Findings

### SAPCHK-01 — Critical — Missing tables produce no failed entry statuses

When a required table is absent, the table name is pushed into `runtime.missingTables`, but none of
its required rows are pushed into `runtime.entriesStatus.bad`
([missing-table branch](../../src/actions/checkSapEntries/analyze.ts#L73)). Output construction only
uses the `good` and `bad` arrays ([source](../../src/actions/checkSapEntries/analyze.ts#L128));
`missingTables` is never consumed. The standalone action can therefore return an empty status map,
and the install wrapper interprets that as all requirements being satisfied.

Recommendation: append every required row from a missing table as `status: false`, or add an
explicit missing-table result that the install workflow must reject.

### SAPCHK-02 — Medium — Any table-probe error is misclassified as “table not found”

The TADIR table-existence probe catches every exception and sets `tableExists = false`
([source](../../src/actions/checkSapEntries/analyze.ts#L63)). Authorization failures, connection
loss, invalid responses, and genuine absence become indistinguishable. Combined with SAPCHK-01,
infrastructure failure can become a false-success result.

Recommendation: only translate a connector-specific not-found result; rethrow operational errors
with the table name as context.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It safely normalizes absent `sapEntries` and `printOptions`. |
| 2 | `analyze` | SAPCHK-01 and SAPCHK-02. Per-row query errors are at least represented as failed rows and logged. |
