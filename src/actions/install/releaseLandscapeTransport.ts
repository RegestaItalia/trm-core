import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { TrmTransportIdentifier } from "../../transport";
import { Manifest } from "../../manifest";
import chalk from "chalk";

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
        //1- release
        await context.output.transport.release(true, false, context.rawInput.contextData.logTemporaryFolder);
    }
}
