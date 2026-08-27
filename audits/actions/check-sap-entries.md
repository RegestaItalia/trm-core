# `check-sap-entries` workflow audit

Audit date: 2026-08-27
Entry point: [`checkSapEntries`](../../src/actions/checkSapEntries/index.ts#L90)

## Result

No open workflow-specific problems were found.

## Resolved findings

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

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It safely normalizes absent `sapEntries` and `printOptions`. |
| 2 | `analyze` | No issue found. Missing tables and rows produce failed statuses; table-probe failures reject the workflow; per-row query failures are logged and represented as failed rows. |
