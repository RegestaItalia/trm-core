# `check-engines` workflow audit

Audit date: 2026-10-04
Entry point: [`checkEngines`](../../src/actions/checkEngines/index.ts#L88)

The [README](README.md#workflow-engine-behavior-assumed-by-this-audit) describes the workflow-engine rollback semantics assumed by this report. Shared findings (ACT-2026-04 to ACT-2026-21) are listed in the README.

## Findings

### ACT-2026-74 — Medium — Functional — Unknown properties inside known engine checks pass silently

- **Where:** non-strict validation in [`checkEngines/init.ts#L26`](../../src/actions/checkEngines/init.ts#L26); evaluators read only `release`/`sp`/`version`.
- **Failure:** `{ release: '>=758', patch: '>=3' }` prints "patch >=3 … OK" without checking `patch`, unlike unknown top-level keys, which fail.
- **Fix:** fail constraints with unsupported properties using the same "update TRM" reason.

### ACT-2026-75 — Low — Technical — Normalization collisions and comparison gaps

- **Where:** `validateEngines.ts` normalization (`sap_basis`/`SAP_BASIS`, `0001234`/`1234` collapse silently); blank `EXTRELEASE` shown as SP 0 but fails `sp >=0`; failed CVERS/PRDVERS reads not cached ([`analyze.ts#L31`](../../src/actions/checkEngines/analyze.ts#L31)).
- **Fix:** reject post-normalization duplicates, normalize blank SP, cache rejections.

### ACT-2026-76 — Low — Functional — `anyOf` failures are opaque

- **Where:** [`install/checkEngines.ts#L39`](../../src/actions/install/checkEngines.ts#L39); notes validation message lists unsupported value kinds.
- **Fix:** print each alternative's reason under a failed `anyOf`; use per-check validation messages.

## Step review

| Order | Step | Result |
|---:|---|---|
| 1 | `init` | Unknown nested properties silently accepted (ACT-2026-74); key collisions (ACT-2026-75). |
| 2 | `analyze` | Main logic correct (read failures fail requirements, unknown top-level keys fail, `anyOf` handled); minor comparison gaps (ACT-2026-75). |
| — | install wrapper `check-engines` | Skips on `noEngines` or when no engines are declared; prints each unmet requirement before aborting. `anyOf` detail is lost (ACT-2026-76). |

## Resolved findings

None.

## Non-relevant findings

None.
