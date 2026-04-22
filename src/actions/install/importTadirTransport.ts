import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Inquirer, Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { Transport } from "../../transport";
import _ from 'lodash';
import { stopWarning } from "../stopWarning";

/**
 * Import TADIR Transport.
 * 
 * 1- upload transport into system
 * 
 * 2 - delete from tms buffer (if it exists)
 * 
 * 3- import transport into system
 * 
 * 4- run tadir interface (package replacement)
 * 
*/
export const importTadirTransport: Step<InstallWorkflowContext> = {
    name: 'import-tadir-transport',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Import TADIR Transport step', true);

        Logger.loading(`Importing ${context.rawInput.packageData.name}...`);

        //1- upload transport into system
        Logger.loading(`Uploading ${context.runtime.packageTransports.tadir.binaries.trkorr}`, true);
        if (!context.runtime.stopWarningShown) {
            context.runtime.stopWarningShown = true;
            stopWarning('install');
        }
        context.runtime.packageTransports.tadir.instance = await Transport.upload(
            context.runtime.packageTransports.tadir.binaries.trkorr, {
                binary: context.runtime.packageTransports.tadir.binaries.binaries,
                trTarget: SystemConnector.getDest()
        });

        //2 - delete from tms buffer (if it exists)
        await context.runtime.packageTransports.tadir.instance.deleteFromTms(SystemConnector.getDest());

        //3- import transport into system
        const originalLPrefix = Logger.getPrefix();
        const originalIPrefix = Inquirer.getPrefix();
        const prefix = `(${Transport.getTransportIcon()}  Workbench) `;
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
        Logger.loading(`Importing ${context.runtime.packageTransports.tadir.binaries.trkorr}`, true);
        await context.runtime.packageTransports.tadir.instance.import();
        Logger.success(`Transport ${context.runtime.packageTransports.tadir.binaries.trkorr} imported`, true);
        Logger.setPrefix(originalLPrefix);
        Inquirer.setPrefix(originalIPrefix);

        Logger.loading(`Finalizing import...`);

        //4- run tadir interface (package replacement)
        for (const tadir of context.runtime.packageTransportsData.tadir) {
            var object = _.cloneDeep(tadir);
            if (!context.rawInput.installData.installDevclass.keepOriginal) {
                const replacementDevclass = context.rawInput.installData.installDevclass.replacements.find(o => o.originalDevclass === tadir.devclass);
                if (replacementDevclass && replacementDevclass.installDevclass) {
                    object.devclass = replacementDevclass.installDevclass;
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

        //TODO: if at this point the import is done no revert is possible 
    }
}