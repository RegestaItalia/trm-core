import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { forwardDeletionTransport, isDeletionForwardable, removeFromImportQueue, revertForwardedDeletionTransport, withScopedPrefix } from "../commons/utils";

/**
 * Workflow step that releases the generated landscape transport, when present.
 *
 * 1- add upgrade transport to target transport queue
 *
 * 2- release
 *
*/
export const releaseLandscapeTransport: Step<InstallWorkflowContext> = {
    name: 'release-install-transports',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.output.transport) {
            return true;
        } else {
            Logger.log(`Skipping release of landscape transport (transport was not generated)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        await withScopedPrefix(`(${Transport.getTransportIcon()}  Landscape) `, async () => {
            //1- add upgrade transport to target transport queue
            //if previous package was temporary, don't add deletion entries
            if (isDeletionForwardable(context)) {
                await forwardDeletionTransport(context, context.rawInput.installData.landscapeTransport.targetSystem);
            }

            //2- release
            Logger.loading(`Releasing...`);
            // Mark before the release: SAP may export the transport and still fail.
            context.revert.landscapeReleaseStarted = true;
            await context.output.transport.release(true, false, context.rawInput.contextData.logTemporaryFolder);
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        let firstError: unknown;
        try {
            await revertForwardedDeletionTransport(context, context.rawInput.installData.landscapeTransport.targetSystem);
        } catch (error) {
            firstError = error;
        }
        const transport = context.output.transport;
        const targetSystem = context.rawInput.installData.landscapeTransport.targetSystem;
        try {
            if (await transport.canBeDeleted()) {
                await transport.delete();
                context.output.transport = undefined;
            } else if (context.revert.landscapeReleaseStarted) {
                // A released transport can't be deleted: take it out of the target import queue instead.
                await removeFromImportQueue(transport.trkorr, targetSystem, `Released landscape transport`);
            }
        } catch (error) {
            firstError ||= error;
            if (context.revert.landscapeReleaseStarted) {
                Logger.warning(`Released landscape transport ${transport.trkorr} may be in the ${targetSystem} import queue: check it in STMS.`, { important: true });
            }
        }
        if (firstError) {
            throw firstError;
        }
    }
}
