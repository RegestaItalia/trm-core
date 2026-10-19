# Maintaining SystemConnector APIs

Follow this workflow when adding, editing, renaming, or removing a typed public
`SystemConnector` API. It does not apply to client-only helpers that are
intentionally excluded from the connector API.

Treat a public connector API as one contract implemented through both transports. Unless the user explicitly narrows the scope, keep all of these files synchronized:

- `src/systemConnector/ISystemConnector.ts`
- `src/systemConnector/SystemConnector.ts`
- `src/systemConnector/RFCSystemConnector.ts`
- `src/systemConnector/RESTSystemConnector.ts`
- `src/client/RFCClient.ts`
- `src/client/RESTClient.ts`

Also update shared exports, component/structure types, tests, mocks, and call sites when the changed contract requires it. Preserve the repository's existing naming, normalization, request-shape, response-shape, and error-handling conventions.

Before designing the change, find the closest existing API with `rg` and inspect its complete path through both clients. Prefer an analogous operation with the same SAP wire types or encoding. Reuse its parsing and typing conventions instead of implementing only the obvious forwarding calls. For example, `getAbapgitSource` demonstrates the established pattern for converting an RFC `XSTRING` containing ABAP XML into typed TypeScript data while REST consumes the equivalent JSON response.

## Establish the backend contract

Before implementing or materially editing an API, inspect both SAP implementations through the ARC-1 MCP. Use ARC-1 read-only tools; do not change SAP objects as part of this workflow.

For RFC, locate the corresponding function module in function group `/ATRM/SERVER`:

1. Search the group with `SAPRead` using `type="FUGR"`, `name="/ATRM/SERVER"`, and a focused `grep`, or inspect the group with `expand_includes=true` when the mapping is unknown.
2. Read the exact function module with `SAPRead`, `type="FUNC"`, its name, and `group="/ATRM/SERVER"`.

For REST, locate the corresponding handler in class `/ATRM/CL_REST_RESOURCE`:

1. Search with `SAPRead`, `type="CLAS"`, `name="/ATRM/CL_REST_RESOURCE"`, and a focused `grep`; use `method="*"` to survey method signatures when needed.
2. Read the exact handler with `SAPRead`, specifying its `method`.

Use the SAP source to confirm endpoint/function name, HTTP verb, parameter names, casing, optionality, payload encoding, response fields, concrete SAP data types, and error behavior. Resolve the fields of returned structures from SAP metadata or source before defining their TypeScript equivalents. If an API is new and no backend implementation exists, report that constraint rather than inventing a transport contract. For removals, verify both backend mappings before deleting the local paths. If the RFC and REST contracts disagree, surface the mismatch and follow explicit user direction; do not silently choose one.

## Define one typed public contract

Do not use `any`, `unknown`, `object`, or an untyped record as a shortcut for a public connector parameter or return value. Define the concrete type in the same locations and style already used by this repository:

- Put scalar SAP data-element aliases in `src/client/components/` and export them from `src/client/components/index.ts`.
- Put SAP structures in `src/client/struct/` and export them from `src/client/struct/index.ts`.
- Compose arrays and small API-specific result types from those concrete types where the repository's existing pattern supports doing so.

Search for an existing local definition before creating one. Take field names and field types from the actual SAP contract, not from a sample response. Carry the same concrete public type through `ISystemConnector`, `SystemConnector`, both connector classes, and both clients.

RFC and REST may represent the same result differently on the wire. Normalize both inside their clients so callers receive the same typed value:

- When RFC returns an `XSTRING` containing ABAP XML but REST returns the actual object as JSON, parse the RFC buffer with the repository's existing `xml-js`/ABAP XML pattern, map every field into the concrete shared type, and return the already-normalized REST object as that same type.
- Do not expose `Buffer | object`, transport-specific unions, raw XML, or `Promise<any>` merely because the wire encodings differ.
- Handle empty or optional backend results explicitly in the type and implementation only when the SAP contract permits them.

## Apply the change end to end

Maintain the public signature in `ISystemConnector`, then the forwarding facade in the `SystemConnector` namespace. Implement the same semantic operation in both connector classes, delegating to their respective clients. Implement the transport details in both clients:

- `RFCClient`: call the verified `/ATRM/SERVER` function module, decode transport-specific payloads such as ABAP XML, and map the result to the concrete public type.
- `RESTClient`: call the verified `/ATRM/CL_REST_RESOURCE` route with the correct HTTP verb and request location, then normalize its JSON response to the same concrete public type.

For edits and renames, trace every occurrence of the old API name and transport mapping with `rg`. For removals, delete the facade, interface member, both connector methods, both client methods, and obsolete dedicated types/exports/tests only when they have no remaining consumers. Do not leave one transport unsupported unless the user explicitly requests that design and the interface represents it accurately.

## Keep trm-server/trm-rest upgrades working

trm-core upgrades trm-server and trm-rest themselves, so an upgrade always runs on the previous backend: an API added in the release being installed doesn't exist yet. When a new API is called by an action that already exists (most notably install), register it before the action calls it:

1. Add or extend a generation in `TRM_BACKEND_APIS` (`src/actions/commons/utils/trmBackend.ts`) with the first trm-server and trm-rest releases that ship the API. Ask for the release numbers if they aren't known: versions are set at release.
2. Guard the call with `lacksTrmBackendApis(context, '<generation>')` and continue as the action did before the API existed (skip the step, use the previous behaviour, leave a check out). Pass `missingBackendApis` on to helpers that make the call.
3. Don't catch the "function module not found" / `METHOD_CALL_EXCEPTION` error to fall back: outside a trm-server/trm-rest upgrade `missingBackendApis` is empty, and a missing API is an error, because every other action needs the backend this trm-core is built for.
4. Test both paths: the upgrade on a backend without the generation continues without the API, and any other action calls it (and fails when it is missing).

## Verify completeness

Before finishing:

1. Search for the API name and its former name, if any, and account for every occurrence.
2. Confirm the public method has the same concrete parameter and return types across all six layers and that any new component/structure files are exported.
3. Search the changed public API path for `any`, `unknown`, raw transport payloads, and transport-specific return unions; replace shortcuts with the resolved concrete contract.
4. Confirm RFC decoding and REST normalization produce the same logical value, using the closest existing API as the implementation reference.
5. When an existing action calls the API, confirm it is registered in `TRM_BACKEND_APIS` and guarded for trm-server/trm-rest upgrades.
6. Run the most relevant tests when present, then run `npm run build`.
7. Summarize the RFC function module and REST route/method verified through ARC-1, the shared result type, the analogous local API followed, and any backend discrepancy or missing implementation.
