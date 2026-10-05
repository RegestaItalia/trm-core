# Shared action infrastructure audit

Audit date: 2026-10-04

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. This report covers reusable steps, callbacks, and helpers used by more than one action workflow.

## Findings

### ACT-2026-04 — Critical — Technical — Deletion-transport import return code is ignored

- **Where:** [`releaseDeletionTransport.ts#L53`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L53); `Transport.import()` only logs the RC ([`Transport.ts#L809`](../../src/transport/Transport.ts#L809)).
- **Failure:** the test import only rejects RC > 8, and the real `import(false)` result is discarded. With RC 8/12/16/-1 the delete action logs "imported", forwards the deletion transport, removes the TRM record and reports success while the objects remain. The same helper drives upgrade cleanup and `import-batch` rollback cleanup.
- **Fix:** check the real-import RC and throw above the accepted threshold (≤ 4), so the workflow rolls back.

### ACT-2026-05 — High — Functional — Cleanup deletes a namespace still used by other packages

- **Where:** [`packageCleanup.ts#L200`](../../src/actions/commons/utils/packageCleanup.ts#L200), [`#L359`](../../src/actions/commons/utils/packageCleanup.ts#L359); NSPC added to the landscape transport at [`generateLandscapeTransport.ts#L74`](../../src/actions/install/generateLandscapeTransport.ts#L74).
- **Failure:** when an install generated a namespace, its landscape transport (the stored package transport) contains `R3TR NSPC`. Cleanup deletes every previous-transport entry except retained tables, bypassing the "last package in namespace" guard at L328–347. Deleting package A removes `/ABC/` even if package B lives there; upgrading A also puts the NSPC in the deletion transport (the incoming TADIR list never contains NSPC) and forwards it through the landscape. SAP-side effect of a namespace in a deletion transport was not reproduced.
- **Fix:** drop `R3TR NSPC` from the previous-transport entries and add it only through the `namespaceToDelete` check.

### ACT-2026-06 — High — Technical — Rollback re-imports report success regardless of return code

- **Where:** [`restoreTransport.ts#L14`](../../src/actions/commons/utils/restoreTransport.ts#L14); used by `revertInstalledPackageCleanup` and every `prepare-*` revert.
- **Failure:** re-importing the pre-deletion copy or the retained-table backup ends with RC 8/12, yet the revert logs "restored" and resolves. Staging cleanup then proceeds and the TRM record is restored over missing objects; the rollback looks clean.
- **Fix:** throw when the restore RC exceeds the threshold so the best-effort pass reports it.

### ACT-2026-07 — High — Technical — Unauthorized deletion path is masked by deleting a released transport

- **Where:** [`releaseDeletionTransport.ts#L31`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L31); callers branch on the error type at [`packageCleanup.ts#L464`](../../src/actions/commons/utils/packageCleanup.ts#L464) and [`importBatch.ts#L117`](../../src/actions/install/importBatch.ts#L117).
- **Failure:** the transport is released at L14, then on `RegistryDeletionTransportUnauthorizedError` it is deleted (the caller's own comment states it cannot be). The delete error replaces the authorization error, so the intended "warn and continue" upgrade path (`requireDeletion: false`) is unreachable and upgrades fail hard for users without deletion rights. If SAP does delete it, `revert.dele` is cleared and the revert later calls `canBeDeleted()` on a missing request (see ACT-2026-17).
- **Fix:** do not delete a released transport; always rethrow the original authorization error.

### ACT-2026-08 — Medium — Technical — Upgrade-cleanup revert restores payloads after a failed cleanup

- **Where:** [`packageCleanup.ts#L510`](../../src/actions/commons/utils/packageCleanup.ts#L510) vs the guards in [`install/init.ts#L214`](../../src/actions/install/init.ts#L214) and `prepare*.ts`.
- **Failure:** the `generate-update-transport` revert always re-imports `dele`, retained tables and TADIR assignments, even when `cleanupImported && !cleanupSucceeded`, restoring old payloads over objects that were not deleted (violates the project revert rule).
- **Fix:** skip the restore operations (not the independent deletes) when the destructive cleanup did not succeed.

### ACT-2026-09 — Medium — Functional — `ZTRM_DELE_*` staging package leaks on install upgrades

- **Where:** created at [`packageCleanup.ts#L388`](../../src/actions/commons/utils/packageCleanup.ts#L388); install revert only calls `revertInstalledPackageCleanup` ([`generateUpdateTransport.ts#L59`](../../src/actions/install/generateUpdateTransport.ts#L59)); delete has `deleteStagingPackages`.
- **Failure:** for `$` installations the staging package survives a rollback (re-importing `dele` even recreates it), and on the unauthorized path it survives a successful upgrade.
- **Fix:** reuse the delete action's staging cleanup after a full restore and exclude it from `cleanupEntries`.

### ACT-2026-10 — Medium — Technical — Rollback failures never reach the caller

- **Where:** engine `execute` (revert catch); [`workflowCallbacks.ts#L35`](../../src/actions/commons/workflowCallbacks.ts#L35) only logs.
- **Failure:** steps follow "surface the first failure", but the action still throws the original step error, so CLI and API callers cannot distinguish a clean rollback from an inconsistent system.
- **Fix:** collect revert errors in the callbacks and attach them to (or throw a `WorkflowRevertError` for) the action failure.

### ACT-2026-11 — Medium — Technical — Action-lock release is mishandled

- **Where:** [`actionLocks.ts#L72`](../../src/actions/commons/utils/actionLocks.ts#L72), [`install/index.ts#L378`](../../src/actions/install/index.ts#L378), [`delete/index.ts#L155`](../../src/actions/delete/index.ts#L155).
- **Failure:** a release error after success turns a committed install/delete/publish/cg3z into a rejection (install's outer `catch` then releases a second time); release errors after a failure are swallowed without logging. Locks are non-expiring and the clients expose no list/break API, so a crash or failed release blocks the package with no recovery path in TRM.
- **Fix:** log release failures with resources and owner token; after success, warn instead of throwing; never re-run release from the outer catch; provide a TTL or break-lock API server-side.

### ACT-2026-12 — Medium — Technical — Server authorization check fails open and caches failures

- **Where:** [`checkServerAuth.ts#L16`](../../src/actions/commons/checkServerAuth.ts#L16); clients return any caught error ([`RESTClient.ts#L648`](../../src/client/RESTClient.ts#L648)); REST interceptor rethrows non-SAP errors untyped; result cached in [`RESTSystemConnector.ts#L335`](../../src/systemConnector/RESTSystemConnector.ts#L335).
- **Failure:** a timeout or an HTTP 403/404 without a SAP message is not a `ClientError`, so the check passes. A transient `ClientError` is cached until reconnect.
- **Fix:** treat any non-`true` value as failure and cache only `true`.

### ACT-2026-13 — Medium — Functional — Transport target is not normalized, breaking forwarded-deletion rollback

- **Where:** [`setTransportTarget.ts#L66`](../../src/actions/commons/prompts/setTransportTarget.ts#L66) returns raw input; `forwardTransport` uppercases but `deleteTmsTransport` does not ([`RFCClient.ts#L629`](../../src/client/RFCClient.ts#L629)).
- **Failure:** with `targetSystem: 'qas'`, the forward succeeds but the revert's `deleteTmsTransport(..., 'qas')` fails, leaving the deletion transport queued in QAS while the source is rolled back.
- **Fix:** return `trim().toUpperCase()` from `setTransportTarget` and normalize in `deleteTmsTransport`.

### ACT-2026-14 — Medium — Technical — Release and TMS-queue polling never time out

- **Where:** [`Transport.ts#L471`](../../src/transport/Transport.ts#L471) (`readReleaseLog`; the "Timed out" branch is unreachable), [`#L554`](../../src/transport/Transport.ts#L554) (`_isInTmsQueue`).
- **Failure:** an unreadable log or a request that never reaches the queue hangs install/publish forever after SAP state changed; rollback never runs.
- **Fix:** add a deadline or attempt cap and throw; exit early on an error exit code.

### ACT-2026-15 — Medium — Functional — System-package snapshot excludes local-registry packages

- **Where:** [`setSystemPackages.ts#L21`](../../src/actions/commons/setSystemPackages.ts#L21) calls `getInstalledPackages(true)`; locals filtered at [`SystemConnectorBase.ts#L239`](../../src/systemConnector/SystemConnectorBase.ts#L239).
- **Failure:** a dependency declared with `registry: local` is reported "not found" and `installDependency` throws "has to be installed manually" although it is installed; `delete` misses dependants that were published locally.
- **Fix:** include locals in the snapshot (or for dependency/dependant matching).

### ACT-2026-16 — Medium — Technical — Raw input package name used for case-sensitive lookups

- **Where:** [`install/init.ts#L166`](../../src/actions/install/init.ts#L166), [`setInstallDevclass.ts#L56`](../../src/actions/install/setInstallDevclass.ts#L56), [`checkTransports.ts#L254`](../../src/actions/install/checkTransports.ts#L254), [`delete/init.ts#L86`](../../src/actions/delete/init.ts#L86); query at [`SystemConnectorBase.ts#L412`](../../src/systemConnector/SystemConnectorBase.ts#L412).
- **Failure:** the installed package is found case-insensitively, but mappings are queried with `PACKAGE_NAME EQ '<raw>'`. With "MyPkg" vs stored "mypkg", mappings are empty: install's existing-object check throws "object(s) already exist", and delete's revert restores the record without its mappings.
- **Fix:** after lookup, use the installed package's stored name and registry.

### ACT-2026-17 — Medium — Technical — Cached transport status is never invalidated

- **Where:** `getE070` cache [`Transport.ts#L59`](../../src/transport/Transport.ts#L59); `delete`/`release` do not reset it; `canBeDeleted` dereferences a possibly undefined row ([`#L862`](../../src/transport/Transport.ts#L862)).
- **Failure:** publish rollback: `release-transport` revert deletes unreleased requests, then the generator reverts read the cached `D` on the same instances and delete again, producing spurious "Failed rollback". Where no E070 exists (cg3z uploads, deleted requests) `canBeDeleted` throws `TypeError`.
- **Fix:** clear the cache in `delete`/`release` and return `false` when no row exists.

### ACT-2026-18 — Low — Technical — Global prefixes are overwritten instead of restored

- **Where:** [`workflowCallbacks.ts#L25`](../../src/actions/commons/workflowCallbacks.ts#L25), [`executePostActivities.ts#L30`](../../src/actions/install/executePostActivities.ts#L30).
- **Failure:** nested dependency installs and host-set prefixes lose their prefix after a rollback or post-activity.
- **Fix:** use `withScopedPrefix` (save/restore) in both places.

### ACT-2026-19 — Low — Technical — Retained-workflow rollback loses diagnostics and cannot be retried

- **Where:** [`retainedWorkflow.ts#L22`](../../src/actions/commons/utils/retainedWorkflow.ts#L22).
- **Failure:** no revert callbacks/logs, errors after the first are dropped, and `rolledBack` is set before the pass, so a transient dependency-rollback failure is final.
- **Fix:** log each failure and set the flag only after a fully successful pass.

### ACT-2026-20 — Low — Technical — Caller input objects are mutated and reused stale

- **Where:** `setSystemPackages.ts#L16`, install/delete/publish `init`, [`findDependencies.ts#L93`](../../src/actions/publish/findDependencies.ts#L93), [`installDependencies.ts#L99`](../../src/actions/install/installDependencies.ts#L99).
- **Failure:** defaults, resolved versions/devclasses and the snapshot are written into the caller's object (not undone on rollback); reusing it for a retry or later action skips refreshes and sees rolled-back dependencies as installed.
- **Fix:** clone input at action entry and keep computed values in `runtime`.

### ACT-2026-21 — Low — Technical — Minor cleanup-helper state issues

- **Where:** [`releaseDeletionTransport.ts#L42`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L42) overwrites `runtime.dele` even for helper calls; L56 is a dead assignment; [`packageCleanup.ts#L344`](../../src/actions/commons/utils/packageCleanup.ts#L344) swallows namespace connector errors as "no namespace".
- **Fix:** return the uploaded transport instead of writing context; catch only the namespace parse error.

## Step review

| Step/helper | Result |
|---|---|
| `check-server-auth` | Fails open on non-`ClientError` failures and caches failures (ACT-2026-12). |
| `set-system-packages` | Excludes local-registry packages (ACT-2026-15); writes into caller input (ACT-2026-20). |
| `workflowCallbacks` | Revert failures are only logged and never reach the caller (ACT-2026-10); prefixes overwritten instead of restored (ACT-2026-18). |
| `setTransportTarget` | Zero-target rejection is correct; the returned target is not normalized (ACT-2026-13). |
| `setLandscapeTarget` | No issue found. |
| `stopWarning` | No issue found. |
| `actionLocks` | Owner-token and deduplication logic correct; release lifecycle and non-expiring locks (ACT-2026-11). |
| `retainedWorkflow` | Run/revert tracking correct; rollback loses diagnostics and cannot be retried (ACT-2026-19). |
| `withScopedPrefix` | No issue found; restores prefixes in `finally`. |
| `restoreTransport` / `revertPreparedTransport` | Import return code ignored (ACT-2026-06). |
| `releaseDeletionTransport` | Final import return code ignored (ACT-2026-04); unauthorized path deletes a released transport (ACT-2026-07); context overwrite and dead assignment (ACT-2026-21). |
| `packageCleanup` | Shared namespace deleted (ACT-2026-05); restore without cleanup success (ACT-2026-08); staging package leak (ACT-2026-09); namespace errors swallowed (ACT-2026-21). |
| `Transport` status cache (used by every revert) | Cached E070 never invalidated (ACT-2026-17); release and queue polling unbounded (ACT-2026-14). |
| Package-name lookups | Raw input name used for case-sensitive queries (ACT-2026-16). |

## Resolved findings
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
