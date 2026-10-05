# `install-dependency` workflow audit

Audit date: 2026-10-05
Entry point: [`installDependency`](../../src/actions/installDependency/index.ts#L95)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared helper findings referenced below ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are recorded in the [shared audit](shared.md).

## Findings

### ACT-2026-80 — Medium — Technical — Lock integrity is checked on a different download than the one imported

- **Where:** [`Lockfile.ts#L103`](../../src/lockfile/Lockfile.ts#L103); the nested install re-fetches metadata and imports per-transport binaries verified only against registry checksums.
- **Failure:** the lock does not protect what is imported; an empty integrity row (`getPackageIntegrity` returns `''`) produces a lockfile that always raises "SECURITY ISSUE".
- **Fix:** pass the expected integrity into the nested install and compare it with the imported release; refuse empty integrity at generation.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. |
| 2 | `set-system-packages` | No issue found; the snapshot is consulted by `check-installed-release`. |
| 3 | `check-installed-release` | Keeps a compatible installed release (no-op output) unless a lockfile pins another version; rejects an unreadable installed manifest (ACT-2026-81, resolved). |
| 4 | `find-install-release` | Uses the lockfile entry when present and falls back to the newest release in range when the lockfile has none; a lock outside the range aborts with its own error (ACT-2026-79, resolved). Integrity check on a different download (ACT-2026-80). Skipped when the installed release is kept. |
| 5 | `confirm-downgrade` | Requires confirmation (prompt defaulting to no, or `checks.allowDowngrade`) before replacing a newer installed release; aborts without a prompt (ACT-2026-81, resolved). |
| 6 | `install-release` | Forwards options correctly; relies on `find-install-release` to set the version or throw. Skipped when the installed release is kept. |

## Resolved findings
### ACT-2026-79 — Resolved — A lockfile without the dependency aborts installation

[`Lockfile.getLock`](../../src/lockfile/Lockfile.ts#L92) now returns `undefined` when the lockfile
has no entry for the package, so
[`selectDependencyRelease`](../../src/actions/installDependency/findInstallRelease.ts#L16) falls back
to the newest registry release in range, as documented. Partial lockfiles (generation skips
dependencies missing on the source system) no longer abort the install, and `find-install-release`
logs the fallback. A locked version outside the range throws a distinct error naming the pinned
version and the range, instead of reporting the lock as "not found". The cycle walk and
`check-installed-release` share the same lookup.

### ACT-2026-81 — Resolved — Installed versions are ignored: silent downgrade or "already installed" abort

The dependency install now reads the system snapshot in
[`check-installed-release`](../../src/actions/installDependency/checkInstalledRelease.ts): a release
already installed that satisfies the range is kept and the action returns `alreadyInstalled`
without installing anything, so a direct call with the newest in-range release installed no longer
throws. With a lockfile, the installed release is kept only when it equals the locked version;
otherwise the lock is honoured. Replacing a newer installed release goes through
[`confirm-downgrade`](../../src/actions/installDependency/confirmDowngrade.ts), which prompts with
a default of no, accepts `installData.checks.allowDowngrade`, and aborts without a prompt. In the
install workflow, [`check-dependencies`](../../src/actions/install/checkDependencies.ts) now
reports incompatible dependencies with their installed version instead of labelling them
"missing", and `install-dependencies` lists them separately. The installed-version check is shared
by the dependency check, the cycle walk and the dependency install
([`getInstalledDependency`](../../src/actions/commons/utils/installedDependency.ts)).

### ACT-2026-82 — Resolved — Self and cyclic dependencies are not detected

The install workflow now runs [`check-dependency-cycles`](../../src/actions/install/checkDependencyCycles.ts)
right after `check-dependencies`, before resources are locked or any dependency is installed. It
walks the dependencies the install would recurse into: a dependency already installed in a
compatible version is not installed again and ends that branch (for example a package installed
with `noDependencies`), while any other dependency resolves to the release a dependency install
would select ([`selectDependencyRelease`](../../src/actions/installDependency/findInstallRelease.ts#L16),
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
