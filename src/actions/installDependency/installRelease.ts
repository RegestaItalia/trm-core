import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallDependencyWorkflowContext } from ".";
import { Logger } from "../../logger";
import { InstallActionInput, install } from "../install";
import { inspect } from "util";

const SUBWORKFLOW_NAME = 'install-dependency-sub-install';

export const installRelease: Step<InstallDependencyWorkflowContext> = {
    name: 'install-release',
    filter: async (context: InstallDependencyWorkflowContext): Promise<boolean> => {
        if (context.runtime.skipInstall) {
            Logger.log(`Skipping install release (skipInstall)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallDependencyWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const version = context.output.version;
        const registry = context.runtime.registry;
        const integrity = context.parsedInput.integrity;
        const installOptions = context.parsedInput.installOptions;

        const inputData: InstallActionInput = {
            ...installOptions,
            packageName,
            version,
            integrity,
            registry
        };
        
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        const result = await install(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        context.output.installOutput = result;
        /*await install({
            ...(data.originalInstallOptions || {}),
            ...{
                packageName,
                version,
                integrity,
                safe: integrity ? true : false
            }
        }, registry);*/
    }
}