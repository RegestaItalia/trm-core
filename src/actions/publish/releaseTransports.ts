import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";

/**
 * Release transports
 * 
 * 1- release
 * 
*/
export const releaseTransports: Step<PublishWorkflowContext> = {
    name: 'release-transport',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Release transports step', true);

        //1- release
        const tmpFolder = context.rawInput.contextData.logTemporaryFolder;
        const releaseTimeout = context.rawInput.systemData.releaseTimeout;
        context.runtime.systemData.releasedTransports.push(context.runtime.systemData.tadirTransport);
        if(context.runtime.systemData.langTransport){
            context.runtime.systemData.releasedTransports.push(context.runtime.systemData.langTransport);
        }
        if(context.runtime.systemData.custTransport){
            context.runtime.systemData.releasedTransports.push(context.runtime.systemData.custTransport);
        }
        context.runtime.systemData.releasedTransports.push(context.runtime.systemData.devcTransport);
        var counter = 0;
        for(const transport of context.runtime.systemData.releasedTransports){
            counter++;
            const prefix = `(${counter}/${context.runtime.systemData.releasedTransports.length}) `;
            Logger.setPrefix(prefix);
            Inquirer.setPrefix(prefix);
            Logger.log(`Ready to release transport ${transport.trkorr}, ${transport.trmIdentifier}`, true);
            Logger.loading(`Releasing transport...`);
            await transport.release(false, releaseTimeout ? true : false, tmpFolder, releaseTimeout);
            Logger.removePrefix();
            Inquirer.removePrefix();
        }
    }
}