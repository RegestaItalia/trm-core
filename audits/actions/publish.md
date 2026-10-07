# `publish` workflow audit

Audit date: 2026-10-04
Entry point: [`publish`](../../src/actions/publish/index.ts#L241)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-56 — High — Functional — Overwriting a local artifact treats it as the latest release

- **Where:** [`FileSystem.ts#L94`](../../src/registry/FileSystem.ts#L94) returns `dist_tags.latest = 'latest'` and ignores the name; [`publish/init.ts#L169`](../../src/actions/publish/init.ts#L169).
- **Failure:** `inc('latest')` is `null` (non-interactive fails later with "Package version missing"); the file's manifest is merged regardless of package name; its CUST transports are classified as retained, skipped by generation, and ignored by `FileSystem.publish`, so customizing silently disappears.
- **Fix:** do not treat the target file as latest for LOCAL, or validate its name and return the real version.

### ACT-2026-59 — Medium — Functional — Non-interactive engines are validated non-strictly

- **Where:** [`setManifestValues.ts#L49`](../../src/actions/publish/setManifestValues.ts#L49); strict validation only in prompt branches.
- **Failure:** an unknown top-level key is published and makes every install fail "update TRM"; an unknown constraint property (typo) is dropped and never enforced.
- **Fix:** validate caller-supplied engines strictly in non-interactive mode.

### ACT-2026-60 — Medium — Functional — `preRelease` is ignored on automatic versions

- **Where:** [`publish/init.ts#L169`](../../src/actions/publish/init.ts#L169) vs L176–183.
- **Failure:** with the version omitted on an existing package, a stable version is published instead of a prerelease.
- **Fix:** apply the prerelease computation after the automatic increment.

### ACT-2026-63 — Medium — Functional — Retained customizing transports cannot be dropped non-interactively

- **Where:** [`setCustomizingTransports.ts#L55`](../../src/actions/publish/setCustomizingTransports.ts#L55).
- **Fix:** let an explicit `customizingTransports` list replace the retained set, or add an exclusion input.

### ACT-2026-64 — Low — Technical — Object locks are not re-checked after TRM locks are taken

- **Where:** check in `init`, locks in [`publish/lockResources.ts#L8`](../../src/actions/publish/lockResources.ts#L8) after the prompt steps.
- **Fix:** re-read objects and SAP locks in `lock-resources`.

### ACT-2026-65 — Low — Functional — Public-registry metadata limits are enforced only in prompts

- **Where:** [`setManifestValues.ts#L182`](../../src/actions/publish/setManifestValues.ts#L182).
- **Fix:** apply the same limits before transport generation in non-interactive mode.

### ACT-2026-67 — Low — Technical — Prompted version is not cleaned

- **Where:** [`publish/init.ts#L204`](../../src/actions/publish/init.ts#L204).
- **Failure:** `v1.2.4` is stored raw (duplicate check, transport text and comment disagree with the manifest).
- **Fix:** store `clean(v)`.

### ACT-2026-68 — Low — Functional — Derived manifest fields and engine prefill are brittle

- **Where:** [`setManifestValues.ts#L274`](../../src/actions/publish/setManifestValues.ts#L274) (caller `registry`/`namespace` survive), [`getSystemEngines.ts#L32`](../../src/actions/publish/getSystemEngines.ts#L32) (one malformed row discards the whole prefill), [`setManifestValues.ts#L380`](../../src/actions/publish/setManifestValues.ts#L380) (logs `[object Object]`).
- **Fix:** reset derived fields, skip malformed rows individually, log JSON strings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1–2 | `check-server-auth`, `set-system-packages` | Shared findings only. |
| 3 | `init` | A missing local artifact file starts a first publication (ACT-2026-55, resolved); local overwrite misreads the file (ACT-2026-56); prerelease ignored on automatic version (ACT-2026-60); prompted version not cleaned (ACT-2026-67). Without a supplied devclass, the devclass of the previous publish is used; non-interactive runs fail clearly when none can be derived, and supplied or derived devclasses are normalized and validated (ACT-2026-61, resolved). The package and its subpackages must use at most one reserved namespace, read after the package objects (ACT-2026-89, resolved). |
| 4 | `find-dependencies` | No functional issue; mutates caller input ([ACT-2026-20](shared.md)). |
| 5 | `set-customizing-transports` | Retained transports cannot be dropped non-interactively (ACT-2026-63). Adding a transport already in the selection, retained or new, is rejected (ACT-2026-66, resolved). |
| 6 | `set-manifest-values` | non-strict engines (ACT-2026-59), interactive-only limits (ACT-2026-65), stale derived fields (ACT-2026-68). Post activities of the latest release are merged by class (trimmed, uppercased): an input post activity replaces the one of the same class (ACT-2026-62, resolved). Post activities whose class does not exist are removed (ACT-2026-58, resolved). |
| 7 | `set-optional-release-data` | No issue found. |
| 8 | `lock-resources` | Object locks not re-checked after locking (ACT-2026-64). |
| 9–12 | `generate-devc/tadir/lang/cust-transport` | Forward flow correct; reverts re-read the status after an earlier delete ([ACT-2026-17](shared.md), resolved). |
| 13 | `release-transport` | Prefixes restored, revert best-effort; unbounded release wait ([ACT-2026-14](shared.md)). |
| 14 | `publish-to-registry` | An async publish whose status cannot be followed fails with an unknown outcome; polling is bounded (ACT-2026-57, resolved). |
| 15 | `update-package-data` | Accepted best-effort behavior. |

## Resolved findings
### ACT-2026-58 — Resolved — Post-activity existence check is dead

`PostActivity.exists` did not await the TADIR lookup, so the Promise was always truthy: post activities
of non-existent classes were published, the install-time guard in `execute` never fired, and a failed
lookup became an unhandled rejection. `exists` now awaits the lookup and `execute` awaits `exists`, so
publish removes post activities of missing classes, install stops before calling the system with a
clear "doesn't exist" error, and lookup failures propagate to the caller
([source](../../src/manifest/PostActivity.ts#L116)).

### ACT-2026-57 — Resolved — Async registry publish failures are reported as success

On 202, a failed status poll was logged as "check manually" and `publish` resolved, so the workflow
reported success and recorded the release even if the registry job failed; polling was unbounded.
Polling now tolerates up to three consecutive poll failures and stops after 30 minutes. An exhausted
poll, a timeout, or a malformed status (non-integer `steps`/`current_step`) fails the publish with an
error stating the outcome is unknown and the registry must be checked before publishing again. A
completed status still fails on `data.error`; a completed status without `data` is success, since
completion is reported by the steps. Released transports are not deleted by the rollback
([source](../../src/registry/RegistryV2.ts#L553)).

### ACT-2026-62 — Resolved — Merging with the latest release cannot remove or replace entries

Post activities of the latest release were merged with the input ones by deep equality, so changing a
post activity's parameters published both versions and it ran twice at install. They are now merged
by class, compared trimmed and uppercased: an input post activity replaces the latest release one of
the same class, and latest release post activities of other classes are kept. Authors and keywords
remain an additive union with the latest release
([source](../../src/actions/publish/setManifestValues.ts#L92)).

### ACT-2026-61 — Resolved — Non-interactive devclass may stay unresolved

With `noInquirer`, no devclass and no matching system package, the package objects were read with an
`undefined` devclass and failed with a `TypeError`; a devclass derived from the system package was
neither validated nor normalized. `init` still derives the devclass from the matching system package,
so a republish needs no explicit devclass, but now fails with a clear error when none is supplied and
none can be derived. Supplied and derived devclasses are normalized and validated; prompted ones are
validated by the prompt ([source](../../src/actions/publish/init.ts#L266)).

### ACT-2026-66 — Resolved — A retained transport can be added twice

The CLI "add" prompt accepted any transport retained from the latest release before checking the
current selection, so a retained transport could be added again and published twice. The prompt now
rejects a transport already in the selection before accepting retained ones
([source](../../src/actions/publish/setCustomizingTransports.ts#L182)).

### ACT-2026-55 — Resolved — First publish to a new local file always fails

PUBL-05 made `init` rethrow every lookup failure except `RegistryPackageNotFoundError`, while the
local registry reported a missing artifact file as a generic read error, so publishing to a new file
always aborted. `FileSystem.getPackage` now throws `RegistryPackageNotFoundError` when the target
file does not exist; unreadable or corrupt existing files still abort
([source](../../src/registry/FileSystem.ts#L94)).

### ACT-2026-89 — Resolved — Publish limits the package to one reserved namespace

The manifest carries a single namespace and repair license, read from the root package only, so a
package whose subpackages used another reserved `/NAMESPACE/` was published with a namespace the
install could not create. `init` now reads the package objects first, then derives the namespace with
the same rule as the install (`getPackagesNamespace`): the root namespace, or the only reserved
namespace used by a subpackage when the root uses `Z` or `Y`. More than one reserved namespace is
rejected; `Z` and `Y` need no namespace object and can be mixed with it
([source](../../src/actions/publish/init.ts#L305)).

### PUBL-05 — Resolved — Registry failures are distinct from first publication

Registry HTTP 404 responses are now represented by `RegistryPackageNotFoundError`, including the
package, requested version, endpoint, and original error. Publish initialization catches only this
typed error to enter the first-publication flow; authentication, network, timeout, server, and local
filesystem lookup failures retain their original diagnostics and abort before version or visibility
defaults are selected
([registry source](../../src/registry/RegistryV2.ts), [publish source](../../src/actions/publish/init.ts)).

### PUBL-08 — Resolved — Failed customizing-copy builds retain rollback tracking

Each customizing TOC is now registered in `runtime.transports.cust` immediately after creation, so
copy and content-check failures leave it visible to workflow rollback. An empty TOC is removed from
tracking only after its deletion succeeds
([source](../../src/actions/publish/generateCustTransport.ts#L42)).

### PUBL-02 — Resolved — Dependencies without manifests block publication

Automatic discovery now validates every detected TRM dependency before changing the publication
manifest. If any dependency has no readable manifest, the step reports its ABAP package and rejects
publication, preventing an incomplete dependency list
([source](../../src/actions/publish/findDependencies.ts#L65)).

### PUBL-11 — Resolved — Local-dependency diagnostics use the correct collection length

Local TRM dependency pluralization and item counters now use `trmLocalDependencies.length`, so the
blocking diagnostic reports the correct total independently of non-TRM custom dependencies
([source](../../src/actions/publish/findDependencies.ts#L51)).

### PUBL-09 — Resolved — Release prefix state is restored on errors

The release step saves the existing logger and prompt prefixes and restores both in `finally`, so
annotation or release failures cannot leak per-transport prefix state into rollback or later work
([source](../../src/actions/publish/releaseTransports.ts#L22)).

### PUBL-06 — Resolved — Non-interactive first publication requires visibility

When a first remote publication has no `publishData.private` value and interactive prompts are
disabled, initialization now rejects with a clear error instead of prompting. No visibility default
is assumed ([source](../../src/actions/publish/init.ts#L237)).

## Non-relevant findings
### PUBL-01 — Non-relevant — Publishing without abapGit source is supported

The audit originally treated every failure from `getAbapgitSource` or the `.abapgit.xml` read as an
operational failure that must abort publication. Source content and `.abapgit.xml` exclusions are
optional publication inputs, however, and publishing a transport-only release is supported. The
broad fallback is therefore intentional ([source](../../src/actions/publish/init.ts#L312)).

### PUBL-03 — Non-relevant — Language content is optional

The audit originally reported that translation collection errors could allow publication without
language content. Language transport generation is optional by design: when usable translation
content cannot be generated, the empty transport is deleted and the main release may continue
([source](../../src/actions/publish/generateLangTransport.ts#L37)).

### PUBL-04 — Non-relevant — Released transports of copies need no rollback

The audit originally treated a registry failure after transport release as an inconsistent partial
publication. The generated release transports are transports of copies: releasing them does not
modify the source objects, and the released artifacts may safely remain if registry publication
fails ([source](../../src/actions/publish/releaseTransports.ts#L21)).

### PUBL-07 — Non-relevant — The prompt adapter supports selecting multiple dependencies

The audit originally inferred from `type: "select"` that only one retained dependency could be
chosen. In this project's `trm-commons` prompt adapter, that question is the supported multi-select
flow and returns the dependency collection consumed by the following concatenation
([source](../../src/actions/publish/setManifestValues.ts#L100)).

### PUBL-10 — Non-relevant — Origin-system record synchronization is best-effort

The audit originally required the action to fail when the final origin-system package-record update
fails. Registry publication is already complete at that point, and the local record is explicitly a
best-effort synchronization. Logging the inconsistency while preserving publication success is the
intended contract ([source](../../src/actions/publish/updatePackageData.ts#L18)).
