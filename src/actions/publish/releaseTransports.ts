import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { Transport } from "../../transport";

/**
 * Workflow step that annotates and releases every generated publish transport.
 * 
 * 1- release
 * 
*/
export const releaseTransports: Step<PublishWorkflowContext> = {
    name: 'release-transport',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        //1- release
        context.runtime.aggregatedTransports = [context.runtime.transports.tadir, context.runtime.transports.devc];
        if(context.runtime.transports.lang){
            context.runtime.aggregatedTransports.push(context.runtime.transports.lang);
        }
        context.runtime.aggregatedTransports = context.runtime.aggregatedTransports.concat(context.runtime.transports.cust);
        var counter = 0;
        for (var transport of context.runtime.aggregatedTransports) {
            counter++;
            const prefix = `(${counter}/${context.runtime.aggregatedTransports.length}) `;
            Logger.setPrefix(prefix);
            Inquirer.setPrefix(prefix);
            await transport.addComment(`name=${context.rawInput.packageData.name}`);
            await transport.addComment(`version=${context.rawInput.packageData.version}`);
            await transport.setDocumentation(context.runtime.manifestXml);
            Logger.log(`Ready to release transport ${transport.trkorr}, ${transport.trmIdentifier}`, true);
            Logger.loading(`${Transport.getTransportIcon()}  Releasing ${transport.trkorr}...`);
            await transport.release(false, false, context.rawInput.contextData.logTemporaryFolder);
            Logger.removePrefix();
            Inquirer.removePrefix();
        }
    }
}
