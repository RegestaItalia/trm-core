import { Logger } from "trm-commons";
import { SystemConnector } from "../../../systemConnector";
import type { PackageCleanupRevert } from "./packageCleanup";

type Transportish = { trkorr: string } | undefined;

/** What an install or uninstall left on the system, logged when it ends. */
export type ActionSummary = {
    /** e.g. `pkg 1.0.0 → 2.0.0 installed` or `pkg 1.0.0 uninstall failed, rolled back`. */
    outcome: string,
    imported?: Transportish[],
    deletions?: Transportish[],
    landscape?: { transport?: Transportish, targetSystem?: string, released?: boolean },
    revert?: PackageCleanupRevert
};

function list(transports: Transportish[] = []): string {
    return transports.filter(Boolean).map(transport => transport.trkorr).join(', ');
}

/**
 * Logs a final summary of an action: outcome, transports imported and deleted on the connected system,
 * the landscape transport, and the backups kept in the import queue for recovery.
 */
export function logActionSummary(summary: ActionSummary): void {
    const lines = [summary.outcome];
    const imported = list(summary.imported);
    if (imported) {
        lines.push(`Imported on ${SystemConnector.getDest()}: ${imported}`);
    }
    const deletions = list(summary.deletions);
    if (deletions) {
        lines.push(`Deletions imported on ${SystemConnector.getDest()}: ${deletions}`);
    }
    const backups = list([summary.revert?.backup?.tadir?.transport, summary.revert?.backup?.cust?.transport]);
    if (backups) {
        lines.push(`Backups kept in the ${SystemConnector.getDest()} import queue for recovery: ${backups}`);
    }
    const landscape = summary.landscape?.transport;
    if (landscape) {
        lines.push(`Landscape transport ${landscape.trkorr} to ${summary.landscape.targetSystem}${summary.landscape.released ? '' : ' (not released)'}`);
    }
    try {
        Logger.info(lines.join('\n'));
    } catch {
        // a summary never changes the result of the action
    }
}

/**
 * How a failed action left the system: `, rolled back` when something was changed and the rollback succeeded,
 * `, rollback incomplete` when a rollback step failed too (see ActionWorkflowRevertError), nothing otherwise
 * (no change, or a change that is never rolled back).
 */
export function failureState(changed: boolean | undefined, error: unknown): string {
    if ((error as any)?.name === 'ActionWorkflowRevertError') {
        return ', rollback incomplete: check the system before retrying';
    }
    return changed ? ', rolled back' : '';
}
