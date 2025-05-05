import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";

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
            if (context.runtime.packageTransports.cust.binaries) {
                return true;
            } else {
                Logger.log(`Skipping import CUST transport (no transports in package)`, true);
                return false;
            }
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import CUST Transport step', true);

        Logger.loading(`Importing...`);
        const importTimeout = context.rawInput.installData.import.timeout;

        //1- upload transport into system
        Logger.loading(`Uploading ${context.runtime.packageTransports.cust.binaries.trkorr}`, true);
        context.runtime.packageTransports.cust.instance = await Transport.upload({
            binary: context.runtime.packageTransports.cust.binaries.binaries,
            trTarget: SystemConnector.getDest(),
            r3transOption: context.rawInput.contextData.r3transOptions
        });

        //2 - delete from tms buffer (if it exists)
        await context.runtime.packageTransports.cust.instance.deleteFromTms(SystemConnector.getDest());

        //3- import transport into system
        Logger.loading(`Importing ${context.runtime.packageTransports.cust.binaries.trkorr}`, true);
        await context.runtime.packageTransports.cust.instance.import(importTimeout);
        Logger.success(`Transport ${context.runtime.packageTransports.cust.binaries.trkorr} imported`, true);

    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Rollback CUST Transport step', true);

        Logger.warning(`Customizing transport ${context.runtime.packageTransports.cust.binaries.trkorr} can't be reverted.`);
    }
}