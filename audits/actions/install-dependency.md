# `install-dependency` workflow audit

Audit date: 2026-10-04
Entry point: [`installDependency`](../../src/actions/installDependency/index.ts#L83)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-79 — High — Functional — A lockfile without the dependency aborts installation

- **Where:** [`findInstallRelease.ts#L20`](../../src/actions/installDependency/findInstallRelease.ts#L20); [`Lockfile.getLock`](../../src/lockfile/Lockfile.ts#L87) throws instead of returning nothing.
- **Failure:** the documented registry fallback runs only without a lockfile. Partial lockfiles (generation skips packages missing on the source) abort deterministically, and an out-of-range lock is reported as "not found".
- **Fix:** return `undefined` for a missing entry and fall back; throw a distinct error for an out-of-range lock.

### ACT-2026-80 — Medium — Technical — Lock integrity is checked on a different download than the one imported

- **Where:** [`Lockfile.ts#L95`](../../src/lockfile/Lockfile.ts#L95); the nested install re-fetches metadata and imports per-transport binaries verified only against registry checksums.
- **Failure:** the lock does not protect what is imported; an empty integrity row (`getPackageIntegrity` returns `''`) produces a lockfile that always raises "SECURITY ISSUE".
- **Fix:** pass the expected integrity into the nested install and compare it with the imported release; refuse empty integrity at generation.

### ACT-2026-81 — Medium — Functional — Installed versions are ignored: silent downgrade or "already installed" abort

- **Where:** snapshot never read by `installDependency`; wrapper labels incompatible dependencies "missing" ([`install/checkDependencies.ts#L42`](../../src/actions/install/checkDependencies.ts#L42)).
- **Failure:** X 2.0.0 installed and `^1.0.0` required: confirming "missing dependencies" downgrades X. Called directly when the newest in-range release is installed, it throws instead of returning a no-op.
- **Fix:** skip compatible installed versions and require explicit confirmation for downgrades.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. |
| 2 | `set-system-packages` | Snapshot loaded but never consulted (ACT-2026-81). |
| 3 | `find-install-release` | Lockfile fallback unreachable (ACT-2026-79); integrity check on a different download (ACT-2026-80). |
| 4 | `install-release` | Forwards options correctly; relies on `find-install-release` to set the version or throw. |

## Resolved findings
### ACT-2026-82 — Resolved — Self and cyclic dependencies are not detected

The install workflow now runs [`check-dependency-cycles`](../../src/actions/install/checkDependencyCycles.ts)
right after `check-dependencies`, before resources are locked or any dependency is installed. It
walks the dependencies the install would recurse into: a dependency already installed in a
compatible version is not installed again and ends that branch (for example a package installed
with `noDependencies`), while any other dependency resolves to the release a dependency install
would select ([`selectDependencyRelease`](../../src/actions/installDependency/findInstallRelease.ts#L14),
shared with `find-install-release`) and is walked. A self or cyclic dependency on that path aborts
the install with the cycle, for example `"A" -> "B" -> "A"`.

### ACT-2026-83 — Resolved — Dead guard and unused imports

The `install-release` step no longer re-checks `installVersion`: `find-install-release` always sets
it or throws, so the guard could never fire
([source](../../src/actions/installDependency/installRelease.ts#L14)). The unused `inspect` and
`Logger` imports were removed from the workflow's modules.

### DEPINS-01 — Resolved — Optional input initializes `installData.checks`

The `init` step now creates an empty `checks` object when callers omit `installData` or
`installData.checks` ([source](../../src/actions/installDependency/init.ts#L49)). The following
lockfile lookup can therefore safely read `checks.lockfile` for the documented optional-input path.

### DEPINS-02 — Resolved — Unsupported `noStopWarning` injection was removed

The nested install now forwards the supported `contextData` unchanged
([source](../../src/actions/installDependency/installRelease.ts#L19)). It no longer adds an
undeclared `noStopWarning` property that the install workflow ignored. Dependency installs follow
the same warning behavior as direct installs.
