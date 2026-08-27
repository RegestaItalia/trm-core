import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger, inspect } from "trm-commons";
import { checkSapEntries as CheckSapEntriesWkf, CheckSapEntriesActionInput } from "../checkSapEntries";

const SUBWORKFLOW_NAME = 'check-sap-entries-sub-install';

/**
 * Workflow step that blocks installation when required SAP table entries are missing.
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
        //1- execute check sap entries workflow
        const inputData: CheckSapEntriesActionInput = {
            packageData: {
                manifest: context.runtime.package.data.manifest
            },
            printOptions: {
                entriesStatus: false,
                information: false
            }
        };
        Logger.loading(`Checking system requirements...`);
        const result = await CheckSapEntriesWkf(inputData);

        //2- check result
        const sapEntriesOutput = result.sapEntriesStatus;
        var missingEntries: any[] = [];
        Object.keys(sapEntriesOutput).forEach(t => {
            missingEntries = missingEntries.concat(sapEntriesOutput[t].filter(o => !o.status));
        });
        if(missingEntries.length > 0){
            Logger.error(JSON.stringify(missingEntries), true);
            if(missingEntries.length === 1){
                throw new Error(`Install aborted. ${missingEntries.length} system requirement is not met!`);
            }else{
                throw new Error(`Install aborted. ${missingEntries.length} system requirements are not met!`);
            }
        }else{
            Logger.success(`SAP entries checked.`);
        }
    }
}
