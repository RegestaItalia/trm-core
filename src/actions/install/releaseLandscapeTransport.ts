import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { SystemConnector } from "../../systemConnector";
import { withScopedPrefix } from "../commons/utils";

function normalize(value: string): string {
    return value.trim().toUpperCase();
}

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
            const noDeletions = context.runtime.update && normalize(context.runtime.update.getDevclass() || '').startsWith('$');
            if (context.revert.dele && !noDeletions) {
                // The queue may be changed even when the connector response fails.
                context.revert.deleInTargetTms = true;
                await SystemConnector.forwardTransport(context.revert.dele.trkorr, context.rawInput.installData.landscapeTransport.targetSystem, SystemConnector.getDest(), true);
            }

            //2- release
            Logger.loading(`Releasing...`);
            await context.output.transport.release(true, false, context.rawInput.contextData.logTemporaryFolder);
        });
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        let firstError: unknown;
        if (context.revert.deleInTargetTms) {
            try {
                await SystemConnector.deleteTmsTransport(context.revert.dele.trkorr, context.rawInput.installData.landscapeTransport.targetSystem);
            } catch (error) {
                firstError = error;
            }
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
