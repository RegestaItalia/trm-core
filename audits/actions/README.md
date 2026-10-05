# Action workflow audits

Audit date: 2026-10-05 (in-depth static source review; no SAP or registry operation was run).

These documents are static source audits of every workflow assembled under `src/actions`.
Each step was reviewed in execution order, including filters, external calls, context mutations,
error handling, rollback handlers, and the shared workflow callbacks. A finding marked
"No workflow-specific issue found" means no defect was identified in that step; ordinary
connector, registry, filesystem, and prompt failures may still propagate as expected.

Findings remain in their workflow report after review. **Resolved** findings were corrected by a
code change; **Non-relevant** findings were reviewed and intentionally accepted or rejected as not
applicable. Neither category is included in the open severity counts below. Retaining both prevents
later audits from reporting the same accepted candidates as new findings.

## Severity

- **Critical**: the normal workflow can fail deterministically, report success after a failed
  state-changing operation, or leave the SAP system materially inconsistent.
- **High**: a realistic failure path can silently lose required work or leave state without
  effective recovery.
- **Medium**: misleading results, swallowed diagnostics, stale global state, or incomplete input
  handling can affect callers or operations.
- **Low**: primarily diagnostics, typing, or maintainability concerns with limited runtime impact.

Each finding is also classified as **Technical** (wrong use of shared state, unexpected
exceptions, unchecked results, races) or **Functional** (unexpected flow branch, half-shipped
feature, missing case).

## Workflow index

| Workflow | Steps audited | Critical | High | Medium | Low | Report |
|---|---:|---:|---:|---:|---:|---|
| `cg3y` | 2 | 0 | 0 | 0 | 0 | [CG3Y](cg3y.md) |
| `cg3z` | 2 | 0 | 1 | 0 | 0 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 0 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-engines` | 2 | 0 | 0 | 0 | 0 | [Engines check](check-engines.md) |
| `check-sap-entries` | 2 | 0 | 0 | 0 | 0 | [SAP-entry check](check-sap-entries.md) |
| `delete` | 9 | 0 | 0 | 1 | 0 | [Package delete](delete.md) |
| `install-dependency` | 6 | 0 | 1 | 1 | 0 | [Dependency install](install-dependency.md) |
| `install` | 24 | 1 | 7 | 11 | 6 | [Package install](install.md) |
| `publish` | 15 | 1 | 2 | 6 | 5 | [Package publish](publish.md) |
| Shared steps/callbacks | 12 | 1 | 3 | 10 | 4 | [Shared infrastructure](shared.md) |
| **Total** | | **3** | **14** | **29** | **15** | |

Each workflow report holds its active findings, current step review, and the history of resolved and
non-relevant findings; this README only aggregates them. Since the 2026-08-27 audit the
install workflow gained `check-dependants`, `check-engines`, resource locking, transport
preparation, batch import, landscape-transport skipping on final systems, and retained tables on
update; `delete` and `check-engines` are new workflows; publish gained manifest engines. The shared
`trm-server-pa` step no longer exists. All active findings describe the current source and are
included in the index counts.

Two earlier resolutions turned out to be ineffective and are superseded by new findings:
**SAPCHK-02** (see [ACT-2026-69](check-sap-entries.md), now resolved) and **CG3Z-01** (see [ACT-2026-85](cg3z.md)).

### Workflow engine behavior assumed by this audit

`@simonegaffurini/sammarksworkflow` 1.3.2-fork3 pushes a step into the executed list *before*
running it, so a failing step's own `revert` runs first, followed by earlier steps in reverse order.
A revert that throws is passed to `onRevertFailed` and the remaining reverts continue; the caller
always receives the original `WorkflowError` (the defined `WorkflowRevertError` is never thrown).
Filters run outside the try block, and filtered-out steps are never reverted.

## Highest-priority remediation

1. **[ACT-2026-22](install.md)** — reset dependency install mappings so dependency installs stop failing with "Multiple roots".
2. **[ACT-2026-55](publish.md)** — restore first-time local publishing.
3. **[ACT-2026-04](shared.md)** and **[ACT-2026-06](shared.md)**, together with re-deciding **INST-02** ([install](install.md#reconsideration-of-accepted-findings)) — enforce import return codes for deletion, restore, and batch imports.
4. **[ACT-2026-05](shared.md)** — stop cleanup from deleting shared namespaces.
5. **[ACT-2026-28](install.md)** — keep retained tables out of the rollback cleanup.
6. **[ACT-2026-23](install.md)**, **[ACT-2026-24](install.md)**, **[ACT-2026-79](install-dependency.md)** — make dependency resolution consistent (major bumps, diamonds, partial lockfiles).
7. **[ACT-2026-25](install.md)**, **[ACT-2026-26](install.md)**, **[ACT-2026-27](install.md)** — stale mappings and local-registry install/rollback.
8. **[ACT-2026-07](shared.md)**, **[ACT-2026-29](install.md)**, **[ACT-2026-85](cg3z.md)** — unauthorized deletion path, queued landscape transport after rollback, cg3z rollback.
9. **[ACT-2026-56](publish.md)**, **[ACT-2026-57](publish.md)** — local overwrite and async publish status.

These findings were identified by static review and were not reproduced against SAP or a registry.
