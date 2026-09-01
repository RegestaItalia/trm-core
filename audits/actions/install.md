# `install` workflow audit

Audit date: 2026-08-27
Entry point: [`install`](../../src/actions/install/index.ts#L257)

## Findings

No active install-specific findings.

## Scheduled step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No install-specific issue; see [shared audit](shared.md). |
| 2 | `set-system-packages` | No install-specific issue. |
| 3 | `trm-server-pa` | SHARED-02. |
| 4 | `init` | No additional issue found; registry and validation failures propagate. |
| 5 | `check-transports` | No issue found. It downloads and validates artifact transports, populates the package hierarchy, and performs object safety checks before dependent steps run. Optional transports retain their accepted non-interactive defaults. |
| 6 | `check-sap-entries` | No issue found. The subworkflow now reports every row from a missing table as failed and propagates table-probe errors. |
| 7 | `check-dependencies` | No additional issue found. |
| 8 | `install-dependencies` | No issue found. The installed-package snapshot is refreshed after each nested install, and logger/prompt prefixes are restored after success or failure. |
| 9 | `set-install-devclass` | No issue found. Persisting replacement mappings before import is intentional so they can be reused by later attempts. |
| 10 | `add-namespace` | No rollback is advertised because the connector has no supported namespace-deletion operation. |
| 11 | `generate-devclass` | Existing replacement packages are lock-checked in one connector call. No rollback is advertised for newly created packages because the connector has no supported package-deletion operation. |
| 12 | `generate-deletion-transport` | The update-only cleanup step is scheduled before artifact imports, and its captured pre-import transport is restored on rollback. |
| 13 | `import-devc-transport` | Captured pre-import transport state is restored on rollback. Prefix state is restored after success or failure, and return-code handling follows the accepted transport-layer contract. |
| 14 | `import-tadir-transport` | Captured pre-import transport state is restored on rollback. Prefix state is restored after success or failure, and return-code handling follows the accepted transport-layer contract. |
| 15 | `import-lang-transport` | Captured pre-import transport state is restored on rollback. Prefix state is restored after success or failure, and return-code handling follows the accepted transport-layer contract. |
| 16 | `import-cust-transport` | Captured pre-import transports are restored in reverse order on rollback. Prefix state is restored after success or failure, and return-code handling follows the accepted transport-layer contract. |
| 17 | `generate-landscape-transport` | A partially built, still-modifiable request is deleted on rollback. |
| 18 | `update-package-data` | No issue found. Committing the installed-package record before the remaining finalization steps is accepted behavior; missing root replacements reject descriptively. |
| 19 | `execute-post-activities` | No issue found. Post-activities are intentionally best-effort: failures are logged without invalidating the completed package installation. |
| 20 | `release-install-transports` | No step-local logic error found. The package record intentionally remains committed if release fails. |

## Resolved findings

### INST-04 — Resolved — Rollback handlers restore captured transport state

DEVC, TADIR, LANG, CUST, and deletion imports now share a compensating operation that uploads the
captured pre-import binary to the target system and imports it. Customizing snapshots are restored
in reverse import order. The landscape-transport step also deletes a partially constructed request
when SAP still reports it as modifiable
([restore helper](../../src/actions/install/restoreTransport.ts),
[customizing rollback](../../src/actions/install/importCustTransport.ts),
[landscape rollback](../../src/actions/install/generateLandscapeTransport.ts)).

The previous namespace and generated-package rollback handlers were removed instead of retaining
TODO-only promises: the connector exposes creation but no safe deletion operation for either kind
of SAP metadata. Those bootstrap mutations are therefore not represented as reversible workflow
steps.

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
