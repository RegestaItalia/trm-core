# `check-engines` workflow audit

Audit date: 2026-10-05
Entry point: [`checkEngines`](../../src/actions/checkEngines/index.ts#L88)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared findings ([ACT-2026-04](shared.md) to [ACT-2026-21](shared.md)) are listed in the README.

## Findings

No active findings.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | No issue found. Validation is non-strict for forward compatibility; normalization keeps unknown properties, including those of table checks and conditions, so `analyze` can fail them. Component, product, and note keys that normalize to the same value are rejected. |
| 2 | `analyze` | No issue found. Read failures fail requirements and are read once per run, unknown top-level keys and unknown properties inside known checks fail, `anyOf` is handled, and a blank support package level is evaluated and shown as 0. |
| — | install wrapper `check-engines` | Skips on `noEngines` or when no engines are declared; prints each unmet requirement before aborting; under a failed `anyOf` it also prints each unmet requirement of every alternative, with its reason or actual value, skipping the contents of a satisfied nested `anyOf`. |

## Resolved findings
### ACT-2026-74 — Resolved — Medium — Functional — Unknown properties inside known engine checks pass silently

Previously validation in `init` was non-strict and the evaluators read only `release`, `sp`, and
`version`, so `{ release: '>=758', patch: '>=3' }` was reported OK without checking `patch`.
Normalization also dropped unknown properties of table checks and conditions. Each evaluator now
compares a constraint with the supported properties shared with validation
([source](../../src/manifest/engines/validateEngines.ts#L14)) and fails it with "Unsupported
property … update TRM to verify it", the same wording used for unknown top-level keys
([source](../../src/actions/checkEngines/analyze.ts#L23)). Notes and table checks with unknown
properties fail without reading the system. In a list of component or product alternatives, an
alternative with unknown properties never matches, but another supported alternative can still
satisfy the requirement. Normalization now keeps unknown table properties
([source](../../src/manifest/engines/validateEngines.ts#L251)).

### ACT-2026-75 — Resolved — Low — Technical — Normalization collisions and comparison gaps

Previously normalization silently collapsed keys such as `sap_basis`/`SAP_BASIS` or note
`0001234`/`1234`, keeping only the last declaration. `validateEngines` now rejects a component,
product, or note key that normalizes to the same value as an earlier key in the same map
([source](../../src/manifest/engines/validateEngines.ts#L58)). Because publish, manifest parsing,
and `init` share this validation, a colliding declaration is rejected everywhere. A blank
`EXTRELEASE` was shown as SP 0 but failed `sp >=0`; it is now evaluated and displayed as level 0
([source](../../src/actions/checkEngines/analyze.ts#L46)). The CVERS and PRDVERS reads are cached as
promises, so a failed read is attempted once per run rather than once per requirement
([source](../../src/actions/checkEngines/analyze.ts#L31)).

### ACT-2026-76 — Resolved — Low — Functional — `anyOf` failures are opaque

Previously the install `check-engines` step printed only "expected at least 1 of N alternatives"
for a failed `anyOf` and dropped why each alternative failed. It now prints every unmet
requirement nested under the failed `anyOf`, with its reason or actual value, and skips
requirements under a nested `anyOf` that was satisfied
([source](../../src/actions/install/checkEngines.ts#L14)). Validation messages are now specific to
each check: notes report "expected true or an object" instead of also listing `false` and arrays,
and an element of a component or product alternatives list reports "expected an object"
([source](../../src/manifest/engines/validateEngines.ts#L38)).

## Non-relevant findings

None.
