import execute from "@simonegaffurini/sammarksworkflow";
import { R3trans, R3transOptions } from "node-r3trans";
import { inspect } from "util";
import { Logger } from "../../logger";
import { IRegistry, Registry } from "../../registry";
import { Transport } from "../../transport";
import { TransportBinary, TrmArtifact, TrmPackage } from "../../trmPackage";
import { IActionContext, InstallActionInputContextData, InstallActionInputInstallData, InstallActionOutput, setSystemPackages } from "..";
import { init } from "./init";
import { findInstallRelease } from "./findInstallRelease";
import { installRelease } from "./installRelease";

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
        registry: IRegistry;

        /**
         * Dependency integrity.
         */
        integrity?: string;
    };

    installData?: InstallActionInputInstallData
}

type WorkflowRuntime = {
    rollback: boolean,
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
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallDependencyWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const installOutput = result.runtime.installOutput;
    return {
        installOutput
    }
}