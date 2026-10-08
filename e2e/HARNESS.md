# E2E harness

Scripts in `e2e/harness/` run trm-core actions straight from `src/` against a real SAP system and registry, without
trm-client. Every prompt is answered by the operator through files, like on the CLI. They are meant for the procedure
in [README.md](README.md); results are reported as described in [REPORT_CONTRACT.md](REPORT_CONTRACT.md).

## Setup
- `npm install` in the repository root. The harness uses the repository's `ts-node`, `dotenv` and `trm-commons`.
- `.env` in the repository root (never committed):

| Key | Purpose |
|---|---|
| `SAP_URL` | System base URL, e.g. `http://host:port`. The REST connector appends `/ztrmserver`. |
| `SAP_USER`, `SAP_PASSWORD` | Logon user. |
| `SAP_CLIENT`, `SAP_LANGUAGE` | Client and logon language (default `EN`). |
| `TRM_PUBLIC_REGISTRY_ENDPOINT` | Registry the `public` registry points to (a test registry, never production). |
| `TRM_PUBLIC_REGISTRY_TOKEN` | Token of the e2e registry user. |

The same `.env` usually configures the arc-1 MCP server (see [SAP_TOOLING.md](SAP_TOOLING.md)).

- **Work folder:** `e2e/work/` (git-ignored). Set `E2E_WORK` to use another folder, e.g. one per campaign. Its
  layout:

| Path | Content |
|---|---|
| `inputs/<name>.json` | Action specs. |
| `ipc/` | Prompts of the running action: `q-<n>.json`, `a-<n>.json`, `transcript.log`, `pid`, `done`. Cleared by every launch. |
| `logs/<name>.out` | Console output of the run. |
| `logs/<label>/` | Per-run record: `spec.json`, `transcript.log`, `output.json`, `result.json` and the trm-core log file. |

Only one action runs at a time per work folder: the prompt files are shared.

## Action spec (params in)
```json
{
    "label": "s3-upgrade-v2",
    "action": "install",
    "input": { "packageData": { "name": "@test/e2e-upg", "version": "2.0.0" } },
    "file": "/path/to/package.trm"
}
```
- **`label`:** names the per-run log folder. Use the scenario and step (`s<n>-<step>`), and never reuse a label: a
  rerun gets a suffix (`-2`, `-3`).
- **`action`:** any action exported by trm-core, e.g. `publish`, `install`, `deletePackage`, `checkEngines`,
  `checkSapEntries`.
- **`input`:** the action input, as minimal as possible.
  - The runner sets `packageData.registry` and `contextData.logTemporaryFolder`.
  - Leave out `noInquirer` and the skip, overwrite and check flags, so every prompt surfaces.
  - Set a flag only when the scenario is about it, and report it.
- **`file` (optional):** a `.trm` path; the run then uses the `FileSystem` registry instead of the remote one.

## Running
```bash
e2e/harness/go.sh s3-upgrade-v2                    # spec from <work>/inputs, or a path to a .json
node e2e/harness/wait.js                           # prints the first pending prompt, or @@DONE
node e2e/harness/wait.js 1 '{"value":"ZPKG_NEW"}'  # answers prompt 1, then waits for the next one
node e2e/harness/wait.js 2 '{"useDefault":true}'
node e2e/harness/auto.js '{}'                      # waits for the end without answering anything
grep '@@DONE' e2e/work/logs/s3-upgrade-v2.out      # @@DONE OK <s> | @@DONE FAIL <s> <error> | @@DONE CRASH
```
- **Answers:** always `{"value": <answer>}` or `{"useDefault": true}`.
  - A bare JSON value is read as `undefined`, and a confirm then silently means "no". Check the answer in
    `transcript.log` when an outcome looks wrong.
  - A validation error re-asks the same question with a new id and an `error` field.
- **Prompt JSON:** carries `type`, `name`, `message`, `default` and `choices`. Answer a `list`/`checkbox` with the
  choice `value`, not its label.
- **`auto.js`:** answers prompts by `name` from a map: `<value>`, `{"$default": true}` or an array (one per
  occurrence). It stops on the first unknown prompt with `@@NEEDS ANSWER`.
  - `auto.js @e2e/harness/answers/publish-metadata.json` answers the publish metadata questions, after the
    visibility and customizing prompts were answered by hand.
  - Read every prompt that matters for the scenario yourself; `auto.js` is for the repetitive ones.
- **Long runs:** `wait.js` and `auto.js` return `@@STILL RUNNING` after about 9.5 minutes. Call them again.
- **Interrupting a run** (to test interrupted actions): `kill -9 $(cat e2e/work/ipc/pid)` at the moment under test.
  Watch `logs/<name>.out` for the step to hit, e.g. `Importing`.

## Params out
- **`logs/<label>/result.json`:** `{ status: OK|FAIL, seconds, error: { name, message, cause } }`.
- **`logs/<label>/output.json`:** the action output (manifest, transports, target system...), with binaries
  replaced.
- **`logs/<label>/transcript.log`:** every prompt and answer, in order (`[Q<n>] (<type>) <name>: <message>` /
  `[A<n>] <value>`).
- **`logs/<name>.out` and the trm-core log file:** the full console and debug log, including every REST request and
  response. Filter with `grep -v AXIOS` for the user-facing lines.

## Diagnostics: `e2e/harness/tool.sh`
| Command | Use |
|---|---|
| `log <file>...` | Reads tp/R3trans logs through the connector, e.g. `/usr/sap/trans/log/<SID>I<number>.<SID>`. Step letters: `E` export, `H` dictionary import, `I` main import, `A` activation, `R` post-import methods, `G` generation. |
| `record <package> [registry]` | The TRM packages table row (with the decoded manifest), install mappings and install transports. Registry key: `public`, `local` or the endpoint. |
| `locks` | TRM action locks, grouped by owner token. |
| `release-locks <owner token>` | Releases the locks of one owner left by an interrupted run, the same way the action does. Only use it when no action of that owner runs. |

For a one-off check (repairing a record, calling one connector method), copy `tool.ts` into a scratch folder
outside the repository. It needs the same environment as `tool.sh` (`NODE_PATH`, `TS_NODE_PROJECT`,
`TS_NODE_TRANSPILE_ONLY`, run from the repository root). When a scenario needs such an intervention, list it in its steps.
