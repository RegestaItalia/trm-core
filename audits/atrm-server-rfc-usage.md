# `/ATRM/SERVER` RFC usage analysis

Analysis date: 2026-08-26

## Scope and interpretation

- The function-module inventory comes from ARC-1, reading function group `/ATRM/SERVER` with its generated includes expanded. ARC-1 returned 47 function modules.
- **Called by `RFCClient`** means the function module appears as a literal `/ATRM/...` target passed to `RFCClient._call(...)`.
- **`RFCClient` method called by system connector** means the enclosing `RFCClient` method is invoked by `RFCSystemConnector`, including protected adapter methods inherited by `SystemConnectorBase`.
- **System connector method called in project** means the corresponding connector path is called elsewhere in project source. This includes calls made from `SystemConnectorBase` to concrete or protected connector methods. The forwarding declaration in `SystemConnector.ts` is not, by itself, treated as usage. Calls in generated `dist/` files mirror `src/`; they were not treated as additional independent usage.
- This is a static source analysis. Dynamic calls and consumers outside this repository are not visible.

## Results

| Function name | Called by `RFCClient` | `RFCClient` method called by system connector | System connector method called in project |
|---|:---:|:---:|:---:|
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
| `/ATRM/DELETE_LOG_POLLING` | Yes | Yes | Yes |
| `/ATRM/DELETE_TRANSPORT` | Yes | Yes | Yes |
| `/ATRM/DEL_TRANSPORT_TMS` | Yes | Yes | Yes |
| `/ATRM/DEQUEUE_TR` | Yes | Yes | Yes |
| `/ATRM/EXECUTE_POST_ACTIVITY` | Yes | Yes | Yes |
| `/ATRM/FORWARD_TR` | Yes | Yes | Yes |
| `/ATRM/GET_ABAPGIT_SOURCE` | Yes | Yes | Yes |
| `/ATRM/GET_BINARY_FILE` | Yes | Yes | Yes |
| `/ATRM/GET_DEPENDENCIES` | Yes | Yes | Yes |
| `/ATRM/GET_DEPENDENCIES_SINGLE` | Yes | Yes | Yes |
| `/ATRM/GET_DEVCLASS_OBJS` | Yes | Yes | Yes |
| `/ATRM/GET_DIR_TRANS` | Yes | Yes | Yes |
| `/ATRM/GET_DOT_ABAPGIT` | Yes | Yes | Yes |
| `/ATRM/GET_FILE_SYS` | Yes | Yes | Yes |
| `/ATRM/GET_INSTALLED_PACKAGES` | Yes | Yes | Yes |
| `/ATRM/GET_OBJS_LOCKS` | Yes | Yes | Yes |
| `/ATRM/GET_R3TRANS_INFO` | Yes | Yes | Yes |
| `/ATRM/GET_TRANSPORT_LAYER` | Yes | Yes | Yes |
| `/ATRM/GET_TR_IMPORT_STATUS` | Yes | Yes | Yes |
| `/ATRM/GET_TR_TARGETS` | Yes | Yes | Yes |
| `/ATRM/IMPORT_TR` | Yes | Yes | Yes |
| `/ATRM/LIST_OBJECT_TYPES` | Yes | Yes | Yes |
| `/ATRM/PING` | Yes | Yes | No |
| `/ATRM/READ_LOG_POLLING` | Yes | Yes | Yes |
| `/ATRM/READ_TMS_QUEUE` | Yes | Yes | Yes |
| `/ATRM/REFRESH_TR_TMS_TXT` | Yes | Yes | Yes |
| `/ATRM/RELEASE_TR` | Yes | Yes | Yes |
| `/ATRM/REMOVE_TR_COMMENTS` | Yes | Yes | Yes |
| `/ATRM/RENAME_TRANSPORT_REQUEST` | Yes | Yes | Yes |
| `/ATRM/SET_INSTALL_DEVC` | Yes | Yes | Yes |
| `/ATRM/SET_TRANSPORT_DOC` | Yes | Yes | Yes |
| `/ATRM/TADIR_INTERFACE` | Yes | Yes | Yes |
| `/ATRM/TDEVC_INTERFACE` | Yes | Yes | Yes |
| `/ATRM/TR_COPY` | Yes | Yes | Yes |
| `/ATRM/UPDATE_TRM_PACKAGE_DATA` | Yes | Yes | Yes |
| `/ATRM/VERSION` | Yes | Yes | Yes |
| `/ATRM/WRITE_BINARY_FILE` | Yes | Yes | Yes |

## Unused public connector paths

`/ATRM/PING` reaches `RFCSystemConnector.ping`, but no call site invokes that connector path outside its forwarding declaration in `SystemConnector.ts`.