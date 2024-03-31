import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";

export const importTadirTransport: Step<InstallWorkflowContext> = {
    name: 'import-tadir-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.tadirTransport) {
            return true;
        } else {
            Logger.log(`Skip import TADIR transport (no transport data in package)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const importTimeout = context.parsedInput.importTimeout;
        const transportData = context.runtime.tadirTransport;
        const target = SystemConnector.getDest();
        Logger.loading(`Importing transport to ${target}...`);
        const transport = await Transport.upload({
            binary: transportData.binaries,
            trTarget: target
        });
        await transport.import(importTimeout);

        //for all tadir objects, run tadir interface with replacement devclass
        const aTadir = context.runtime.tadirData;
        const packageReplacements = context.runtime.packageReplacements;
        Logger.loading(`Finalizing TADIR import...`);
        for (const tadir of aTadir) {
            const replacementDevclass = packageReplacements.find(o => o.originalDevclass === tadir.devclass).installDevclass;
            if(replacementDevclass){
                var object = tadir;
                object.devclass = replacementDevclass;
                object.srcsystem = 'TRM';
                Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${tadir.devclass} -> ${object.devclass}, src system ${tadir.srcsystem} -> ${object.srcsystem}`, true);
                await SystemConnector.tadirInterface(object);
            }else{
                Logger.error(`Replacement devclass not found for ${tadir.devclass}!`, true);
            }
        }
        Logger.success(`TADIR import finished.`);
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.loading(`Rollback TADIR transport ${context.runtime.tadirTransport.trkorr}...`);
        try {
            await SystemConnector.addSkipTrkorr(context.runtime.tadirTransport.trkorr);
            //TODO abapgit delete?
            Logger.info(`Executed rollback on transport ${context.runtime.tadirTransport.trkorr}`);
        } catch (e) {
            Logger.info(`Unable to rollback transport ${context.runtime.tadirTransport.trkorr}`);
            Logger.error(e.toString(), true);
        }
    }
}