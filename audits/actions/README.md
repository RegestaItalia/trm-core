# Action workflow audits

Audit date: 2026-09-18 (source review; no SAP or registry operation was run).

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

## Workflow index

| Workflow | Steps audited | Critical | High | Medium | Low | Report |
|---|---:|---:|---:|---:|---:|---|
| `cg3y` | 2 | 0 | 0 | 0 | 0 | [CG3Y](cg3y.md) |
| `cg3z` | 2 | 0 | 0 | 0 | 0 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 0 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-sap-entries` | 2 | 0 | 0 | 0 | 0 | [SAP-entry check](check-sap-entries.md) |
| `install-dependency` | 4 | 0 | 0 | 0 | 0 | [Dependency install](install-dependency.md) |
| `install` | 22 | 0 | 0 | 0 | 0 | [Package install](install.md) |
| `publish` | 15 | 0 | 0 | 0 | 0 | [Package publish](publish.md) |
| Shared steps/callbacks | 5 | 0 | 0 | 0 | 0 | [Shared infrastructure](shared.md) |

The linked workflow reports retain the 2026-08-27 step reviews and finding history. The install workflow has since added `check-dependants`, resource locking, transport preparation, batch import, and a final metadata write. The findings below describe the current source and are included in the index counts.

## Findings

### ACT-2026-01 — Resolved — Unauthorized cleanup can report a successful rollback

When workbench cleanup was denied by the registry, `deleteImportedEntries` marked cleanup
unsuccessful and logged a warning, but returned normally after the temporary-package cleanup pass.
Preparation reverts then skipped snapshot restoration because `cleanupSucceeded` was false, so the
rollback caller could see a successful rollback even though imported objects remained.

The authorization error is now retained as the first cleanup failure and thrown after every
temporary package has received an independent cleanup attempt. Regression coverage verifies that a
later temporary-package failure does not replace it and that all temporary packages are attempted.

### ACT-2026-02 — Resolved — Post-activity substitution changes the release manifest

`executePostActivities` previously replaced `&LANDSCAPE_TRANSPORT&` directly in
`context.runtime.package.data.manifest.postActivities`. `updatePackageData` then serialized that
same manifest into the installed-package record, leaving a transport number from the current
installation in place of the published placeholder.

The execution step now copies each activity and its parameters before resolving placeholders for
`PostActivity`. The release manifest remains unchanged for persistence and later reinstalls, with
regression coverage for both substituted and unchanged parameters.

### ACT-2026-03 — Resolved — A published release is reported as failed if local synchronization fails

`publish-to-registry` completes before `update-package-data` runs ([workflow](../../src/actions/publish/index.ts#L269)). A regression caused a failed SAP package-record update to be rethrown, so `publish()` rejected after the registry had accepted the release. A caller retrying the same version would then encounter a version conflict.

The final synchronization is best-effort again: a metadata write failure logs the exact published
package and version plus the repair action, while the workflow preserves the successful registry
publication result. Regression coverage verifies that the final step resolves after reporting the
failure.

## Highest-priority remediation

No open action-workflow findings remain.

These findings were identified by static review and were not reproduced against SAP or a registry.
