# `/ATRM/SERVER` RFC usage analysis

Analysis date: 2026-10-16 (previous run: 2026-08-26)

## Scope and interpretation

- The function-module inventory comes from ARC-1, reading function group `/ATRM/SERVER` with its generated includes expanded. ARC-1 returned 55 function modules; `RFCClient` calls exactly the same 55.
- **Called by `RFCClient`** means the function module appears as a literal `/ATRM/...` target passed to `RFCClient._call(...)`.
- **`RFCClient` method called by system connector** means the enclosing `RFCClient` method is invoked by `RFCSystemConnector`, including protected adapter methods inherited by `SystemConnectorBase`.
- **System connector method called in project** means the corresponding connector path is called elsewhere in project source. This includes calls made from `SystemConnectorBase` to concrete or protected connector methods. The forwarding declaration in `SystemConnector.ts` is not, by itself, treated as usage. Calls in generated `dist/` files mirror `src/`; they were not treated as additional independent usage. `src/test.ts` is a local development script excluded from the published package (`package.json` `files`), so calls made only there are not usage.
- Every public `RFCClient` method is called by `RFCSystemConnector`; there is no orphan client method.
- Standard SAP function modules (`STFC_CONNECTION`, `RFC_READ_TABLE`, ...) are out of scope.
- This is a static source analysis. Dynamic calls and consumers outside this repository are not visible, except where noted from the sibling `trm-client` repository.
- New since the previous run (marked *(new)*): `ACQUIRE_ACT_LOCKS`, `RELEASE_ACT_LOCKS`, `DELETE_INSTALL_DEVC`, `DELETE_TMP_PACKAGE`, `GET_DEST`, `GET_EXCEPTION_LOG`, `GET_TRANSPORT_ENTRIES`, `IMPORT_TR_MULTIPLE`, `LOCK_TRANSPORT_OBJS`, `SET_INSTALL_TR`.

## Results

