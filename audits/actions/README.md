# Action workflow audits

Audit date: 2026-10-16 (in-depth static review of every workflow: unseen functional scenarios, crashes and unhandled cases; the 2026-10-15 run reviewed the upgrade and uninstall redesign; ACT-2026-91 was reproduced from an install log).

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
| `cg3y` | 2 | 0 | 0 | 0 | 1 | [CG3Y](cg3y.md) |
| `cg3z` | 2 | 0 | 0 | 0 | 1 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 0 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-engines` | 2 | 0 | 0 | 0 | 0 | [Engines check](check-engines.md) |
| `check-sap-entries` | 2 | 0 | 0 | 0 | 1 | [SAP-entry check](check-sap-entries.md) |
| `uninstall` | 10 | 0 | 0 | 2 | 2 | [Package uninstall](uninstall.md) |
| `install-dependency` | 6 | 0 | 0 | 0 | 1 | [Dependency install](install-dependency.md) |
| `install` | 29 | 1 | 0 | 3 | 1 | [Package install](install.md) |
| `publish` | 15 | 0 | 0 | 1 | 4 | [Package publish](publish.md) |
| Shared steps/callbacks | 16 | 0 | 1 | 2 | 6 | [Shared infrastructure](shared.md) |
| **Total** | | **1** | **1** | **8** | **17** | |

Each workflow report holds its active findings, current step review, and the history of resolved and
non-relevant findings; this README only aggregates them. Since the 2026-08-27 audit the
install workflow gained `check-dependants`, `check-engines`, resource locking, transport
preparation, batch import, landscape-transport skipping on final systems, and retained tables on
update; `uninstall` and `check-engines` are new workflows; publish gained manifest engines. The shared
`trm-server-pa` step no longer exists. On 2026-10-15 upgrade and uninstall were redesigned: everything the
cleanup may delete is backed up first in `@X1@TRM (BKP)` transports kept in the import queue,
deletions are generated from the backups by one shared helper (`generateDeletion`) and, on upgrade,
imported with the incoming release (`plan-update-cleanup`, `prepare-backup`, `prepare-deletion`,
`import-update-deletion` replace `generate-update-transport` and `generate-post-import-update-transport`);
no deletion transport is forwarded, the single landscape transport copies them and is released last
(uninstall `forward-deletion-transport` replaced by `generate-landscape-transport` and
`release-landscape-transport`); imports fail from return code 8. This resolved ACT-2026-04, ACT-2026-06 and
INST-02 and ACT-2026-50; ACT-2026-92, found in the new action summary, was resolved in the same change. All active findings describe the current source and are included in the
index counts.

The 2026-10-16 run found no new workflow; it added ACT-2026-93 to ACT-2026-112 (1 Critical, 1 High, 7 Medium, 11 Low)
and found that INST-07 (Non-relevant) no longer matches the code: a failed post-activity now rolls the install back
(see [install](install.md)).

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

1. **[ACT-2026-93](install.md)** — exclude the kept SAP packages (and every other backed-up object that isn't a confirmed deletion) from the upgrade deletion, so keep-original upgrades that remove objects don't abort on the preview check.
2. **[ACT-2026-97](shared.md)** — put kept objects of a local (`$`) installation back in their packages after the backup staging, also on success, and don't leak the staging package when no deletion runs.
3. **[ACT-2026-94](install.md) / [ACT-2026-101](uninstall.md)** — with `ignoreImportErrors`, don't copy a deletion that ended with RC ≥ 8 into the landscape transport (objects still present are shipped instead of deleted).
4. **[ACT-2026-102](uninstall.md)** — plan and check the parent cleanup (locks, registry, prompts) before the nested uninstalls delete anything.
5. **[ACT-2026-98](shared.md)** — compare customizing keys without the client only for client-dependent tables.
6. **[ACT-2026-14](shared.md)** — bound the TMS-queue polling of releases and imports, so a stuck request can't hang an action after SAP state changed.

These findings were identified by static review and were not reproduced against SAP or a registry.
