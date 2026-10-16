# Shared action infrastructure audit

Audit date: 2026-10-16 (in-depth static review of `src/actions/commons`, `stopWarning`, the workflow wrapper and the TMS-queue polling; `/ATRM/DEL_TRANSPORT_TMS` was read on SAP)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. This report covers reusable steps, callbacks, and helpers used by more than one action workflow.

## Findings

### ACT-2026-97 — High — Functional — Kept objects of a local installation stay in the staging package

- **Where:** [`packageCleanup.ts#L1065`](../../src/actions/commons/utils/packageCleanup.ts#L1065) stages every backed-up object in a `$` package, and the plan's backup holds the kept objects too ([`#L941`](../../src/actions/commons/utils/packageCleanup.ts#L941), [`#L981`](../../src/actions/commons/utils/packageCleanup.ts#L981)). The staging package is deleted through the deletion preview ([`#L1147`](../../src/actions/commons/utils/packageCleanup.ts#L1147)). The original TADIR rows (`cleanupOriginalTadir`) are put back only by reverts ([`prepareBackup.ts#L77`](../../src/actions/install/prepareBackup.ts#L77), [`uninstall/generateDeletionTransport.ts#L76`](../../src/actions/uninstall/generateDeletionTransport.ts#L76)), never on the success path.
- **Failure:** take an uninstall or upgrade of a `$` installation. Some objects in `$` packages are backed up but not deleted: declined local additions, installed objects moved to `$TMP` or another `$` package (kept by default), objects in the `$` package of another TRM installation, and objects excluded by the incoming release. These are moved into `ZTRM_DELE_*`/`/NS/TRMD_*` and stay there. The imported deletion then removes the staging `R3TR DEVC` while it still holds them. Depending on SAP, either the import fails (RC ≥ 8, so the action can't complete while anything is kept) or the kept objects, another installation's included, end up in a deleted package. When no objects deletion runs, the staging package and any namespace imported for it are left on the system after a successful action, and the staged objects keep the staging package. This happens when the registry can't generate the deletion on upgrade (`requireDeletion: false`), when every installed object is shipped again, or when `import-update-deletion` fails.
- **Fix:** stage only the objects in the deletion preview, or reassign the staged objects that are not deleted back to their `cleanupOriginalTadir` row right after the backup is released. When no objects deletion is imported, restore all staged rows and call `deleteCleanupStagingPackages`. Add success-path tests with a declined object and with an object moved to `$TMP`.

### ACT-2026-98 — Medium — Functional — Customizing keys of client-independent tables are compared without their first three characters

- **Where:** [`packageCleanup.ts#L555`](../../src/actions/commons/utils/packageCleanup.ts#L555) (`isShippedRow` with `ignoreClient`, used for `lost` at [`#L594`](../../src/actions/commons/utils/packageCleanup.ts#L594)), [`generateDeletion.ts#L41`](../../src/actions/commons/utils/generateDeletion.ts#L41) (`withoutClient` in the preview check).
- **Failure:** every `tabkey` is treated as if it started with a client, but client-independent tables have no client in the key. Take an upgrade where the installed release shipped `ZCFG` `DE PARAM1` (or the generic `DE*`) and the new release ships `IT PARAM1` (or `IT*`). The installed row is a deletion candidate, yet it counts as shipped, so it is never listed or confirmed. A generic key or a whole table skips its mandatory default-no confirmation, and is not kept under `noInquirer` either. The row stays in `previewKeys`, and the preview check accepts the registry deleting it, so it can be deleted without confirmation. Comparing a short generic key without its client (`ZT*` becomes empty) matches every row of the table.
- **Fix:** strip the client only for client-dependent tables (read `DD02L-CLIDEP` once per table, or compare against the logon client explicitly), in both `isShippedRow` and `checkPreview`.

### ACT-2026-99 — Low — Technical — The deletion preview check is skipped when the registry doesn't report what it deletes

- **Where:** [`generateDeletion.ts#L103`](../../src/actions/commons/utils/generateDeletion.ts#L103) checks only `if (input.preview && deletion.deleted)`. `DeletionTransport.deleted` is optional ("when the registry reports it", [`DeletionTransport.ts#L31`](../../src/registry/DeletionTransport.ts#L31)).
- **Failure:** a registry answer without `deleted`, from an older or third-party registry or a bug, is uploaded, test-imported and imported, and nothing checks it against the confirmed preview. The safety net that keeps the deletion inside what the user confirmed fails open.
- **Fix:** when a preview is passed and the registry gives no `deleted` list, throw (or treat the registry as unavailable) before uploading.

### ACT-2026-100 — Low — Functional — The package action lock is acquired before `check-server-auth`

- **Where:** [`publish/index.ts#L291`](../../src/actions/publish/index.ts#L291), [`install/index.ts#L450`](../../src/actions/install/index.ts#L450), [`uninstall/index.ts#L239`](../../src/actions/uninstall/index.ts#L239), [`cg3z/index.ts#L98`](../../src/actions/cg3z/index.ts#L98) call `ActionLockScope.acquire` ([`actionLocks.ts#L52`](../../src/actions/commons/utils/actionLocks.ts#L52)) before the workflow runs `checkServerAuth`.
- **Failure:** on a system whose trm-server is missing or too old to have `/ATRM/ACQUIRE_ACT_LOCKS`, the first error is a failed lock call (missing function or route), followed by the "Could not clean up uncertain action lock acquisition" warning. The clear authorization or backend message never shows. Install disables locks only for a trm-server/trm-rest upgrade on a recognized legacy backend. An unreadable backend version counts as not legacy ([`trmBackend.ts#L29`](../../src/actions/commons/utils/trmBackend.ts#L29)).
- **Fix:** run the server check (and, for install, the backend-version check) before acquiring the package lock, or map a missing lock API to a "trm-server is missing or outdated" error.

### ACT-2026-14 — Medium — Technical — TMS-queue polling never times out

- **Where:** [`Transport.ts#L639`](../../src/transport/Transport.ts#L639) (`_isInTmsQueue`, `while (true)`). `readReleaseLog` now stops at `releaseLogTimeoutMs`. The queue polling still has no deadline, only a backoff of the interval (3 s, then 5 s, then 10 s). It is used by every `release` without a log folder (deletion dummies, the landscape release without `logTemporaryFolder`), by `import` and by `importMultiple`.
- **Failure:** a request that never reaches the queue (release), or whose import never ends in the queue, hangs install, uninstall and publish forever after SAP state changed; rollback never runs.
- **Fix:** add a deadline or attempt cap and throw; exit early on an error exit code.

### ACT-2026-18 — Low — Technical — Global prefixes are overwritten instead of restored

- **Where:** [`workflowCallbacks.ts#L25`](../../src/actions/commons/workflowCallbacks.ts#L25), [`executePostActivities.ts#L30`](../../src/actions/install/executePostActivities.ts#L30).
- **Failure:** nested dependency installs and host-set prefixes lose their prefix after a rollback or post-activity.
- **Fix:** use `withScopedPrefix` (save/restore) in both places.

### ACT-2026-19 — Low — Technical — Retained-workflow rollback loses diagnostics and cannot be retried

- **Where:** [`retainedWorkflow.ts#L20`](../../src/actions/commons/utils/retainedWorkflow.ts#L20).
- **Failure:** the rollback has no revert callbacks or logs, errors after the first are dropped, and `rolledBack` is set before the pass, so a transient dependency-rollback failure is final.
- **Fix:** log each failure and set the flag only after a fully successful pass.

### ACT-2026-20 — Low — Technical — Caller input objects are mutated and reused stale

- **Where:** [`setSystemPackages.ts#L18`](../../src/actions/commons/setSystemPackages.ts#L18), install/uninstall/publish `init`. Publish `init` copies `sapEntries` only shallowly ([`publish/init.ts#L138`](../../src/actions/publish/init.ts#L138)), so [`findDependencies.ts#L114`](../../src/actions/publish/findDependencies.ts#L114) pushes the detected keys into the caller's arrays. [`installDependencies.ts#L130`](../../src/actions/install/installDependencies.ts#L130) changes the caller's `systemPackages` (its revert restores the list).
- **Failure:** defaults, resolved versions and devclasses, detected SAP entries and the snapshot are written into the caller's object, and a rollback doesn't undo them. Reusing the object for a retry or a later action skips refreshes and sees rolled-back dependencies as installed.
- **Fix:** clone input at action entry and keep computed values in `runtime`.

### ACT-2026-21 — Low — Technical — Minor cleanup-helper state issues

- **Where:** [`releaseDeletionTransport.ts#L54`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L54) overwrites `runtime.dele` even for helper calls (`retainSnapshot` false: `deleteCleanupStagingPackages`, `import-batch` rollback cleanup). The dead assignment was removed on 2026-10-15. The swallowed namespace connector errors in `packageCleanup` were fixed with ACT-2026-05.
- **Fix:** return the uploaded transport instead of writing context.

## Step review

| Step/helper | Result |
|---|---|
| `check-server-auth` | Fails closed: throws on any result other than `true` and propagates failures of the check itself; clients return only a typed SAP denial and rethrow other errors, and connectors cache only a granted authorization (ACT-2026-12, resolved). |
| `set-system-packages` | Reads the snapshot with local-registry packages included, so locally published dependencies and dependants are matched (ACT-2026-15, resolved); writes into caller input (ACT-2026-20). |
| `workflowCallbacks` | Every action runs through `executeWorkflow`, which collects each revert failure and, after the rollback, throws an `ActionWorkflowRevertError` (a `WorkflowRevertError`) with the step failure and all of them; a clean rollback still throws the step failure (ACT-2026-10, resolved); prefixes overwritten instead of restored (ACT-2026-18). |
| `setTransportTarget` | Zero-target rejection is correct; the returned target is trimmed and uppercased (ACT-2026-13, resolved). |
| `setLandscapeTarget` | No issue found. |
| `stopWarning` | No issue found. |
| `actionLocks` | Acquired by the actions before `check-server-auth`, so a missing lock API hides the server message (ACT-2026-100). Owner-token and deduplication logic correct; a resource requested more than once in one call (e.g. the SAP package of several objects) is sent once; a failed release is logged with its resources and owner token and never rejects a committed action, never masks a workflow failure, and is attempted once per run (ACT-2026-11, resolved). |
| `retainedWorkflow` | Run/revert tracking correct (filters kept, only completed steps reverted); rollback loses diagnostics and cannot be retried (ACT-2026-19). |
| `withScopedPrefix` | No issue found; restores prefixes in `finally`. |
| `restoreTransport` / `revertPreparedTransport` | `restoreTransport` throws a `TransportImportError` when the restore ends with no return code or RC ≥ 8 (ACT-2026-06, resolved). `revertPreparedTransport` deletes a prepared dummy while it can, otherwise takes it out of the connected system's import queue; its released content is never re-imported, the objects come back from the backups. |
| `releaseDeletionTransport` | Releases a transport of copies and deletes its whole content through `generateDeletion`; returns `false` when the registry reports nothing to delete. The real import throws a `TransportImportError` at RC ≥ 8 or without a return code (ACT-2026-04, resolved). An unavailable registry deletion keeps the released transport, clears the rollback snapshot and rethrows the original error (ACT-2026-07, resolved); `runtime.dele` still overwritten by helper calls (ACT-2026-21). |
| `generateDeletion` | Single path producing deletion transports (upgrade, uninstall, rollback and staging cleanups): resolves the real registry of a local artifact, passes the target dummy, `subtract` (incoming registry transports) and `exclude` (declined objects and keys) options, dequeues the dummy when nothing is left to delete, rejects a registry result that deletes entries outside the confirmed preview before anything is uploaded, then uploads and test-imports (RC ≥ 8 fails; skipped on a legacy backend). It never imports. The preview check is skipped when the registry omits `deleted` (ACT-2026-99) and compares keys without a client also for client-independent tables (ACT-2026-98). |
| `importQueue` | `dequeueTransport` only touches the connected system's queue and refuses `@X1@TRM (BKP)` backups, which are registered by `protectBackupTransport` when created; `dequeueTransports` attempts all and throws the first failure. Dequeuing a dummy twice (empty or unavailable deletion, then the revert) is harmless: `/ATRM/CL_TRANSPORT->DELETE_FROM_TMS_QUEUE` returns when the request is not in TMSBUFFER. No issue found. |
| `landscapeTransport` | `releaseLandscape` marks the release started, releases, and on failure logs an error and a warning to release the transport manually without failing the action; `revertLandscapeRelease` deletes the transport while possible, otherwise removes it from the target queue when it is the connected system (warns otherwise). Sets `landscapeReleased` only after a successful release (ACT-2026-92, resolved). |
| `actionSummary` | Logs the outcome, imported transports, imported deletions, the BKP backups kept in the import queue and the landscape transport; never throws. Reports "(not released)" and "rolled back"/"rollback incomplete" from the actual state (ACT-2026-92, resolved). |
| `packageCleanup` | Split into plan, backup, deletion and restore. `planInstalledPackageCleanup` asks every question before anything changes and returns the objects and customizing keys to back up, exclude and preview; customizing keys are matched without the client also for client-independent tables, which can skip a confirmation (ACT-2026-98). Namespaces are deleted only when no other SAP package uses them in TDEVC and the incoming release does not (ACT-2026-05, resolved). `backupInstalledPackage` stages the objects of a `$` installation in transportable staging packages, then backs up the objects (and the objects the incoming release overwrites) and the recorded CUST transports (copied with their keys) in two `@X1@TRM (BKP)` transports: released transports of copies that are never deleted or dequeued. An object that can't be added to the backup is warned about and, as the deletion is generated from the backup, not deleted. Staging moves every backed-up `$` object, kept ones included, and only reverts put them back: kept objects stay in the staging package, which the deletion removes, and without an objects deletion the staging package leaks (ACT-2026-97). `generateCleanupDeletions` generates `@X1@TRM (DELE)` from the backups into released dummies; without `requireDeletion` an unavailable registry dequeues the dummy and lists the leftovers. `revertCleanupDeletions` deletes or dequeues every dummy (never re-imports them); `restoreCleanupBackups` recreates the temporary packages, re-imports the backups (RC checked) and restores the staging TADIR rows, attempting each and throwing the first failure. Callers restore only after their destructive cleanup succeeded (ACT-2026-08, resolved); staging packages are deleted through `deleteCleanupStagingPackages` only after a complete restore (ACT-2026-09, resolved). Backups are released with their release log checked, so an export error stops before any deletion ([ACT-2026-50](uninstall.md), resolved). |
| `Transport` status cache (used by every revert) | `uninstall` and `release` invalidate the cached E070, even when the call fails, and the status checks return `false` when no row exists (ACT-2026-17, resolved); imports fail at RC ≥ 8 or without a return code (`TransportImportError`); the import wait reads the request status first and the queue only when the status can't tell, a test import is not forwarded again by the real import; a release with a log folder stops at `releaseLogTimeoutMs`, queue polling is unbounded (ACT-2026-14). |
| `SystemConnector` connection check | Pings at most once every 60 s per connector; `connect` clears the timestamp, so a reopened connection is checked by the next call. No issue found. |
| Package-name lookups | Install mappings and transports are queried and written under the stored package name: install adopts the registry manifest name, uninstall uses the installed package's name and registry (ACT-2026-16, resolved). |

## Resolved findings

### ACT-2026-92 — Resolved — Low — Technical — Action summary misreports the landscape release and the rollback

- **Where:** [`actionSummary.ts#L41`](../../src/actions/commons/utils/actionSummary.ts#L41) prints a landscape transport as released whenever `landscapeReleaseStarted` is set, but [`landscapeTransport.ts#L22`](../../src/actions/commons/utils/landscapeTransport.ts#L22) sets it before the release and the catch at L25 never clears it; uninstall also sets `output.targetSystem` after a failed release. The failure outcome says "rolled back" from `importStarted`/`deleImportStarted` alone ([`install/index.ts#L508`](../../src/actions/install/index.ts#L508), [`uninstall/index.ts#L206`](../../src/actions/uninstall/index.ts#L206)), also when the rollback failed (`ActionWorkflowRevertError`) or, for a trm-server/trm-rest upgrade, was never attempted on the imported release.
- **Failure:** the last lines an operator reads contradict the warnings above them: a landscape transport left to release manually is listed without "(not released)", and a partial or skipped rollback is reported as done.
- **Fix:** record the release outcome separately from the "started" flag, and derive the "rolled back" wording from the error type (and `selfUpdate`).

Resolved: `releaseLandscape` sets `landscapeReleased` only after a successful release, and the summary reports
"(not released)" from it (`src/actions/commons/utils/landscapeTransport.ts`, `actionSummary.ts`). A failed action is
described by `failureState`: "rolled back" only when something changed and every rollback step succeeded,
"rollback incomplete" on an `ActionWorkflowRevertError`, nothing for trm-server/trm-rest upgrades that are never rolled back.


### ACT-2026-04 — Resolved — Critical — Technical — Deletion-transport import return code is ignored

- **Where (before):** `releaseDeletionTransport.ts#L53`; `Transport.import()` only logged the RC.
- **Failure (before):** the real `import(false)` result was discarded. With RC 8/12/16/-1 the uninstall logged "imported", forwarded the deletion transport, removed the TRM record and reported success while the objects remained. The same helper drove the upgrade cleanup and the `import-batch` rollback cleanup.
- **Resolution (2026-10-15):** every deletion import checks its return code with `TransportImportError.assert`, which throws at RC ≥ 8 or without a return code ([`TransportImportError.ts`](../../src/transport/TransportImportError.ts)): `releaseDeletionTransport` ([#L59](../../src/actions/commons/utils/releaseDeletionTransport.ts#L59)), the uninstall deletion imports ([`generateDeletionTransport.ts#L54`](../../src/actions/uninstall/generateDeletionTransport.ts#L54)), the upgrade deletions imported in the `import-batch` batch (every result checked) and `import-update-deletion` (warns: the trm-server/trm-rest upgrade is not undone). The test import in `generateDeletion` uses the same threshold. `Transport.import` takes the higher of the queue `maxrc` and the final tp status return code.

### ACT-2026-06 — Resolved — High — Technical — Rollback re-imports report success regardless of return code

- **Where (before):** `restoreTransport.ts#L14`, used by `revertInstalledPackageCleanup` and every `prepare-*` revert.
- **Failure (before):** re-importing the pre-deletion copy or the retained-table backup ended with RC 8/12, yet the revert logged "restored" and resolved.
- **Resolution (2026-10-15):** `restoreTransport` throws a `TransportImportError` at RC ≥ 8 or without a return code ([`restoreTransport.ts#L16`](../../src/actions/commons/utils/restoreTransport.ts#L16)), so `restoreCleanupBackups` reports it after attempting the other restores and the uninstall revert keeps the staging packages. The `prepare-*` reverts no longer re-import anything: `revertPreparedTransport` deletes or dequeues the dummy, and the objects come back from the BKP backups.
### ACT-2026-17 — Resolved — Medium — Technical — Cached transport status is never invalidated

`Transport.delete` and `Transport.release` clear the cached E070 row after the connector call,
also when it fails, so the next status check re-reads the request
([source](../../src/transport/Transport.ts#L435)). `canBeDeleted` and `isReleased` return `false`
when no E070 row exists instead of throwing a `TypeError`
([source](../../src/transport/Transport.ts#L907)). Before, in the publish rollback the
`release-transport` revert deleted the unreleased requests and the generator reverts then read the
cached `D` on the same instances and deleted them again, reporting a spurious "Failed rollback";
a request without an E070 row (deleted requests, cg3z uploads) made `canBeDeleted` throw.

### ACT-2026-16 — Resolved — Medium — Technical — Raw input package name used for case-sensitive lookups

Install `init` now replaces the input name with the name of the fetched manifest for every registry,
not only for local artifacts ([source](../../src/actions/install/init.ts#L112)), so the existing
install mappings and transports are read (`init`, `set-install-devclass`) and written
(`update-package-data`) under the same name as the TRM packages table record that the update is
matched against. Uninstall `init` queries them with the installed package's stored name and registry
([source](../../src/actions/uninstall/init.ts#L100)). Before, an input like "MyPkg" for the stored
"mypkg" found the installed package but no mappings: install failed its existing-object check with
"object(s) already exist", and the uninstall revert restored the record without its mappings.

### ACT-2026-15 — Resolved — Medium — Functional — System-package snapshot excludes local-registry packages

`set-system-packages` now reads the snapshot with `getInstalledPackages(true, true)`
([source](../../src/actions/commons/setSystemPackages.ts#L22)), so packages recorded under the
local registry are part of it. A dependency declared with `registry: local` that is installed is
reported `ok` by `check-dependencies` instead of "not found", so the install no longer queues it for
`install-dependency` (which rejects local packages as "has to be installed manually"), and `uninstall`
`check-dependants` sees dependants that were published locally. Every lookup in the snapshot
matches by name and registry, except the update root lookup of install `check-transports`, which
matched by name only and could pick a same-named local package; it now uses the package being
updated (`runtime.update`) ([source](../../src/actions/install/checkTransports.ts#L255)).

### ACT-2026-13 — Resolved — Medium — Functional — Transport target is not normalized, breaking forwarded-deletion rollback

`setTransportTarget` trims and uppercases an explicit target before validating it and returns the
normalized value ([source](../../src/actions/commons/prompts/setTransportTarget.ts#L28)), so
publish, install and uninstall store the same target they forward to. `deleteTmsTransport` trims and
uppercases the transport and the target system in both clients, like `forwardTransport`
([RFC](../../src/client/RFCClient.ts#L644), [REST](../../src/client/RESTClient.ts#L565)), so the
revert of a forward to `qas` removes the transport from the `QAS` import queue. Before, the
forward succeeded but `deleteTmsTransport(..., 'qas')` failed, leaving the deletion transport
queued in QAS while the source was rolled back.

### ACT-2026-11 — Resolved — Medium — Technical — Action-lock release is mishandled

`ActionLockScope.release` logs a failed release as a warning naming the action, the owner token,
every held resource, and the `/ATRM/ACT_LOCK_ADMIN` program that deletes the non-expiring locks
on SAP, then rethrows and keeps the locks held
([source](../../src/actions/commons/utils/actionLocks.ts#L61)). `withLockRelease` runs the work
and then releases exactly once: after a success a release failure no longer rejects the
committed action, and after a failure it never replaces the workflow error
([source](../../src/actions/commons/utils/actionLocks.ts#L82)). publish and cg3z use it through
`withActionLockScope`; install and uninstall use it for their non-retained runs, and their retained
runs release only when the workflow fails, so the outer `catch` no longer releases a second time
([install](../../src/actions/install/index.ts#L391), [uninstall](../../src/actions/uninstall/index.ts#L197)).
A retained run keeps its locks until the parent calls `release`, or `rollback`, which still
surfaces a release failure after attempting the rollback. Stuck locks are recovered on SAP with
`/ATRM/ACT_LOCK_ADMIN` ("View and manually delete TRM action locks", package `/ATRM/SERVER`);
no TTL was added.

### ACT-2026-12 — Resolved — Medium — Technical — Server authorization check fails open and caches failures

`checkServerAuth` throws on any result other than `true`: the `ClientError` denial, or a generic
error for any other value ([source](../../src/actions/commons/checkServerAuth.ts#L16)). Both clients
return only their typed SAP error (`RESTClientError`/`RFCClientError`) as a denial and rethrow any
other error, such as a timeout or an HTTP 403/404 without a SAP message
([REST](../../src/client/RESTClient.ts#L665), [RFC](../../src/client/RFCClient.ts#L740)), so a
failed check propagates out of the step. Both connectors cache only a granted authorization: a
denial or a failed check is checked again on the next call
([REST](../../src/systemConnector/RESTSystemConnector.ts#L343),
[RFC](../../src/systemConnector/RFCSystemConnector.ts#L287)). The public `true | ClientError`
signature is unchanged and now accurate. The RFC client wraps connection failures in
`RFCClientError`, so there they surface as an uncached denial. Backend contract checked on SAP:
`/ATRM/CHECK_AUTH` raises `TRM_RFC_UNAUTHORIZED` with a T100 message, and
`/ATRM/CL_REST_RESOURCE->handle_request` answers a denied route with HTTP 401 and a JSON `message`
built from `sy`, which the REST interceptor turns into a `RESTClientError`; an HTTP 401 without
that body (e.g. a failed SAP logon) is rethrown.

### ACT-2026-10 — Resolved — Medium — Technical — Rollback failures never reach the caller

Every action workflow (and `executeRetainedWorkflow`) runs through `executeWorkflow`
([source](../../src/actions/commons/workflowCallbacks.ts#L66)). It wraps the callbacks per
execution and collects every `onRevertFailed` error as a `WorkflowError` before calling the
original callback. When the engine rethrows the step failure after a rollback with failures, it
throws an `ActionWorkflowRevertError` instead
([source](../../src/actions/commons/workflowCallbacks.ts#L48)): a `WorkflowRevertError` whose
`originalWorkflowError` is the step failure, `revertErrors` holds every revert failure in rollback
order, and the message lists them all. `stepName`/`originalException` describe the first revert
failure. A clean rollback still throws the step's `WorkflowError`, so callers can tell the two
apart. The engine's ES5 error classes return a plain `Error`, so the subclass restores its
prototype chain for `instanceof`, and the step failure is recognized by shape. A retained journal
rolled back by a parent action still throws its first failure, which reaches the parent's own
`ActionWorkflowRevertError`.

### ACT-2026-09 — Resolved — Medium — Functional — `ZTRM_DELE_*` staging package leaks on install upgrades

The staging package is tracked in `revert.stagingPackages` instead of `revert.sapPackages`, so
`cleanupEntries` no longer adds it to the cleanup transport of the imported objects (where an
already deleted package could fail the add and mark that cleanup failed). The uninstall action's
staging cleanup moved to `deleteCleanupStagingPackages`
([source](../../src/actions/commons/utils/packageCleanup.ts#L148)). The `generate-update-transport`
revert calls it after `revertInstalledPackageCleanup` succeeds with `restore` set
([caller](../../src/actions/install/generateUpdateTransport.ts#L72)): a package still holding objects
is kept and reported, every package is attempted, and the first failure is thrown. A package already
deleted by the deletion transport is skipped. On the unauthorized upgrade path the package cannot be
deleted (that also needs a deletion transport): after restoring the assignments the cleanup warns
that it must be deleted manually
([source](../../src/actions/commons/utils/packageCleanup.ts#L692)).

### ACT-2026-08 — Resolved — Medium — Technical — Upgrade-cleanup revert restores payloads after a failed cleanup

`revertInstalledPackageCleanup` takes a `restore` flag. The `generate-update-transport` revert
clears it when `cleanupImported && !cleanupSucceeded`, the same guard as `init` and `prepare*`.
Then the revert does not recreate temporary packages, re-import the deletion copy or the
retained-table backup, or restore TADIR assignments over objects that were not deleted. It warns
that manual restore might be necessary. The independent deletes of unreleased cleanup and backup
transports still run. The uninstall action keeps the default (always restore)
([source](../../src/actions/commons/utils/packageCleanup.ts#L681),
[caller](../../src/actions/install/generateUpdateTransport.ts#L67)).

### ACT-2026-07 — Resolved — High — Technical — Unauthorized deletion path is masked by deleting a released transport

On `RegistryDeletionTransportUnauthorizedError`, `releaseDeletionTransport` no longer tries to delete
the already released transport of copies. It clears the `revert.dele` snapshot of its own call, so
the never-imported transport is neither restored nor forwarded through the landscape. A helper
call keeps the snapshot of its caller. Then it always rethrows the original authorization error.
Callers branch on that error type again. The upgrade `requireDeletion: false` path restores the
cleanup assignments, warns and continues. Uninstall and `import-batch` rollback cleanup report the
authorization error itself
([source](../../src/actions/commons/utils/releaseDeletionTransport.ts#L34)).

### ACT-2026-05 — Resolved — High — Functional — Cleanup deletes a namespace still used by other packages

`R3TR NSPC` entries of the installed transport (e.g. the landscape transport of an install that
generated the namespace) are no longer deletion candidates by themselves. Together with the
namespace of the installed root package, each is deleted only when no SAP package outside the
deletion remains in TDEVC with `NAMESPACE` = that namespace, whether installed by TRM or not, and
the incoming release (upgrades) does not use it, as its packages may not be imported yet. A
namespace is never treated as an extra package object, and a failed usage check now keeps the
namespace with a warning instead of being swallowed
([source](../../src/actions/commons/utils/packageCleanup.ts#L429)).

### SHARED-02 — Resolved — `trm-server` initialization failures propagate

The per-activity `try/catch` was removed. Construction or execution failure now rejects the shared
step and is handled by the workflow executor like any other step failure. Prefix cleanup remains in
a `finally` block, so failure does not leak logger state
([source](../../src/actions/commons/trmServerPa.ts#L21)).

### SHARED-03 — Resolved — Zero transport targets reject before prompting

`setTransportTarget` now checks the available-target collection before automatic, interactive, or
explicit selection. An empty collection throws a clear error immediately, so interactive callers
cannot receive an empty list prompt ([source](../../src/actions/commons/prompts/setTransportTarget.ts#L20)).

### SHARED-01 — Resolved — Lifecycle logs use bounded, redacted summaries

Workflow start/finish callbacks no longer inspect complete inputs and outputs. The redaction policy
now lives in the shared `summarizeForLog` utility and is also used by `RFCClient` argument/response
logging and the Axios request/response layer that serves `RESTClient`. The summarizer:

- redacts authentication, cookie, credential, password, secret, token, API-key, and private-key fields;
- replaces buffers, typed arrays, and array buffers with type and byte-count labels;
- replaces registry, connector, manifest, lockfile, and other class instances with class-name labels;
- detects circular references; and
- limits string length, recursion depth, array items, and object keys.

This preserves useful structural diagnostics without serializing release artifacts or object
internals. All three consumers now converge on the same implementation
([utility](../../src/commons/summarizeForLog.ts#L1),
[workflow callbacks](../../src/actions/commons/workflowCallbacks.ts#L1),
[RFC client](../../src/client/RFCClient.ts#L4),
[REST/Axios layer](../../src/commons/getAxiosInstance.ts#L1)).
