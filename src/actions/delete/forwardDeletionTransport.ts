import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import {
    forwardDeletionTransport as forward,
    isDeletionForwardable,
    revertForwardedDeletionTransport,
    withScopedPrefix
} from "../commons/utils";

/**
 * Workflow step that adds the deletion transport to the landscape target import queue,
 * so the package is deleted from the following systems too.
 *
 * It's the same forward performed by install when upgrading a package (see `releaseLandscapeTransport`).
 *
*/
export const forwardDeletionTransport: Step<DeleteWorkflowContext> = {
    name: 'forward-deletion-transport',
    filter: async (context: DeleteWorkflowContext): Promise<boolean> => {
        if (!context.rawInput.deleteData.landscapeTransport.targetSystem) {
            Logger.log(`Skipping forward of deletion transport (system has no transport targets)`, true);
            return false;
        } else if (!isDeletionForwardable(context)) {
            Logger.log(`Skipping forward of deletion transport (package is temporary)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: DeleteWorkflowContext): Promise<void> => {
        const targetSystem = context.rawInput.deleteData.landscapeTransport.targetSystem;
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Landscape) `, async () => {
            Logger.loading(`Forwarding ${context.revert.dele.trkorr} to ${targetSystem}...`);
            await forward(context, targetSystem);
            context.output.targetSystem = targetSystem;
            Logger.success(`Transport ${context.revert.dele.trkorr} added to ${targetSystem} import queue`, true);
        });
    },
    revert: async (context: DeleteWorkflowContext): Promise<void> => {
        await revertForwardedDeletionTransport(context, context.rawInput.deleteData.landscapeTransport.targetSystem);
        context.output.targetSystem = undefined;
    }
}
