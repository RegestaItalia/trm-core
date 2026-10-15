# `uninstall` workflow audit

Audit date: 2026-10-15
Entry point: [`uninstall`](../../src/actions/uninstall/index.ts#L179)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared findings ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md), [ACT-2026-92](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-50 — Medium — Technical — The backup export is unchecked

- **Where:** [`packageCleanup.ts#L1031`](../../src/actions/commons/utils/packageCleanup.ts#L1031) (`createBackup` releases with `release(false, true)`, no release log read); the deletion is then generated from the downloaded backup binaries ([`#L1158`](../../src/actions/commons/utils/packageCleanup.ts#L1158) onward).
- **History:** reported 2026-10-07 against the in-memory transport of copies, which an interrupted process lost. Since 2026-10-15 the rollback copy is the `@X1@TRM (BKP)`/`(BKP C)` backup, a released transport kept in the connected system's import queue and listed in the action summary, so that half is resolved. An object that can't be added to the backup is warned about and not deleted.
- **Failure:** an object recorded in the backup whose export fails (release RC 8) is still deleted by the registry-generated deletion, and the rollback re-import can't restore it. Also applies to the upgrade cleanup of `install`.
- **Fix:** read the release log (or the export return code) of the backup and exclude, or abort on, objects that were not exported.

## Step review

| Order | Step | Result |
|---:|---|---|
| — | package lock (pre-workflow) | Released once after the workflow; a release failure is logged with the resources and owner token and doesn't reject a committed uninstall ([ACT-2026-11](shared.md), resolved). A final summary lists the deletions, the BKP backups and the landscape transport ([ACT-2026-92](shared.md), resolved). |
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `set-system-packages` | Local-registry dependants are included in the snapshot ([ACT-2026-15](shared.md), resolved); a missing record snapshot (backend read failed) is re-read by `init` (ACT-2026-51, resolved). |
| 3 | `init` | Reads the install mappings, the recorded install transports and the TRM packages installed under the package; mappings and install transports read with the installed package's stored name and registry ([ACT-2026-16](shared.md), resolved); re-reads a missing TRM packages table record and aborts before any change when it still can't be read (ACT-2026-51, resolved); dirty packages need confirmation, or the `ignoreDirty` check without prompts; aborts state the reason (ACT-2026-53, resolved). Asks for the landscape transport target, except for a `$` installation or a nested uninstall. |
| 4 | `check-dependants` | Packages deleted by the same run are ignored (ACT-2026-47, non-relevant); dependants published locally are found ([ACT-2026-15](shared.md), resolved). |
| 5 | `uninstall-nested-packages` | Runs the uninstall action (`nested: true`) for the TRM packages installed in the package's SAP packages and retains their rollbacks (ACT-2026-47, non-relevant); collects their imported deletion transports for this uninstall's landscape transport. |
| 6 | `lock-resources` | No issue found. |
| 7 | `generate-deletion-transport` | Highest-risk step. Plans the cleanup (every question asked first), backs up what is deleted in `@X1@TRM (BKP)`/`(BKP C)` (kept in the import queue), generates `@X1@TRM (DELE)`/`(DELE C)` through `generateDeletion` with `requireDeletion` (an unavailable registry aborts), and imports them; each import throws at RC ≥ 8 ([ACT-2026-04](shared.md), resolved). Nothing to delete only warns (ACT-2026-54, resolved); installed objects moved outside the installation are kept unless confirmed (ACT-2026-52, resolved); namespaces still used by other SAP packages are kept ([ACT-2026-05](shared.md), resolved); SAP packages of other installations are never cleaned up (ACT-2026-47, non-relevant); customizing of the recorded CUST transports is deleted by key (ACT-2026-48, resolved). The revert re-imports the backups only once a deletion import started (ACT-2026-49, resolved), RC checked ([ACT-2026-06](shared.md), resolved), otherwise only restores the staging TADIR rows; then deletes or dequeues the DELE dummies, and deletes the staging packages only after a complete restore. Backup export unchecked (ACT-2026-50). |
| 8 | `remove-package-data` | Atomic and reversible, install transports included; always runs, and fails instead of skipping without a snapshot (ACT-2026-51, resolved). |
| 9 | `generate-landscape-transport` | Replaces `forward-deletion-transport`: no deletion transport is forwarded anymore. Skipped for a nested uninstall, without a target, or when nothing was deleted; otherwise copies the imported deletion transports, the nested uninstalls' included, into one `@X1@TRM (DELE)` workbench transport with the TRM comments. Revert deletes it while modifiable. No issue found. |
| 10 | `release-landscape-transport` | Last step: a failed release only logs an error and a warning to release it manually, and the uninstall stays done. The revert (a parent rolling back) deletes it or removes it from the target queue when it's the connected system, otherwise warns ([ACT-2026-29](install.md), resolved). The final summary reports it as not released ([ACT-2026-92](shared.md), resolved). |

## Resolved findings

### ACT-2026-48 — Medium — Functional — Resolved — Customizing and translations are not reliably removed

- **Where:** [`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts) (`getCustomizingSources`); [`install/updatePackageData.ts`](../../src/actions/install/updatePackageData.ts); `/ATRM/INSTALLTR`.
- **Failure (before):** the cleanup only read the single stored transport. On final systems that is the TADIR transport, so customizing was never deleted. On landscape systems the landscape transport carries the CUST entries, but they were re-added without E071K keys, so the registry requested the deletion of the whole table object ([ACT-2026-40](install.md)).
- **Resolution:**
  - Install records the CUST and LANG transports imported on the system in `/ATRM/INSTALLTR` (`setInstallTransports`). Uninstall and both rollbacks restore or remove these rows in the same LUW as the package row.
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

- **Where:** [`uninstall/init.ts#L49`](../../src/actions/uninstall/init.ts#L51), [`removePackageData.ts#L14`](../../src/actions/uninstall/removePackageData.ts#L14); backend failure falls back without snapshots ([`SystemConnectorBase.ts#L261`](../../src/systemConnector/SystemConnectorBase.ts#L261)).
- **Failure (before):** objects were deleted and forwarded but the record and mappings remained; the action reported success with only a debug log.
- **Resolution:** uninstall requires the TRM server APIs, so a missing snapshot means the backend read failed. `init` reads the installed packages again; when the record still can't be read, the uninstall aborts before any change. `remove-package-data` no longer has a skip filter and throws if the snapshot is missing.

### ACT-2026-52 — Medium — Functional — Resolved — Moved or reassigned objects are deleted anyway

- **Where:** [`packageCleanup.ts#L349`](../../src/actions/commons/utils/packageCleanup.ts#L349).
- **Failure (before):** every install-transport entry was deleted wherever it lived, including objects moved to another package or now shipped by another TRM package.
- **Resolution:** before locking or changing anything, the current TADIR package of every installed `R3TR` object is compared with the installation's packages (including live subpackages). Objects now outside are listed and kept, unless the user confirms the prompt (default no); without prompts they are always kept. `LIMU` entries and package definitions are not checked: package definitions follow the subtree decision ([ACT-2026-47](#act-2026-47--high--functional--non-relevant--uninstall-deletes-objects-outside-the-installation-without-confirmation)).

### ACT-2026-53 — Low — Functional — Resolved — Dirty packages cannot be deleted non-interactively

- **Where:** [`uninstall/init.ts#L55`](../../src/actions/uninstall/init.ts#L55).
- **Failure (before):** with `noInquirer` the action always threw a bare "Uninstall aborted."
- **Resolution:** `uninstallData.checks.ignoreDirty` deletes dirty packages without prompts (still logging a warning); without it, non-interactive and declined runs abort with the reason, and the non-interactive error names the option.

### ACT-2026-54 — Low — Functional — Resolved — An empty deletion list still reports a successful uninstall

- **Where:** [`packageCleanup.ts#L362`](../../src/actions/commons/utils/packageCleanup.ts#L362).
- **Failure (before):** with no installed transport entries and no package to remove (missing transport or E071 rows, no devclass, or every extra-object group declined), an empty deletion transport was still released, sent to the registry, and imported.
- **Resolution:** when the selection holds no objects other than TRM comment rows (and no retained tables), the cleanup logs a warning, deletes the empty transport when possible, and generates no deletion transport, so nothing is forwarded.

## Non-relevant findings

### ACT-2026-47 — High — Functional — Non-relevant — Uninstall deletes objects outside the installation without confirmation

- **Where:** [`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts) (`cleanupInstalledPackage`), [`uninstallNestedPackages.ts`](../../src/actions/uninstall/uninstallNestedPackages.ts).
- **Reported failure:** every live subpackage not in the mappings is "locally added", including another TRM package installed underneath; its objects and DEVC are deleted while its record remains. With `noInquirer` extra objects are auto-confirmed (`deleteExtraObjects: true`).
- **Decision:** deleting the whole subtree, other TRM packages included, is the expected behavior, and so is the confirmation without prompts. A package with objects outside its installation is dirty, and deleting a dirty package already requires confirmation or the `ignoreDirty` check ([ACT-2026-53](#act-2026-53--low--functional--resolved--dirty-packages-cannot-be-deleted-non-interactively)).
- **Change made:** the stale record was a real gap. `init` now lists the TRM packages installed in the package's SAP subtree, at any depth. The new `uninstall-nested-packages` step warns about them and runs the uninstall action for the outermost ones, with the same options; deeper ones are deleted by those uninstalls. Each nested uninstall removes its own objects, customizing and record, and forwards its own deletion transport (since 2026-10-15 nothing is forwarded: a nested uninstall generates no landscape transport, and its imported deletions are copied into the parent's). Its rollback is retained, so a later failure restores it, and its locks are held until the parent uninstall ends. Packages deleted by the same run are not dependants. The shared cleanup ignores other installations, which have their own lifecycle: during an upgrade everything else is removed, their SAP packages and subpackages are left untouched, their ancestors stay only as packages, and installed objects now in one of their packages are kept without asking. Without prompts, the extra objects count is now logged as a warning. Upgrading a dirty package now warns too (before, only the same-version overwrite warned).
- **Not covered:** when a nested package can't be deleted (local registry, declined dirty or dependants prompt), the whole uninstall aborts.
