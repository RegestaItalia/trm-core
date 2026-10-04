# Action workflow audits

Audit date: 2026-10-04 (in-depth static source review; no SAP or registry operation was run).

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
| `cg3z` | 2 | 0 | 1 | 2 | 1 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 1 | 1 | [Package dependency check](check-package-dependencies.md) |
| `check-engines` | 2 | 0 | 0 | 1 | 2 | This file |
| `check-sap-entries` | 2 | 0 | 0 | 3 | 2 | [SAP-entry check](check-sap-entries.md) |
| `delete` | 8 | 0 | 1 | 5 | 2 | This file |
| `install-dependency` | 4 | 0 | 1 | 2 | 2 | [Dependency install](install-dependency.md) |
| `install` | 23 | 1 | 7 | 11 | 6 | [Package install](install.md) |
| `publish` | 15 | 1 | 2 | 6 | 5 | [Package publish](publish.md) |
| Shared steps/callbacks | 12 | 1 | 3 | 10 | 4 | [Shared infrastructure](shared.md) |
| **Total** | | **3** | **15** | **41** | **26** | |

The linked workflow reports keep the 2026-08-27 step reviews and finding history. Since then the
install workflow gained `check-dependants`, `check-engines`, resource locking, transport
preparation, batch import, landscape-transport skipping on final systems, and retained tables on
update; `delete` and `check-engines` are new workflows; publish gained manifest engines. The shared
`trm-server-pa` step referenced by `shared.md` no longer exists. All active findings below describe
the current source and are included in the index counts.

Two earlier resolutions turned out to be ineffective and are superseded by new findings:
**SAPCHK-02** (see ACT-2026-69) and **CG3Z-01** (see ACT-2026-85).

### Workflow engine behavior assumed by this audit

`@simonegaffurini/sammarksworkflow` 1.3.2-fork3 pushes a step into the executed list *before*
running it, so a failing step's own `revert` runs first, followed by earlier steps in reverse order.
A revert that throws is passed to `onRevertFailed` and the remaining reverts continue; the caller
always receives the original `WorkflowError` (the defined `WorkflowRevertError` is never thrown).
Filters run outside the try block, and filtered-out steps are never reverted.

## Step review

### `install` (23 steps)

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Shared ACT-2026-12. |
| 2 | `set-system-packages` | Snapshot excludes local-registry packages (ACT-2026-15) and is never refreshed for transitive installs (ACT-2026-24). |
| 3 | `init` | Raw package name used for lookups (ACT-2026-16); local installs use the wrong registry key (ACT-2026-26); transport layer always mandatory (ACT-2026-42). Revert is the only cleanup point for early failures (ACT-2026-37). |
| 4 | `check-dependants` | Correct on its own, but blocks nested dependency upgrades against the parent's old manifest (ACT-2026-23). |
| 5 | `check-transports` | Root package matched by raw name (ACT-2026-16); non-interactive mode overwrites when the root devclass is unknown (ACT-2026-36). |
| 6 | `check-sap-entries` | See check-sap-entries findings; install wrapper hides missing entries (ACT-2026-72). |
| 7 | `check-engines` | No install-specific issue; `anyOf` detail lost (ACT-2026-76). |
| 8 | `check-dependencies` | Incompatible installed dependencies are labelled "missing" and may be downgraded (ACT-2026-81). |
| 9 | `set-install-devclass` | Stale stored mappings retained (ACT-2026-25), wrong namespace carry-over (ACT-2026-33), partial input discards stored mappings (ACT-2026-35), TypeError on unknown root (ACT-2026-41). |
| 10 | `lock-resources` | Runs after safety checks; namespace never locked (ACT-2026-38). |
| 11 | `install-dependencies` | Forwards the parent's resolved mappings (ACT-2026-22); transitive installs not merged back (ACT-2026-24). |
| 12 | `add-namespace` | Namespace taken from `replacements[0]` (ACT-2026-34). |
| 13 | `generate-devclass` | Fails with "Multiple roots" on inherited or stale mappings (ACT-2026-22, ACT-2026-25). |
| 14 | `generate-update-transport` | Silently skipped for local registries (ACT-2026-32); revert restores without checking cleanup success (ACT-2026-08) and leaks the staging package (ACT-2026-09). |
| 15–18 | `prepare-devc`, `prepare-tadir`, `prepare-lang`, `prepare-cust` | Forward flow correct; test-import RC is checked. `prepare-cust` revert is not best-effort (ACT-2026-39). |
| 19 | `import-batch` | Batch RC ignored (see *Reconsideration of accepted findings*). Rollback drops retained tables (ACT-2026-28), deletes unsnapshotted pre-existing objects (ACT-2026-30), and always fails for local registries (ACT-2026-27). |
| 20 | `generate-landscape-transport` | Locked namespace silently omitted (ACT-2026-44). |
| 21 | `execute-post-activities` | Global prefix clobbered (ACT-2026-18); empty `&LANDSCAPE_TRANSPORT&` (ACT-2026-43). |
| 22 | `release-install-transports` | Released transport stays queued in the target after rollback (ACT-2026-29); unbounded release wait (ACT-2026-14). |
| 23 | `update-package-data` | Revert incomplete without a metadata snapshot (ACT-2026-31). |

### `delete` (8 steps)

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

### `publish` (15 steps)

| Order | Step | Result |
|---:|---|---|
| 1–2 | `check-server-auth`, `set-system-packages` | Shared findings only. |
| 3 | `init` | Local first publish fails (ACT-2026-55) and local overwrite misreads the file (ACT-2026-56); prerelease ignored on automatic version (ACT-2026-60); non-interactive devclass unresolved (ACT-2026-61); prompted version not cleaned (ACT-2026-67). |
| 4 | `find-dependencies` | No functional issue; mutates caller input (ACT-2026-20). |
| 5 | `set-customizing-transports` | Retained transports cannot be dropped non-interactively (ACT-2026-63); duplicate retained entry (ACT-2026-66). |
| 6 | `set-manifest-values` | Dead post-activity check (ACT-2026-58), non-strict engines (ACT-2026-59), union-only merge (ACT-2026-62), interactive-only limits (ACT-2026-65), stale derived fields (ACT-2026-68). |
| 7 | `set-optional-release-data` | No issue found. |
| 8 | `lock-resources` | Object locks not re-checked after locking (ACT-2026-64). |
| 9–12 | `generate-devc/tadir/lang/cust-transport` | Forward flow correct; reverts hit cached status (ACT-2026-17). |
| 13 | `release-transport` | Prefixes restored, revert best-effort; unbounded release wait (ACT-2026-14). |
| 14 | `publish-to-registry` | Async status failures reported as success (ACT-2026-57). |
| 15 | `update-package-data` | Accepted best-effort behavior. |

### Other workflows

