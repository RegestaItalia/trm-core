# `check-dependencies` workflow audit

Audit date: 2026-08-27
Entry point: [`checkPackageDependencies`](../../src/actions/checkPackageDependencies/index.ts#L91)

## Result

No open workflow-specific problems were found.

## Resolved findings

### DEPCHK-01 — Resolved — Duplicate dependency keys are rejected

Previously, results were aggregated by dependency name and registry, causing declarations with
different ranges to overwrite each other. The workflow now enforces uniqueness by `(name,
registry)` during initialization and raises a descriptive error for a duplicate key
([source](../../src/actions/checkPackageDependencies/init.ts#L25)). For valid manifests, analysis
still emits exactly one ordered status per declaration.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It initializes output/runtime, rejects duplicate `(name, registry)` dependency keys, and normalizes optional input groups. |
| 2 | `set-system-packages` | No workflow-specific issue found. Connector failures propagate. |
| 3 | `analyze` | No issue found. Each valid declaration produces one ordered result; missing packages and incompatible versions are reported as `match: false`. |
