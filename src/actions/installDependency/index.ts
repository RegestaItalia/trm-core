import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { AbstractRegistry } from "../../registry";
import { IActionContext, InstallActionInputContextData, InstallActionInputInstallData, InstallActionOutput, setSystemPackages, workflowCallbacks } from "..";
import { init } from "./init";
import { findInstallRelease } from "./findInstallRelease";
import { installRelease } from "./installRelease";
import { TrmPackage } from "../../trmPackage";

/**
 * Input data for install dependency action.
 */
export interface InstallDependencyActionInput {
    
    contextData?: InstallActionInputContextData,

    /**
     * Data related to the dependency package being installed.
     */
    dependencyDataPackage: {
        /**
         * The name of the package.
         */
        name: string;

        /**
         * Dependency release install version range.
         */
        versionRange: string;

        /**
         * The registry where the package is stored.
         */
        registry: AbstractRegistry;
    };

    installData?: InstallActionInputInstallData
}

type WorkflowRuntime = {
    trmPackage: TrmPackage,
    installVersion: string,
    installOutput: InstallActionOutput
}

export type InstallDependencyActionOutput = {
    installOutput: InstallActionOutput
}

export interface InstallDependencyWorkflowContext extends IActionContext {
    rawInput: InstallDependencyActionInput,
    runtime?: WorkflowRuntime,
    output?: InstallDependencyActionOutput
};

const WORKFLOW_NAME = 'install-dependency';

/**
 * Install TRM Package dependency from registry to target system
*/
export async function installDependency(inputData: InstallDependencyActionInput): Promise<InstallDependencyActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        findInstallRelease,
        installRelease
    ];
    const result = await execute<InstallDependencyWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    const installOutput = result.runtime.installOutput;
    return {
        installOutput
    }
}
