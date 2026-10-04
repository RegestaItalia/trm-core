import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { forwardDeletionTransport, isDeletionForwardable, revertForwardedDeletionTransport, withScopedPrefix } from "../commons/utils";

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
        try {
            if (await context.output.transport.canBeDeleted()) {
                await context.output.transport.delete();
                context.output.transport = undefined;
            }
        } catch (error) {
            firstError ||= error;
        }
        if (firstError) {
            throw firstError;
        }
    }
}
