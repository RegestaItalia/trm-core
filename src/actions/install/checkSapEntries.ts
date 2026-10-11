import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { checkSapEntries as CheckSapEntriesWkf, CheckSapEntriesActionInput } from "../checkSapEntries";

/**
 * Workflow step that checks the required SAP table entries: missing ones block the installation
 * in check-engines, together with the unmet engines.
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
        const missingEntries = Object.entries(sapEntriesOutput).flatMap(([table, entries]) => entries.filter(o => !o.status).map(o => ({ table, entry: o.entry })));
        if(missingEntries.length > 0){
            missingEntries.forEach(o => {
                const fields = Object.entries(o.entry).map(([field, value]) => `${field} = ${value}`).join(', ');
                Logger.error(`Required entry not found in table ${o.table}: ${fields}`, { important: true });
            });
            // Aborted by check-engines, so unmet engines are reported in the same run.
            context.runtime.missingSapEntries = missingEntries.length;
        }else{
            Logger.success(`SAP entries checked.`);
        }
    }
}
