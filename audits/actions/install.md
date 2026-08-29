# `install` workflow audit

Audit date: 2026-08-27
Entry point: [`install`](../../src/actions/install/index.ts#L257)

## Findings

### INST-01 — Critical — `checkTransports` is never scheduled

The implemented `checkTransports` step is absent from the workflow array
([workflow](../../src/actions/install/index.ts#L258)). That step is the only code that downloads or
indexes artifact transports and populates `runtime.package.hierarchy`
([source](../../src/actions/install/checkTransports.ts#L78)). The scheduled `setInstallDevclass`
then dereferences `context.runtime.package.hierarchy.devclass`
([source](../../src/actions/install/setInstallDevclass.ts#L59)). A standard install therefore fails
before importing anything, unless out-of-band code mutates the context (none exists in this entry
point).

Recommendation: schedule `checkTransports` after `init` and before SAP/dependency/package mapping
checks that rely on artifact state.

### INST-02 — Critical — Failed SAP imports are treated as successful

Every import step awaits `Transport.import()`, but that method only logs TMS return codes `-1`, `8`,
`12`, and `16`; it does not throw ([source](../../src/transport/Transport.ts#L793)). The workflow
then continues through package registration and returns success after a failed or cancelled import.

Recommendation: make non-success return codes reject (decide explicitly whether RC 4 is accepted),
return a typed import result, and gate every later step on it.

### INST-04 — High — Rollback handlers for imported state are empty

The DEVC, TADIR, LANG, CUST, deletion-transport, namespace, and generated-package rollback paths
contain TODO-only handlers. Examples: [DEVC](../../src/actions/install/importDevcTransport.ts#L147),
[TADIR](../../src/actions/install/importTadirTransport.ts#L121),
[namespace](../../src/actions/install/addNamespace.ts#L96), and
[packages](../../src/actions/install/generateDevclass.ts#L122). The source comments promise saved
rollback binaries, but no restore/import occurs.

Recommendation: implement compensating operations and test failure injection after every mutation;
otherwise remove the misleading rollback handlers and fail before mutations that cannot be safely
recovered.

### INST-05 — High — Generated packages are not recorded for rollback

`generateDevclass` creates packages but never pushes them into `context.revert.sapPackages`
([creation](../../src/actions/install/generateDevclass.ts#L45)). Even a future implementation of its
existing revert loop would have no targets.

### INST-06 — High — Package record is committed before fallible final steps and has no revert

`updatePackageData` runs before post-activities and landscape transport release
([workflow order](../../src/actions/install/index.ts#L273)). If release fails, the system package
table already claims the release is installed; the update step has no revert handler.

Recommendation: release first and commit last, or retain/restore the previous database row.

### INST-07 — High — Post-activity failures are converted into success

`executePostActivities` catches each exception, logs it, and continues
([source](../../src/actions/install/executePostActivities.ts#L27)). The action can return success
when required configuration failed. It also mutates manifest parameter values in place when
substituting `&LANDSCAPE_TRANSPORT&`.

Recommendation: support explicit optional/required activity semantics and reject required failures;
clone activity data before substitutions.

### INST-08 — High — Recursive dependency installs use stale installed-package snapshots

`installDependencies` deep-clones the parent `contextData` for each dependency
([source](../../src/actions/install/installDependencies.ts#L73)). `systemPackages` is therefore the
same pre-install snapshot for all recursive calls. A later dependency can fail to recognize a
package installed earlier in the same run, causing duplicate installation, same-version errors, or
incorrect dependency decisions.

Recommendation: refresh the snapshot after each successful nested install or update it with the
nested result before processing the next dependency.

### INST-09 — High — Generated deletion transport is omitted from the workflow

`generateDeletionTransport` is implemented to remove objects from prior versions but is not in the
workflow array. Upgrades/downgrades therefore never execute its cleanup logic. Its own revert is
also TODO-only ([source](../../src/actions/install/generateDeletionTransport.ts#L16)).

### INST-10 — Medium — Logger/prompt prefixes leak when nested operations throw

Dependency and transport import steps restore global prefixes only after successful awaits. For
example, a nested install rejection bypasses restoration
([source](../../src/actions/install/installDependencies.ts#L57)); the same pattern exists in DEVC,
TADIR, LANG, CUST, and deletion imports.

Recommendation: wrap every prefix mutation in `try/finally` and restore the exact prior prefix.

### INST-11 — Medium — Install-package mappings are persisted before installation succeeds

`setInstallDevclass` writes replacement mappings to the SAP table before transports are imported
([source](../../src/actions/install/setInstallDevclass.ts#L136)). Its revert only warns that dirty
records remain. Failed installs therefore influence later runs.

### INST-12 — Medium — Existing target packages are not lock-checked

`generateDevclass` explicitly leaves a TODO where existing ABAP packages should be checked for
locks ([source](../../src/actions/install/generateDevclass.ts#L35)). Hierarchy and transport-layer
mutations may then collide with another open transport.

## Scheduled step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No install-specific issue; see [shared audit](shared.md). |
| 2 | `set-system-packages` | No install-specific issue. |
| 3 | `trm-server-pa` | SHARED-02. |
| 4 | `init` | No additional issue found; registry and validation failures propagate. |
| 5 | `check-sap-entries` | No issue found. The subworkflow now reports every row from a missing table as failed and propagates table-probe errors. |
| 6 | `check-dependencies` | No additional issue found. |
| 7 | `install-dependencies` | INST-08 and INST-10. |
| 8 | `set-install-devclass` | INST-01 and INST-11. |
| 9 | `add-namespace` | INST-04. |
| 10 | `generate-devclass` | INST-05 and INST-12. |
| 11 | `import-devc-transport` | INST-02, INST-04, and INST-10. |
| 12 | `import-tadir-transport` | INST-02, INST-04, and INST-10. |
| 13 | `import-lang-transport` | INST-02, INST-04, and INST-10. |
| 14 | `import-cust-transport` | INST-02, INST-04, and INST-10. |
| 15 | `generate-landscape-transport` | No revert exists for a partially built request; covered by INST-04's incomplete recovery category. |
| 16 | `update-package-data` | INST-06 and INST-11. A missing root replacement now rejects with a descriptive error. |
| 17 | `execute-post-activities` | INST-07. |
| 18 | `release-install-transports` | No step-local logic error found; release failures expose INST-06. |

## Implemented but omitted steps

| Step | Result |
|---|---|
| `check-transports` | INST-01. Optional language and customizing transports intentionally default to skipped in non-interactive mode unless explicitly requested. This is required setup, not optional dead code. |
| `generate-deletion-transport` | INST-09 and INST-04. |

## Resolved findings

### INST-03 — Resolved — Missing required SAP tables now block installation

The SAP-entry subworkflow now emits a failed status for every required row belonging to a missing
table. The install wrapper's existing failed-row check therefore rejects installation as intended.

### INST-13 — Resolved — Missing root replacements produce a descriptive error

`updatePackageData` now checks the root-package replacement before reading its target devclass. If
the mapping is absent or has no target, finalization rejects with an error that names the original
root package instead of throwing an opaque property-access `TypeError`
([source](../../src/actions/install/updatePackageData.ts#L24)).

## Non-relevant findings

### INST-14 — Non-relevant — Non-interactive mode intentionally skips unspecified optional transports

When prompts are disabled and `noLang` or `noCust` is unspecified, optional language and
customizing transports are intentionally skipped. Non-interactive callers must explicitly request
those optional transports; the deterministic opt-in behavior is the supported contract
([source](../../src/actions/install/checkTransports.ts#L40)).
