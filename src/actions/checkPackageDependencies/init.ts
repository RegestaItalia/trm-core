import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckPackageDependenciesWorkflowContext } from ".";
import { Logger } from "../../logger";

/**
 * Init
 * 
 * 1- set dependencies (read manifest)
 * 
*/
export const init: Step<CheckPackageDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: CheckPackageDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);

        context.output = {
            dependencies: [],
            dependencyStatus: []
        };
        context.runtime = {
            dependenciesStatus: {
                goodVersion: [],
                badVersion: [],
                goodIntegrity: [],
                badIntegrity: []
            }
        };

        //1- set dependencies (read manifest)
        if(context.rawInput.packageData.package.manifest){
            const manifest = context.rawInput.packageData.package.manifest.get();
            context.output.dependencies = manifest.dependencies || [];
        }

        //2- fill missing input data
        if(!context.rawInput.printOptions){
            context.rawInput.printOptions = {};
        }
    }
}