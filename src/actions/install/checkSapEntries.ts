import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, inspect } from "../../logger";
import { checkSapEntries as CheckSapEntriesWkf, CheckSapEntriesActionInput } from "../checkSapEntries";

const SUBWORKFLOW_NAME = 'check-sap-entries-sub-install';

/**
 * Check if package SAP entries are supported in target system
 * 
 * 1- execute check sap entries workflow
 * 
 * 2- check result
 * 
*/
export const checkSapEntries: Step<InstallWorkflowContext> = {
    name: 'check-sap-entries',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(context.rawInput.installData.checks.noSapEntries){
            Logger.log(`Skipping SAP entries check (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Check sap entries step', true);

        //1- execute check sap entries workflow
        const inputData: CheckSapEntriesActionInput = {
            packageData: {
                package: context.runtime.remotePackageData.trmPackage
            },
            printOptions: {
                entriesStatus: false,
                information: false
            }
        };
        Logger.loading(`Checking SAP entries...`);
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await CheckSapEntriesWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        
        //2- check result
        const sapEntriesOutput = result.sapEntriesStatus;
        var missingEntries: any[] = [];
        Object.keys(sapEntriesOutput).forEach(t => {
            missingEntries = missingEntries.concat(sapEntriesOutput[t].filter(o => !o.status));
        });
        if(missingEntries.length > 0){
            Logger.error(JSON.stringify(missingEntries), true);
            throw new Error(`Package requires ${missingEntries.length} SAP entries that don't exist on your system (run in verbose for more detail).`);
        }else{
            Logger.success(`SAP entries checked.`);
        }
    }
}