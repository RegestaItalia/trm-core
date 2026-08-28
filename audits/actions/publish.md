# `publish` workflow audit

Audit date: 2026-08-27
Entry point: [`publish`](../../src/actions/publish/index.ts#L242)

## Findings

### PUBL-04 — High — Partial release/publication cannot be rolled back

Transports are released sequentially before the registry upload
([source](../../src/actions/publish/releaseTransports.ts#L21)). If a later release or registry publish
fails, earlier transports are already released and `canBeDeleted()` prevents normal revert deletion.
The workflow has no compensating publication transaction, so it can leave released transports with
no registry release.

Recommendation: prevalidate the complete artifact, define an explicit recovery record for partial
release, and make registry publication idempotent/resumable.

### PUBL-05 — Medium — Registry lookup failures are misclassified as first publication

`registry.getPackage(name, "latest")` catches every exception and announces a first publish
([source](../../src/actions/publish/init.ts#L154)). Network, authentication, and registry failures
are not equivalent to package-not-found and can lead to incorrect version `1.0.0` and visibility
decisions before a later, less clear failure.

Recommendation: catch only a typed package-not-found error.

### PUBL-06 — Medium — Non-interactive mode can still prompt for package visibility

For the first remote publication with no explicit `publishData.private`, `init` always invokes
`Inquirer.prompt`; it does not check `contextData.noInquirer`
([source](../../src/actions/publish/init.ts#L231)). Headless callers can hang or fail unexpectedly.

Recommendation: require `private` when prompts are disabled, or define and document a default.

### PUBL-07 — Medium — Retained-dependency prompt can include only one dependency

The prompt asking which missing dependencies to include uses `type: "select"`, even though the
message and subsequent code treat the response as a collection
([source](../../src/actions/publish/setManifestValues.ts#L100)). When multiple latest-release
dependencies are missing, the user cannot retain more than one in that interaction.

Recommendation: use a checkbox/multiselect prompt and validate the returned array.

### PUBL-08 — Medium — A failed customizing-copy build can leave an untracked transport

`generateCustTransport` creates a TOC and only pushes it into `runtime.transports.cust` after every
copy and content check succeeds ([source](../../src/actions/publish/generateCustTransport.ts#L35)).
If `getTasks`, `addObjectsFromTransport`, or `getE071` fails, the revert handler cannot see or delete
the newly created request.

Recommendation: register the transport immediately after creation or clean it in a local catch.

### PUBL-09 — Medium — Prefix state leaks on release errors

`releaseTransports` sets global logger and prompt prefixes and removes them only after a successful
release ([source](../../src/actions/publish/releaseTransports.ts#L21)). Any annotation or release
exception leaves prefixes active for rollback and subsequent operations.

Recommendation: restore previous prefixes in `finally` rather than calling `removePrefix()` only on
success.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `check-server-auth` | No publish-specific issue; see [shared audit](shared.md). |
| 2 | `set-system-packages` | No publish-specific issue. |
| 3 | `trm-server-pa` | SHARED-02. |
| 4 | `init` | PUBL-05 and PUBL-06. Version/name/lock validation otherwise rejects failures. Publishing without abapGit source or `.abapgit.xml` is intentionally allowed. |
| 5 | `find-dependencies` | No issue found. Customer/local packages and TRM dependencies without manifests correctly block publication. |
| 6 | `set-customizing-transports` | No confirmed logic defect found. Invalid new requests reject; retained requests deliberately reuse prior metadata. Connector errors propagate, although a missing E070 currently surfaces as a generic `TypeError` before being wrapped. |
| 7 | `set-manifest-values` | PUBL-07. Final manifest normalization provides a last validation boundary. |
| 8 | `set-optional-release-data` | No issue found. Omitted optional text remains undefined in non-interactive mode. |
| 9 | `generate-devc-transport` | No issue found. The transport is registered in context before object addition, allowing deletion on failure while still modifiable. |
| 10 | `generate-tadir-transport` | No issue found for the same reason as DEVC generation. |
| 11 | `generate-lang-transport` | No issue found. Translation content is optional; an empty generated transport is deleted and publication continues without it. |
| 12 | `generate-cust-transport` | PUBL-08. |
| 13 | `release-transport` | PUBL-04 and PUBL-09. |
| 14 | `publish-to-registry` | No step-local validation issue found; failures propagate, but after irreversible releases (PUBL-04). |
| 15 | `update-package-data` | No issue found. Updating the origin-system package record is best-effort and does not invalidate a successful registry publication. |

## Resolved findings

### PUBL-02 — Resolved — Dependencies without manifests block publication

Automatic discovery now validates every detected TRM dependency before changing the publication
manifest. If any dependency has no readable manifest, the step reports its ABAP package and rejects
publication, preventing an incomplete dependency list
([source](../../src/actions/publish/findDependencies.ts#L65)).

### PUBL-11 — Resolved — Local-dependency diagnostics use the correct collection length

Local TRM dependency pluralization and item counters now use `trmLocalDependencies.length`, so the
blocking diagnostic reports the correct total independently of non-TRM custom dependencies
([source](../../src/actions/publish/findDependencies.ts#L51)).
