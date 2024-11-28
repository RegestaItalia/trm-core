import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { IActionContext, setSystemPackages } from "../commons";
import { TrmManifestDependency } from "../../manifest";
import { init } from "./init";
import { analyze } from "./analyze";

/**
 * Input data for check package dependencies action.
 */
export interface CheckPackageDependenciesActionInput {
    /**
     * Optional context data.
     */
    contextData?: {
        /**
         * Manually set installed packages on the system.
         */
        systemPackages?: TrmPackage[]; 
    };

    /**
     * Data related to the package being checked.
     */
    packageData: {
        /**
         * TRM Package instance.
         */
        package: TrmPackage;
    };
    
    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print dependency status.
         */
        dependencyStatus?: boolean;

        /**
         * Print information data.
         */
        information?: boolean;
    }
}

type WorkflowRuntime = {
    dependenciesStatus: {
        goodVersion: TrmManifestDependency[],
        badVersion: TrmManifestDependency[],
        goodIntegrity: TrmManifestDependency[],
        badIntegrity: TrmManifestDependency[]
    }
}

export type CheckPackageDependenciesActionOutput = {
    dependencies: TrmManifestDependency[],
    dependencyStatus: {
        dependency: TrmManifestDependency,
        match: boolean,
        safe: boolean
    }[]
}

export interface CheckPackageDependenciesWorkflowContext extends IActionContext {
    rawInput: CheckPackageDependenciesActionInput,
    runtime?: WorkflowRuntime,
    output?: CheckPackageDependenciesActionOutput
};

const WORKFLOW_NAME = 'check-dependencies';

/**
 * Check package dependencies
*/
export async function checkPackageDependencies(inputData: CheckPackageDependenciesActionInput): Promise<CheckPackageDependenciesActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        analyze
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<CheckPackageDependenciesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    return result.output;
}