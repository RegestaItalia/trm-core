import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";

export const importLangTransport: Step<InstallWorkflowContext> = {
    name: 'import-lang-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.langTransport) {
            if(context.parsedInput.skipLangImport){
                Logger.log(`Skip import LANG transport (input)`, true);
                return false;
            }else{
                return true;
            }
        } else {
            Logger.log(`Skip import LANG transport (no transport data in package)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const importTimeout = context.parsedInput.importTimeout;
        const transportData = context.runtime.langTransport;
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
        //TODO rollback lang transport?
    }
}