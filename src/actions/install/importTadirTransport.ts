import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import _ from 'lodash';

/**
 * Import TADIR Transport.
 * 
 * 1- upload transport into system
 * 
 * 2- import transport into system
 * 
 * 3- run tadir interface (package replacement)
 * 
*/
export const importTadirTransport: Step<InstallWorkflowContext> = {
    name: 'import-tadir-transport',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import TADIR Transport step', true);

        Logger.loading(`Importing...`);
        const importTimeout = context.rawInput.installData.import.timeout;

        //1- upload transport into system
        Logger.loading(`Uploading ${context.runtime.packageTransports.tadir.binaries.trkorr}`, true);
        context.runtime.packageTransports.tadir.instance = await Transport.upload({
            binary: context.runtime.packageTransports.tadir.binaries.binaries,
            trTarget: SystemConnector.getDest(),
            r3transOption: context.rawInput.contextData.r3transOptions
        });

        //2- import transport into system
        Logger.loading(`Importing ${context.runtime.packageTransports.tadir.binaries.trkorr}`, true);
        await context.runtime.packageTransports.tadir.instance.import(importTimeout);
        Logger.success(`Transport ${context.runtime.packageTransports.tadir.binaries.trkorr} imported`, true);

        Logger.loading(`Finalizing import...`);

        //3- run tadir interface (package replacement)
        for (const tadir of context.runtime.packageTransportsData.tadir) {
            var object = _.cloneDeep(tadir);
            if (!context.rawInput.installData.installDevclass.keepOriginal) {
                const replacementDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === tadir.devclass);
                if (replacementDevclass && replacementDevclass.installDevclass) {
                    object.devclass = replacementDevclass.installDevclass;;
                } else {
                    Logger.error(`Replacement ABAP package not found for ${tadir.devclass}!`, true);
                }
            }
            object.srcsystem = 'TRM';
            Logger.log(`Running TADIR interface for object ${object.pgmid} ${object.object} ${object.objName}, devclass ${tadir.devclass} -> ${object.devclass}, src system ${tadir.srcsystem} -> ${object.srcsystem}`, true);
            await SystemConnector.tadirInterface(object);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Rollback TADIR Transport step', true);

        Logger.loading(`Rollback...`);
        Logger.loading(`Rollback transport ${context.runtime.packageTransports.tadir.binaries.trkorr}...`, true);

        try {
            await SystemConnector.addSkipTrkorr(context.runtime.packageTransports.tadir.binaries.trkorr);
            Logger.success(`Rollback transport ${context.runtime.packageTransports.tadir.binaries.trkorr} done`, true);
        } catch (e) {
            Logger.info(`Unable to rollback transport ${context.runtime.packageTransports.tadir.binaries.trkorr}`);
            Logger.error(e.toString(), true);
        }
    }
}