| Workflow | Step | Result |
|---|---|---|
| `check-engines` | `init` | Unknown nested properties silently accepted (ACT-2026-74); key collisions (ACT-2026-75). |
| `check-engines` | `analyze` | Main logic correct (read failures fail requirements, unknown top-level keys fail, `anyOf` handled); minor comparison gaps (ACT-2026-75). |
| `check-sap-entries` | `init` | No issue found. |
| `check-sap-entries` | `analyze` | Error handling dead (ACT-2026-69); unsafe where clause (ACT-2026-70); case-sensitive, TABL-only probe (ACT-2026-71); hidden and misaligned output (ACT-2026-72, ACT-2026-73). |
| `check-dependencies` | `init`, `set-system-packages`, `analyze` | Prerelease handling (ACT-2026-77); invalid ranges silent (ACT-2026-78); local packages excluded (ACT-2026-15). |
| `install-dependency` | `init` | No issue found. |
| `install-dependency` | `set-system-packages` | Snapshot loaded but never consulted (ACT-2026-81). |
| `install-dependency` | `find-install-release` | Lockfile fallback unreachable (ACT-2026-79); integrity check on a different download (ACT-2026-80). |
| `install-dependency` | `install-release` | Forwards options correctly; dead guard (ACT-2026-83). |
| `cg3y` | `check-server-auth`, `download` | Read-only and correct for released requests; validation gaps (ACT-2026-84). |
| `cg3z` | `check-server-auth`, `upload` | Upload/forward works for well-formed archives; rollback ineffective (ACT-2026-85); overwrite and entry-name gaps (ACT-2026-86, ACT-2026-87). |

## Findings

### Shared steps and helpers

#### ACT-2026-04 — Critical — Technical — Deletion-transport import return code is ignored

