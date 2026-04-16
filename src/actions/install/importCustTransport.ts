import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import { stopWarning } from "../stopWarning";
import { TransportBinary } from "../..";

/**
 * Import CUST Transport.
 * 
 * 1- upload transport into system
 * 
 * 2 - delete from tms buffer (if it exists)
 * 
 * 3- import transport into system
 * 
*/
export const importCustTransport: Step<InstallWorkflowContext> = {
    name: 'import-cust-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.import.noCust) {
            Logger.log(`Skipping import CUST transport (user input)`, true);
            return false;
        } else {
            if (context.runtime.packageTransports.cust.length > 0) {
                return true;
            } else {
                Logger.log(`Skipping import CUST transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import CUST Transport step', true);

        //1- upload transports into system
        for (var transport of context.runtime.packageTransports.cust){
            Logger.loading(`Importing ${context.rawInput.packageData.name} customizing...`);
            Logger.loading(`Uploading ${transport.binaries.trkorr}`, true);
            if (!context.runtime.stopWarningShown) {
                context.runtime.stopWarningShown = true;
                stopWarning('install');
            }
            transport.instance = await Transport.upload({
                binary: transport.binaries.binaries,
                trTarget: SystemConnector.getDest(),
                r3transOption: context.rawInput.contextData.r3transOptions
            });

            //2 - delete from tms buffer (if it exists)
            await transport.instance.deleteFromTms(SystemConnector.getDest());

            //3- import transport into system
            const originalLPrefix = Logger.getPrefix();
            const originalIPrefix = Inquirer.getPrefix();
            const prefix = `(${Transport.getTransportIcon()}  Customizing) `;
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
            Logger.loading(`Importing ${transport.binaries.trkorr}`, true);
            await transport.instance.import();
            Logger.success(`Transport ${transport.binaries.trkorr} imported`, true);
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Rollback CUST Transport step', true);
        //TODO
        //Logger.warning(`Customizing transport ${context.runtime.packageTransports.cust.binaries.trkorr} can't be reverted.`);
    }
}