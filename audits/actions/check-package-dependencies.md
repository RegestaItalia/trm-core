# `check-dependencies` workflow audit

Audit date: 2026-10-04
Entry point: [`checkPackageDependencies`](../../src/actions/checkPackageDependencies/index.ts#L91)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

No active findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It rejects duplicate `(name, registry)` keys and invalid or empty version ranges, and normalizes optional input. |
| 2 | `set-system-packages` | No issue found; local-registry packages are included in the snapshot ([ACT-2026-15](shared.md), resolved). |
| 3 | `analyze` | One ordered result per declaration, each with a `status` (`ok`, `versionMismatch`, `notFound`, `manifestUnreadable`). Installed prerelease versions are matched with `includePrerelease`, so `1.3.0-beta.1` satisfies `>=1.0.0`. |

## Resolved findings
### ACT-2026-77 — Resolved — Medium — Functional — Prerelease versions are treated inconsistently

Previously `semver.satisfies` ran without `includePrerelease`, so an installed `1.3.0-beta.1` failed
`>=1.0.0` and the install workflow replaced it with `1.2.0` behind a "Downgrading" warning. One
policy now applies: a version already on the system or pinned by a lockfile is matched with
`includePrerelease` in [`analyze`](../../src/actions/commons/utils/installedDependency.ts#L33),
[`Lockfile.getLock`](../../src/lockfile/Lockfile.ts#L97),
[`install` `check-dependants`](../../src/actions/install/checkDependants.ts#L52), and
[`checkCoreTrmDependencies`](../../src/commons/checkCoreTrmDependencies.ts#L32). Because a satisfied
installed prerelease is no longer queued for install, no lower release is auto-selected over it.
Selection of a new registry release in
[`find-install-release`](../../src/actions/installDependency/findInstallRelease.ts#L27) keeps the
semver default and picks a prerelease only when the range opts in. A prerelease outside the range,
such as `2.0.0-beta.1` against `^1.0.0`, is still a `versionMismatch`.

### ACT-2026-78 — Resolved — Low — Functional — Invalid ranges and unreadable manifests are not distinguished

Previously an invalid range silently evaluated false, and an installed package without a readable
manifest was reported as "Not found", so the install workflow tried to reinstall it. `init` now
throws for any range rejected by
[`Manifest.isValidDependencyRange`](../../src/manifest/Manifest.ts#L334). That check is stricter
than `semver.validRange`: an empty or blank range, which semver reads as `*`, is also rejected
([source](../../src/actions/checkPackageDependencies/init.ts#L39)). Publish applies the same check
in both dependency editors and aborts before normalization, rather than letting normalization drop
the dependency or publish an empty range
([source](../../src/actions/publish/setManifestValues.ts#L627)). `analyze` reports an installed
package whose manifest is missing, cannot be read, or has a non-semver version as
`manifestUnreadable` ("Installed, manifest unreadable")
([source](../../src/actions/checkPackageDependencies/analyze.ts#L44)). The install
`check-dependencies` step aborts on that status instead of queuing a reinstall
([source](../../src/actions/install/checkDependencies.ts#L50)).

### DEPCHK-01 — Resolved — Duplicate dependency keys are rejected

Previously, results were aggregated by dependency name and registry, causing declarations with
different ranges to overwrite each other. The workflow now enforces uniqueness by `(name,
registry)` during initialization and raises a descriptive error for a duplicate key
([source](../../src/actions/checkPackageDependencies/init.ts#L25)). For valid manifests, analysis
still emits exactly one ordered status per declaration.
