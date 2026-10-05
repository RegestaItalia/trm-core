# `check-dependencies` workflow audit

Audit date: 2026-10-04
Entry point: [`checkPackageDependencies`](../../src/actions/checkPackageDependencies/index.ts#L91)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-77 — Medium — Functional — Prerelease versions are treated inconsistently

- **Where:** `semver.satisfies` without `includePrerelease` in [`checkPackageDependencies/analyze.ts#L46`](../../src/actions/checkPackageDependencies/analyze.ts#L46), [`findInstallRelease.ts#L30`](../../src/actions/installDependency/findInstallRelease.ts#L30), [`Lockfile.ts#L89`](../../src/lockfile/Lockfile.ts#L89), [`checkDependants.ts#L52`](../../src/actions/install/checkDependants.ts#L52).
- **Failure:** installed `1.3.0-beta.1` fails `>=1.0.0`, so `1.2.0` is installed over it with only a "Downgrading" warning.
- **Fix:** adopt one prerelease policy and never auto-select a version below the installed one.

### ACT-2026-78 — Low — Functional — Invalid ranges and unreadable manifests are not distinguished

- **Where:** [`checkPackageDependencies/analyze.ts#L43`](../../src/actions/checkPackageDependencies/analyze.ts#L43).
- **Failure:** an invalid range silently evaluates false (docs promise a throw); an installed package without a manifest is "Not found" and triggers a reinstall attempt.
- **Fix:** validate ranges and report "installed, manifest unreadable" separately.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It rejects duplicate `(name, registry)` keys and normalizes optional input. |
| 2 | `set-system-packages` | Local-registry packages excluded from the snapshot ([ACT-2026-15](shared.md)). |
| 3 | `analyze` | One ordered result per declaration; prerelease handling (ACT-2026-77); invalid ranges and unreadable manifests not distinguished (ACT-2026-78). |

## Resolved findings
### DEPCHK-01 — Resolved — Duplicate dependency keys are rejected

Previously, results were aggregated by dependency name and registry, causing declarations with
different ranges to overwrite each other. The workflow now enforces uniqueness by `(name,
registry)` during initialization and raises a descriptive error for a duplicate key
([source](../../src/actions/checkPackageDependencies/init.ts#L25)). For valid manifests, analysis
still emits exactly one ordered status per declaration.
