# Action workflow audits

Audit date: 2026-08-27

These documents are static source audits of every workflow assembled under `src/actions`.
Each step was reviewed in execution order, including filters, external calls, context mutations,
error handling, rollback handlers, and the shared workflow callbacks. A finding marked
"No workflow-specific issue found" means no defect was identified in that step; ordinary
connector, registry, filesystem, and prompt failures may still propagate as expected.

Findings remain in their workflow report after review. **Resolved** findings were corrected by a
code change; **Non-relevant** findings were reviewed and intentionally accepted or rejected as not
applicable. Neither category is included in the open severity counts below. Retaining both prevents
later audits from reporting the same accepted candidates as new findings.

## Severity

- **Critical**: the normal workflow can fail deterministically, report success after a failed
  state-changing operation, or leave the SAP system materially inconsistent.
- **High**: a realistic failure path can silently lose required work or leave state without
  effective recovery.
- **Medium**: misleading results, swallowed diagnostics, stale global state, or incomplete input
  handling can affect callers or operations.
- **Low**: primarily diagnostics, typing, or maintainability concerns with limited runtime impact.

## Workflow index

| Workflow | Steps audited | Critical | High | Medium | Low | Report |
|---|---:|---:|---:|---:|---:|---|
| `cg3y` | 2 | 0 | 0 | 0 | 0 | [CG3Y](cg3y.md) |
| `cg3z` | 2 | 0 | 1 | 1 | 0 | [CG3Z](cg3z.md) |
| `check-dependencies` | 3 | 0 | 0 | 0 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-sap-entries` | 2 | 0 | 0 | 0 | 0 | [SAP-entry check](check-sap-entries.md) |
| `install-dependency` | 4 | 0 | 0 | 0 | 0 | [Dependency install](install-dependency.md) |
| `install` | 20 | 0 | 0 | 0 | 0 | [Package install](install.md) |
| `publish` | 15 | 0 | 0 | 0 | 0 | [Package publish](publish.md) |
| Shared steps/callbacks | 5 | 0 | 0 | 0 | 0 | [Shared infrastructure](shared.md) |

## Highest-priority remediation order

1. Add rollback for partial CG3Z uploads and transports that fail during forwarding (CG3Z-01).
