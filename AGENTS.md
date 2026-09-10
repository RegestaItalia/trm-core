# Agent guidance

When adding, editing, renaming, or removing a public `SystemConnector` API,
follow [the SystemConnector API maintenance workflow](docs/development/system-connector-api.md).

When changing an action that creates, deletes, or modifies SAP-system data, update
the action's failure-injection and rollback tests in the same change. The revert
path must make a best-effort cleanup: continue attempting independent cleanup
operations after one fails, restore prior state only after destructive cleanup
succeeds, and surface the first failure after the cleanup pass. Run the affected
tests and the full test suite, then run the TypeScript build before completing the
change.
