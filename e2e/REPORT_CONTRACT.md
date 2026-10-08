# E2E report contract

Every campaign run with [README.md](README.md) produces one report. Its readers:
- the maintainers, who decide on fixes;
- the trm-server, trm-rest and registry backend teams, who replicate what concerns them;
- a later agent, who reruns the scenarios.

The report must be complete enough that each run can be repeated on another disposable system without this
conversation.

## Location and lifecycle
- **File:** `E2E_REPORT.md` in the repository root (or `E2E_REPORT-<campaign>.md`). Git-ignored by `E2E_REPORT*.md`:
  never commit it.
- **Updates:** after each scenario, so an interrupted campaign still leaves a usable report.
- **Run evidence:** the per-run folders in `e2e/work/logs/<label>/` hold the raw params in/out. The report quotes what
  matters and names the labels.

## Structure (in this order)
1. Title and branch.
2. Environment.
3. Fixes committed.
4. Server-side changes.
5. Scenarios (S1…Sn), with replication blocks.
6. Final state of the system.
7. Server issues (trm-server/trm-rest) not fixed.
8. Backend issues (registry).
9. Worth noting.

Sections 7 and 8 may be empty, but they stay present: write "None".

### 1. Title
`# trm-core E2E report: branch <branch>`, followed by "Not committed".

### 2. Environment
Describe the systems generically enough for someone else to set up equivalent ones:
- **trm-core:** version and branch, and how actions were run (harness, `src/`).
- **SAP system:** release (SAP_BASIS), client, connector (REST/RFC), trm-server and trm-rest versions, transport
  targets and layers, installed languages, whether customizing changes are allowed.
- **Registry:** kind (local, test instance) and how it was reached (`TRM_PUBLIC_REGISTRY_ENDPOINT`).
- **Fixture tooling:** what was used (arc-1, WebGUI transactions, helper programs, with the package they live in).
- **Flags:** every non-default flag used in any run, and why.
- **System gaps:** problems of the system itself (e.g. missing customizing) and their workarounds. They are not trm-core
  findings.

### 3. Fixes committed
A table with one row per commit, in commit order:

| Commit | Area | Problem and impact |
|---|---|---|
| `<short sha>` | action/step or module | What the user saw, why, and what changed. Bold the impact when it blocked a whole use case. |

Every commit must also be cited by the scenario that found it.

### 4. Server-side changes
For each change made on SAP to trm-server or trm-rest:
- the object (`class->method`, function module);
- the request it's recorded on, and whether that request is released;
- what changed and why;
- the scenario that verified it.

End with: "must be ported to the trm-server/trm-rest repository".

### 5. Scenarios
One `###` section per scenario, titled `### S<n>: <name> (<packages>), <status>`. Status vocabulary:

| Status | Meaning |
|---|---|
| `passed` | Behaved as expected on the first run. |
| `passed after fixes` | Failed, was fixed (commits listed), and passed on rerun. |
| `partially run` | Some steps weren't run. Say which and why. |
| `failed` | Still failing. The open issue is described. |
| `blocked` | Couldn't run (environment, backend). The cause is described. |

Each scenario contains:
- **Goal:** the risk it covers.
- **Fixture:** packages, objects (types and names), versions, customizing and translations, and how they were built.
- **Narrative:** concise bullets of what happened, with the prompts seen (exact texts for UX-relevant ones), the
  failures (exact messages), the root causes and the fix commits.
- **Replication:** one block per action run (see below), including the failing runs when they show a defect.
- **Not run:** steps of the plan that were skipped, and why.

#### Replication block
Repeat for each relevant run. Use generic names (`<SID>`, `<client>`, `<request>`) for anything system-specific.

```markdown
##### R<scenario>.<n>: <short title>
- **Preconditions:** system state before the run. Examples: "`@test/e2e-upg` 1.0.0 installed in `ZE2E_UPG`",
  "namespace `/ABAPGIT/` absent", "fixture request released".
- **Params in:** the spec (`e2e/work/logs/<label>/spec.json`):
  {"label": "...", "action": "install", "input": {"packageData": {"name": "@test/...", "version": "..."}}}
- **Prompts:** in order, `name`: answer (from `transcript.log`). Example: `ZE2E_UPG`: default; `confirmInstall`: true.
- **Params out:**
  - `result.json` status and error message;
  - the relevant fields of `output.json` (transports, target system);
  - the `@@DONE` line.
- **Expected result:** what must be true afterwards, as checks someone can rerun:
  - SAP queries with the expected rows. Example: `SELECT obj_name FROM tadir WHERE devclass = 'ZE2E_UPG'` → exactly
    `ZE2E_UPG_A`, `ZIF_E2E_UPG`, the DEVC entry.
  - TRM data: `tool.sh record @test/e2e-upg` → version 2.0.0, mappings `ZE2E_UPG → ZE2E_UPG`.
  - Locks: `tool.sh locks` → empty.
  - For an expected failure: the exact error message, and "no SAP change" evidence.
- **Actual result:** matches / differs (how). For a defect: the commit that fixed it, and the label of the passing
  rerun.
```

Keep it short: when runs repeat the same shape, write one full block and list the others as deltas ("as R3.1, with
version 1.0.0; expected …").

### 6. Final state of the system
- the TRM packages still installed;
- the state of `/ABAPGIT/`;
- leftover packages, objects and helper programs;
- modifiable requests.

The system is disposable: this is information for the next campaign, not a cleanup list.

### 7. Server issues (trm-server/trm-rest) not fixed
`### T<n>: <symptom>`, then:
- **Symptom:** the endpoint or function module, and the exact error.
- **Analysis:** what was ruled in or out.
- **Replication:** numbered, minimal steps.
- **trm-core impact:** how trm-core handles it now (commit), or what fails.

### 8. Backend issues (registry)
`### B<n>: <symptom>`, then:
- **Symptom:** request (`METHOD /path`) and response (status and body).
- **Cause:** when the source is known.
- **Replication:** numbered steps with the specs (params in) and the response (params out).
- **Workaround used:** what the campaign did instead, if anything.

Backend issues are fixed only when the operator provided a way to edit the backend; otherwise this section is the
deliverable.

### 9. Worth noting
UX observations and risks that weren't worth a fix in this campaign, as short bullets:
- confusing prompts or messages (quote them);
- noisy logs on success;
- slow steps;
- untestable paths;
- remaining risks;
- fixes verified only by unit tests.

Each bullet names the scenario where it was seen.
