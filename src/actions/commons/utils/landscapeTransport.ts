import { Logger } from "trm-commons";
import { SystemConnector } from "../../../systemConnector";
import { Transport } from "../../../transport";
import { removeFromImportQueue } from "./packageCleanup";

/** Rollback state of a landscape transport release. */
export type LandscapeReleaseRevert = {
    revert?: {
        /** Set before the landscape transport is released, as SAP may export it and still fail. */
        landscapeReleaseStarted?: boolean,
        /** Set once the landscape transport release succeeded. */
        landscapeReleased?: boolean
    }
};

/**
 * Releases a landscape transport to its target. Deleted objects are exported as deletions, with a
 * warning (return code 4). A failed release doesn't fail the action, which is complete on this system:
 * the transport is left to release (or check) manually.
 */
export async function releaseLandscape(context: LandscapeReleaseRevert, transport: Transport, targetSystem: string, completedMessage: string, logTemporaryFolder?: string): Promise<void> {
    Logger.loading(`Releasing...`);
    // Mark before the release: SAP may export the transport and still fail.
    context.revert.landscapeReleaseStarted = true;
    try {
        await transport.release(true, false, logTemporaryFolder);
        context.revert.landscapeReleased = true;
    } catch (error) {
        Logger.error(`Release of landscape transport ${transport.trkorr} failed: ${error instanceof Error ? error.message : String(error)}`, { important: true });
        Logger.warning(`${completedMessage} ${SystemConnector.getDest()}. Release transport ${transport.trkorr} to ${targetSystem} manually (SE09), or check it in STMS if it was released.`, { important: true });
    }
}

/** Rolls back a landscape transport: deleted while possible, otherwise taken out of the target queue when it's the connected system. */
export async function revertLandscapeRelease(context: LandscapeReleaseRevert, transport: Transport | undefined, targetSystem: string): Promise<void> {
    if (!transport) {
        return;
    }
    try {
        if (await transport.canBeDeleted()) {
            await transport.delete();
        } else if (context.revert.landscapeReleaseStarted) {
            // A released transport can't be deleted: take it out of the target import queue instead.
            await removeFromImportQueue(transport.trkorr, targetSystem, `Released landscape transport`);
        }
    } catch (error) {
        if (context.revert.landscapeReleaseStarted) {
            Logger.warning(`Released landscape transport ${transport.trkorr} may be in the ${targetSystem} import queue: check it in STMS.`, { important: true });
        }
        throw error;
    }
}
