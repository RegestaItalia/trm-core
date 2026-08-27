# `install-dependency` workflow audit

Audit date: 2026-08-27
Entry point: [`installDependency`](../../src/actions/installDependency/index.ts#L75)

## Result

No open workflow-specific problems were found.

## Resolved findings

### DEPINS-01 — Resolved — Optional input initializes `installData.checks`

The `init` step now creates an empty `checks` object when callers omit `installData` or
`installData.checks` ([source](../../src/actions/installDependency/init.ts#L49)). The following
lockfile lookup can therefore safely read `checks.lockfile` for the documented optional-input path.

### DEPINS-02 — Resolved — Unsupported `noStopWarning` injection was removed

The nested install now forwards the supported `contextData` unchanged
([source](../../src/actions/installDependency/installRelease.ts#L19)). It no longer adds an
undeclared `noStopWarning` property that the install workflow ignored. Dependency installs follow
the same warning behavior as direct installs.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It initializes every optional group required by later steps and validates package name, registry type, and semantic range. |
| 2 | `set-system-packages` | No workflow-specific issue found. |
| 3 | `find-install-release` | No issue found. Lockfile range/integrity checks and newest-compatible-release selection are coherent. |
| 4 | `install-release` | No issue found. It forwards supported context/install options and nested install failures propagate. |
