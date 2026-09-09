import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { Transport } from "../../transport";
import { SystemConnector } from "../../systemConnector";

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
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Landscape) `;
        try {
            if (originalLPrefix) {
                Logger.setPrefix(`${originalLPrefix}-> ${prefix}`);
            } else {
                Logger.setPrefix(prefix);
            }
            if (originalIPrefix) {
                Inquirer.setPrefix(`${originalIPrefix}-> ${prefix}`);
            } else {
                Inquirer.setPrefix(prefix);
            }

            //1- add upgrade transport to target transport queue
            //if previous package was temporary, don't add deletion entries
            const noDeletions = context.runtime.update && normalize(context.runtime.update.getDevclass() || '').startsWith('$');
            if(context.revert.dele && !noDeletions){
                await SystemConnector.forwardTransport(context.revert.dele.trkorr, context.rawInput.installData.landscapeTransport.targetSystem, SystemConnector.getDest(), true);
                context.revert.deleInTargetTms = true;
            }

            //2- release
            Logger.loading(`Releasing...`);
            await context.output.transport.release(true, false, context.rawInput.contextData.logTemporaryFolder);
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if(context.revert.deleInTargetTms){
            await SystemConnector.deleteTmsTransport(context.revert.dele.trkorr, context.rawInput.installData.landscapeTransport.targetSystem);
        }
        if (await context.output.transport.canBeDeleted()) {
            await context.output.transport.delete();
            context.output.transport = undefined;
        }
    }
}
