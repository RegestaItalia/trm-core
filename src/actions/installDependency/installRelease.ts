import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { InstallActionInput, install as InstallWkf } from "..";

/**
 * Workflow step that delegates the selected dependency release to the package install action.
 * 
 * 1- run install workflow
 * 
*/
export const installRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'install-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        if (!context.runtime.installVersion) {
            throw new Error(`Couldn't find dependency "${context.rawInput.dependencyDataPackage.name}" on registry.`);
        }
        
        //1- run install workflow
        const inputData: InstallActionInput = {
            packageData: {
                name: context.rawInput.dependencyDataPackage.name,
                registry: context.rawInput.dependencyDataPackage.registry,
                version: context.runtime.installVersion,
                overwrite: false
            },
            contextData: {...context.rawInput.contextData, ...{ noStopWarning: true }},
            installData: context.rawInput.installData
        };
        const result = await InstallWkf(inputData);
        context.runtime.installOutput = result;
    }
}
