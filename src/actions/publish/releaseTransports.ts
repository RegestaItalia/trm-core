import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { Transport } from "../../transport";

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
        context.runtime.systemData.releasedTransports.push(context.runtime.systemData.tadirTransport);
        if (context.runtime.systemData.langTransport) {
            context.runtime.systemData.releasedTransports.push(context.runtime.systemData.langTransport);
        }
        context.runtime.systemData.releasedTransports = context.runtime.systemData.releasedTransports.concat(context.runtime.systemData.custTransports);

        context.runtime.systemData.releasedTransports.push(context.runtime.systemData.devcTransport);
        var counter = 0;
        for (var transport of context.runtime.systemData.releasedTransports) {
            counter++;
            const prefix = `(${counter}/${context.runtime.systemData.releasedTransports.length}) `;
            Logger.setPrefix(prefix);
            Inquirer.setPrefix(prefix);
            await transport.addComment(`name=${context.rawInput.packageData.name}`);
            await transport.addComment(`version=${context.rawInput.packageData.version}`);
            await transport.setDocumentation(context.runtime.trmPackage.manifestXml);
            Logger.log(`Ready to release transport ${transport.trkorr}, ${transport.trmIdentifier}`, true);
            Logger.loading(`${Transport.getTransportIcon()}  Releasing transport...`);
            await transport.release(false, false, tmpFolder);
            Logger.removePrefix();
            Inquirer.removePrefix();
        }
    }
}