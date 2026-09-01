---
name: maintain-system-connector-api
description: Add, edit, rename, or remove a public SystemConnector API in trm-core while keeping its interface, facade, RFC and REST connectors, and both transport clients synchronized. Use for requests that change methods exposed through SystemConnector; do not use for client-only helpers that are intentionally not part of the connector API.
---

# Maintain SystemConnector APIs

Treat a public connector API as one contract implemented through both transports. Unless the user explicitly narrows the scope, keep all of these files synchronized:

- `src/systemConnector/ISystemConnector.ts`
- `src/systemConnector/SystemConnector.ts`
- `src/systemConnector/RFCSystemConnector.ts`
- `src/systemConnector/RESTSystemConnector.ts`
- `src/client/RFCClient.ts`
- `src/client/RESTClient.ts`

Also update shared exports, component/structure types, tests, mocks, and call sites when the changed contract requires it. Preserve the repository's existing naming, normalization, request-shape, response-shape, and error-handling conventions.

## Establish the backend contract

Before implementing or materially editing an API, inspect both SAP implementations through the ARC-1 MCP. Use ARC-1 read-only tools; do not change SAP objects as part of this workflow.

For RFC, locate the corresponding function module in function group `/ATRM/SERVER`:

1. Search the group with `SAPRead` using `type="FUGR"`, `name="/ATRM/SERVER"`, and a focused `grep`, or inspect the group with `expand_includes=true` when the mapping is unknown.
2. Read the exact function module with `SAPRead`, `type="FUNC"`, its name, and `group="/ATRM/SERVER"`.

For REST, locate the corresponding handler in class `/ATRM/CL_REST_RESOURCE`:

1. Search with `SAPRead`, `type="CLAS"`, `name="/ATRM/CL_REST_RESOURCE"`, and a focused `grep`; use `method="*"` to survey method signatures when needed.
2. Read the exact handler with `SAPRead`, specifying its `method`.

Use the SAP source to confirm endpoint/function name, HTTP verb, parameter names, casing, optionality, payload encoding, response fields, and error behavior. If an API is new and no backend implementation exists, report that constraint rather than inventing a transport contract. For removals, verify both backend mappings before deleting the local paths. If the RFC and REST contracts disagree, surface the mismatch and follow explicit user direction; do not silently choose one.

## Apply the change end to end

Maintain the public signature in `ISystemConnector`, then the forwarding facade in the `SystemConnector` namespace. Implement the same semantic operation in both connector classes, delegating to their respective clients. Implement the transport details in both clients:

- `RFCClient`: call the verified `/ATRM/SERVER` function module and map its normalized result to the public return type.
- `RESTClient`: call the verified `/ATRM/CL_REST_RESOURCE` route with the correct HTTP verb and request location, then map its response to the same public return type.

For edits and renames, trace every occurrence of the old API name and transport mapping with `rg`. For removals, delete the facade, interface member, both connector methods, both client methods, and obsolete dedicated types/exports/tests only when they have no remaining consumers. Do not leave one transport unsupported unless the user explicitly requests that design and the interface represents it accurately.

## Verify completeness

Before finishing:

1. Search for the API name and its former name, if any, and account for every occurrence.
2. Confirm the public method has a consistent parameter and return contract across all six layers.
3. Run the most relevant tests when present, then run `npm run build`.
4. Summarize the RFC function module and REST route/method verified through ARC-1, plus any backend discrepancy or missing implementation.
