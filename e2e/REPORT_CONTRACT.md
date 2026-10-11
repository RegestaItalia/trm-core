# E2E report contract

Every campaign run with [README.md](README.md) produces one report. It is not a log of the campaign: it keeps only
what the next campaign and the owning teams need.
- **Passed scenarios:** the regression catalog. The next campaign reruns all of them, unless the operator excludes
  some.
- **Open issues:** what still fails, why, and how to replicate it, so the owner can fix it and the next campaign can
  verify the fix.

What happened during the campaign (failed attempts, fixes along the way, prompts seen) stays out: the fixes are in
the git history, and the raw runs in `e2e/work/logs/`.

## Classifying findings
Every finding is one of three kinds. The kind decides what happens to it, so classify before writing anything.

| Kind | What it is | What happens |
|---|---|---|
| **Defect** | The action does the wrong thing: it fails, hangs, raises a false error, writes wrong or missing data (SAP or TRM), or leaves something behind after a rollback. | Fix loop (README, step 5). |
| **UX defect** | The result is right, but the user is misled or slowed down. See the list below. | Fix loop, exactly like a defect. |
| **Worth noting** | Nothing to fix. See [Worth noting](#6-worth-noting). | A bullet in section 6. |

UX defects include:
- the same question asked twice, or a question whose answer is already known;
- prompts that can't be told apart (e.g. two identical texts with no transport number);
- a destructive choice applied without confirmation;
- a question asked before a refusal that makes the answer pointless;
- a message that hides the cause or the next step;
- a prompt that lacks the information needed to answer it.

A defect or UX defect becomes an open issue only when the campaign can't fix it:
- the fix belongs to the registry backend and the operator gave no way to edit it;
- the operator decided to defer it;
- it was fixed on the server side outside the campaign's control and must be verified later.

Otherwise it is fixed and the scenario passes: the report keeps no trace of it beyond the scenario.

A defect found by reading code, on a path the system can't reach, is still a defect: fix it and cover it with a unit
test.

If you would describe a finding with "should", "could", "minor" or "confusing", it isn't worth noting: it's a defect
or a UX defect.

## Location and lifecycle
- **File:** `E2E_REPORT.md` in the repository root (or `E2E_REPORT-<campaign>.md`). Git-ignored by `E2E_REPORT*.md`:
  never commit it.
- **Updates:** after each scenario, so an interrupted campaign still leaves a usable report.
- **Next campaign:** it starts from the previous report (see the README, Prepare): it keeps the passed scenarios it
  reran or was told to skip, and carries over every issue that isn't `verified`.
- **Manual edits:** between campaigns, the operator may change an issue's status (e.g. to
  `fixed externally, to verify`) or mark scenarios to skip.

## Structure (in this order)
1. Title and branch.
2. Environment.
3. Server-side changes.
4. Passed scenarios.
5. Open issues.
6. Worth noting.

Sections 3, 5 and 6 may be empty, but they stay present: write "None".

### 1. Title
`# trm-core E2E report: branch <branch>`, followed by "Not committed".

### 2. Environment
Describe the systems generically enough for someone else to set up equivalent ones:
- **trm-core:** version and branch, and how actions were run (harness, `src/`).
- **SAP system:** release (SAP_BASIS), client, connector (REST/RFC), trm-server and trm-rest versions, transport
  targets and layers, installed languages, whether customizing changes are allowed.
- **Registry:** kind (local, test instance) and how it was reached (`TRM_PUBLIC_REGISTRY_ENDPOINT`).
- **Fixture tooling:** what was used (arc-1, WebGUI transactions, helper programs, with the package they live in).
- **System gaps:** problems of the system itself (e.g. missing customizing) and their workarounds. They are not trm-core
  findings.

### 3. Server-side changes
Changes made on SAP to trm-server or trm-rest that must be ported to their repositories. For each:
- the object (`class->method`, function module);
- the request it's recorded on;
- what changed and why;
- the scenario that verifies it.

Once ported, the change drops out of the next report.

### 4. Passed scenarios
One `###` section per scenario, titled `### S<n>: <name> (<packages>)`. A scenario is listed here only when all its
steps passed in this campaign, after any fixes. A scenario with a failing step goes here with that step removed, and
the step becomes an open issue.

Each scenario contains:
- **Goal:** the risk it covers.
- **Fixture:** packages, objects (types and names), versions, customizing and translations, and how to build them.
- **Steps:** numbered, one per action run. Name the action, the version, the prompt answers that matter and any
  non-default flag. Use generic names (`<SID>`, `<client>`, `<request>`) for anything system-specific.
- **Expected result:** per step, checks someone can rerun:
  - SAP queries with the expected rows. Example: `SELECT obj_name FROM tadir WHERE devclass = 'ZE2E_UPG'` → exactly
    `ZE2E_UPG_A`, `ZIF_E2E_UPG`, the DEVC entry.
  - TRM data: `tool.sh record @test/e2e-upg` → version 2.0.0, mappings `ZE2E_UPG → ZE2E_UPG`.
  - Locks: `tool.sh locks` → empty.
  - For an expected refusal: the exact message, and "no SAP change".
- **Last passed:** branch and date. Add "unit tests only" to a step whose fix couldn't be verified on the system.
- **Open issues:** the issues this scenario found, if any (e.g. `B1`). Omit when empty.
- **Not covered:** steps of the plan that weren't run, and why. Omit when empty.

Keep it short: when steps repeat the same shape, write one in full and the others as deltas ("as step 1, with
version 1.0.0").

### 5. Open issues
Everything that still fails at the end of the campaign, or was carried over from an earlier one and isn't `verified`.
One `###` section per issue, numbered by owner and keeping its number across campaigns:
- `C<n>`: trm-core;
- `T<n>`: trm-server/trm-rest;
- `B<n>`: registry backend.

Each issue contains:
- **Status:** see [Issue status](#issue-status).
- **Symptom:** the action and step, the endpoint or function module, and the exact error (for the backend: `METHOD
  /path`, status and body).
- **Cause:** when known; otherwise what was ruled in or out.
- **Replication:** numbered, minimal steps, with the specs (params in) and the response (params out).
- **Impact and workaround:** what fails for users, and what the campaign did instead, if anything.

Backend issues are fixed only when the operator provided a way to edit the backend; otherwise this section is the
deliverable.

#### Issue status
Issues are often fixed outside the campaign, by the team that owns the code. A fix is only trusted once a campaign has
rerun the replication.

| Status | Meaning |
|---|---|
| `open` | Not fixed. |
| `fixed externally, to verify` | The owner reports a fix. Name who, when, and the reference (commit, request, deploy), when known. |
| `verified` | A later campaign reran the replication and it passed. |
| `still failing` | A later campaign reran it after a reported fix and it failed. Quote the new error. |

A `verified` issue drops out of the report; the scenario that covers it moves to the passed scenarios.

### 6. Worth noting
Things a reader should know that need no change. Each bullet says why no change is needed, and names the scenario
where it was seen (or "reading" for the code):
- **Intended behaviour that looks wrong:** and why it's right, or who decided it. Example: a downgrade to an explicit
  version warns without asking for confirmation, because the version was chosen on purpose.
- **Untested paths:** what the system can't exercise, and the risk left. Example: a branch that only runs with a time
  zone customizing this client lacks.
- **Code smells read along the way that don't change behaviour:** e.g. state that is set and never read.
- **Slow steps,** with their duration, when nothing in trm-core can speed them up.

Defects and UX defects never go here (see [Classifying findings](#classifying-findings)). The next campaign carries
over the bullets that still apply.
