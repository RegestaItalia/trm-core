# E2E campaigns for trm-core

How to run end-to-end tests of trm-core against a real SAP system and a real registry, fix what they reveal, and
report the results.
- [HARNESS.md](HARNESS.md): the scripts that run actions and answer prompts.
- [SAP_TOOLING.md](SAP_TOOLING.md): how to build fixtures and inspect the system with arc-1 and SAP WebGUI.
- [REPORT_CONTRACT.md](REPORT_CONTRACT.md): what the final report must contain: the passed scenarios and the open
  issues.

The goal is to improve trm-core: find flaws and poor UX on real systems and fix them. Fix only what needs fixing.

## Ground rules
- **Disposable environment:**
  - The SAP system and the registry are test instances that can be broken without consequences. No cleanup is needed
    after the campaign. Each campaign starts on a fresh instance.
  - Never point a campaign at a system or registry that matters.
- **Package names:** `@test/` is the only allowed scope (e.g. `@test/e2e-upg`). Install only packages published by
  the same campaign.
- **SAP namespaces:**
  - Customer packages are `Z…` (e.g. `ZE2E_UPG`). Local `$…` packages are only install targets: publishing from them
    is not supported.
  - `/ABAPGIT/` and `/AWSSAMP/` are the only custom namespaces allowed for namespace tests (publish, install, delete, and import or
    removal of the namespace itself).
  - Never publish or install into the namespace of TRM itself (`/ATRM/`). trm-server and trm-rest aren't fixtures.
- **Keep packages small:** a handful of objects each, at most one subpackage level and no superpackages. Test
  systems often run with little memory.
- **No trm-client:** run the actions through the harness.
- **Answer prompts by hand:**
  - Pass no automatic flags (`noInquirer`, skip, overwrite or check flags), unless the scenario is about that flag.
  - Missing branches of non-interactive mode come up in audits anyway. The interactive path is what users see.
- **Cleanup is not a goal:** when cleaning up a fixture fails or gets complicated, don't force it. Publish under a new
  package name instead: names are unlimited.
- **Out of scope:**
  - The registry backend: unless the operator says how to change it (e.g. by providing its source code), report its
    errors with replication steps (see the report contract) and work around them.
  - **trm-server and trm-rest** may be edited when a fix belongs there. Edit through arc-1 or WebGUI, record the change
    on a dedicated request (if possible), and list it in the report so it can be ported to their repositories.
- **Never touch `audits/`:** e2e fixes change code and tests only. The audit is a separate process. Findings go in the
  report.

## 1. Prepare
1. **Read the branch:** read the changes under test (e.g. `git log main..`, `git diff --stat main...`) and the open
   audits for known risks.
   - **Previous report:** read `E2E_REPORT.md` before overwriting it (see the report contract):
     - its passed scenarios are rerun, unless the operator excludes some;
     - its open issues are carried over; rerun the replication of each one marked `fixed externally, to verify`.
2. **Check the environment, read-only:**
   - The connection works.
   - trm-server and trm-rest are installed and their versions are known.
   - The TRM packages table is clean or known.
   - Transport targets and layers, and installed languages (for translations).
   - Whether customizing changes are allowed in the client.
   - The state of `/ABAPGIT/` and `/AWSSAMP/` in the namespace table .
   - The registry answers, with the e2e token.
3. **Note gaps of the system itself** (e.g. missing customizing that breaks ADT) and how you work around them. They
   go in the report's environment section, never in the open issues.

## 2. Plan the scenarios
- **Spend little on simple cases:** one or two smoke scenarios (publish, install, delete) are enough. Focus on what is
  most likely to break:
  - upgrades that remove objects and keep table data;
  - rollbacks after failures at each stage;
  - customizing and translations;
  - local `.trm` files;
  - dependency graphs;
  - delete edge cases (dependants, dirty packages, nested TRM packages);
  - namespaces and renames into `$`/`Z`/`/ABAPGIT/`/`/AWSSAMP/` targets;
  - engines and SAP entries;
  - interrupted runs and action locks.
- **Write the plan down:** for each scenario, the goal, the fixture, the steps and the expected result. Keep the order
  flexible: when a fix changes behaviour, rerun the affected scenario before moving on.

