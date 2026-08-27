# `install-dependency` workflow audit

Audit date: 2026-08-27
Entry point: [`installDependency`](../../src/actions/installDependency/index.ts#L75)

## Findings

### DEPINS-01 — Critical — Optional input causes a deterministic `TypeError`

`installData` is optional. The `init` step creates `installData`, `import`, and `installDevclass`,
but not `installData.checks` ([source](../../src/actions/installDependency/init.ts#L49)). The next
resolution step unconditionally evaluates `context.rawInput.installData.checks.lockfile`
([source](../../src/actions/installDependency/findInstallRelease.ts#L20)). A normal call without a
`checks` object crashes before registry resolution.

Recommendation: initialize `installData.checks ??= {}` or use optional chaining.

### DEPINS-02 — Medium — Attempted stop-warning suppression is not part of install context and is ignored

The nested install input adds `contextData.noStopWarning: true`
([source](../../src/actions/installDependency/installRelease.ts#L19)), but
`InstallActionInputContextData` does not declare or consume this field. Install runtime always
initializes `stopWarningShown` to `false` ([source](../../src/actions/install/init.ts#L29)). Recursive
dependency installs therefore show warnings despite the apparent suppression intent.

Recommendation: add and honor the field consistently, or remove the dead assignment.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | DEPINS-01 and DEPINS-02. Package-name, registry-type, and semantic-range validation otherwise propagate correctly. |
| 2 | `set-system-packages` | No workflow-specific issue found. |
| 3 | `find-install-release` | DEPINS-01. Once initialized, lockfile range/integrity checks and newest-compatible-release selection are coherent. |
| 4 | `install-release` | DEPINS-02. Nested install failures propagate. |
