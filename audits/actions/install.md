# `install` workflow audit

Audit date: 2026-10-04
Entry point: [`install`](../../src/actions/install/index.ts#L308)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-22 — Critical — Functional — Dependency installs inherit the parent's resolved package mappings

- **Where:** [`installDependencies.ts#L83`](../../src/actions/install/installDependencies.ts#L83) clones `installData` after `set-install-devclass` filled `replacements`; only `keepOriginal` is removed. The dependency's [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53) skips its stored mappings because the list is non-empty.
- **Failure:** installing P (renamed packages) with a missing dependency D: D's `generate-devclass` sees P's root as a second root and fails with "Multiple roots found"; with `$` targets it fails "All packages must start with prefix $"; D may pick P's namespace or contend for P's devclass locks; on success P's rows are persisted as D's mappings.
- **Fix:** build each dependency's `installDevclass` from the user's original input with `replacements: []`.

### ACT-2026-23 — High — Functional — Upgrades needing a new dependency major are blocked

- **Where:** nested installs receive the snapshot holding the parent's installed manifest ([`installDependencies.ts#L82`](../../src/actions/install/installDependencies.ts#L82)); [`checkDependants.ts#L50`](../../src/actions/install/checkDependants.ts#L50).
- **Failure:** P v1 (D ^1) installed; installing P v2 (D ^2) upgrades D, whose `check-dependants` finds P v1 requiring ^1 and aborts. Installing D directly fails the same way; there is no skip option.
- **Fix:** replace the in-flight parent's manifest in the nested snapshot, or exclude it from the dependants check.

### ACT-2026-24 — High — Technical — Transitive installs are not merged into the parent snapshot

- **Where:** [`installDependencies.ts#L82`](../../src/actions/install/installDependencies.ts#L82), [`#L99`](../../src/actions/install/installDependencies.ts#L99).
- **Failure:** A→B, A→C, B→D, C→D with D missing: B installs D in its clone only; C reinstalls D, failing on D's package lock (held until the root finishes) or on "object(s) already exist". The whole install rolls back.
- **Fix:** return every package a nested install installed (or share one snapshot) and treat compatible installed dependencies as no-ops.

### ACT-2026-25 — High — Functional — Stored mappings for removed devclasses break upgrades

- **Where:** [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53) keeps all stored rows; [`generateDevclass.ts#L111`](../../src/actions/install/generateDevclass.ts#L111).
- **Failure:** v1 had ZFOO and ZFOO_OLD (renamed); v2 drops ZFOO_OLD. Its stored row has no parent in the new hierarchy, becomes a second root, and every upgrade fails with "Multiple roots found"; the stale row is also written back.
- **Fix:** filter replacements to the devclasses of the incoming hierarchy.

### ACT-2026-26 — High — Functional — Local (`.trm`) installs use the wrong registry key

- **Where:** [`install/init.ts#L166`](../../src/actions/install/init.ts#L166), [`setInstallDevclass.ts#L56`](../../src/actions/install/setInstallDevclass.ts#L56) and [`actionLocks.ts#L23`](../../src/actions/commons/utils/actionLocks.ts#L23) use the file directory as endpoint; [`updatePackageData.ts#L45`](../../src/actions/install/updatePackageData.ts#L45) stores the real registry.
- **Failure:** upgrading a renamed package from a `.trm` file finds no mappings; non-interactive mode falls back to identity mappings and imports into the publisher's package names. Previous packages are not locked and local/remote installs of the same package do not block each other.
- **Fix:** resolve the real registry once in `init` and use it for mapping lookups and lock keys.

### ACT-2026-27 — High — Functional — Rollback cleanup always fails for local-registry installs

- **Where:** [`importBatch.ts#L111`](../../src/actions/install/importBatch.ts#L111) passes the `FileSystem` registry; [`FileSystem.ts#L188`](../../src/registry/FileSystem.ts#L188) always throws.
- **Failure:** any failure after namespace/package generation or import leaves the released cleanup transport orphaned, sets `cleanupSucceeded = false` (blocking all restores), and leaves imported objects, packages and namespace behind.
- **Fix:** use `getRealRegistry()` for deletion transports or refuse up front when rollback is impossible.

### ACT-2026-28 — High — Functional — Upgrade rollback after import drops retained tables

- **Where:** `cleanupEntries` includes every imported E071 ([`importBatch.ts#L36`](../../src/actions/install/importBatch.ts#L36)); the revert re-imports only the old definition ([`packageCleanup.ts#L534`](../../src/actions/commons/utils/packageCleanup.ts#L534)).
- **Failure:** a failure in landscape generation, post-activities, release or package-data deletes the retained `R3TR TABL` objects and recreates them from a definition-only backup; table data is lost despite the "data is kept" intent.
- **Fix:** exclude retained-table keys from `cleanupEntries` and let the backup restore handle them.

### ACT-2026-29 — High — Functional — Released landscape transport stays queued after rollback

- **Where:** [`releaseLandscapeTransport.ts#L45`](../../src/actions/install/releaseLandscapeTransport.ts#L45), [`generateLandscapeTransport.ts#L121`](../../src/actions/install/generateLandscapeTransport.ts#L121).
- **Failure:** if `update-package-data` fails (or release logs an error after export), the local install and the forwarded deletion transport are rolled back, but the released landscape transport (with `upgrade=` pointing at the removed deletion transport) remains in the target queue.
- **Fix:** when released, remove it from the target TMS queue in the revert, or report it explicitly.

### ACT-2026-30 — Medium — Functional — Rollback deletes pre-existing objects that no snapshot covers

- **Where:** [`importBatch.ts#L29`](../../src/actions/install/importBatch.ts#L29), [`#L48`](../../src/actions/install/importBatch.ts#L48); restore relies on `revert.dele` built from previous transport objects only.
- **Failure:** objects overwritten under `noExistingObjects`, and kept-original package definitions on a final system (stored transport is the TADIR transport), are deleted on rollback and never restored.
- **Fix:** snapshot pre-existing imported objects before import, or exclude them from cleanup.

### ACT-2026-31 — Medium — Functional — `update-package-data` revert is incomplete without a metadata snapshot

- **Where:** [`updatePackageData.ts#L97`](../../src/actions/install/updatePackageData.ts#L97), [`#L119`](../../src/actions/install/updatePackageData.ts#L119).
- **Failure:** when packages were not read through the backend API, an upgrade revert restores only mappings (or nothing); the new version/trkorr row survives over rolled-back objects, notably in parent-driven dependency rollbacks.
- **Fix:** read the row directly before writing, or fail forward when restore cannot be guaranteed.

### ACT-2026-32 — Medium — Functional — Upgrades from a local registry skip obsolete-object cleanup silently

- **Where:** [`generateUpdateTransport.ts#L28`](../../src/actions/install/generateUpdateTransport.ts#L28).
- **Failure:** objects removed in the new release remain and no deletion is forwarded; the user sees only a debug log.
- **Fix:** warn visibly, or use the real registry for the deletion transport.

### ACT-2026-33 — Medium — Functional — Namespace carry-over for new devclasses uses the wrong pattern

- **Where:** [`setInstallDevclass.ts#L79`](../../src/actions/install/setInstallDevclass.ts#L79), [`#L108`](../../src/actions/install/setInstallDevclass.ts#L108).
- **Failure:** the pattern is taken from the root's *install* devclass but applied to *original* names (and `^$` is unescaped). With ZFOO installed as /ACME/FOO, a new ZFOO_B stays ZFOO_B under the /ACME/ root in non-interactive mode.
- **Fix:** use the original root's namespace as pattern and escape it.

### ACT-2026-34 — Medium — Functional — `add-namespace` uses the first replacement instead of the root

- **Where:** [`addNamespace.ts#L26`](../../src/actions/install/addNamespace.ts#L26).
- **Failure:** with root mapped to /ACME/FOO and a subpackage to ZSUB listed first, the namespace becomes `Z`, /ACME/ is not created and `generate-devclass` fails.
- **Fix:** derive it from the root replacement and validate every target namespace.

### ACT-2026-35 — Medium — Functional — Partial explicit replacements discard stored mappings on update

- **Where:** [`setInstallDevclass.ts#L53`](../../src/actions/install/setInstallDevclass.ts#L53).
- **Failure:** passing one replacement for a new subpackage makes every previously renamed devclass fall back to publisher names (non-interactive).
- **Fix:** merge stored rows under the explicit rows.

### ACT-2026-36 — Medium — Functional — Non-interactive upgrade overwrites objects when the root devclass is unknown

- **Where:** [`checkTransports.ts#L275`](../../src/actions/install/checkTransports.ts#L275).
- **Failure:** with `noInquirer` and no `noExistingObjects`, existing foreign objects only produce a warning, while the interactive path asks for confirmation.
- **Fix:** fail closed in non-interactive mode unless `noExistingObjects` is set.

### ACT-2026-37 — Medium — Technical — Parent cleanup runs after dependency rollback for early failures

- **Where:** [`install/init.ts#L207`](../../src/actions/install/init.ts#L207) runs after [`installDependencies.ts#L113`](../../src/actions/install/installDependencies.ts#L113).
- **Failure:** a failure in `add-namespace`/`generate-devclass`/`generate-update-transport`/`prepare-devc` rolls back dependencies (possibly deleting a namespace) before the parent's packages in that namespace are cleaned.
- **Fix:** move parent cleanup into a revert after `install-dependencies`.

### ACT-2026-38 — Medium — Technical — Safety checks run before locks; namespaces are never locked

- **Where:** step order in [`install/index.ts#L304`](../../src/actions/install/index.ts#L304); the `NAMESPACE` lock type in [`actionLocks.ts#L6`](../../src/actions/commons/utils/actionLocks.ts#L6) is unused.
- **Failure:** existence and lock checks plus prompts happen before `lock-resources`; two installs can both create a namespace and one's rollback deletes it.
- **Fix:** lock (including the namespace) before the checks, or re-validate after locking.

### ACT-2026-39 — Medium — Technical — `prepare-cust` revert stops at the first failure

- **Where:** [`prepareCust.ts#L102`](../../src/actions/install/prepareCust.ts#L102).
- **Failure:** one failing `revertPreparedTransport` skips the remaining customizing transports (violates the best-effort revert rule).
- **Fix:** catch per transport and throw the first error after the loop.

### ACT-2026-40 — Medium — Functional — Customizing keys are dropped from the rollback cleanup transport

- **Where:** `cleanupEntries`/`addObjects` pass only PGMID/OBJECT/OBJ_NAME ([`importBatch.ts#L36`](../../src/actions/install/importBatch.ts#L36)). The upgrade and delete cleanup ([`packageCleanup.ts`](../../src/actions/commons/utils/packageCleanup.ts)) no longer does: it drops keyed entries and copies the recorded CUST transports with their keys ([ACT-2026-48](delete.md), resolved).
- **Failure:** on install rollback, `R3TR TABU`/`VDAT` entries reach the cleanup deletion transport without their E071K keys and `OBJFUNC` `K`. The registry then treats them as repository objects and requests the deletion of the whole table object, or the add fails (blocking restores through `cleanupSucceeded = false`). SAP-side behavior not reproduced.
- **Fix:** copy the imported CUST transports into the cleanup transport (`addObjectsFromTransport`, as the upgrade cleanup does) instead of adding their entries.

### ACT-2026-41 — Low — Technical — TypeError when the installed root devclass is unknown

- **Where:** [`setInstallDevclass.ts#L93`](../../src/actions/install/setInstallDevclass.ts#L93).
- **Fix:** guard `undefined` and fall back to the stored root replacement.

### ACT-2026-42 — Low — Functional — Transport layer is mandatory even when unused

- **Where:** [`install/init.ts#L136`](../../src/actions/install/init.ts#L136); only consumed by `generate-devclass`.
- **Failure:** `keepOriginal` or `$` installs fail on systems without a default layer.
- **Fix:** validate the layer only when packages are generated.

### ACT-2026-44 — Low — Functional — Locked namespace is silently omitted from the landscape transport

- **Where:** [`generateLandscapeTransport.ts#L81`](../../src/actions/install/generateLandscapeTransport.ts#L81).
- **Fix:** log a warning naming the locking transport.

### ACT-2026-45 — Low — Functional — Root release is not checked against the lockfile

- **Where:** `checks.lockfile` is only consumed for dependencies; [`install/init.ts#L87`](../../src/actions/install/init.ts#L87) ignores the requested version for local files.
- **Fix:** verify root name/version/integrity against the lockfile and reject a local artifact whose version differs.

### ACT-2026-46 — Low — Technical — Rollback-readiness diagnostics are hidden

- **Where:** deletion-TOC download failures in `prepare*` are debug-only; a failed reconnect at [`importBatch.ts#L197`](../../src/actions/install/importBatch.ts#L197) leaves every revert on a closed connection.
- **Fix:** warn visibly and reconnect at the start of the revert.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | Shared [ACT-2026-12](shared.md). |
| 2 | `set-system-packages` | Snapshot excludes local-registry packages ([ACT-2026-15](shared.md)) and is never refreshed for transitive installs (ACT-2026-24). |
| 3 | `init` | Raw package name used for lookups ([ACT-2026-16](shared.md)); local installs use the wrong registry key (ACT-2026-26); transport layer always mandatory (ACT-2026-42). Revert is the only cleanup point for early failures (ACT-2026-37). |
| 4 | `check-dependants` | Correct on its own, but blocks nested dependency upgrades against the parent's old manifest (ACT-2026-23). |
| 5 | `check-transports` | Root package matched by raw name ([ACT-2026-16](shared.md)); non-interactive mode overwrites when the root devclass is unknown (ACT-2026-36). |
| 6 | `check-sap-entries` | See [check-sap-entries findings](check-sap-entries.md); each missing entry is logged at error level before aborting. |
| 7 | `check-engines` | No install-specific issue; a failed `anyOf` lists each alternative's unmet requirements ([ACT-2026-76](check-engines.md), resolved). |
| 8 | `check-dependencies` | Queues missing and incompatible dependencies separately, with the installed version; a downgrade must be confirmed by the dependency install ([ACT-2026-81](install-dependency.md), resolved). |
| 9 | `check-dependency-cycles` | Walks the dependencies the install would recurse into (compatible installed dependencies end the walk; others resolve to the release a dependency install would select) and aborts on a self or cyclic dependency before anything is locked or installed ([ACT-2026-82](install-dependency.md), resolved). Skipped with `noDependencies`. |
| 10 | `set-install-devclass` | Stale stored mappings retained (ACT-2026-25), wrong namespace carry-over (ACT-2026-33), partial input discards stored mappings (ACT-2026-35), TypeError on unknown root (ACT-2026-41). |
| 11 | `lock-resources` | Runs after safety checks; namespace never locked (ACT-2026-38). |
| 12 | `install-dependencies` | Forwards the parent's resolved mappings (ACT-2026-22); transitive installs not merged back (ACT-2026-24). |
| 13 | `add-namespace` | Namespace taken from `replacements[0]` (ACT-2026-34). |
| 14 | `generate-devclass` | Fails with "Multiple roots" on inherited or stale mappings (ACT-2026-22, ACT-2026-25). |
| 15 | `generate-update-transport` | Silently skipped for local registries (ACT-2026-32); revert restores without checking cleanup success ([ACT-2026-08](shared.md)) and leaks the staging package ([ACT-2026-09](shared.md)). Deletes the installed release's customizing by key, without asking, before the new customizing is imported, unless `noCust` ([ACT-2026-48](delete.md), resolved). |
| 16–19 | `prepare-devc`, `prepare-tadir`, `prepare-lang`, `prepare-cust` | Forward flow correct; test-import RC is checked. `prepare-cust` revert is not best-effort (ACT-2026-39). |
| 20 | `import-batch` | Batch RC ignored (see *Reconsideration of accepted findings*). Rollback drops retained tables (ACT-2026-28), deletes unsnapshotted pre-existing objects (ACT-2026-30), and always fails for local registries (ACT-2026-27). |
| 21 | `generate-landscape-transport` | Locked namespace silently omitted (ACT-2026-44). |
| 22 | `execute-post-activities` | Global prefix clobbered ([ACT-2026-18](shared.md)). `&LANDSCAPE_TRANSPORT&` intentionally resolves to an empty string without a landscape transport (ACT-2026-43, non-relevant). |
| 23 | `release-install-transports` | Released transport stays queued in the target after rollback (ACT-2026-29); unbounded release wait ([ACT-2026-14](shared.md)). |
| 24 | `update-package-data` | Revert incomplete without a metadata snapshot (ACT-2026-31). Records the imported CUST and LANG transports in `/ATRM/INSTALLTR` and restores the previous ones on revert ([ACT-2026-48](delete.md), resolved). |

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

## Resolved findings
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

### INST-02 — Non-relevant — Import return-code handling follows the transport contract

Install steps intentionally rely on `Transport.import()` to interpret and report TMS return codes.
The action workflow does not independently convert logged return codes into rejected promises;
continuing according to the transport layer's result is the accepted contract
([source](../../src/transport/Transport.ts#L793)).
