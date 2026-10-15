# Action workflow audits

Audit date: 2026-10-15 (static review of the upgrade and uninstall redesign; ACT-2026-91 was reproduced from an install log; the original audit was a static source review).

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
| `cg3z` | 2 | 0 | 0 | 0 | 0 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 0 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-engines` | 2 | 0 | 0 | 0 | 0 | [Engines check](check-engines.md) |
| `check-sap-entries` | 2 | 0 | 0 | 0 | 0 | [SAP-entry check](check-sap-entries.md) |
| `uninstall` | 10 | 0 | 0 | 0 | 0 | [Package uninstall](uninstall.md) |
| `install-dependency` | 6 | 0 | 0 | 0 | 0 | [Dependency install](install-dependency.md) |
| `install` | 29 | 0 | 0 | 0 | 1 | [Package install](install.md) |
| `publish` | 15 | 0 | 0 | 0 | 1 | [Package publish](publish.md) |
| Shared steps/callbacks | 16 | 0 | 0 | 1 | 4 | [Shared infrastructure](shared.md) |
| **Total** | | **0** | **0** | **1** | **6** | |

Each workflow report holds its active findings, current step review, and the history of resolved and
non-relevant findings; this README only aggregates them. Since the 2026-08-27 audit the
install workflow gained `check-dependants`, `check-engines`, resource locking, transport
preparation, batch import, landscape-transport skipping on final systems, and retained tables on
update; `uninstall` and `check-engines` are new workflows; publish gained manifest engines. The shared
`trm-server-pa` step no longer exists. On 2026-10-15 upgrade and uninstall were redesigned: everything the
cleanup may delete is backed up first in `@X1@TRM (BKP)`/`(BKP C)` transports kept in the import queue,
deletions are generated from the backups by one shared helper (`generateDeletion`) and, on upgrade,
imported with the incoming release (`plan-update-cleanup`, `prepare-backup`, `prepare-deletion`,
`import-update-deletion` replace `generate-update-transport` and `generate-post-import-update-transport`);
no deletion transport is forwarded, the single landscape transport copies them and is released last
(uninstall `forward-deletion-transport` replaced by `generate-landscape-transport` and
`release-landscape-transport`); imports fail from return code 8. This resolved ACT-2026-04, ACT-2026-06 and
INST-02 and ACT-2026-50; ACT-2026-92, found in the new action summary, was resolved in the same change. All active findings describe the current source and are included in the
index counts.

Two earlier resolutions turned out to be ineffective and are superseded by new findings:
**SAPCHK-02** (see [ACT-2026-69](check-sap-entries.md)) and **CG3Z-01** (see [ACT-2026-85](cg3z.md)), both now resolved.

### Workflow engine behavior assumed by this audit

`@simonegaffurini/sammarksworkflow` 1.3.2-fork3 pushes a step into the executed list *before*
running it, so a failing step's own `revert` runs first, followed by earlier steps in reverse order.
A revert that throws is passed to `onRevertFailed` and the remaining reverts continue; the caller
always receives the original `WorkflowError` (the engine never throws its `WorkflowRevertError`; TRM
actions run it through `executeWorkflow`, which does when a revert fails, see [ACT-2026-10](shared.md)).
Filters run outside the try block, and filtered-out steps are never reverted.

## Highest-priority remediation

1. **[ACT-2026-14](shared.md)** — bound the TMS-queue polling of releases and imports, so a stuck request can't hang an action after SAP state changed.
2. **[ACT-2026-46](install.md)** — reconnect before the `import-batch` rollback, so a failed reconnect doesn't leave the whole rollback on a closed connection.

These findings were identified by static review and were not reproduced against SAP or a registry.
