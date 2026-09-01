# `publish` workflow audit

Audit date: 2026-08-27
Entry point: [`publish`](../../src/actions/publish/index.ts#L242)

## Findings

No active publish-specific findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No publish-specific issue; see [shared audit](shared.md). |
| 2 | `set-system-packages` | No publish-specific issue. |
| 3 | `trm-server-pa` | SHARED-02. |
| 4 | `init` | Version/name/lock validation rejects failures. Only a registry HTTP 404 enters the first-publication flow. First remote non-interactive publication requires explicit visibility. Publishing without abapGit source or `.abapgit.xml` is intentionally allowed. |
| 5 | `find-dependencies` | No issue found. Customer/local packages and TRM dependencies without manifests correctly block publication. |
| 6 | `set-customizing-transports` | No confirmed logic defect found. Invalid new requests reject; retained requests deliberately reuse prior metadata. Connector errors propagate, although a missing E070 currently surfaces as a generic `TypeError` before being wrapped. |
| 7 | `set-manifest-values` | No issue found. Missing dependencies from the latest release can be retained with a multi-select prompt. Final manifest normalization provides a last validation boundary. |
| 8 | `set-optional-release-data` | No issue found. Omitted optional text remains undefined in non-interactive mode. |
| 9 | `generate-devc-transport` | No issue found. The transport is registered in context before object addition, allowing deletion on failure while still modifiable. |
| 10 | `generate-tadir-transport` | No issue found for the same reason as DEVC generation. |
| 11 | `generate-lang-transport` | No issue found. Translation content is optional; an empty generated transport is deleted and publication continues without it. |
| 12 | `generate-cust-transport` | No issue found. A created TOC is tracked before it is populated, allowing rollback on copy or content-check failure. |
| 13 | `release-transport` | No issue found. Generated transports are transports of copies, so releasing them does not modify source objects and requires no rollback. Logger and prompt prefixes are restored after success or failure. |
| 14 | `publish-to-registry` | No issue found; failures propagate and released transports of copies can safely remain released. |
| 15 | `update-package-data` | No issue found. Updating the origin-system package record is best-effort and does not invalidate a successful registry publication. |

## Resolved findings

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
