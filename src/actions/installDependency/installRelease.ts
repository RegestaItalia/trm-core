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
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => !context.runtime.alreadyInstalled,
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        //1- run install workflow
        const inputData: InstallActionInput = {
            packageData: {
                name: context.rawInput.dependencyDataPackage.name,
                registry: context.rawInput.dependencyDataPackage.registry,
                version: context.runtime.installVersion,
                integrity: context.runtime.installIntegrity,
                overwrite: false
            },
            contextData: context.rawInput.contextData,
            installData: context.rawInput.installData
        };
        if (context.installRunner) {
            const result = await context.installRunner(inputData);
            context.runtime.installOutput = result.output;
            context.runtime.installedPackages = result.installedPackages;
            context.runtime.rollback = result.rollback;
            context.runtime.release = result.release;
        } else {
            context.runtime.installOutput = await InstallWkf(inputData);
        }
    }
}
