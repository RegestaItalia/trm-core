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

### INST-06 — High — Package record is committed before fallible final steps and has no revert

`updatePackageData` runs before post-activities and landscape transport release
([workflow order](../../src/actions/install/index.ts#L273)). If release fails, the system package
table already claims the release is installed; the update step has no revert handler.

Recommendation: release first and commit last, or retain/restore the previous database row.

## Scheduled step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No install-specific issue; see [shared audit](shared.md). |
| 2 | `set-system-packages` | No install-specific issue. |
| 3 | `trm-server-pa` | SHARED-02. |
| 4 | `init` | No additional issue found; registry and validation failures propagate. |
| 5 | `check-sap-entries` | No issue found. The subworkflow now reports every row from a missing table as failed and propagates table-probe errors. |
| 6 | `check-dependencies` | No additional issue found. |
| 7 | `install-dependencies` | No issue found. The installed-package snapshot is refreshed after each nested install, and logger/prompt prefixes are restored after success or failure. |
| 8 | `set-install-devclass` | INST-01. Persisting replacement mappings before import is intentional so they can be reused by later attempts. |
| 9 | `add-namespace` | INST-04. |
| 10 | `generate-devclass` | No additional issue beyond INST-04's unimplemented package deletion. Existing replacement packages are lock-checked in one connector call, and newly created packages are recorded for rollback. |
| 11 | `generate-deletion-transport` | INST-04. The update-only cleanup step is now scheduled before the artifact transports are imported. |
| 12 | `import-devc-transport` | INST-02 and INST-04. Prefix state is restored after success or failure. |
| 13 | `import-tadir-transport` | INST-02 and INST-04. Prefix state is restored after success or failure. |
| 14 | `import-lang-transport` | INST-02 and INST-04. Prefix state is restored after success or failure. |
| 15 | `import-cust-transport` | INST-02 and INST-04. Prefix state is restored after success or failure. |
| 16 | `generate-landscape-transport` | No revert exists for a partially built request; covered by INST-04's incomplete recovery category. |
| 17 | `update-package-data` | INST-06. A missing root replacement now rejects with a descriptive error. |
| 18 | `execute-post-activities` | No issue found. Post-activities are intentionally best-effort: failures are logged without invalidating the completed package installation. |
| 19 | `release-install-transports` | No step-local logic error found; release failures expose INST-06. |

## Implemented but omitted steps

| Step | Result |
|---|---|
| `check-transports` | INST-01. Optional language and customizing transports intentionally default to skipped in non-interactive mode unless explicitly requested. This is required setup, not optional dead code. |

## Resolved findings

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

### INST-05 — Resolved — Generated packages are recorded for rollback

Immediately after `createPackage` succeeds, `generateDevclass` now adds the created devclass to
`context.revert.sapPackages`, avoiding duplicate entries. Recording happens before the following
TADIR operation so a later failure still leaves the created package visible to workflow rollback
([source](../../src/actions/install/generateDevclass.ts#L72)).

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
