# Shared action infrastructure audit

Audit date: 2026-08-27

This report covers reusable steps and callbacks used by more than one action workflow.

## Findings

### SHARED-01 — High — Verbose lifecycle logging serializes complete inputs and outputs

`onWorkflowStart` and `onWorkflowFinish` inspect the complete raw input/output
([source](../../src/actions/commons/workflowCallbacks.ts#L8)). Inputs include registry instances,
manifests, lockfiles, and CG3Z transport binaries; outputs include CG3Y archives and release
artifacts. This can expose secrets held on registry objects and can generate very large logs or
block the event loop while formatting buffers.

Recommendation: log a redacted summary, never connector/registry internals, and replace buffers
with byte counts and hashes.

### SHARED-02 — Medium — `trm-server` initialization failures are swallowed

Every post-activity exception is logged and ignored
([source](../../src/actions/commons/trmServerPa.ts#L25)). Workflows continue even if server
initialization was required for later API compatibility. The logger prefix is also not restored in
a `finally`, so a throw from logging itself or from manifest access can leak global prefix state.

Recommendation: distinguish optional activities from required initialization; aggregate and throw
required failures, and restore prefixes in `finally`.

### SHARED-03 — Medium — Interactive target selection does not handle zero targets explicitly

With zero available targets and prompts enabled, `setTransportTarget` opens a list with no choices
instead of raising the clear error used by non-interactive mode
([source](../../src/actions/commons/prompts/setTransportTarget.ts#L25)). Depending on the prompt
adapter this can reject indirectly or leave the user without a selectable answer.

Recommendation: reject immediately when `systemTargets.length === 0`.

## Step review

| Step/helper | Result |
|---|---|
| `check-server-auth` | No issue found. The connector contract is `true | ClientError`, and denial is propagated. |
| `set-system-packages` | No issue found. It preserves a supplied snapshot and propagates query failures. |
| `trm-server-pa` | SHARED-02. |
| `setTransportTarget` | SHARED-03. Explicit targets are otherwise validated. |
| `stopWarning` | No issue found. It only emits the standard interruption warning and has no state-changing behavior. |
| `workflowCallbacks` | SHARED-01. Failure callbacks also assume an `Error` object, so non-`Error` throws lose diagnostic detail, but do not change workflow control flow. |