| Function name | Called by `RFCClient` | `RFCClient` method called by system connector | System connector method called in project |
|---|:---:|:---:|:---:|
| `/ATRM/ACQUIRE_ACT_LOCKS` | Yes | Yes | Yes |
| `/ATRM/ADD_LANG_TR` | Yes | Yes | Yes |
| `/ATRM/ADD_NAMESPACE` | Yes | Yes | Yes |
| `/ATRM/ADD_OBJS_TR` | Yes | Yes | Yes |
| `/ATRM/CHANGE_TR_OWNER` | Yes | Yes | Yes |
| `/ATRM/CHECK_AUTH` | Yes | Yes | Yes |
| `/ATRM/CREATE_CUST_TR` | Yes | Yes | Yes |
| `/ATRM/CREATE_IMPORT_TR` | Yes | Yes | Yes |
| `/ATRM/CREATE_LOG_POLLING` | Yes | Yes | Yes |
| `/ATRM/CREATE_PACKAGE` | Yes | Yes | Yes |
| `/ATRM/CREATE_TOC` | Yes | Yes | Yes |
| `/ATRM/DELETE_INSTALL_DEVC` | Yes | Yes | Yes |
| `/ATRM/DELETE_LOG_POLLING` | Yes | Yes | Yes |
| `/ATRM/DELETE_TMP_PACKAGE` | Yes | Yes | Yes |
| `/ATRM/DELETE_TRANSPORT` | Yes | Yes | Yes |
| `/ATRM/DEL_TRANSPORT_TMS` | Yes | Yes | Yes |
| `/ATRM/EXECUTE_POST_ACTIVITY` | Yes | Yes | Yes |
| `/ATRM/FORWARD_TR` | Yes | Yes | Yes |
| `/ATRM/GET_ABAPGIT_SOURCE` | Yes | Yes | Yes |
| `/ATRM/GET_BINARY_FILE` | Yes | Yes | Yes |
| `/ATRM/GET_DEPENDENCIES` | Yes | Yes | Yes |
| `/ATRM/GET_DEPENDENCIES_SINGLE` | Yes | Yes | No |
| `/ATRM/GET_DEST` | Yes | Yes | Yes |
| `/ATRM/GET_DEVCLASS_OBJS` | Yes | Yes | Yes |
| `/ATRM/GET_DIR_TRANS` | Yes | Yes | Yes |
| `/ATRM/GET_DOT_ABAPGIT` | Yes | Yes | Yes |
| `/ATRM/GET_EXCEPTION_LOG` | Yes | Internal | Internal |
| `/ATRM/GET_FILE_SYS` | Yes | Yes | Yes |
| `/ATRM/GET_INSTALLED_PACKAGES` | Yes | Yes | Yes |
| `/ATRM/GET_OBJS_LOCKS` | Yes | Yes | Yes |
| `/ATRM/GET_TRANSPORT_ENTRIES` | Yes | Yes | Yes |
| `/ATRM/GET_TRANSPORT_LAYER` | Yes | Yes | Yes |
| `/ATRM/GET_TR_IMPORT_STATUS` | Yes | Yes | Yes |
| `/ATRM/GET_TR_TARGETS` | Yes | Yes | Yes |
| `/ATRM/IMPORT_TR` | Yes | Yes | Yes |
| `/ATRM/IMPORT_TR_MULTIPLE` | Yes | Yes | Yes |
| `/ATRM/LIST_OBJECT_TYPES` | Yes | Yes | Yes |
| `/ATRM/LOCK_TRANSPORT_OBJS` | Yes | Yes | Yes |
| `/ATRM/PING` | Yes | Yes | No |
| `/ATRM/READ_LOG_POLLING` | Yes | Yes | Yes |
| `/ATRM/READ_TMS_QUEUE` | Yes | Yes | Yes |
| `/ATRM/REFRESH_TR_TMS_TXT` | Yes | Yes | Yes |
| `/ATRM/RELEASE_ACT_LOCKS` | Yes | Yes | Yes |
| `/ATRM/RELEASE_TR` | Yes | Yes | Yes |
| `/ATRM/REMOVE_TR_COMMENTS` | Yes | Yes | Yes |
| `/ATRM/RENAME_TRANSPORT_REQUEST` | Yes | Yes | Yes |
| `/ATRM/SET_INSTALL_DEVC` | Yes | Yes | Yes |
| `/ATRM/SET_INSTALL_TR` | Yes | Yes | Yes |
| `/ATRM/SET_TRANSPORT_DOC` | Yes | Yes | Yes |
| `/ATRM/TADIR_INTERFACE` | Yes | Yes | Yes |
| `/ATRM/TDEVC_INTERFACE` | Yes | Yes | Yes |
| `/ATRM/TR_COPY` | Yes | Yes | Yes |
| `/ATRM/UPDATE_TRM_PACKAGE_DATA` | Yes | Yes | Yes |
| `/ATRM/VERSION` | Yes | Yes | Yes |
| `/ATRM/WRITE_BINARY_FILE` | Yes | Yes | Yes |

## Internal function modules

`/ATRM/GET_EXCEPTION_LOG` is not a connector path: `RFCClient._call` calls it itself, after a classic RFC exception raised by another `/ATRM/` function module, to read the `/ATRM/CX_EXCEPTION` message log ([`RFCClient.ts#L189`](../src/client/RFCClient.ts#L189)). It is used.

## Unused public connector paths

- `/ATRM/PING` reaches `RFCSystemConnector.ping`, but no call site in this repository invokes that connector path outside its forwarding declaration in `SystemConnector.ts` (the `ping()` calls in `Lockfile.ts` and `RegistryV2.ts` are registry pings). It is used by the `trm-client` `ping` command (`trm-client/src/command/implementations/Ping.ts`), so it is a public API to keep. Unchanged since the previous run.
- `/ATRM/GET_DEPENDENCIES_SINGLE` reaches `RFCSystemConnector.getObjectDependenciesInternal`, wrapped by the public `SystemConnectorBase.getObjectDependencies` ([`SystemConnectorBase.ts#L660`](../src/systemConnector/SystemConnectorBase.ts#L660)) and `SystemConnector.getObjectDependencies`. The only caller is the development script `src/test.ts`; `trm-client` only stubs it (`DummyConnector.ts`). Reported as used in the previous run. Candidate for removal together with the REST counterpart (`RESTClient.getObjectDependencies`), unless an external consumer needs single-object dependencies.