## 3. Build fixtures: the single-system pattern
On one system, the publisher and the installer are the same system:
1. **Develop:** create the source objects in `ZE2E_*` (or `/ABAPGIT/E2E_*`/`/AWSSAMP/E2E_*`) packages on a request, then release it.
   Use arc-1, or WebGUI for what ADT can't create (see [SAP_TOOLING.md](SAP_TOOLING.md)). Create translations
   in the translation environment (SE63/LXE): the LANG transport only picks them up from there.
2. **Publish the versions:** publish v1, change the objects, publish v2, and so on, back to back.
3. **Clean the dev copy:** publishing records the package as installed on the system, so an install would say
   "already installed". Delete the dev copy with the trm-core `deletePackage` action, or delete the objects,
   packages and rows by hand.
4. **Test from the registry:** install, upgrade, downgrade and delete.

Publish limits: the registry may rate-limit publishes (e.g. a few per hour per user). Batch the publishes of a scenario
and plan around the limit. A 429 only arrives at the final registry call, after the SAP-side work.

## 4. Run
- **One spec per step:** answer each prompt deliberately, and read every prompt and message as a user would. A UX
  defect stops the run like any other failure: fix it now, don't note it for later.
- **Gather evidence after every step**, on the SAP side (SQL through arc-1, logs through `tool.sh`):
  - **Objects and packages:** TADIR/TDEVC, including the package transport layer and the superpackage.
  - **Transports:** E070/E071/E071K of the landscape and deletion transports (TRM comment rows `* ZTRM name=/version=`),
    and the TMS import queue of the target.
  - **TRM data:** the packages table row, install mappings and install transports (`tool.sh record`).
  - **Data:** retained table rows, customizing rows, translations.
  - **Locks:** action locks (`tool.sh locks`) and SAP object locks (modifiable requests).
  - **Namespaces:** namespace rows, when namespaces are involved.
  - **Import logs:** `tool.sh log` of the main import, dictionary and post-import steps, when something looks off.
- **Before calling a result a bug,** rule out the known false alarms:
  - **Buffered tables:** TADIR is single-record buffered and TRNSPACE is fully buffered. Right after a tp/R3trans
    import, freestyle SQL and some server reads (e.g. `TRINT_SELECT_OBJECTS`) can still list deleted rows. Query again
    after a short wait and compare with the import log.
  - **Answer format:** a prompt answered in the wrong format arrives as `undefined` (see HARNESS.md).
  - **Open requests:** an object still in a modifiable request is locked. Release fixture requests before running
    actions on their objects.
  - **Own edits:** your own interventions during a run (e.g. creating a namespace while an install runs) can cause
    failures. Never change the system while an action runs, unless that's the test.

## 5. Fix loop
When a run shows a defect or a UX defect (see [Classifying findings](REPORT_CONTRACT.md#classifying-findings)):
1. **Stop** after that run. Leave the system as it is and find the root cause from the logs and the SAP evidence.
2. **Choose where to fix it:** in trm-core, or in trm-server/trm-rest when the cause is there. Registry backend
   defects are only reported (see Ground rules).
3. **Prefer fixing the failing path to restricting the feature.**
   - TRM writes TADIR at a low level, so states that SAP refuses for manual edits are legitimate. Example: objects of a
     custom namespace in a `$` package. Make the operation that breaks handle them: a temporary namespace import, a
     server fallback.
   - Don't add a validation that refuses the use case.
4. **Follow the repository rules (`AGENTS.md`):**
   - Update the failure-injection and rollback tests of any action that changes SAP data.
   - Keep revert paths best-effort: continue independent cleanups after a failure, restore only after a destructive
     cleanup succeeded, and surface the first failure at the end.
   - Run the affected tests, the full suite and the build.
5. **Respect what TRM can't do,** for example: only the import queue of the connected system can be changed. A
   transport queued on another system needs that system's credentials, so warn and ask the operator to remove it in
   STMS.
6. **Commit** on the branch under test, one commit per defect, with a message that explains the user-visible failure.
7. **Rerun** the scenario and confirm the fix on the system. When a fix is verified only by unit tests, say so in the
   scenario.

Repairs the campaign itself needs (a corrupted record, stale locks, a namespace to restore) are done with the
connector (`tool.sh`, scratch probes) or SAP tools. They are not fixes.

## 6. Report
Write the report as described in [REPORT_CONTRACT.md](REPORT_CONTRACT.md):
- in the repository root as `E2E_REPORT.md` (git-ignored, never committed);
- updated after each scenario, not at the end.
