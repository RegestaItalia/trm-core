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
| `install` | 22 | 0 | 1 | 1 | 0 | [Package install](install.md) |
| `publish` | 15 | 0 | 0 | 1 | 0 | [Package publish](publish.md) |
| Shared steps/callbacks | 5 | 0 | 0 | 0 | 0 | [Shared infrastructure](shared.md) |

The linked workflow reports retain the 2026-08-27 step reviews and finding history. The install workflow has since added `check-dependants`, resource locking, transport preparation, batch import, and a final metadata write. The findings below describe the current source and are included in the index counts.

## Findings

### ACT-2026-01 — High — Unauthorized cleanup can report a successful rollback

When workbench cleanup is denied by the registry, `deleteImportedEntries` marks cleanup unsuccessful and logs a warning, but leaves `cleanupError` unset and returns normally ([source](../../src/actions/install/importBatch.ts#L115)). Preparation reverts then skip snapshot restoration because `cleanupSucceeded` is false ([example](../../src/actions/install/prepareDevc.ts#L93)). The rollback caller can therefore see a successful rollback even though imported objects remain and prior state was not restored. Preserve the authorization error for reporting after the temporary-package cleanup pass.

### ACT-2026-02 — Medium — Post-activity substitution changes the release manifest

`executePostActivities` replaces `&LANDSCAPE_TRANSPORT&` directly in `context.runtime.package.data.manifest.postActivities` ([source](../../src/actions/install/executePostActivities.ts#L28)). `updatePackageData` then serializes that same manifest into the installed-package record ([source](../../src/actions/install/updatePackageData.ts#L68)). The stored manifest consequently contains a transport number from this installation rather than the published placeholder. A later reinstall from that metadata can no longer substitute its own landscape transport. Pass a copied activity and parameters to `PostActivity`.

### ACT-2026-03 — Medium — A published release is reported as failed if local synchronization fails

`publish-to-registry` completes before `update-package-data` runs ([workflow](../../src/actions/publish/index.ts#L269)). A failed SAP package-record update is rethrown ([source](../../src/actions/publish/updatePackageData.ts#L32)), so `publish()` rejects after the registry has accepted the release. A caller retrying the same version will encounter a version conflict. The log describes the partial success, but the returned error does not carry the published release result. Return or throw an explicit partial-publication outcome that exposes the published version and repair action.

## Highest-priority remediation

1. Make unauthorized rollback cleanup report its failure after attempting independent cleanup operations (ACT-2026-01).
2. Copy post-activity inputs before substituting the landscape transport (ACT-2026-02).
3. Expose partial publication explicitly when origin-system synchronization fails (ACT-2026-03).

These findings were identified by static review and were not reproduced against SAP or a registry.
