import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependenciesWorkflowContext } from ".";
import { Logger } from "trm-commons";

/**
 * Workflow step that initializes dependency-check output and normalizes optional input.
 * 
 * 1- set dependencies (read manifest)
 * 
*/
export const init: Step<CheckPackageDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckPackageDependenciesWorkflowContext): Promise<void> => {
        context.output = {
            dependencies: [],
            dependencyStatus: []
        };
        context.runtime = {
            dependenciesStatus: {
                goodVersion: [],
                badVersion: []
            }
        };

        //1- set dependencies
        context.output.dependencies = context.rawInput.packageData.manifest.dependencies || [];

        //2- fill missing input data
        if(!context.rawInput.printOptions){
            context.rawInput.printOptions = {};
        }
        if(!context.rawInput.contextData){
            context.rawInput.contextData = {};
        }
    }
}