- **Where:** [`releaseDeletionTransport.ts#L53`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L53); `Transport.import()` only logs the RC ([`Transport.ts#L809`](../../src/transport/Transport.ts#L809)).
- **Failure:** the test import only rejects RC > 8, and the real `import(false)` result is discarded. With RC 8/12/16/-1 the delete action logs "imported", forwards the deletion transport, removes the TRM record and reports success while the objects remain. The same helper drives upgrade cleanup and `import-batch` rollback cleanup.
- **Fix:** check the real-import RC and throw above the accepted threshold (≤ 4), so the workflow rolls back.

#### ACT-2026-05 — High — Functional — Cleanup deletes a namespace still used by other packages

- **Where:** [`packageCleanup.ts#L200`](../../src/actions/commons/utils/packageCleanup.ts#L200), [`#L359`](../../src/actions/commons/utils/packageCleanup.ts#L359); NSPC added to the landscape transport at [`generateLandscapeTransport.ts#L74`](../../src/actions/install/generateLandscapeTransport.ts#L74).
- **Failure:** when an install generated a namespace, its landscape transport (the stored package transport) contains `R3TR NSPC`. Cleanup deletes every previous-transport entry except retained tables, bypassing the "last package in namespace" guard at L328–347. Deleting package A removes `/ABC/` even if package B lives there; upgrading A also puts the NSPC in the deletion transport (the incoming TADIR list never contains NSPC) and forwards it through the landscape. SAP-side effect of a namespace in a deletion transport was not reproduced.
- **Fix:** drop `R3TR NSPC` from the previous-transport entries and add it only through the `namespaceToDelete` check.

#### ACT-2026-06 — High — Technical — Rollback re-imports report success regardless of return code

- **Where:** [`restoreTransport.ts#L14`](../../src/actions/commons/utils/restoreTransport.ts#L14); used by `revertInstalledPackageCleanup` and every `prepare-*` revert.
- **Failure:** re-importing the pre-deletion copy or the retained-table backup ends with RC 8/12, yet the revert logs "restored" and resolves. Staging cleanup then proceeds and the TRM record is restored over missing objects; the rollback looks clean.
- **Fix:** throw when the restore RC exceeds the threshold so the best-effort pass reports it.

#### ACT-2026-07 — High — Technical — Unauthorized deletion path is masked by deleting a released transport

- **Where:** [`releaseDeletionTransport.ts#L31`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L31); callers branch on the error type at [`packageCleanup.ts#L464`](../../src/actions/commons/utils/packageCleanup.ts#L464) and [`importBatch.ts#L117`](../../src/actions/install/importBatch.ts#L117).
- **Failure:** the transport is released at L14, then on `RegistryDeletionTransportUnauthorizedError` it is deleted (the caller's own comment states it cannot be). The delete error replaces the authorization error, so the intended "warn and continue" upgrade path (`requireDeletion: false`) is unreachable and upgrades fail hard for users without deletion rights. If SAP does delete it, `revert.dele` is cleared and the revert later calls `canBeDeleted()` on a missing request (see ACT-2026-17).
- **Fix:** do not delete a released transport; always rethrow the original authorization error.

#### ACT-2026-08 — Medium — Technical — Upgrade-cleanup revert restores payloads after a failed cleanup

- **Where:** [`packageCleanup.ts#L510`](../../src/actions/commons/utils/packageCleanup.ts#L510) vs the guards in [`install/init.ts#L214`](../../src/actions/install/init.ts#L214) and `prepare*.ts`.
- **Failure:** the `generate-update-transport` revert always re-imports `dele`, retained tables and TADIR assignments, even when `cleanupImported && !cleanupSucceeded`, restoring old payloads over objects that were not deleted (violates the project revert rule).
- **Fix:** skip the restore operations (not the independent deletes) when the destructive cleanup did not succeed.

#### ACT-2026-09 — Medium — Functional — `ZTRM_DELE_*` staging package leaks on install upgrades

- **Where:** created at [`packageCleanup.ts#L388`](../../src/actions/commons/utils/packageCleanup.ts#L388); install revert only calls `revertInstalledPackageCleanup` ([`generateUpdateTransport.ts#L59`](../../src/actions/install/generateUpdateTransport.ts#L59)); delete has `deleteStagingPackages`.
- **Failure:** for `$` installations the staging package survives a rollback (re-importing `dele` even recreates it), and on the unauthorized path it survives a successful upgrade.
- **Fix:** reuse the delete action's staging cleanup after a full restore and exclude it from `cleanupEntries`.

#### ACT-2026-10 — Medium — Technical — Rollback failures never reach the caller

- **Where:** engine `execute` (revert catch); [`workflowCallbacks.ts#L35`](../../src/actions/commons/workflowCallbacks.ts#L35) only logs.
- **Failure:** steps follow "surface the first failure", but the action still throws the original step error, so CLI and API callers cannot distinguish a clean rollback from an inconsistent system.
- **Fix:** collect revert errors in the callbacks and attach them to (or throw a `WorkflowRevertError` for) the action failure.

#### ACT-2026-11 — Medium — Technical — Action-lock release is mishandled

- **Where:** [`actionLocks.ts#L72`](../../src/actions/commons/utils/actionLocks.ts#L72), [`install/index.ts#L378`](../../src/actions/install/index.ts#L378), [`delete/index.ts#L155`](../../src/actions/delete/index.ts#L155).
- **Failure:** a release error after success turns a committed install/delete/publish/cg3z into a rejection (install's outer `catch` then releases a second time); release errors after a failure are swallowed without logging. Locks are non-expiring and the clients expose no list/break API, so a crash or failed release blocks the package with no recovery path in TRM.
- **Fix:** log release failures with resources and owner token; after success, warn instead of throwing; never re-run release from the outer catch; provide a TTL or break-lock API server-side.

#### ACT-2026-12 — Medium — Technical — Server authorization check fails open and caches failures

- **Where:** [`checkServerAuth.ts#L16`](../../src/actions/commons/checkServerAuth.ts#L16); clients return any caught error ([`RESTClient.ts#L648`](../../src/client/RESTClient.ts#L648)); REST interceptor rethrows non-SAP errors untyped; result cached in [`RESTSystemConnector.ts#L335`](../../src/systemConnector/RESTSystemConnector.ts#L335).
- **Failure:** a timeout or an HTTP 403/404 without a SAP message is not a `ClientError`, so the check passes. A transient `ClientError` is cached until reconnect.
- **Fix:** treat any non-`true` value as failure and cache only `true`.

#### ACT-2026-13 — Medium — Functional — Transport target is not normalized, breaking forwarded-deletion rollback

- **Where:** [`setTransportTarget.ts#L66`](../../src/actions/commons/prompts/setTransportTarget.ts#L66) returns raw input; `forwardTransport` uppercases but `deleteTmsTransport` does not ([`RFCClient.ts#L629`](../../src/client/RFCClient.ts#L629)).
- **Failure:** with `targetSystem: 'qas'`, the forward succeeds but the revert's `deleteTmsTransport(..., 'qas')` fails, leaving the deletion transport queued in QAS while the source is rolled back.
- **Fix:** return `trim().toUpperCase()` from `setTransportTarget` and normalize in `deleteTmsTransport`.

#### ACT-2026-14 — Medium — Technical — Release and TMS-queue polling never time out

- **Where:** [`Transport.ts#L471`](../../src/transport/Transport.ts#L471) (`readReleaseLog`; the "Timed out" branch is unreachable), [`#L554`](../../src/transport/Transport.ts#L554) (`_isInTmsQueue`).
- **Failure:** an unreadable log or a request that never reaches the queue hangs install/publish forever after SAP state changed; rollback never runs.
- **Fix:** add a deadline or attempt cap and throw; exit early on an error exit code.

#### ACT-2026-15 — Medium — Functional — System-package snapshot excludes local-registry packages

- **Where:** [`setSystemPackages.ts#L21`](../../src/actions/commons/setSystemPackages.ts#L21) calls `getInstalledPackages(true)`; locals filtered at [`SystemConnectorBase.ts#L239`](../../src/systemConnector/SystemConnectorBase.ts#L239).
- **Failure:** a dependency declared with `registry: local` is reported "not found" and `installDependency` throws "has to be installed manually" although it is installed; `delete` misses dependants that were published locally.
- **Fix:** include locals in the snapshot (or for dependency/dependant matching).

#### ACT-2026-16 — Medium — Technical — Raw input package name used for case-sensitive lookups

- **Where:** [`install/init.ts#L166`](../../src/actions/install/init.ts#L166), [`setInstallDevclass.ts#L56`](../../src/actions/install/setInstallDevclass.ts#L56), [`checkTransports.ts#L254`](../../src/actions/install/checkTransports.ts#L254), [`delete/init.ts#L86`](../../src/actions/delete/init.ts#L86); query at [`SystemConnectorBase.ts#L412`](../../src/systemConnector/SystemConnectorBase.ts#L412).
- **Failure:** the installed package is found case-insensitively, but mappings are queried with `PACKAGE_NAME EQ '<raw>'`. With "MyPkg" vs stored "mypkg", mappings are empty: install's existing-object check throws "object(s) already exist", and delete's revert restores the record without its mappings.
- **Fix:** after lookup, use the installed package's stored name and registry.

#### ACT-2026-17 — Medium — Technical — Cached transport status is never invalidated

- **Where:** `getE070` cache [`Transport.ts#L59`](../../src/transport/Transport.ts#L59); `delete`/`release` do not reset it; `canBeDeleted` dereferences a possibly undefined row ([`#L862`](../../src/transport/Transport.ts#L862)).
- **Failure:** publish rollback: `release-transport` revert deletes unreleased requests, then the generator reverts read the cached `D` on the same instances and delete again, producing spurious "Failed rollback". Where no E070 exists (cg3z uploads, deleted requests) `canBeDeleted` throws `TypeError`.
- **Fix:** clear the cache in `delete`/`release` and return `false` when no row exists.

#### ACT-2026-18 — Low — Technical — Global prefixes are overwritten instead of restored

- **Where:** [`workflowCallbacks.ts#L25`](../../src/actions/commons/workflowCallbacks.ts#L25), [`executePostActivities.ts#L30`](../../src/actions/install/executePostActivities.ts#L30).
- **Failure:** nested dependency installs and host-set prefixes lose their prefix after a rollback or post-activity.
- **Fix:** use `withScopedPrefix` (save/restore) in both places.

#### ACT-2026-19 — Low — Technical — Retained-workflow rollback loses diagnostics and cannot be retried

- **Where:** [`retainedWorkflow.ts#L22`](../../src/actions/commons/utils/retainedWorkflow.ts#L22).
- **Failure:** no revert callbacks/logs, errors after the first are dropped, and `rolledBack` is set before the pass, so a transient dependency-rollback failure is final.
- **Fix:** log each failure and set the flag only after a fully successful pass.

#### ACT-2026-20 — Low — Technical — Caller input objects are mutated and reused stale

- **Where:** `setSystemPackages.ts#L16`, install/delete/publish `init`, [`findDependencies.ts#L93`](../../src/actions/publish/findDependencies.ts#L93), [`installDependencies.ts#L99`](../../src/actions/install/installDependencies.ts#L99).
- **Failure:** defaults, resolved versions/devclasses and the snapshot are written into the caller's object (not undone on rollback); reusing it for a retry or later action skips refreshes and sees rolled-back dependencies as installed.
- **Fix:** clone input at action entry and keep computed values in `runtime`.

#### ACT-2026-21 — Low — Technical — Minor cleanup-helper state issues

- **Where:** [`releaseDeletionTransport.ts#L42`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L42) overwrites `runtime.dele` even for helper calls; L56 is a dead assignment; [`packageCleanup.ts#L344`](../../src/actions/commons/utils/packageCleanup.ts#L344) swallows namespace connector errors as "no namespace".
- **Fix:** return the uploaded transport instead of writing context; catch only the namespace parse error.

### `install`

#### ACT-2026-22 — Critical — Functional — Dependency installs inherit the parent's resolved package mappings

- **Where:** [`installDependencies.ts#L83`](../../src/actions/install/installDependencies.ts#L83) clones `installData` after `set-install-devclass` filled `replacements`; only `keepOriginal` is removed. The dependency's [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53) skips its stored mappings because the list is non-empty.
- **Failure:** installing P (renamed packages) with a missing dependency D: D's `generate-devclass` sees P's root as a second root and fails with "Multiple roots found"; with `$` targets it fails "All packages must start with prefix $"; D may pick P's namespace or contend for P's devclass locks; on success P's rows are persisted as D's mappings.
- **Fix:** build each dependency's `installDevclass` from the user's original input with `replacements: []`.

#### ACT-2026-23 — High — Functional — Upgrades needing a new dependency major are blocked

- **Where:** nested installs receive the snapshot holding the parent's installed manifest ([`installDependencies.ts#L82`](../../src/actions/install/installDependencies.ts#L82)); [`checkDependants.ts#L50`](../../src/actions/install/checkDependants.ts#L50).
- **Failure:** P v1 (D ^1) installed; installing P v2 (D ^2) upgrades D, whose `check-dependants` finds P v1 requiring ^1 and aborts. Installing D directly fails the same way; there is no skip option.
- **Fix:** replace the in-flight parent's manifest in the nested snapshot, or exclude it from the dependants check.

#### ACT-2026-24 — High — Technical — Transitive installs are not merged into the parent snapshot

- **Where:** [`installDependencies.ts#L82`](../../src/actions/install/installDependencies.ts#L82), [`#L99`](../../src/actions/install/installDependencies.ts#L99).
- **Failure:** A→B, A→C, B→D, C→D with D missing: B installs D in its clone only; C reinstalls D, failing on D's package lock (held until the root finishes) or on "object(s) already exist". The whole install rolls back.
- **Fix:** return every package a nested install installed (or share one snapshot) and treat compatible installed dependencies as no-ops.

#### ACT-2026-25 — High — Functional — Stored mappings for removed devclasses break upgrades

- **Where:** [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53) keeps all stored rows; [`generateDevclass.ts#L111`](../../src/actions/install/generateDevclass.ts#L111).
- **Failure:** v1 had ZFOO and ZFOO_OLD (renamed); v2 drops ZFOO_OLD. Its stored row has no parent in the new hierarchy, becomes a second root, and every upgrade fails with "Multiple roots found"; the stale row is also written back.
- **Fix:** filter replacements to the devclasses of the incoming hierarchy.

#### ACT-2026-26 — High — Functional — Local (`.trm`) installs use the wrong registry key

- **Where:** [`install/init.ts#L166`](../../src/actions/install/init.ts#L166), [`setInstallDevclass.ts#L56`](../../src/actions/install/setInstallDevclass.ts#L56) and [`actionLocks.ts#L23`](../../src/actions/commons/utils/actionLocks.ts#L23) use the file directory as endpoint; [`updatePackageData.ts#L45`](../../src/actions/install/updatePackageData.ts#L45) stores the real registry.
- **Failure:** upgrading a renamed package from a `.trm` file finds no mappings; non-interactive mode falls back to identity mappings and imports into the publisher's package names. Previous packages are not locked and local/remote installs of the same package do not block each other.
- **Fix:** resolve the real registry once in `init` and use it for mapping lookups and lock keys.

#### ACT-2026-27 — High — Functional — Rollback cleanup always fails for local-registry installs

- **Where:** [`importBatch.ts#L111`](../../src/actions/install/importBatch.ts#L111) passes the `FileSystem` registry; [`FileSystem.ts#L188`](../../src/registry/FileSystem.ts#L188) always throws.
- **Failure:** any failure after namespace/package generation or import leaves the released cleanup transport orphaned, sets `cleanupSucceeded = false` (blocking all restores), and leaves imported objects, packages and namespace behind.
- **Fix:** use `getRealRegistry()` for deletion transports or refuse up front when rollback is impossible.

#### ACT-2026-28 — High — Functional — Upgrade rollback after import drops retained tables

- **Where:** `cleanupEntries` includes every imported E071 ([`importBatch.ts#L36`](../../src/actions/install/importBatch.ts#L36)); the revert re-imports only the old definition ([`packageCleanup.ts#L534`](../../src/actions/commons/utils/packageCleanup.ts#L534)).
- **Failure:** a failure in landscape generation, post-activities, release or package-data deletes the retained `R3TR TABL` objects and recreates them from a definition-only backup; table data is lost despite the "data is kept" intent.
- **Fix:** exclude retained-table keys from `cleanupEntries` and let the backup restore handle them.

#### ACT-2026-29 — High — Functional — Released landscape transport stays queued after rollback

- **Where:** [`releaseLandscapeTransport.ts#L45`](../../src/actions/install/releaseLandscapeTransport.ts#L45), [`generateLandscapeTransport.ts#L121`](../../src/actions/install/generateLandscapeTransport.ts#L121).
- **Failure:** if `update-package-data` fails (or release logs an error after export), the local install and the forwarded deletion transport are rolled back, but the released landscape transport (with `upgrade=` pointing at the removed deletion transport) remains in the target queue.
- **Fix:** when released, remove it from the target TMS queue in the revert, or report it explicitly.

#### ACT-2026-30 — Medium — Functional — Rollback deletes pre-existing objects that no snapshot covers

- **Where:** [`importBatch.ts#L29`](../../src/actions/install/importBatch.ts#L29), [`#L48`](../../src/actions/install/importBatch.ts#L48); restore relies on `revert.dele` built from previous transport objects only.
- **Failure:** objects overwritten under `noExistingObjects`, and kept-original package definitions on a final system (stored transport is the TADIR transport), are deleted on rollback and never restored.
- **Fix:** snapshot pre-existing imported objects before import, or exclude them from cleanup.

#### ACT-2026-31 — Medium — Functional — `update-package-data` revert is incomplete without a metadata snapshot

- **Where:** [`updatePackageData.ts#L97`](../../src/actions/install/updatePackageData.ts#L97), [`#L119`](../../src/actions/install/updatePackageData.ts#L119).
- **Failure:** when packages were not read through the backend API, an upgrade revert restores only mappings (or nothing); the new version/trkorr row survives over rolled-back objects, notably in parent-driven dependency rollbacks.
- **Fix:** read the row directly before writing, or fail forward when restore cannot be guaranteed.

#### ACT-2026-32 — Medium — Functional — Upgrades from a local registry skip obsolete-object cleanup silently

- **Where:** [`generateUpdateTransport.ts#L28`](../../src/actions/install/generateUpdateTransport.ts#L28).
- **Failure:** objects removed in the new release remain and no deletion is forwarded; the user sees only a debug log.
- **Fix:** warn visibly, or use the real registry for the deletion transport.

#### ACT-2026-33 — Medium — Functional — Namespace carry-over for new devclasses uses the wrong pattern

- **Where:** [`setInstallDevclass.ts#L79`](../../src/actions/install/setInstallDevclass.ts#L79), [`#L108`](../../src/actions/install/setInstallDevclass.ts#L108).
- **Failure:** the pattern is taken from the root's *install* devclass but applied to *original* names (and `^$` is unescaped). With ZFOO installed as /ACME/FOO, a new ZFOO_B stays ZFOO_B under the /ACME/ root in non-interactive mode.
- **Fix:** use the original root's namespace as pattern and escape it.

#### ACT-2026-34 — Medium — Functional — `add-namespace` uses the first replacement instead of the root

- **Where:** [`addNamespace.ts#L26`](../../src/actions/install/addNamespace.ts#L26).
- **Failure:** with root mapped to /ACME/FOO and a subpackage to ZSUB listed first, the namespace becomes `Z`, /ACME/ is not created and `generate-devclass` fails.
- **Fix:** derive it from the root replacement and validate every target namespace.

#### ACT-2026-35 — Medium — Functional — Partial explicit replacements discard stored mappings on update

- **Where:** [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53).
- **Failure:** passing one replacement for a new subpackage makes every previously renamed devclass fall back to publisher names (non-interactive).
- **Fix:** merge stored rows under the explicit rows.

#### ACT-2026-36 — Medium — Functional — Non-interactive upgrade overwrites objects when the root devclass is unknown

- **Where:** [`checkTransports.ts#L275`](../../src/actions/install/checkTransports.ts#L275).
- **Failure:** with `noInquirer` and no `noExistingObjects`, existing foreign objects only produce a warning, while the interactive path asks for confirmation.
- **Fix:** fail closed in non-interactive mode unless `noExistingObjects` is set.

#### ACT-2026-37 — Medium — Technical — Parent cleanup runs after dependency rollback for early failures

- **Where:** [`install/init.ts#L207`](../../src/actions/install/init.ts#L207) runs after [`installDependencies.ts#L113`](../../src/actions/install/installDependencies.ts#L113).
- **Failure:** a failure in `add-namespace`/`generate-devclass`/`generate-update-transport`/`prepare-devc` rolls back dependencies (possibly deleting a namespace) before the parent's packages in that namespace are cleaned.
- **Fix:** move parent cleanup into a revert after `install-dependencies`.

#### ACT-2026-38 — Medium — Technical — Safety checks run before locks; namespaces are never locked

- **Where:** step order in [`install/index.ts#L304`](../../src/actions/install/index.ts#L304); the `NAMESPACE` lock type in [`actionLocks.ts#L6`](../../src/actions/commons/utils/actionLocks.ts#L6) is unused.
- **Failure:** existence and lock checks plus prompts happen before `lock-resources`; two installs can both create a namespace and one's rollback deletes it.
- **Fix:** lock (including the namespace) before the checks, or re-validate after locking.

#### ACT-2026-39 — Medium — Technical — `prepare-cust` revert stops at the first failure

- **Where:** [`prepareCust.ts#L102`](../../src/actions/install/prepareCust.ts#L102).
- **Failure:** one failing `revertPreparedTransport` skips the remaining customizing transports (violates the best-effort revert rule).
- **Fix:** catch per transport and throw the first error after the loop.

#### ACT-2026-40 — Medium — Functional — Customizing keys are dropped from cleanup transports

- **Where:** `cleanupEntries`/`addObjects` pass only PGMID/OBJECT/OBJ_NAME ([`importBatch.ts#L36`](../../src/actions/install/importBatch.ts#L36), [`packageCleanup.ts#L200`](../../src/actions/commons/utils/packageCleanup.ts#L200)).
- **Failure:** `R3TR TABU`/`VDAT` entries reach deletion transports without their E071K keys; the add fails (blocking restores through `cleanupSucceeded = false`) or the deletion scope is undefined. SAP-side behavior not reproduced.
- **Fix:** carry E071K keys, or exclude customizing explicitly with a warning.

#### ACT-2026-41 — Low — Technical — TypeError when the installed root devclass is unknown

- **Where:** [`setInstallDevclass.ts#L93`](../../src/actions/install/setInstallDevclass.ts#L93).
- **Fix:** guard `undefined` and fall back to the stored root replacement.

#### ACT-2026-42 — Low — Functional — Transport layer is mandatory even when unused

- **Where:** [`install/init.ts#L136`](../../src/actions/install/init.ts#L136); only consumed by `generate-devclass`.
- **Failure:** `keepOriginal` or `$` installs fail on systems without a default layer.
- **Fix:** validate the layer only when packages are generated.

#### ACT-2026-43 — Low — Functional — `&LANDSCAPE_TRANSPORT&` resolves to an empty string

- **Where:** [`executePostActivities.ts#L37`](../../src/actions/install/executePostActivities.ts#L37).
- **Failure:** on a final system or `$` package the placeholder silently becomes `''`.
- **Fix:** warn or fail when used without a landscape transport.

#### ACT-2026-44 — Low — Functional — Locked namespace is silently omitted from the landscape transport

- **Where:** [`generateLandscapeTransport.ts#L81`](../../src/actions/install/generateLandscapeTransport.ts#L81).
- **Fix:** log a warning naming the locking transport.

#### ACT-2026-45 — Low — Functional — Root release is not checked against the lockfile

- **Where:** `checks.lockfile` is only consumed for dependencies; [`install/init.ts#L87`](../../src/actions/install/init.ts#L87) ignores the requested version for local files.
- **Fix:** verify root name/version/integrity against the lockfile and reject a local artifact whose version differs.

#### ACT-2026-46 — Low — Technical — Rollback-readiness diagnostics are hidden

- **Where:** deletion-TOC download failures in `prepare*` are debug-only; a failed reconnect at [`importBatch.ts#L197`](../../src/actions/install/importBatch.ts#L197) leaves every revert on a closed connection.
- **Fix:** warn visibly and reconnect at the start of the revert.

### `delete`

#### ACT-2026-47 — High — Functional — Uninstall deletes objects outside the installation without confirmation

- **Where:** [`packageCleanup.ts#L230`](../../src/actions/commons/utils/packageCleanup.ts#L230), [`#L292`](../../src/actions/commons/utils/packageCleanup.ts#L292).
- **Failure:** every live subpackage not in the mappings is "locally added", including another TRM package installed underneath; its objects and DEVC are deleted while its record remains. With `noInquirer` extra objects are auto-confirmed (`deleteExtraObjects: true`), silently removing customer development.
- **Fix:** exclude devclasses owned by other installed packages; default to keeping extra objects without prompts and add an explicit option.

#### ACT-2026-48 — Medium — Functional — Customizing and translations are not reliably removed

- **Where:** [`packageCleanup.ts#L200`](../../src/actions/commons/utils/packageCleanup.ts#L200); on final systems the stored transport is the TADIR transport ([`updatePackageData.ts#L71`](../../src/actions/install/updatePackageData.ts#L71)).
- **Failure:** on final systems customizing is never deleted; on landscape systems TABU entries lack keys (ACT-2026-40).
- **Fix:** define the customizing policy for delete and document or implement it.

#### ACT-2026-49 — Medium — Technical — Revert re-imports the copy even when the deletion was never imported

- **Where:** snapshot saved before `registry.delete` ([`releaseDeletionTransport.ts#L19`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L19)); revert decides only on `canBeDeleted()` ([`packageCleanup.ts#L518`](../../src/actions/commons/utils/packageCleanup.ts#L518)).
- **Failure:** a registry 500 still triggers a full re-import over live objects; if it fails, staging cleanup is skipped.
- **Fix:** set an "import started" flag before `import(false)` and re-import only when set.

#### ACT-2026-50 — Medium — Technical — The only rollback copy lives in memory and its export is unchecked

- **Where:** [`releaseDeletionTransport.ts#L14`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L14), [`#L42`](../../src/actions/commons/utils/releaseDeletionTransport.ts#L42) (deletion binaries uploaded under the copy's number).
- **Failure:** an interrupted process loses the pre-deletion copy, including dirty and extra objects that cannot be reinstalled; objects that failed to export are deleted but unrestorable.
- **Fix:** persist the copy binaries locally and check the export log.

#### ACT-2026-51 — Medium — Functional — Record removal is skipped when the snapshot is missing

- **Where:** [`removePackageData.ts#L14`](../../src/actions/delete/removePackageData.ts#L14); backend failure falls back without snapshots ([`SystemConnectorBase.ts#L261`](../../src/systemConnector/SystemConnectorBase.ts#L261)).
- **Failure:** objects are deleted and forwarded but the record and mappings remain; the action reports success with only a debug log.
- **Fix:** re-read the record when no snapshot exists, or fail.

#### ACT-2026-52 — Medium — Functional — Moved or reassigned objects are deleted anyway

- **Where:** [`packageCleanup.ts#L359`](../../src/actions/commons/utils/packageCleanup.ts#L359).
- **Failure:** every install-transport entry is deleted wherever it lives now, including objects moved to another package or now shipped by another TRM package.
- **Fix:** compare current TADIR devclasses with the installation's and skip or confirm outsiders.

#### ACT-2026-53 — Low — Functional — Dirty packages cannot be deleted non-interactively

- **Where:** [`delete/init.ts#L55`](../../src/actions/delete/init.ts#L55).
- **Failure:** with `noInquirer` the action always throws a bare "Delete aborted."
- **Fix:** add an explicit override option and include the reason.

#### ACT-2026-54 — Low — Functional — An empty deletion list still reports a successful delete

- **Where:** [`packageCleanup.ts#L368`](../../src/actions/commons/utils/packageCleanup.ts#L368), [`#L427`](../../src/actions/commons/utils/packageCleanup.ts#L427).
- **Fix:** warn or abort when nothing would be deleted.

### `publish`

#### ACT-2026-55 — Critical — Functional — First publish to a new local file always fails

- **Where:** [`publish/init.ts#L156`](../../src/actions/publish/init.ts#L156); [`FileSystem.ts#L127`](../../src/registry/FileSystem.ts#L127) wraps the missing file in a generic `Error`.
- **Failure:** PUBL-05 now rethrows anything but `RegistryPackageNotFoundError`, so publishing to a not-yet-existing artifact path aborts deterministically.
- **Fix:** throw `RegistryPackageNotFoundError` when the file does not exist (or skip the lookup for LOCAL).

#### ACT-2026-56 — High — Functional — Overwriting a local artifact treats it as the latest release

- **Where:** [`FileSystem.ts#L94`](../../src/registry/FileSystem.ts#L94) returns `dist_tags.latest = 'latest'` and ignores the name; [`publish/init.ts#L169`](../../src/actions/publish/init.ts#L169).
- **Failure:** `inc('latest')` is `null` (non-interactive fails later with "Package version missing"); the file's manifest is merged regardless of package name; its CUST transports are classified as retained, skipped by generation, and ignored by `FileSystem.publish`, so customizing silently disappears.
- **Fix:** do not treat the target file as latest for LOCAL, or validate its name and return the real version.

#### ACT-2026-57 — High — Technical — Async registry publish failures are reported as success

- **Where:** [`RegistryV2.ts#L547`](../../src/registry/RegistryV2.ts#L547).
- **Failure:** on 202, polling errors are logged as "check manually" and `publish` resolves; the workflow reports success and records the release on the origin system even if the server job failed. Polling is unbounded.
- **Fix:** fail (or return an explicit unknown state that blocks success) and bound polling.

#### ACT-2026-58 — Medium — Technical — Post-activity existence check is dead

- **Where:** [`PostActivity.ts#L117`](../../src/manifest/PostActivity.ts#L117) does not await `getObject`; used at [`setManifestValues.ts#L391`](../../src/actions/publish/setManifestValues.ts#L391) and [`PostActivity.ts#L22`](../../src/manifest/PostActivity.ts#L22).
- **Failure:** a Promise is always truthy, so non-existent classes are published and the install-time guard never fires; a rejected lookup becomes an unhandled rejection.
- **Fix:** await `getObject` (and `exists` at L22).

#### ACT-2026-59 — Medium — Functional — Non-interactive engines are validated non-strictly

- **Where:** [`setManifestValues.ts#L49`](../../src/actions/publish/setManifestValues.ts#L49); strict validation only in prompt branches.
- **Failure:** an unknown top-level key is published and makes every install fail "update TRM"; an unknown constraint property (typo) is dropped and never enforced.
- **Fix:** validate caller-supplied engines strictly in non-interactive mode.

#### ACT-2026-60 — Medium — Functional — `preRelease` is ignored on automatic versions

- **Where:** [`publish/init.ts#L169`](../../src/actions/publish/init.ts#L169) vs L176–183.
- **Failure:** with the version omitted on an existing package, a stable version is published instead of a prerelease.
- **Fix:** apply the prerelease computation after the automatic increment.

#### ACT-2026-61 — Medium — Technical — Non-interactive devclass may stay unresolved

- **Where:** [`publish/init.ts#L268`](../../src/actions/publish/init.ts#L268), [`#L300`](../../src/actions/publish/init.ts#L300).
- **Failure:** with `noInquirer`, no devclass and no matching system package, `getPackageNamespace(undefined)` throws a `TypeError`; a devclass derived from the snapshot is never validated or normalized.
- **Fix:** require the devclass explicitly in non-interactive mode and always validate/normalize it.

#### ACT-2026-62 — Medium — Functional — Merging with the latest release cannot remove or replace entries

- **Where:** [`setManifestValues.ts#L52`](../../src/actions/publish/setManifestValues.ts#L52).
- **Failure:** authors, keywords and post-activities are unioned; changing a post-activity's parameters publishes both versions, so it runs twice at install.
- **Fix:** treat caller-supplied arrays as authoritative, or merge post-activities by class.

#### ACT-2026-63 — Medium — Functional — Retained customizing transports cannot be dropped non-interactively

- **Where:** [`setCustomizingTransports.ts#L55`](../../src/actions/publish/setCustomizingTransports.ts#L55).
- **Fix:** let an explicit `customizingTransports` list replace the retained set, or add an exclusion input.

#### ACT-2026-64 — Low — Technical — Object locks are not re-checked after TRM locks are taken

- **Where:** check in `init`, locks in [`publish/lockResources.ts#L8`](../../src/actions/publish/lockResources.ts#L8) after the prompt steps.
- **Fix:** re-read objects and SAP locks in `lock-resources`.

#### ACT-2026-65 — Low — Functional — Public-registry metadata limits are enforced only in prompts

- **Where:** [`setManifestValues.ts#L182`](../../src/actions/publish/setManifestValues.ts#L182).
- **Fix:** apply the same limits before transport generation in non-interactive mode.

#### ACT-2026-66 — Low — Technical — A retained transport can be added twice

- **Where:** [`setCustomizingTransports.ts#L185`](../../src/actions/publish/setCustomizingTransports.ts#L185).
- **Fix:** check "already added" before the retained-transport branch.

#### ACT-2026-67 — Low — Technical — Prompted version is not cleaned

- **Where:** [`publish/init.ts#L204`](../../src/actions/publish/init.ts#L204).
- **Failure:** `v1.2.4` is stored raw (duplicate check, transport text and comment disagree with the manifest).
- **Fix:** store `clean(v)`.

#### ACT-2026-68 — Low — Functional — Derived manifest fields and engine prefill are brittle

- **Where:** [`setManifestValues.ts#L274`](../../src/actions/publish/setManifestValues.ts#L274) (caller `registry`/`namespace` survive), [`getSystemEngines.ts#L32`](../../src/actions/publish/getSystemEngines.ts#L32) (one malformed row discards the whole prefill), [`setManifestValues.ts#L380`](../../src/actions/publish/setManifestValues.ts#L380) (logs `[object Object]`).
- **Fix:** reset derived fields, skip malformed rows individually, log JSON strings.

### `check-sap-entries`

#### ACT-2026-69 — Medium — Technical — Connector swallows every SAP-entry error (SAPCHK-02 ineffective)

- **Where:** [`SystemConnectorBase.ts#L432`](../../src/systemConnector/SystemConnectorBase.ts#L432) returns `false` on any error, so the rethrow at [`analyze.ts#L70`](../../src/actions/checkSapEntries/analyze.ts#L70) and the "Unknown" branch are dead.
- **Failure:** missing authorization or a dropped connection reports every table "not found" and aborts install with "requirements are not met" instead of the real cause.
- **Fix:** propagate read errors; treat only true absence as `false`.

#### ACT-2026-70 — Medium — Technical — SAP-entry where clause is built unsafely

- **Where:** [`SystemConnectorBase.ts#L435`](../../src/systemConnector/SystemConnectorBase.ts#L435).
- **Failure:** values are not quote-escaped (`O'NEIL`), field names are unvalidated, an empty entry throws, and a single condition over the 72-character option line cannot be split; all surface as `NOT FOUND`.
- **Fix:** escape `'`, validate fields and lengths, reject empty entries in `Manifest.normalize`.

#### ACT-2026-71 — Medium — Functional — Table probe is case-sensitive and TABL-only

- **Where:** [`analyze.ts#L65`](../../src/actions/checkSapEntries/analyze.ts#L65).
- **Failure:** a lowercase table key or a database view is reported "table was not found" and blocks install.
- **Fix:** uppercase table names and probe DD02L (or TABL plus VIEW).

#### ACT-2026-72 — Low — Functional — Missing entries are hidden and the status table is misaligned

- **Where:** [`install/checkSapEntries.ts#L30`](../../src/actions/install/checkSapEntries.ts#L30) prints entries only in debug; `splice` at [`analyze.ts#L118`](../../src/actions/checkSapEntries/analyze.ts#L118) shifts values when an entry lacks a column.
- **Fix:** log each missing entry at error level; build rows as `header.map(h => entry[h] ?? '')`.

#### ACT-2026-73 — Low — Technical — Output order and unused imports

- **Where:** good rows are emitted before bad rows ([`analyze.ts#L137`](../../src/actions/checkSapEntries/analyze.ts#L137)); unused imports in `index.ts`.
- **Fix:** emit statuses in declaration order.

### `check-engines`

#### ACT-2026-74 — Medium — Functional — Unknown properties inside known engine checks pass silently

- **Where:** non-strict validation in [`checkEngines/init.ts#L26`](../../src/actions/checkEngines/init.ts#L26); evaluators read only `release`/`sp`/`version`.
- **Failure:** `{ release: '>=758', patch: '>=3' }` prints "patch >=3 … OK" without checking `patch`, unlike unknown top-level keys, which fail.
- **Fix:** fail constraints with unsupported properties using the same "update TRM" reason.

#### ACT-2026-75 — Low — Technical — Normalization collisions and comparison gaps

- **Where:** `validateEngines.ts` normalization (`sap_basis`/`SAP_BASIS`, `0001234`/`1234` collapse silently); blank `EXTRELEASE` shown as SP 0 but fails `sp >=0`; failed CVERS/PRDVERS reads not cached ([`analyze.ts#L31`](../../src/actions/checkEngines/analyze.ts#L31)).
- **Fix:** reject post-normalization duplicates, normalize blank SP, cache rejections.

#### ACT-2026-76 — Low — Functional — `anyOf` failures are opaque

- **Where:** [`install/checkEngines.ts#L39`](../../src/actions/install/checkEngines.ts#L39); notes validation message lists unsupported value kinds.
- **Fix:** print each alternative's reason under a failed `anyOf`; use per-check validation messages.

### `check-dependencies`

#### ACT-2026-77 — Medium — Functional — Prerelease versions are treated inconsistently

- **Where:** `semver.satisfies` without `includePrerelease` in [`checkPackageDependencies/analyze.ts#L46`](../../src/actions/checkPackageDependencies/analyze.ts#L46), [`findInstallRelease.ts#L30`](../../src/actions/installDependency/findInstallRelease.ts#L30), [`Lockfile.ts#L89`](../../src/lockfile/Lockfile.ts#L89), [`checkDependants.ts#L52`](../../src/actions/install/checkDependants.ts#L52).
- **Failure:** installed `1.3.0-beta.1` fails `>=1.0.0`, so `1.2.0` is installed over it with only a "Downgrading" warning.
- **Fix:** adopt one prerelease policy and never auto-select a version below the installed one.

#### ACT-2026-78 — Low — Functional — Invalid ranges and unreadable manifests are not distinguished

- **Where:** [`checkPackageDependencies/analyze.ts#L43`](../../src/actions/checkPackageDependencies/analyze.ts#L43).
- **Failure:** an invalid range silently evaluates false (docs promise a throw); an installed package without a manifest is "Not found" and triggers a reinstall attempt.
- **Fix:** validate ranges and report "installed, manifest unreadable" separately.

### `install-dependency`

#### ACT-2026-79 — High — Functional — A lockfile without the dependency aborts installation

- **Where:** [`findInstallRelease.ts#L20`](../../src/actions/installDependency/findInstallRelease.ts#L20); [`Lockfile.getLock`](../../src/lockfile/Lockfile.ts#L87) throws instead of returning nothing.
- **Failure:** the documented registry fallback runs only without a lockfile. Partial lockfiles (generation skips packages missing on the source) abort deterministically, and an out-of-range lock is reported as "not found".
- **Fix:** return `undefined` for a missing entry and fall back; throw a distinct error for an out-of-range lock.

#### ACT-2026-80 — Medium — Technical — Lock integrity is checked on a different download than the one imported

- **Where:** [`Lockfile.ts#L95`](../../src/lockfile/Lockfile.ts#L95); the nested install re-fetches metadata and imports per-transport binaries verified only against registry checksums.
- **Failure:** the lock does not protect what is imported; an empty integrity row (`getPackageIntegrity` returns `''`) produces a lockfile that always raises "SECURITY ISSUE".
- **Fix:** pass the expected integrity into the nested install and compare it with the imported release; refuse empty integrity at generation.

#### ACT-2026-81 — Medium — Functional — Installed versions are ignored: silent downgrade or "already installed" abort

- **Where:** snapshot never read by `installDependency`; wrapper labels incompatible dependencies "missing" ([`install/checkDependencies.ts#L42`](../../src/actions/install/checkDependencies.ts#L42)).
- **Failure:** X 2.0.0 installed and `^1.0.0` required: confirming "missing dependencies" downgrades X. Called directly when the newest in-range release is installed, it throws instead of returning a no-op.
- **Fix:** skip compatible installed versions and require explicit confirmation for downgrades.

#### ACT-2026-82 — Low — Functional — Self and cyclic dependencies are not detected

- **Where:** [`installDependencies.ts#L60`](../../src/actions/install/installDependencies.ts#L60).
- **Failure:** A→B→A re-enters install and fails on the package lock with an unrelated message.
- **Fix:** track ancestry and fail with an explicit cycle error.

#### ACT-2026-83 — Low — Technical — Dead guard and unused imports

- **Where:** [`installRelease.ts#L14`](../../src/actions/installDependency/installRelease.ts#L14) can never fire; unused `inspect`/`Logger` imports.

### `cg3y`

#### ACT-2026-84 — Low — Functional — Input and output validation gaps

- **Where:** [`cg3y/download.ts#L21`](../../src/actions/cg3y/download.ts#L21).
- **Failure:** released tasks or local requests without exports pass the checks and fail later with an unclear file error; empty buffers produce a ZIP of 0-byte entries reported as success.
- **Fix:** validate the transport number and request type, and reject empty files.

### `cg3z`

#### ACT-2026-85 — High — Technical — Upload rollback is ineffective (CG3Z-01 ineffective)

- **Where:** [`cg3z/upload.ts#L72`](../../src/actions/cg3z/upload.ts#L72); the unit test mocks `Transport` entirely.
- **Failure:** uploaded foreign transports have no E070 row in the target, so `canBeDeleted()` throws `TypeError`; cofile/data files and any TMS buffer entry remain. Even with E070, `deleteTrkorr` removes neither.
- **Fix:** track header/data/forward progress, remove the buffer entry with `deleteTmsTransport`, restore or delete only files written by this run, and never call `deleteTrkorr` here.

#### ACT-2026-86 — Medium — Functional — Existing transport files are overwritten

- **Where:** [`cg3z/upload.ts#L51`](../../src/actions/cg3z/upload.ts#L51); `Transport.upload` writes without an existence check.
- **Failure:** a colliding transport number (shared trial SIDs, re-upload to the source) overwrites cofile/data, losing import history; a forward failure may then delete an unrelated modifiable request with the same number.
- **Fix:** refuse (or require an overwrite flag) when E070 or files exist, and snapshot them for rollback.

#### ACT-2026-87 — Medium — Functional — Archive entry-name handling is fragile

- **Where:** [`cg3z/upload.ts#L16`](../../src/actions/cg3z/upload.ts#L16).
- **Failure:** lowercase `k900001.npl` yields `nplK900001` and tp cannot find the cofile; any `R*`/`K*` entry (e.g. `README.txt`) or folder prefix triggers a misleading cardinality error.
- **Fix:** use basenames, require `^[KR][A-Z0-9]{6,}\.[A-Z0-9]{3}$/i`, uppercase, ignore directories.

#### ACT-2026-88 — Low — Functional — Diagnostics and stop warning

- **Where:** [`cg3z/upload.ts#L68`](../../src/actions/cg3z/upload.ts#L68).
- **Failure:** the refresh-text error is discarded entirely (typo "Coudln't"); cg3z changes SAP data without the standard stop warning.
- **Fix:** log the error message and call `stopWarning`.

## Reconsideration of accepted findings

These items match previously accepted (**Non-relevant**) findings and are not counted, but the
current source changes their context. They should be re-decided explicitly.

- **INST-02 — Batch import return codes are discarded.** INST-02 accepted that the install relied
  on `Transport.import()` to report TMS return codes. The install now imports through
  [`Transport.importMultiple`](../../src/transport/Transport.ts#L776), whose per-transport results
  are discarded at [`importBatch.ts#L194`](../../src/actions/install/importBatch.ts#L194), while the
  `prepare-*` steps now explicitly reject test-import RC > 8. A final import with RC 8/12 continues to
  TADIR finalization, landscape release and the package record, and reports success. Recommended
  severity if reopened: High.

## Highest-priority remediation

1. **ACT-2026-22** — reset dependency install mappings so dependency installs stop failing with "Multiple roots".
2. **ACT-2026-55** — restore first-time local publishing.
3. **ACT-2026-04** and **ACT-2026-06**, together with re-deciding **INST-02** — enforce import return codes for deletion, restore, and batch imports.
4. **ACT-2026-05** and **ACT-2026-47** — stop cleanup from deleting shared namespaces, foreign subpackages and unconfirmed extra objects.
5. **ACT-2026-28** — keep retained tables out of the rollback cleanup.
6. **ACT-2026-23**, **ACT-2026-24**, **ACT-2026-79** — make dependency resolution consistent (major bumps, diamonds, partial lockfiles).
7. **ACT-2026-25**, **ACT-2026-26**, **ACT-2026-27** — stale mappings and local-registry install/rollback.
8. **ACT-2026-07**, **ACT-2026-29**, **ACT-2026-85** — unauthorized deletion path, queued landscape transport after rollback, cg3z rollback.
9. **ACT-2026-56**, **ACT-2026-57** — local overwrite and async publish status.

These findings were identified by static review and were not reproduced against SAP or a registry.
