import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { stopWarning } from "../stopWarning";
import { Transport } from "../../transport";
import { restoreTransport } from "./restoreTransport";

/**
 * Workflow step that creates a transport for objects removed by an upgrade.
 * It's necessary when:
 *   - upgrading/downgrading a package: to ensure old entries are cleaned up
 *   - sap packages were changes after upgrade/downgrade: to ensure empty packages are cleaned up
 * For these reasons, it's not generated on first install.
 * 
*/
export const generateDeletionTransport: Step<InstallWorkflowContext> = {
    name: 'generate-deletion-transport',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.runtime.isLocal){
            Logger.log(`Skipping generate deletion transport (local registry)`, true);
            return false;
        }else if (context.runtime.update) {
            return true;
        } else {
            Logger.log(`Skipping generate deletion transport (first install?)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }

        //1- generate dummy transport
        Logger.loading(`Generating deletion transport...`);
        const dummy = await Transport.createToc({
            text: `@X1@TRM (DELE) ${context.rawInput.packageData.name} ${context.runtime.package.data.manifest.version}`,
            target: SystemConnector.getDest()
        });
        if (context.runtime.update) {
            for(const linkedTransport of context.runtime.update.manifest.getLinkedTransports()){
                await dummy.addObjectsFromTransport(linkedTransport.trkorr);
            }
        }
        //if sap packages changes...
        //TODO: we should make an example to understand how to catch this and handle it

        await dummy.release(false, true);
        const tocBinaries = (await dummy.download()).binaries;
        //saving dummy binaries for a possible revert
        context.revert.dele = {
            trkorr: dummy.trkorr,
            entries: undefined,
            binaries: tocBinaries
        };
        const deleBinaries = await context.rawInput.packageData.registry.delete(tocBinaries);
        
        //2- upload transport binaries
        Logger.loading(`Uploading deletion transport...`);
        context.runtime.dele = await Transport.upload(dummy.trkorr, {
            binary: deleBinaries,
            trTarget: SystemConnector.getDest()
        });
        
        //3- import transport
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Deletion) `;
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
            Logger.loading(`Importing ${dummy.trkorr}`, true);
            await context.runtime.dele.import();
            Logger.success(`Transport ${dummy.trkorr} imported`, true);
        } finally {
            Logger.setPrefix(originalLPrefix);
            Inquirer.setPrefix(originalIPrefix);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if (context.revert.dele) {
            await restoreTransport(context.revert.dele);
        }
    } 
}
