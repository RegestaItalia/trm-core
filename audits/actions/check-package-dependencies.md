# `check-dependencies` workflow audit

Audit date: 2026-08-27
Entry point: [`checkPackageDependencies`](../../src/actions/checkPackageDependencies/index.ts#L91)

## Findings

### DEPCHK-01 — Medium — Duplicate dependency declarations collapse into one ambiguous status

The output builder identifies an existing result using only dependency name and registry. Two
declarations for the same package/registry with different ranges overwrite the same `match` value,
while both remain in the returned `dependencies` array
([good aggregation](../../src/actions/checkPackageDependencies/analyze.ts#L67),
[bad aggregation](../../src/actions/checkPackageDependencies/analyze.ts#L78)). The final result is
order-dependent and the two output arrays no longer correspond one-to-one.

Recommendation: validate uniqueness before analysis or include the requested range in result
identity and emit exactly one status per input declaration.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. It initializes output/runtime and optional input groups before later access. |
| 2 | `set-system-packages` | No workflow-specific issue found. Connector failures propagate. |
| 3 | `analyze` | DEPCHK-01. Missing packages and incompatible versions are otherwise reported as `match: false` rather than exceptional failures, which matches the action contract. |
