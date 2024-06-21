import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";

export const importCustTransport: Step<InstallWorkflowContext> = {
    name: 'import-cust-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.custTransport) {
            if(context.parsedInput.skipCustImport){
                Logger.log(`Skip import CUST transport (input)`, true);
                return false;
            }else{
                return true;
            }
        } else {
            Logger.log(`Skip import CUST transport (no transport data in package)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const importTimeout = context.parsedInput.importTimeout;
        const transportData = context.runtime.custTransport;
        const target = SystemConnector.getDest();
        Logger.loading(`Importing transport to ${target}...`);
        const transport = await Transport.upload({
            binary: transportData.binaries,
            trTarget: target
        });
        await transport.import(importTimeout);
        //loader stopped in transport import
        context.runtime.trCopy.push(transportData.trkorr);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.error(`CUST transport ${context.runtime.langTransport} can't be removed.`);
    }
}