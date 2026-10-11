# Action audit maintenance

Record every finding, technical or functional, in the report of the workflow it belongs to
(`<workflow>.md`; reusable steps, callbacks, and helpers go in `shared.md`). Each report holds its
audit date, entry point, active **Findings**, current **Step review**, and the **Resolved** and
**Non-relevant** history. A new workflow gets its own report in the same format.

`README.md` only aggregates: update its audit date, workflow index (one row per report, linked),
severity counts, and highest-priority remediation list in place. Do not record findings or step
reviews in the README, and do not create separate dated audit reports. When a finding references
one held in another report, link to that report.

When a code change resolves an active finding in one of these action audit reports:

1. Move the finding from the report's active **Findings** section to **Resolved findings** and mark
   its heading `Resolved`. Do not remove its identifier or history.
2. Update the affected step-review entry so it describes the corrected behavior.
3. Update `README.md` in this directory in the same change: recalculate the workflow's open
   Critical, High, Medium, and Low counts, and update the highest-priority remediation list.
4. Count only active findings. Findings marked **Resolved** or **Non-relevant** must not be included
   in the README severity totals.
5. Before finishing, compare every README workflow row with active findings in its linked report so the aggregate cannot remain stale.
