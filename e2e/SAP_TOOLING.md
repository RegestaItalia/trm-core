# SAP tooling for e2e campaigns

How to build fixtures, inspect the system and patch trm-server/trm-rest during a campaign ([README.md](README.md)).
- **arc-1 (MCP server, ADT):** the default. It's fast and scriptable.
- **SAP GUI for HTML (WebGUI):** for what ADT can't do or when ADT breaks. Drive it with the `sap-webgui` skill ,
  (if available) which holds the interaction rules (keep-awake, session reuse, verifying system and client...).
- **Defaults:** read connection data fresh from the project's `.env` every time (URL, client, language), and confirm
  through a query that arc-1 and WebGUI point to the same system and client. Never reuse hosts, clients or request
  numbers from an earlier campaign.

## arc-1

| Need | Tool and usage |
|---|---|
| Fixture package | `SAPManage create_package`: name, description, `softwareComponent` (`HOME` or `LOCAL` for `$`), `transportLayer`, `superPackage` for nesting, `transport`. |
| Request for fixtures | `SAPTransport create` (pass the package so the target and layer resolve), then `release_recursive` before any TRM action runs on its objects. |
| Programs, interfaces, classes, message classes, DDIC | `SAPWrite create/update` with `package` and `transport`, then `SAPActivate`. Pass `lintBeforeWrite: false` when the local linter rejects valid code. |
| Delete fixtures | `SAPWrite delete`, `SAPManage delete_package`. |
| Evidence | `SAPQuery`: one read-only ABAP SQL `SELECT`, with `maxRows` (see below). |
| Source | `SAPRead` (`grep` to search inside an object). |
| Requests | `SAPTransport list/get/release/delete`. |

**SAPQuery tips:**
- Useful tables:
  - Repository and packages: TADIR, TDEVC, REPOSRC.
  - Transports: E070, E071, E071K, TMSBUFFER.
  - Namespaces: TRNSPACE, TRNSPACET.
  - Code and DDIC metadata: TFDIR (function module → function group/include), SEOCOMPO and TMDIR (class methods),
    DD09L (buffering), T100 (message texts).
  - TRM tables: the packages table, install mappings, install transports and action locks (see the trm-server
    package for their names).
- `PUFFERUNG` in DD09L tells you whether reads can be stale after an import.
- `LIKE` with `$` and `/` works. Joins need `AS` aliases and `~`.

**When ADT fails:**
- **The system itself:** e.g. client customizing missing (time zones), which makes ADT creates and source reads
  dump. Check `SAPDiagnose` dumps. Note it as an environment gap, switch to WebGUI, and come back to ADT when it works
  again.
- **A dialog:** "Sending of dynpro … not possible: No window system type" means the operation needs a dialog (e.g. the
  Modification Assistant on an object whose original system is another one). Do it in WebGUI.
- **Foreign objects:** objects whose original system isn't the current one (TRM installs set `SRCSYSTEM` to `TRM`) are
  repairs. Some actions are refused in modification mode. If the fixture must be edited, set the source system with the
  trm-server TADIR interface.
- **A stuck session:** a stateful ADT session that keeps failing (e.g. CSRF errors) needs the MCP server to reconnect.

## Patching trm-server or trm-rest
- **Scope:** allowed when a campaign fix belongs on the server.
- **Before patching:** read the current source (ADT, or WebGUI when ADT fails). Prefer extending existing fallbacks to
  rewriting logic.
- **Recording:** put the change on a dedicated request (if possible) and leave it modifiable. Note in the report
  the object, the change, the request and the scenario that verified it, so it can be ported to the repository.
- **Verification:** rerun the case through the trm-core harness, not only through SE37: dialog, background and HTTP
  behave differently (e.g. package API calls that work in dialog fail over HTTP).
