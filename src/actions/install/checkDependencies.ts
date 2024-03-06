import { Step } from "@sammarks/workflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { CheckSapEntriesActionInput, checkSapEntries as checkSapEntriesWkf } from "../checkSapEntries";
import { inspect } from "util";

const SUBWORKFLOW_NAME = 'check-sap-entries-sub-install';

export const checkDependencies: Step<InstallWorkflowContext> = {
    name: 'check-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!context.parsedInput.checkDependencies){
            Logger.log(`Skipping dependencies check (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        
    }
}