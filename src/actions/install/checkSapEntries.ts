import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { CheckSapEntriesActionInput, checkSapEntries as checkSapEntriesWkf } from "../checkSapEntries";
import { inspect } from "util";

const SUBWORKFLOW_NAME = 'check-sap-entries-sub-install';

export const checkSapEntries: Step<InstallWorkflowContext> = {
    name: 'check-sap-entries',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!context.parsedInput.checkSapEntries){
            Logger.log(`Skipping SAP entries check (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const trmPackage = context.runtime.trmPackage;
        const inputData: CheckSapEntriesActionInput = {
            trmPackage,
            printAll: false,
            printStatus: true,
            printOkEntries: false,
            printUnsafeEntries: false
        };
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await checkSapEntriesWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        const sapEntriesOutput = result.sapEntriesStatus;
        if(sapEntriesOutput){
            var missingEntries: any[] = [];
            Object.keys(sapEntriesOutput).forEach(t => {
                missingEntries = missingEntries.concat(sapEntriesOutput[t].filter(o => !o.status));
            });
            if(missingEntries.length > 0){
                throw new Error(`Package requires SAP entries that don't exist on your system.`);
            }
        }
    }
}