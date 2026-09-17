# Action audit maintenance

Write every new actions audit directly in `audits/actions/README.md`. Update its audit date, workflow index, active findings, severity counts, and highest-priority remediation list in place. Do not create a separate dated audit report. Keep existing workflow reports as historical step reviews and finding records.

When a code change resolves an active finding in one of these action audit reports:

1. Move the finding from the README or report's active **Findings** section to **Resolved findings** and mark
   its heading `Resolved`. Do not remove its identifier or history.
2. Update the affected step-review entry so it describes the corrected behavior.
3. Update `README.md` in this directory in the same change: recalculate the workflow's open
   Critical, High, Medium, and Low counts, and update the highest-priority remediation list.
4. Count only active findings. Findings marked **Resolved** or **Non-relevant** must not be included
   in the README severity totals.
5. Before finishing, compare every README workflow row with active findings in both the README and
   its linked report so the aggregate cannot remain stale.
