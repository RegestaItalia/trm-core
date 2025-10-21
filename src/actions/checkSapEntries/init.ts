import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "trm-commons";

/**
 * Init
 * 
 * 1- set sap entries  (read manifest)
 * 
 * 2- fill missing input data
 * 
*/
export const init: Step<CheckSapEntriesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);

        context.output = {
            sapEntries: {},
            sapEntriesStatus: {}
        };
        context.runtime = {
            entriesStatus: {
                bad: [],
                good: []
            },
            missingTables: []
        };
        
        //1- set sap entries
        context.output.sapEntries = context.rawInput.packageData.manifest.sapEntries || {};

        //2- fill missing input data
        if(!context.rawInput.printOptions){
            context.rawInput.printOptions = {};
        }
    }
}