# `install` workflow audit

Audit date: 2026-10-15
Entry point: [`install`](../../src/actions/install/index.ts#L388)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-46 — Low — Technical — A failed reconnect leaves the rollback on a closed connection

- **Where:** a failed reconnect at [`importBatch.ts#L416`](../../src/actions/install/importBatch.ts#L416) leaves every revert on a closed connection. (The debug-only download failures of the `prepare*` dummies, the other half of this finding, were removed on 2026-10-15: the dummies are no longer downloaded or re-imported.)
- **Fix:** reconnect at the start of the revert.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Fails closed on any result other than a granted authorization ([ACT-2026-12](shared.md), resolved). |
| 2 | `set-system-packages` | Snapshot includes local-registry packages ([ACT-2026-15](shared.md), resolved); packages installed by dependency installs, transitive ones included, are merged into it ([ACT-2026-24](#act-2026-24--resolved--transitive-installs-are-merged-into-the-parent-snapshot), resolved). |
| 3 | `init` | The input name is replaced with the fetched manifest name, used for the mapping and transport lookups and writes ([ACT-2026-16](shared.md), resolved); a local (`.trm`) artifact is resolved to the registry it was published to (`runtime.installRegistry`), used for the mapping and transport lookups ([ACT-2026-26](#act-2026-26--resolved--local-trm-installs-are-recorded-under-the-real-registry), resolved). With a lockfile, the release is the lockfile root: its version and integrity are used when none is requested, and a conflicting package, version, tag, local artifact, registry, or integrity aborts before any change ([ACT-2026-45](#act-2026-45--resolved--root-release-is-checked-against-the-lockfile), resolved). An explicit transport layer is validated; the system default is no longer looked up here ([ACT-2026-42](#act-2026-42--resolved--transport-layer-is-required-only-for-generated-transportable-packages), resolved). Revert is the only cleanup point for early failures (ACT-2026-37). |
| 4 | `check-dependants` | A nested dependency upgrade is checked against the manifest the parent is installing, not its installed one ([ACT-2026-23](#act-2026-23--resolved--nested-dependency-upgrades-are-checked-against-the-parents-new-manifest), resolved); a direct upgrade still aborts while an installed dependant requires an incompatible range. |
| 5 | `check-transports` | The update root devclass is taken from the package being updated, never from a same-named package of another registry ([ACT-2026-15](shared.md), resolved); when the installed root devclass is unknown, existing objects need confirmation interactively, and non-interactive mode fails unless `noExistingObjects` is set ([ACT-2026-36](#act-2026-36--resolved--non-interactive-upgrade-fails-closed-when-the-root-devclass-is-unknown), resolved). |
| 6 | `check-sap-entries` | See [check-sap-entries findings](check-sap-entries.md); each missing entry is logged at error level before aborting. |
| 7 | `check-engines` | No install-specific issue; a failed `anyOf` lists each alternative's unmet requirements ([ACT-2026-76](check-engines.md), resolved). |
| 8 | `check-dependencies` | Queues missing and incompatible dependencies separately, with the installed version; a downgrade must be confirmed by the dependency install ([ACT-2026-81](install-dependency.md), resolved). |
| 9 | `check-dependency-cycles` | Walks the dependencies the install would recurse into (compatible installed dependencies end the walk; others resolve to the release a dependency install would select) and aborts on a self or cyclic dependency before anything is locked or installed ([ACT-2026-82](install-dependency.md), resolved). Following the install order, it records the version each dependency ends up with (release to install, or compatible installed release kept) and aborts when a later range in the graph is not satisfied by it, so a version conflict on a shared dependency stops the install before any dependency is installed ([ACT-2026-24](#act-2026-24--resolved--transitive-installs-are-merged-into-the-parent-snapshot), resolved). Skipped with `noDependencies`. |
| 10 | `set-install-devclass` | Stored and explicit mappings of devclasses not in the release are dropped before use ([ACT-2026-25](#act-2026-25--resolved--stored-mappings-of-removed-devclasses-are-ignored), resolved); new devclasses in the original root's namespace are moved to the installed root's namespace, matched literally ([ACT-2026-33](#act-2026-33--resolved--namespace-carry-over-matches-the-original-roots-namespace), resolved); on upgrades, explicit replacements are merged over the stored mappings, which keep the devclasses they don't mention renamed ([ACT-2026-35](#act-2026-35--resolved--explicit-replacements-are-merged-over-the-stored-mappings), resolved); an unknown installed root devclass falls back to the stored root replacement, or skips the namespace carry-over ([ACT-2026-41](#act-2026-41--resolved--unknown-installed-root-devclass-no-longer-throws), resolved). Rejects target names using more than one reserved namespace ([ACT-2026-34](#act-2026-34--resolved--install-namespace-is-derived-from-the-root-and-limited-to-one), resolved). |
| 11 | `check-install-devclass` | Rejects install packages inside, or containing, the SAP packages of another installed TRM package before anything is locked; the package's own installed tree stays allowed on upgrade. No issue found. |
| 12 | `lock-resources` | Locks the custom install namespace, unless a parent install already holds it, then repeats the object-lock check and fails on objects created since `check-transports` (warns with `noExistingObjects`) ([ACT-2026-38](#act-2026-38--resolved--safety-checks-are-repeated-once-locked-the-install-namespace-is-locked), resolved). The package lock uses the resolved install registry, so local and remote installs of the same package block each other ([ACT-2026-26](#act-2026-26--resolved--local-trm-installs-are-recorded-under-the-real-registry), resolved). |
| 13 | `install-dependencies` | On upgrade, each dependency install receives the parent's new manifest in its package snapshot ([ACT-2026-23](#act-2026-23--resolved--nested-dependency-upgrades-are-checked-against-the-parents-new-manifest), resolved). Each dependency install starts with no package mappings and resolves its own ([ACT-2026-22](#act-2026-22--resolved--dependency-installs-no-longer-inherit-the-parents-package-mappings), resolved). Every package a dependency install installed, transitive ones included, is merged into the parent snapshot, so a dependency shared by two siblings (diamond) is installed once and found installed by the second; after a successful rollback the snapshot taken before the dependency installs is restored ([ACT-2026-24](#act-2026-24--resolved--transitive-installs-are-merged-into-the-parent-snapshot), resolved). |
| 14 | `cleanup-checkpoint` | Changes nothing; its revert deletes the generated SAP packages and namespace (and any imported entries not yet cleaned up) and restores the package transport layers and hierarchy, before `install-dependencies` rolls back the dependencies ([ACT-2026-37](#act-2026-37--resolved--parent-cleanup-runs-before-the-dependency-rollback), resolved). |
| 15 | `add-namespace` | Namespace derived from the target root package, or from the only reserved namespace used by a subpackage; more than one reserved namespace is rejected before any system change ([ACT-2026-34](#act-2026-34--resolved--install-namespace-is-derived-from-the-root-and-limited-to-one), resolved). |
| 16 | `generate-devclass` | A dependency's mappings no longer include the parent's root ([ACT-2026-22](#act-2026-22--resolved--dependency-installs-no-longer-inherit-the-parents-package-mappings), resolved); stale stored mappings no longer reach it ([ACT-2026-25](#act-2026-25--resolved--stored-mappings-of-removed-devclasses-are-ignored), resolved). Resolves the system default transport layer only when transportable packages must be created, before any package is created; local (`$`) packages are created without a layer (ACT-2026-42, resolved). |
| 17 | `plan-update-cleanup` | Replaces `generate-update-transport` and `generate-post-import-update-transport`. On upgrade (downgrade included) plans, before anything changes, what the installed release loses: objects the incoming release ships are never deleted; customizing rows shipped by the incoming CUST transports, imported or skipped, are kept, and with `noCust` the installed customizing is kept ([ACT-2026-48](uninstall.md), resolved). Runs for local (`.trm`) upgrades too (ACT-2026-32, resolved). No issue found. |
| 18 | `prepare-backup` | Backs up, in `@X1@TRM (BKP)`/`(BKP C)` released transports of copies kept in the import queue, what the cleanup may delete and the objects of the incoming release already on the system (generated packages and namespace excluded; objects in `$` packages are kept with a warning) (ACT-2026-30, resolved); a trm-server/trm-rest upgrade backs up only the cleanup. Revert restores the staging TADIR rows and deletes the staging packages unless the rollback cleanup of the imported objects failed ([ACT-2026-09](shared.md), resolved); backups are never deleted. Backup export checked through its release log ([ACT-2026-50](uninstall.md), resolved). |
| 19–22 | `prepare-devc`, `prepare-tadir`, `prepare-lang`, `prepare-cust` | Forward flow correct; test imports fail at RC ≥ 8. The reverts delete each dummy while modifiable or take it out of the connected system's queue, and never re-import a snapshot: the objects come back from the backups ([ACT-2026-06](shared.md), resolved). `prepare-cust` revert attempts every customizing dummy and surfaces the first failure ([ACT-2026-39](#act-2026-39--resolved--prepare-cust-revert-attempts-every-customizing-transport), resolved). |
| 23 | `prepare-deletion` | On upgrade, generates `@X1@TRM (DELE)`/`(DELE C)` from the backups through `generateDeletion`, subtracting the incoming registry transports (or excluding their objects and keys when the registry doesn't store them: fixed trm-server/trm-rest TADIR transport, local artifacts), with the confirmed preview; uploads and test-imports them, never imports. An unavailable registry dequeues the dummy, lists the leftovers and continues; nothing to delete dequeues the dummy. Revert deletes or dequeues every dummy. No issue found. |
| 24 | `import-batch` | Imports the prepared transports and, last, the upgrade deletions in one batch (one at a time on a legacy backend, SAP packages first); every result is checked and the first one with RC ≥ 8 or without a return code fails the step (INST-02, resolved). Then deletes the emptied `$` packages of the plan, reconnects, and writes TADIR only for imported objects whose live row differs. The rollback cleanup leaves out every backed-up object (installed objects, tables the upgrade keeps, objects already on the system), so tables keep their data and kept SAP packages are never deleted ([ACT-2026-28](#act-2026-28--resolved--upgrade-rollback-after-import-keeps-retained-tables), [ACT-2026-30](#act-2026-30--resolved--existing-objects-are-backed-up-and-restored-instead-of-deleted-on-rollback), resolved); only once that cleanup succeeded are the BKP backups re-imported (RC checked, [ACT-2026-06](shared.md), resolved) and the previous TADIR rows restored, otherwise the backups are named for a manual restore. The rollback cleanup omits LANG entries ([ACT-2026-91](#act-2026-91--resolved--rollback-does-not-add-lang-entries-to-deletion-transports), resolved), copies imported CUST transports with their E071K keys, skips a CUST transport never imported, and a failed copy blocks the restore ([ACT-2026-40](#act-2026-40--resolved--rollback-cleanup-copies-the-imported-customizing-transports), resolved); its deletion transport goes through `generateDeletion`, with the real registry of a local artifact ([ACT-2026-27](#act-2026-27--resolved--local-registry-rollback-generates-deletion-transports-through-the-real-registry), resolved). A trm-server/trm-rest upgrade is never rolled back once imported (warns). A failed reconnect leaves the reverts on a closed connection (ACT-2026-46). |
| 25 | `import-update-deletion` | trm-server/trm-rest upgrades only: imports the deletions after the batch, as the installed backend runs the install. A failed import (RC ≥ 8) warns, leaves the previous release's objects, and drops that deletion from the landscape transport; the upgrade is not undone. Then deletes the emptied `$` packages. No issue found. |
| 26 | `generate-landscape-transport` | Skipped for `$` packages and without a target. Also copies the imported upgrade deletions (`TR_COPY_COMM`), so the following systems get the same cleanup with this one transport; when deletions are present, a failed object lock only warns. A namespace locked in another transport is omitted with a warning naming the locking transport ([ACT-2026-44](#act-2026-44--resolved--locked-namespace-is-omitted-from-the-landscape-transport-with-a-warning), resolved). |
| 27 | `execute-post-activities` | Global prefix clobbered ([ACT-2026-18](shared.md)). `&LANDSCAPE_TRANSPORT&` intentionally resolves to an empty string without a landscape transport (ACT-2026-43, non-relevant). |
| 28 | `update-package-data` | On upgrades, reads the stored TRM packages row through `getTrmPackageData` before any write, aborting when the read fails; the revert restores the metadata in one atomic SAP operation: the stored row, or the deletion of the written row when none was stored, with the previous mappings and install transports ([ACT-2026-31](#act-2026-31--resolved--upgrade-metadata-revert-restores-the-row-read-before-writing), resolved). After writing the new mappings, deletes the stored rows of devclasses no longer installed through `deleteInstallDevc`; the atomic revert replaces them with the previous ones ([ACT-2026-90](#act-2026-90--resolved--mappings-of-removed-devclasses-are-deleted), resolved). Records the imported CUST and LANG transports, plus the installed CUST transports that still own rows kept by the cleanup (all of them with `noCust`), in `/ATRM/INSTALLTR` and restores the previous ones on revert ([ACT-2026-48](uninstall.md), resolved). |
| 29 | `release-install-transports` | Last step, after the package record: releases the landscape transport, which carries the whole upgrade, deletions included (no deletion transport is forwarded). A failed release logs an error and a warning to release it manually; the install stays done. The revert (a parent rolling back a dependency install) deletes it, or removes it from the target queue when it is the connected system, otherwise warns ([ACT-2026-29](#act-2026-29--resolved--a-released-landscape-transport-is-removed-from-the-connected-systems-queue-otherwise-reported), resolved); queue polling unbounded ([ACT-2026-14](shared.md)); the final summary reports it as not released ([ACT-2026-92](shared.md), resolved). |

## Resolved findings

### INST-02 — Resolved — Import return codes are enforced

- **History:** accepted as Non-relevant ("install steps rely on `Transport.import()` to interpret and report TMS return codes"). The 2026-10-07 audit asked to re-decide it: the batch import through `Transport.importMultiple` discarded the per-transport results, so a final import with RC 8/12 continued to TADIR finalization, landscape release and the package record, and reported success (recommended severity High).
- **Resolution (2026-10-15):** imports fail from RC 8, or without a return code, with a `TransportImportError` ([`TransportImportError.ts`](../../src/transport/TransportImportError.ts)). `import-batch` checks every result of the batch, and every single import on a legacy backend ([`importBatch.ts#L392`](../../src/actions/install/importBatch.ts#L392)); test imports, deletion imports and restores use the same threshold ([ACT-2026-04](shared.md), [ACT-2026-06](shared.md)). The import wait reads the request status first and takes the higher of the queue and tp return codes.

### ACT-2026-91 — Resolved — Rollback does not add LANG entries to deletion transports

- **Observed:** 2026-10-14 from a reproduced upgrade log. After a later step failed, `import-batch`
  copied the imported LANG transport's E071 rows into the workbench cleanup set. SAP rejected every
  `PGMID = LANG` row in `ADD_OBJS_TR` with `Unknown syntax`. Those failed additions marked cleanup
  unsuccessful, so the rollback withheld the previous-object and retained-table restores; the
  remaining partial cleanup transport was also imported with RC 8.
- **Fix:** `cleanupEntries` now excludes LANG rows before building the deletion transport.
  Translations are carried by their owning repository objects and are removed or restored with those
  objects. A regression test covers normalization and verifies that ordinary workbench entries still
  reach the cleanup transport.

### ACT-2026-45 — Resolved — Root release is checked against the lockfile

- **Original severity:** Low — Functional.
- **Original issue:** `checks.lockfile` was only consumed for dependencies: the root release defaulted to `latest` even though the lockfile records the root name and version, a lockfile generated for another package was accepted, and `install/init.ts` ignored the requested version for local files.
- **Resolution:** the lockfile now also records the root registry and integrity ([`Lockfile.generate`](../../src/lockfile/Lockfile.ts); a missing root integrity is warned about and omitted). Before fetching, [`init`](../../src/actions/install/init.ts) applies the lockfile root (`Lockfile.getRootLock`) to the requested release: the root version is used when none is requested and the root integrity when none is expected; a package name other than the root, an explicit version, or an explicit integrity that conflicts with the root aborts. After fetching, a release whose name or version differs from the root (a distribution tag, or a local artifact) or whose resolved install registry differs from the recorded one aborts, and the root integrity is verified by the existing integrity check, all before any system change. Dependency installs are marked (`dependency: true`) and keep using only the lockfile dependency entries. `trm clean-install` no longer defaults the version to `latest`.
- **Regression coverage:** [`init.integrity.test.ts`](../../src/actions/install/init.integrity.test.ts) covers the root version and integrity defaults, conflicting version, tag, integrity, package, registry, and local artifact, lockfiles without root or root integrity, and dependency installs; [`Lockfile.test.ts`](../../src/lockfile/Lockfile.test.ts) covers the recorded root.

### ACT-2026-37 — Resolved — Parent cleanup runs before the dependency rollback

- **Where:** [`cleanupCheckpoint.ts`](../../src/actions/install/cleanupCheckpoint.ts), [`install/index.ts`](../../src/actions/install/index.ts); formerly `init` revert.
- **Was:** the parent's fallback cleanup (generated packages, namespace, package layers and hierarchy) ran in the `init` revert, after `install-dependencies` rolled back the dependencies. A failure in `add-namespace`, `generate-devclass`, `generate-update-transport` or `prepare-devc` could roll back a dependency (possibly deleting a namespace) before the parent's packages in that namespace were cleaned.
- **Fix:** the cleanup moved to the revert of the new `cleanup-checkpoint` step, which runs right after `install-dependencies`; `init` has no revert. The cleanup runs before the dependency rollback whatever later step fails; each restore is attempted and the first failure surfaced, and a failed cleanup skips the package restores but still lets the dependencies roll back. Covered by [`installMutationRollback.test.ts`](../../src/actions/install/installMutationRollback.test.ts).

### ACT-2026-35 — Resolved — Explicit replacements are merged over the stored mappings

- **Where:** [`setInstallDevclass.ts`](../../src/actions/install/setInstallDevclass.ts).
- **Was:** stored mappings were read only when no explicit replacement was given: passing one replacement for a new subpackage made every previously renamed devclass fall back to its publisher name (non-interactive).
- **Fix:** on upgrades, the stored mappings (`runtime.previousInstallPackages`, read by `init`) are added under the explicit replacements: an explicit row wins for its devclass, stored rows keep the others. First installs have no stored mappings and are unchanged. Covered by [`setInstallDevclass.test.ts`](../../src/actions/install/setInstallDevclass.test.ts).

### ACT-2026-33 — Resolved — Namespace carry-over matches the original root's namespace

- **Where:** [`setInstallDevclass.ts`](../../src/actions/install/setInstallDevclass.ts).
- **Was:** the pattern was the namespace of the root's *install* devclass, applied to *original* names, and unescaped (`$` is a regex anchor). With ZFOO installed as /ACME/FOO, a new ZFOO_B stayed ZFOO_B under the /ACME/ root in non-interactive mode.
- **Fix:** the pattern is the namespace of the original root, escaped and anchored to the start of the original name; the installed namespace is written literally (a `$` namespace is not read as a replacement token). New devclasses outside the original root's namespace keep their name. Covered by [`setInstallDevclass.test.ts`](../../src/actions/install/setInstallDevclass.test.ts).

### ACT-2026-31 — Resolved — Upgrade metadata revert restores the row read before writing

- **Where:** [`updatePackageData.ts`](../../src/actions/install/updatePackageData.ts); [`SystemConnectorBase.getTrmPackageData`](../../src/systemConnector/SystemConnectorBase.ts).
- **Was:** the previous TRM packages row came only from the snapshot set when the installed packages were read through the backend API. Without it, an upgrade revert restored only the mappings (or nothing): the new version and transport row survived over rolled-back objects, notably in parent-driven dependency rollbacks.
- **Fix:** on upgrades, `update-package-data` reads the stored row through the new `SystemConnector.getTrmPackageData` (`/ATRM/GET_INSTALLED_PACKAGES` and REST `get_installed_packages`, filtered by name and registry, matched exactly on both; the entries listed for trm-server/trm-rest installed through abapGit have no row) before any write; a failed read aborts before writing. The revert always uses `restoreInstallMetadata` (`/ATRM/SET_INSTALL_DEVC`), which atomically writes the stored row or, when none was stored, deletes the written one, and replaces the mappings and install transports with the previous ones. A row the backend can't list (its SAP package or transport no longer on the system) is read as missing, and removed by the revert. Covered by [`updatePackageData.test.ts`](../../src/actions/install/updatePackageData.test.ts) and [`SystemConnectorBase.packageData.test.ts`](../../src/systemConnector/SystemConnectorBase.packageData.test.ts).

### ACT-2026-30 — Resolved — Existing objects are backed up and restored instead of deleted on rollback

- **Where:** [`importBatch.ts`](../../src/actions/install/importBatch.ts) `backupExistingObjects`, `restoreExistingObjects`, `cleanupEntries`.
- **Was:** the rollback cleanup deleted every imported entry. Objects overwritten under `noExistingObjects`, and kept-original SAP packages (their definition is in the imported DEVC transport but not in the stored TADIR transport of a final system, so no upgrade snapshot covers them), were deleted and never restored; deleting a kept package also broke the restore of the previous release's objects.
- **Fix:** before the import, `import-batch` reads which imported R3TR objects already exist (generated packages, the added namespace, and tables retained by the upgrade excluded) and records their TADIR rows, then backs them up, SAP packages included, in a released transport of copies. The rollback leaves them out of the cleanup transport and the temporary-package deletion, so their packages are never deleted. Only once the cleanup succeeded is the backup re-imported over the imported version, then their TADIR rows restored, each attempted and the first failure surfaced; after a failed cleanup the backup is reported, not restored. Objects in temporary packages, or refused by SAP, are kept with their imported version and a warning. A failure before the import aborts it and deletes an unreleased backup. Covered by [`importBatch.test.ts`](../../src/actions/install/importBatch.test.ts).

### ACT-2026-28 — Resolved — Upgrade rollback after import keeps retained tables

- **Where:** [`importBatch.ts`](../../src/actions/install/importBatch.ts) `cleanupEntries`; [`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts) `backupRetainedTables`.
- **Was:** the rollback cleanup included every imported E071, so a failure in landscape generation, post-activities, release or package-data deleted the retained `R3TR TABL` objects, and the revert recreated them from a definition-only backup: table data was lost.
- **Fix:** the upgrade cleanup records the retained tables (`revert.retainedTableObjects`) with their backup. Once the backup exists, the `import-batch` rollback leaves them out of the cleanup transport; the `generate-update-transport` revert re-imports their previous definition over the new one, keeping the data. When the import cleanup fails, the backup is not restored and the tables keep the new definition. Covered by [`importBatch.test.ts`](../../src/actions/install/importBatch.test.ts) and [`generateUpdateTransport.test.ts`](../../src/actions/install/generateUpdateTransport.test.ts).

### ACT-2026-24 — Resolved — Transitive installs are merged into the parent snapshot

- **Where:** [`installDependencies.ts`](../../src/actions/install/installDependencies.ts), [`install/index.ts`](../../src/actions/install/index.ts), [`installDependency`](../../src/actions/installDependency/index.ts).
- **Was:** A→B, A→C, B→D, C→D with D missing: B installed D in its cloned snapshot only, so C reinstalled D and failed on D's package lock or on existing objects, rolling back the whole install.
- **Fix:** each install records every package its dependency installs installed (`runtime.installedDependencies`, transitive ones included). `installWithRollback` and `installDependency` return them as `installedPackages`, and the parent upserts them, followed by the direct dependency, into its own snapshot. The next dependency receives a clone of that snapshot, so `check-installed-release` keeps a compatible D as a no-op and C's own `check-dependencies` no longer lists it. The step revert restores the snapshot taken before the dependency installs, only after every dependency rollback succeeded. Covered by [`installDependencies.test.ts`](../../src/actions/install/installDependencies.test.ts) and [`installDependency.test.ts`](../../src/actions/installDependency/installDependency.test.ts).
- **Version conflicts:** a shared dependency whose planned version (installed by the first sibling, or kept installed) does not satisfy a later sibling's range would still fail midway on the held package lock or on `check-dependants`. `check-dependency-cycles` now walks the graph in install order, records the version each dependency ends up with, and aborts with both requirements before anything is locked or installed. Covered by [`checkDependencyCycles.test.ts`](../../src/actions/install/checkDependencyCycles.test.ts).

### ACT-2026-23 — Resolved — Nested dependency upgrades are checked against the parent's new manifest

On an upgrade, `install-dependencies` replaces the parent's manifest in each dependency install's
cloned package snapshot with the manifest being installed
([source](../../src/actions/install/installDependencies.ts#L91)). Installing P v2 (D ^2) over P v1
(D ^1) now upgrades D, as `check-dependants` reads P's new range; other installed dependants still
requiring D ^1 keep blocking the upgrade. The parent's own snapshot is unchanged. Installing D
directly while P v1 is installed still aborts by design: P must be upgraded first.

### ACT-2026-29 — Resolved — A released landscape transport is removed from the connected system's queue, otherwise reported

`release-install-transports` marks `landscapeReleaseStarted` before the release (SAP may export the
transport and still fail). When its revert cannot delete the landscape transport because it was
released, it removes it from the target import queue only when the target is the connected system
(`removeFromImportQueue`); another system's queue would need that system's credentials, so the revert
logs a warning naming the transport and the target system, asking the operator to remove it in STMS.
A status that can't be read after a release is reported the same way. The forwarded deletion
transport follows the same rule, in install and uninstall
([source](../../src/actions/commons/utils/packageCleanup.ts#L724)). Since 2026-10-15 no deletion transport is forwarded: the landscape transport carries the deletions, it is released last, and a failed release only warns ([`landscapeTransport.ts`](../../src/actions/commons/utils/landscapeTransport.ts)).

### ACT-2026-38 — Resolved — Safety checks are repeated once locked; the install namespace is locked

`lock-resources` now locks the install namespace when it is a custom (`/XXX/`) namespace, so two
installs can no longer both find it missing and create it, with one's rollback deleting it while the
other uses it. A dependency install receives the namespaces its parent installs hold
(`installWithRollback`'s `inheritedNamespaceLocks`) and does not lock them again, as the parent keeps
them locked until the whole install finishes. Once the locks are held, the step repeats the checks of
`check-transports` that another action could have invalidated: objects locked in a transport abort
the install, and objects created on the system since the existence check abort it too (a warning with
`noExistingObjects`). The interactive checks and prompts still run before locking, and the uninstall and
upgrade cleanup do not lock the namespaces they delete ([source](../../src/actions/install/lockResources.ts#L74)).

### ACT-2026-39 — Resolved — `prepare-cust` revert attempts every customizing transport

The `prepare-cust` revert now catches the failure of each `revertPreparedTransport` call, for the
restored snapshots and for the generated dummies without a snapshot, and continues with the
remaining customizing transports. The first failure is thrown after every transport has been
attempted ([source](../../src/actions/install/prepareCust.ts#L102)).

### ACT-2026-40 — Resolved — Rollback cleanup copies the imported customizing transports

`import-batch` no longer puts the entries of the CUST transports in `importedEntries`; it records the
imported CUST transports instead (`revert.importedCustomizing`). The rollback cleanup copies each one
still on the system into the cleanup transport with `addObjectsFromTransport` (`TR_COPY_COMM`), which
keeps the E071K keys and `OBJFUNC` `K`, as the upgrade and uninstall cleanup do
([ACT-2026-48](uninstall.md)). The registry therefore turns the imported customizing into deletions by
key instead of requesting the deletion of whole table objects. A CUST transport that never reached
the system is skipped; a failed copy is logged, the rest of the cleanup still runs, and the restore
of the previous payloads is blocked (`cleanupSucceeded = false`)
([source](../../src/actions/install/importBatch.ts#L119)).

### ACT-2026-44 — Resolved — Locked namespace is omitted from the landscape transport with a warning

When the namespace generated by the install is already locked in another transport,
`generate-landscape-transport` still leaves it out of the landscape transport, but now logs a warning
naming the namespace and the locking transport(s), so the operator knows it must be transported
separately ([source](../../src/actions/install/generateLandscapeTransport.ts#L90)).

### ACT-2026-22 — Resolved — Dependency installs no longer inherit the parent's package mappings

`install-dependencies` still forwards the parent's install options to each dependency install, but
resets `installDevclass.replacements` to an empty list (besides dropping `keepOriginal`), so the
mappings `set-install-devclass` resolved for the parent's devclasses never reach the dependency. The
dependency's own `set-install-devclass` therefore reads its stored mappings and maps only its own
devclasses: `generate-devclass` no longer sees the parent's root, the `$` consistency check and
namespace derivation apply to the dependency alone, and the parent's rows are not persisted as the
dependency's ([source](../../src/actions/install/installDependencies.ts#L91)).

### ACT-2026-32 — Resolved — Local-registry upgrades clean up obsolete objects

`generate-update-transport` no longer skips upgrades from a local (`.trm`) artifact. The skip existed
because the file registry cannot generate deletion transports; they are now generated by the registry
the artifact was published to ([ACT-2026-27](#act-2026-27--resolved--local-registry-rollback-generates-deletion-transports-through-the-real-registry)),
so objects removed in the new release are deleted and the deletion is forwarded like for a remote
upgrade ([source](../../src/actions/install/generateUpdateTransport.ts#L27)).

### ACT-2026-27 — Resolved — Local-registry rollback generates deletion transports through the real registry

`releaseDeletionTransport` now resolves the registry before releasing the transport: for a local
(`.trm`) artifact, the registry in its manifest (`resolveInstallRegistry`), since the file registry
cannot generate deletion transports. The rollback cleanup of a local install therefore completes and
`cleanupSucceeded` allows the restores. An unreadable artifact fails before the transport is released.
The fix is shared by every deletion transport (rollback cleanup, upgrade cleanup, uninstall action)
([source](../../src/actions/commons/utils/releaseDeletionTransport.ts#L17)).

### ACT-2026-26 — Resolved — Local (`.trm`) installs are recorded under the real registry

`init` now resolves the registry the package is recorded under once (`runtime.installRegistry`):
for a local artifact, the registry in its manifest, through `FileSystem.getRealPackage`; otherwise the
input registry. The stored mapping and transport lookups (`init`, `set-install-devclass`), the package
lock (`lock-resources`), and the metadata write (`update-package-data`, through `installRegistryKey`)
all use it, so upgrading a renamed package from a `.trm` file finds its stored mappings, and the
ACT-2026-25 filter and ACT-2026-90 deletion apply to local installs too. The workflow-level package
lock taken before `init` resolves the artifact's real name and registry the same way, so local and
remote installs of the same package block each other
([source](../../src/actions/install/init.ts#L115)).

### ACT-2026-90 — Resolved — Mappings of removed devclasses are deleted

trm-server now provides `/ATRM/DELETE_INSTALL_DEVC` (RFC) and the `delete_install_devc` REST route
(`DELETE`, body `{ installdevc }`), both calling `/ATRM/CL_UTILITIES=>delete_install_devclass`, which
deletes the given `/ATRM/INSTDEVC` keys. trm-core exposes it as `SystemConnector.deleteInstallDevc`.
After writing the new mappings, `update-package-data` deletes the stored rows whose original devclass
is not rewritten (removed devclasses, or every renamed mapping when the upgrade keeps the original
names), so the update and uninstall cleanups no longer see them. Without a metadata snapshot, the revert
deletes the mappings this install added before re-upserting the previous ones (which also restores the
deleted rows), attempts each operation, and surfaces the first failure; with a snapshot,
`restoreInstallMetadata` replaces them atomically
([source](../../src/actions/install/updatePackageData.ts#L97)).

### ACT-2026-25 — Resolved — Stored mappings of removed devclasses are ignored

`set-install-devclass` now drops replacements, stored or explicit, whose original devclass is not part
of the incoming release before anything else uses them, including the keep-original shortcut. A
devclass removed in the new version therefore no longer becomes a second root in `generate-devclass`,
is no longer counted as kept by the update cleanup (so the upgrade removes it as obsolete), and is no
longer written back. Its existing row in `/ATRM/INSTDEVC` is not deleted, because that write only
upserts: it is deleted by `update-package-data`, see [ACT-2026-90](#act-2026-90--resolved--mappings-of-removed-devclasses-are-deleted) ([source](../../src/actions/install/setInstallDevclass.ts#L54)).

### ACT-2026-34 — Resolved — Install namespace is derived from the root and limited to one

`add-namespace` now derives the install namespace from the target root package instead of
`replacements[0]`, using the rule shared with publish (`getPackagesNamespace`, see
[ACT-2026-89](publish.md)): the root namespace, or the only reserved `/NAMESPACE/` used by a
subpackage when the root uses `Z` or `Y`. The target namespace does not have to match the manifest
namespace: a `/X/` package can be installed into an existing `/N/` namespace. The original namespace,
which decides whether the manifest's repair license is used to create the namespace, is derived the
same way from the original package names. Stored mappings of devclasses no longer in the release are
ignored.

More than one reserved namespace is rejected: the manifest carries one namespace and repair license,
and the install checks, creates, adds to the landscape transport, and rolls back only one
(`runtime.namespace`, `revert.namespace`). Supporting several would require reworking those steps.
`set-install-devclass` runs the same check after resolving the target names, so renamed installs
fail before locks and dependency installs; `add-namespace` checks again for original package names
([source](../../src/actions/install/addNamespace.ts#L20)).

### ACT-2026-36 — Resolved — Non-interactive upgrade fails closed when the root devclass is unknown

When an update finds existing objects and the installed root devclass is unknown, `check-transports`
can no longer ask for confirmation in non-interactive mode, so it now aborts unless
`noExistingObjects` is set. The interactive confirmation and the `noExistingObjects` warning are
unchanged ([source](../../src/actions/install/checkTransports.ts#L275)).

### ACT-2026-41 — Resolved — Unknown installed root devclass no longer throws

When an update has customized mappings but the installed package's root devclass is unknown,
`set-install-devclass` falls back to the stored replacement of the release's root devclass. If neither
is known, the namespace is not carried over and a debug message is logged, instead of failing with a
`TypeError` in `getPackageNamespace` ([source](../../src/actions/install/setInstallDevclass.ts#L93)).

### ACT-2026-42 — Resolved — Transport layer is required only for generated transportable packages

`init` now only validates an explicitly provided transport layer. The system default is resolved by
`generate-devclass` when a transportable package has to be created, before the first package is
created, so `keepOriginal` installs, installs into existing packages, and `$` installs no longer fail
on systems without a default layer. Local packages are created with an empty layer
([source](../../src/actions/install/generateDevclass.ts#L66)).

### INST-04 — Resolved — Rollback handlers restore captured transport state

DEVC, TADIR, LANG, CUST, and deletion imports now share a compensating operation that uploads the
captured pre-import binary to the target system and imports it. Customizing snapshots are restored
in reverse import order. The landscape-transport step also deletes a partially constructed request
when SAP still reports it as modifiable
([restore helper](../../src/actions/install/restoreTransport.ts),
[customizing rollback](../../src/actions/install/importCustTransport.ts),
[landscape rollback](../../src/actions/install/generateLandscapeTransport.ts)).

### INST-01 — Resolved — Transport validation is scheduled before dependent steps

`checkTransports` now runs immediately after initialization, once the release artifact is available
and before SAP-entry checks, dependency installation, or package mapping. It downloads and indexes
the artifact transports and populates `runtime.package.hierarchy` before any later step consumes
that state ([workflow](../../src/actions/install/index.ts#L258)).

### INST-03 — Resolved — Missing required SAP tables now block installation

The SAP-entry subworkflow now emits a failed status for every required row belonging to a missing
table. The install wrapper's existing failed-row check therefore rejects installation as intended.

### INST-13 — Resolved — Missing root replacements produce a descriptive error

`updatePackageData` now checks the root-package replacement before reading its target devclass. If
the mapping is absent or has no target, finalization rejects with an error that names the original
root package instead of throwing an opaque property-access `TypeError`
([source](../../src/actions/install/updatePackageData.ts#L24)).

### INST-12 — Resolved — Existing target packages are lock-checked in bulk

`generateDevclass` now collects the distinct replacement devclasses that already exist and checks
all of their `R3TR DEVC` lock keys in a single connector call. Any returned lock is logged with its
transport and aborts installation before package hierarchy or transport-layer mutations begin
([source](../../src/actions/install/generateDevclass.ts#L32)).

### INST-05 — Resolved — Unsupported generated-package rollback is no longer advertised

Generated packages were previously recorded in rollback state consumed only by an empty handler.
That inert tracking and handler have been removed as part of INST-04. Package creation remains an
explicit non-reversible bootstrap operation until the connector provides a safe package-deletion
API ([source](../../src/actions/install/generateDevclass.ts)).

### INST-10 — Resolved — Nested operations always restore prefix state

Dependency installation and DEVC, TADIR, LANG, CUST, and deletion transport imports now perform
prefix mutation and their fallible work inside `try/finally` blocks. Each path restores the exact
logger and prompt prefixes captured before the nested operation, whether it succeeds or throws
([dependency source](../../src/actions/install/installDependencies.ts#L57),
[transport source](../../src/actions/install/importDevcTransport.ts#L86)).

### INST-09 — Resolved — Deletion transport generation is scheduled for updates

`generateDeletionTransport` is now part of the install workflow after target-package generation and
before the DEVC, TADIR, language, and customizing transports are imported. Its filter limits the
cleanup to non-local update installations, so first installs and local registries remain unaffected
([workflow](../../src/actions/install/index.ts#L258),
[filter](../../src/actions/install/generateDeletionTransport.ts#L17)).

### INST-08 — Resolved — Dependency installs refresh the installed-package snapshot

After each successful nested dependency installation, `installDependencies` constructs the
installed `TrmPackage` from the returned manifest and upserts it into the parent snapshot. The next
dependency receives a clone of that updated snapshot, so it recognizes packages installed earlier
in the same run without another target-system query. Upserting also replaces an incompatible
previous version instead of leaving a stale duplicate
([source](../../src/actions/install/installDependencies.ts#L84)).

## Non-relevant findings
### ACT-2026-43 — Non-relevant — `&LANDSCAPE_TRANSPORT&` intentionally resolves to an empty string

On a final system or a `$` package no landscape transport exists, so the placeholder resolves to
`''`. This is expected: a post-activity that requires a landscape transport is responsible for
rejecting the empty value itself, and post-activity failures are already handled as best-effort
(INST-07) ([source](../../src/actions/install/executePostActivities.ts#L37)).

### INST-14 — Non-relevant — Non-interactive mode intentionally skips unspecified optional transports

When prompts are disabled and `noLang` or `noCust` is unspecified, optional language and
customizing transports are intentionally skipped. Non-interactive callers must explicitly request
those optional transports; the deterministic opt-in behavior is the supported contract
([source](../../src/actions/install/checkTransports.ts#L40)).

### INST-11 — Non-relevant — Install-package mappings intentionally survive failed installs

`setInstallDevclass` persists replacement mappings before transports are imported so the selected
package mapping can be reused by subsequent installation attempts. A failed install leaving those
records in place is therefore accepted behavior rather than rollback residue
([source](../../src/actions/install/setInstallDevclass.ts#L136)).

### INST-07 — Non-relevant — Post-activities are intentionally best-effort

`executePostActivities` catches and logs each post-activity failure so one optional follow-up action
does not invalidate an otherwise completed package installation or prevent later post-activities
from running. Returning installation success in this case is the intended workflow contract
([source](../../src/actions/install/executePostActivities.ts#L27)).

### INST-06 — Non-relevant — Package-record commit ordering is intentional

`updatePackageData` intentionally records the installed release before post-activities and landscape
transport release. The package installation has already occurred at this point, and the record is
not rolled back if a later finalization step fails; that ordering is accepted workflow behavior
([workflow](../../src/actions/install/index.ts#L273)).
