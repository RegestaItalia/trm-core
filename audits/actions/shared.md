# Shared action infrastructure audit

Audit date: 2026-08-27

This report covers reusable steps and callbacks used by more than one action workflow.

## Findings

### SHARED-02 — Medium — `trm-server` initialization failures are swallowed

Every post-activity exception is logged and ignored
([source](../../src/actions/commons/trmServerPa.ts#L25)). Workflows continue even if server
initialization was required for later API compatibility. The logger prefix is also not restored in
a `finally`, so a throw from logging itself or from manifest access can leak global prefix state.

Recommendation: distinguish optional activities from required initialization; aggregate and throw
required failures, and restore prefixes in `finally`.

## Step review

| Step/helper | Result |
|---|---|
| `check-server-auth` | No issue found. The connector contract is `true | ClientError`, and denial is propagated. |
| `set-system-packages` | No issue found. It preserves a supplied snapshot and propagates query failures. |
| `trm-server-pa` | SHARED-02. |
| `setTransportTarget` | No issue found. Zero targets reject immediately, a sole target is selected automatically, and explicit targets are validated. |
| `stopWarning` | No issue found. It only emits the standard interruption warning and has no state-changing behavior. |
| `workflowCallbacks` | No open data-exposure issue. Failure callbacks still assume an `Error` object, so non-`Error` throws lose diagnostic detail, but do not change workflow control flow. |

## Resolved findings

### SHARED-03 — Resolved — Zero transport targets reject before prompting

`setTransportTarget` now checks the available-target collection before automatic, interactive, or
explicit selection. An empty collection throws a clear error immediately, so interactive callers
cannot receive an empty list prompt ([source](../../src/actions/commons/prompts/setTransportTarget.ts#L20)).

### SHARED-01 — Resolved — Lifecycle logs use bounded, redacted summaries

Workflow start/finish callbacks no longer inspect complete inputs and outputs. The redaction policy
now lives in the shared `summarizeForLog` utility and is also used by `RFCClient` argument/response
logging and the Axios request/response layer that serves `RESTClient`. The summarizer:

- redacts authentication, cookie, credential, password, secret, token, API-key, and private-key fields;
- replaces buffers, typed arrays, and array buffers with type and byte-count labels;
- replaces registry, connector, manifest, lockfile, and other class instances with class-name labels;
- detects circular references; and
- limits string length, recursion depth, array items, and object keys.

This preserves useful structural diagnostics without serializing release artifacts or object
internals. All three consumers now converge on the same implementation
([utility](../../src/commons/summarizeForLog.ts#L1),
[workflow callbacks](../../src/actions/commons/workflowCallbacks.ts#L1),
[RFC client](../../src/client/RFCClient.ts#L4),
[REST/Axios layer](../../src/commons/getAxiosInstance.ts#L1)).
