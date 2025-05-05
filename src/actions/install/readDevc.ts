import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { getPackageHierarchy, normalize } from "../../commons";

/**
 * Read DEVC Transport data. A TRM must have atleast one DEVC object in DEVC transport.
 * 
 * 1- read TDEVC
 * 
 * 2- set original hierarchy
 * 
 * 3- read TDEVCT
 * 
*/
export const readDevc: Step<InstallWorkflowContext> = {
    name: 'read-devc',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Read DEVC step', true);

        Logger.loading(`Checking package transports...`);

        //1- read TDEVC
        context.runtime.packageTransportsData.tdevc = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.devc.binaries.binaries.data, 'TDEVC'));
        if (context.runtime.packageTransportsData.tdevc.length === 0) {
            throw new Error(`Package has no devclass.`);
        }
        Logger.log(`DEVC TDEVC: ${JSON.stringify(context.runtime.packageTransportsData.tdevc)}`, true);

        //2- set original hierarchy
        context.runtime.originalData.hierarchy = getPackageHierarchy(context.runtime.packageTransportsData.tdevc);

        //3- read TDEVCT
        context.runtime.packageTransportsData.tdevct = normalize(await context.runtime.r3trans.getTableEntries(context.runtime.packageTransports.devc.binaries.binaries.data, 'TDEVCT'));
        Logger.log(`DEVC TDEVCT: ${JSON.stringify(context.runtime.packageTransportsData.tdevct)}`, true);
    }
}