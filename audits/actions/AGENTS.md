# Action audit maintenance

When a code change resolves an active finding in one of these action audit reports:

1. Move the finding from the report's active **Findings** section to **Resolved findings** and mark
   its heading `Resolved`. Do not remove its identifier or history.
2. Update the affected step-review entry so it describes the corrected behavior.
3. Update `README.md` in this directory in the same change: recalculate the workflow's open
   Critical, High, Medium, and Low counts, and update the highest-priority remediation list.
4. Count only active findings. Findings marked **Resolved** or **Non-relevant** must not be included
   in the README severity totals.
5. Before finishing, compare every README workflow row with the active Findings section of its
   linked report so the aggregate cannot remain stale.
