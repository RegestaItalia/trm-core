import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { Transport } from "../../transport";

/**
 * Workflow step that releases the generated landscape transport, when present.
 * 
 * 1- release
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

            //1- release
            Logger.loading(`Releasing...`);
            await context.output.transport.release(true, false, context.rawInput.contextData.logTemporaryFolder);
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (await context.output.transport.canBeDeleted()) {
            await context.output.transport.delete();
            context.output.transport = undefined;
        }
    }
}
