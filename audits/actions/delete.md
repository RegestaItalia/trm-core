# `delete` workflow audit

Audit date: 2026-10-04
Entry point: [`deletePackage`](../../src/actions/delete/index.ts#L139)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared findings (ACT-2026-04 to ACT-2026-21) are listed in the README.

## Findings

### ACT-2026-47 — High — Functional — Uninstall deletes objects outside the installation without confirmation

- **Where:** [`packageCleanup.ts#L230`](../../src/actions/commons/utils/packageCleanup.ts#L230), [`#L292`](../../src/actions/commons/utils/packageCleanup.ts#L292).
- **Failure:** every live subpackage not in the mappings is "locally added", including another TRM package installed underneath; its objects and DEVC are deleted while its record remains. With `noInquirer` extra objects are auto-confirmed (`deleteExtraObjects: true`), silently removing customer development.
- **Fix:** exclude devclasses owned by other installed packages; default to keeping extra objects without prompts and add an explicit option.

### ACT-2026-48 — Medium — Functional — Customizing and translations are not reliably removed

- **Where:** [`packageCleanup.ts#L200`](../../src/actions/commons/utils/packageCleanup.ts#L200); on final systems the stored transport is the TADIR transport ([`updatePackageData.ts#L71`](../../src/actions/install/updatePackageData.ts#L71)).
- **Failure:** on final systems customizing is never deleted; on landscape systems TABU entries lack keys (ACT-2026-40).
- **Fix:** define the customizing policy for delete and document or implement it.

### ACT-2026-49 — Medium — Technical — Revert re-imports the copy even when the deletion was never imported

- **Where:** snapshot saved before `registry.delete` ([`releaseDeletionTransport.ts#L19`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L19)); revert decides only on `canBeDeleted()` ([`packageCleanup.ts#L518`](../../src/actions/commons/utils/packageCleanup.ts#L518)).
- **Failure:** a registry 500 still triggers a full re-import over live objects; if it fails, staging cleanup is skipped.
- **Fix:** set an "import started" flag before `import(false)` and re-import only when set.

### ACT-2026-50 — Medium — Technical — The only rollback copy lives in memory and its export is unchecked

- **Where:** [`releaseDeletionTransport.ts#L14`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L14), [`#L42`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L42) (deletion binaries uploaded under the copy's number).
- **Failure:** an interrupted process loses the pre-deletion copy, including dirty and extra objects that cannot be reinstalled; objects that failed to export are deleted but unrestorable.
- **Fix:** persist the copy binaries locally and check the export log.

### ACT-2026-51 — Medium — Functional — Record removal is skipped when the snapshot is missing

- **Where:** [`removePackageData.ts#L14`](../../src/actions/delete/removePackageData.ts#L14); backend failure falls back without snapshots ([`SystemConnectorBase.ts#L261`](../../src/systemConnector/SystemConnectorBase.ts#L261)).
- **Failure:** objects are deleted and forwarded but the record and mappings remain; the action reports success with only a debug log.
- **Fix:** re-read the record when no snapshot exists, or fail.

### ACT-2026-52 — Medium — Functional — Moved or reassigned objects are deleted anyway

- **Where:** [`packageCleanup.ts#L359`](../../src/actions/commons/utils/packageCleanup.ts#L359).
- **Failure:** every install-transport entry is deleted wherever it lives now, including objects moved to another package or now shipped by another TRM package.
- **Fix:** compare current TADIR devclasses with the installation's and skip or confirm outsiders.

### ACT-2026-53 — Low — Functional — Dirty packages cannot be deleted non-interactively

- **Where:** [`delete/init.ts#L55`](../../src/actions/delete/init.ts#L55).
- **Failure:** with `noInquirer` the action always throws a bare "Delete aborted."
- **Fix:** add an explicit override option and include the reason.

### ACT-2026-54 — Low — Functional — An empty deletion list still reports a successful delete

- **Where:** [`packageCleanup.ts#L368`](../../src/actions/commons/utils/packageCleanup.ts#L368), [`#L427`](../../src/actions/commons/utils/packageCleanup.ts#L427).
- **Fix:** warn or abort when nothing would be deleted.

## Step review

| Order | Step | Result |
|---:|---|---|
| — | package lock (pre-workflow) | Lock lifecycle issues (ACT-2026-11). |
| 1 | `check-server-auth` | Shared ACT-2026-12. |
| 2 | `set-system-packages` | Local-registry dependants missed (ACT-2026-15); missing snapshot skips record removal (ACT-2026-51). |
| 3 | `init` | Raw package name for mapping lookup (ACT-2026-16); dirty packages cannot be deleted non-interactively (ACT-2026-53). |
| 4 | `check-dependants` | No additional issue beyond ACT-2026-15. |
| 5 | `lock-resources` | No issue found. |
| 6 | `generate-deletion-transport` | Highest-risk step: final import RC ignored (ACT-2026-04), shared namespace deleted (ACT-2026-05), foreign subpackages and moved objects deleted (ACT-2026-47, ACT-2026-52), customizing not covered (ACT-2026-48), rollback weaknesses (ACT-2026-06, ACT-2026-07, ACT-2026-49, ACT-2026-50). |
| 7 | `forward-deletion-transport` | Correct on its own; lowercase targets break its revert (ACT-2026-13). |
| 8 | `remove-package-data` | Atomic and reversible; silently skipped without a snapshot (ACT-2026-51). |

## Resolved findings

None.

## Non-relevant findings

None.
