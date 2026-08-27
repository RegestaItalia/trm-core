# Action workflow audits

Audit date: 2026-08-27

These documents are static source audits of every workflow assembled under `src/actions`.
Each step was reviewed in execution order, including filters, external calls, context mutations,
error handling, rollback handlers, and the shared workflow callbacks. A finding marked
"No workflow-specific issue found" means no defect was identified in that step; ordinary
connector, registry, filesystem, and prompt failures may still propagate as expected.

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
| `check-dependencies` | 3 | 0 | 0 | 1 | 0 | [Package dependency check](check-package-dependencies.md) |
| `check-sap-entries` | 2 | 1 | 0 | 1 | 0 | [SAP-entry check](check-sap-entries.md) |
| `install-dependency` | 4 | 1 | 0 | 1 | 0 | [Dependency install](install-dependency.md) |
| `install` | 18 scheduled + 2 omitted | 3 | 6 | 4 | 1 | [Package install](install.md) |
| `publish` | 15 | 0 | 4 | 6 | 1 | [Package publish](publish.md) |
| Shared steps/callbacks | 5 | 0 | 1 | 2 | 0 | [Shared infrastructure](shared.md) |

## Highest-priority remediation order

1. Add `checkTransports` to the install workflow before any step that reads the artifact hierarchy
   or transport state.
2. Make transport import return codes 8, 12, 16, unknown, and missing return codes reject the
   install instead of continuing to package registration.
3. Represent every entry from a missing SAP table as failed in `sapEntriesStatus`.
4. Initialize `installData.checks` in the dependency-install workflow.
5. Implement or explicitly remove the install rollback promises currently represented by empty
   `revert` handlers.

