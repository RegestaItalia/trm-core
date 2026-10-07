# `delete` workflow audit

Audit date: 2026-10-07
Entry point: [`deletePackage`](../../src/actions/delete/index.ts#L139)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared findings ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are listed in the README.

## Findings

### ACT-2026-50 — Medium — Technical — The only rollback copy lives in memory and its export is unchecked

- **Where:** [`releaseDeletionTransport.ts#L14`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L14), [`#L42`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L42) (deletion binaries uploaded under the copy's number).
- **Failure:** an interrupted process loses the pre-deletion copy, including dirty and extra objects that cannot be reinstalled; objects that failed to export are deleted but unrestorable.
- **Fix:** persist the copy binaries locally and check the export log.

## Step review

| Order | Step | Result |
|---:|---|---|
| — | package lock (pre-workflow) | Released once after the workflow; a release failure is logged with the resources and owner token and doesn't reject a committed delete ([ACT-2026-11](shared.md), resolved). |
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `set-system-packages` | Local-registry dependants are included in the snapshot ([ACT-2026-15](shared.md), resolved); a missing record snapshot (backend read failed) is re-read by `init` (ACT-2026-51, resolved). |
| 3 | `init` | Reads the install mappings, the recorded install transports and the TRM packages installed under the package; mappings and install transports read with the installed package's stored name and registry ([ACT-2026-16](shared.md), resolved); re-reads a missing TRM packages table record and aborts before any change when it still can't be read (ACT-2026-51, resolved); dirty packages need confirmation, or the `ignoreDirty` check without prompts; aborts state the reason (ACT-2026-53, resolved). |
| 4 | `check-dependants` | Packages deleted by the same run are ignored (ACT-2026-47, non-relevant); dependants published locally are found ([ACT-2026-15](shared.md), resolved). |
| 5 | `delete-nested-packages` | Runs the delete action for the TRM packages installed in the package's SAP packages and retains their rollbacks (ACT-2026-47, non-relevant). |
| 6 | `lock-resources` | No issue found. |
| 7 | `generate-deletion-transport` | Highest-risk step; an empty deletion list now only warns and skips the deletion transport (ACT-2026-54, resolved), and installed objects moved outside the installation are kept unless confirmed (ACT-2026-52, resolved): final import RC ignored ([ACT-2026-04](shared.md)), namespaces still used by other SAP packages (TDEVC) are kept ([ACT-2026-05](shared.md), resolved), SAP packages of other installations are never cleaned up, as their packages are deleted first (ACT-2026-47, non-relevant); customizing rows of the recorded CUST transports are always deleted by key (ACT-2026-48, resolved); rollback weaknesses ([ACT-2026-06](shared.md), ACT-2026-50); an unauthorized deletion transport aborts with the original authorization error and leaves nothing to restore or forward ([ACT-2026-07](shared.md), resolved); the copy is re-imported only once the deletion import started (ACT-2026-49, resolved). |
| 8 | `forward-deletion-transport` | No issue found; the target is normalized, so the revert removes the transport from the same import queue ([ACT-2026-13](shared.md), resolved). |
| 9 | `remove-package-data` | Atomic and reversible, install transports included; always runs, and fails instead of skipping without a snapshot (ACT-2026-51, resolved). |

## Resolved findings

### ACT-2026-48 — Medium — Functional — Resolved — Customizing and translations are not reliably removed

- **Where:** [`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts) (`getCustomizingSources`); [`install/updatePackageData.ts`](../../src/actions/install/updatePackageData.ts); `/ATRM/INSTALLTR`.
- **Failure (before):** the cleanup only read the single stored transport. On final systems that is the TADIR transport, so customizing was never deleted. On landscape systems the landscape transport carries the CUST entries, but they were re-added without E071K keys, so the registry requested the deletion of the whole table object ([ACT-2026-40](install.md)).
- **Resolution:**
  - Install records the CUST and LANG transports imported on the system in `/ATRM/INSTALLTR` (`setInstallTransports`). Delete and both rollbacks restore or remove these rows in the same LUW as the package row.
  - The cleanup drops entries that have E071K keys from the object selection. It copies each recorded CUST transport still on the system into the deletion transport with `TR_COPY_COMM`, which keeps the keys and `OBJFUNC` `K`. The registry turns those entries into deletions by key, and the rollback copy holds the current rows.
  - Customizing is always deleted, without asking.
  - On update, the old customizing is deleted before the new customizing is imported, so rows the new release still ships are written again. With `noCust` it is kept, because nothing would write it again.
  - The registry accepts customizing-only deletion transports.
  - Installations recorded before this change have no recorded transports, so their customizing is kept.
  - Translations are not deleted separately: they belong to the shipped objects and go with them. LANG transports are only recorded.
  - Not yet validated on SAP: TABU/TDAT/VDAT/CDAT deletions are still `AWAITING_VARIANTS` in the registry deletion campaign.

### ACT-2026-49 — Medium — Technical — Resolved — Revert re-imports the copy even when the deletion was never imported

- **Where:** [`releaseDeletionTransport.ts#L54`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L54), [`packageCleanup.ts#L562`](../../src/actions/commons/utils/packageCleanup.ts#L563).
- **Failure (before):** the snapshot was saved before `registry.delete` and the revert decided only on `canBeDeleted()`, so a registry 500 or a failed test import still triggered a full re-import over live objects; if it failed, staging cleanup was skipped.
- **Resolution:** `deleImportStarted` is set right before `import(false)` (only for the cleanup's own deletion transport). The revert re-imports the copy only when it is set; a released but never imported deletion transport is left as is, and the remaining restore steps and staging cleanup run normally.

### ACT-2026-51 — Medium — Functional — Resolved — Record removal is skipped when the snapshot is missing

- **Where:** [`delete/init.ts#L49`](../../src/actions/delete/init.ts#L51), [`removePackageData.ts#L14`](../../src/actions/delete/removePackageData.ts#L14); backend failure falls back without snapshots ([`SystemConnectorBase.ts#L261`](../../src/systemConnector/SystemConnectorBase.ts#L261)).
- **Failure (before):** objects were deleted and forwarded but the record and mappings remained; the action reported success with only a debug log.
- **Resolution:** delete requires the TRM server APIs, so a missing snapshot means the backend read failed. `init` reads the installed packages again; when the record still can't be read, the delete aborts before any change. `remove-package-data` no longer has a skip filter and throws if the snapshot is missing.

### ACT-2026-52 — Medium — Functional — Resolved — Moved or reassigned objects are deleted anyway

- **Where:** [`packageCleanup.ts#L349`](../../src/actions/commons/utils/packageCleanup.ts#L349).
- **Failure (before):** every install-transport entry was deleted wherever it lived, including objects moved to another package or now shipped by another TRM package.
- **Resolution:** before locking or changing anything, the current TADIR package of every installed `R3TR` object is compared with the installation's packages (including live subpackages). Objects now outside are listed and kept, unless the user confirms the prompt (default no); without prompts they are always kept. `LIMU` entries and package definitions are not checked: package definitions follow the subtree decision ([ACT-2026-47](#act-2026-47--high--functional--non-relevant--uninstall-deletes-objects-outside-the-installation-without-confirmation)).

### ACT-2026-53 — Low — Functional — Resolved — Dirty packages cannot be deleted non-interactively

- **Where:** [`delete/init.ts#L55`](../../src/actions/delete/init.ts#L55).
- **Failure (before):** with `noInquirer` the action always threw a bare "Delete aborted."
- **Resolution:** `deleteData.checks.ignoreDirty` deletes dirty packages without prompts (still logging a warning); without it, non-interactive and declined runs abort with the reason, and the non-interactive error names the option.

### ACT-2026-54 — Low — Functional — Resolved — An empty deletion list still reports a successful delete

- **Where:** [`packageCleanup.ts#L362`](../../src/actions/commons/utils/packageCleanup.ts#L362).
- **Failure (before):** with no installed transport entries and no package to remove (missing transport or E071 rows, no devclass, or every extra-object group declined), an empty deletion transport was still released, sent to the registry, and imported.
- **Resolution:** when the selection holds no objects other than TRM comment rows (and no retained tables), the cleanup logs a warning, deletes the empty transport when possible, and generates no deletion transport, so nothing is forwarded.

## Non-relevant findings

### ACT-2026-47 — High — Functional — Non-relevant — Uninstall deletes objects outside the installation without confirmation

- **Where:** [`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts) (`cleanupInstalledPackage`), [`deleteNestedPackages.ts`](../../src/actions/delete/deleteNestedPackages.ts).
- **Reported failure:** every live subpackage not in the mappings is "locally added", including another TRM package installed underneath; its objects and DEVC are deleted while its record remains. With `noInquirer` extra objects are auto-confirmed (`deleteExtraObjects: true`).
- **Decision:** deleting the whole subtree, other TRM packages included, is the expected behavior, and so is the confirmation without prompts. A package with objects outside its installation is dirty, and deleting a dirty package already requires confirmation or the `ignoreDirty` check ([ACT-2026-53](#act-2026-53--low--functional--resolved--dirty-packages-cannot-be-deleted-non-interactively)).
- **Change made:** the stale record was a real gap. `init` now lists the TRM packages installed in the package's SAP subtree, at any depth. The new `delete-nested-packages` step warns about them and runs the delete action for the outermost ones, with the same options; deeper ones are deleted by those deletes. Each nested delete removes its own objects, customizing and record, and forwards its own deletion transport. Its rollback is retained, so a later failure restores it, and its locks are held until the parent delete ends. Packages deleted by the same run are not dependants. The shared cleanup ignores other installations, which have their own lifecycle: during an upgrade everything else is removed, their SAP packages and subpackages are left untouched, their ancestors stay only as packages, and installed objects now in one of their packages are kept without asking. Without prompts, the extra objects count is now logged as a warning. Upgrading a dirty package now warns too (before, only the same-version overwrite warned).
- **Not covered:** when a nested package can't be deleted (local registry, declined dirty or dependants prompt), the whole delete aborts.
