import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { inspect, Logger } from "../../logger";
import { InstallActionInput, install as InstallWkf } from "..";

const SUBWORKFLOW_NAME = 'install-sub-install-dependency';

/**
 * Find release in range to install
 * 
 * 1- run install workflow
 * 
*/
export const installRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'install-release',
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        Logger.log('Install release step', true);

        if (!context.runtime.installVersion) {
            throw new Error(`Couldn't find dependency "${context.rawInput.dependencyDataPackage.name}" on registry. Try manual install.`);
        }
        
        //1- run install workflow
        const inputData: InstallActionInput = {
            packageData: {
                name: context.rawInput.dependencyDataPackage.name,
                registry: context.rawInput.dependencyDataPackage.registry,
                integrity: context.rawInput.dependencyDataPackage.integrity,
                version: context.runtime.installVersion,
                overwrite: false
            },
            contextData: context.rawInput.contextData,
            installData: context.rawInput.installData
        };
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await InstallWkf(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true)
        context.runtime.installOutput = result;
    }
}