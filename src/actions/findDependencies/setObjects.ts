import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Set ABAP package objects
 * 
 * 1- set ignored DEVC objects
 * 
 * 2- set tadir objects
 * 
 * 3- size acknowledgement
 * 
*/
export const setObjects: Step<FindDependenciesWorkflowContext> = {
    name: 'set-objects',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Set objects step', true);

        Logger.loading(`Reading package data...`);

        //1- set DEVC objects
        const aDevclass = [context.rawInput.packageData.package].concat((await SystemConnector.getSubpackages(context.rawInput.packageData.package)).map(o => o.devclass));
        context.runtime.packageData.ignoredTadir = context.runtime.packageData.ignoredTadir.concat(aDevclass.map(devclass => {
            return {
                pgmid: 'R3TR',
                object: 'DEVC',
                objName: devclass,
                devclass
            };
        }));

        //2- set tadir objects
        if (context.rawInput.packageData.objects === undefined) {
            context.rawInput.packageData.objects = await SystemConnector.getDevclassObjects(context.rawInput.packageData.package, true);
        }

        //3- size acknowledgement
        const totalSize = context.rawInput.packageData.objects.length - context.runtime.packageData.ignoredTadir.length;
        Logger.log(`Objects to analyze: ${totalSize}`, true);
        if (totalSize >= 50) {
            const sMsg = `A total of ${totalSize} objects will be analyzed in order to automatically find dependencies, and it may take a long time.`;
            if (!context.rawInput.contextData.noInquirer) {
                context.runtime.abort = !(await Inquirer.prompt({
                    type: 'confirm',
                    name: 'continue',
                    default: true,
                    message: `${sMsg} Continue?`
                })).continue;
            } else {
                Logger.warning(sMsg);
            }
        }
    }
}