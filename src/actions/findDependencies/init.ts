import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { validateDevclass } from "../../validators";

/**
 * Init
 * 
 * 1- validate package name
 * 
 * 2- set runtime variables
 * 
 * 3- fill missing input data
 * 
*/
export const init: Step<FindDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Init step', true);

        //1- validate package name
        const devclassValid = await validateDevclass(context.rawInput.packageData.package, true);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        //2- set runtime variables
        context.runtime = {
            abort: false,
            packageData: {
                ignoredTadir: []
            },
            repositoryEnvironment: {
                senvi: []
            },
            dependencies: {
                customObjects: [],
                sapObjects: [],
                withTrmPackage: [],
                withoutTrmPackage: []
            }
        };

        //3- fill missing input data
        if(!context.rawInput.contextData){
            context.rawInput.contextData = {};
        }
        if(!context.rawInput.printOptions){
            context.rawInput.printOptions = {};
        }
    }
}