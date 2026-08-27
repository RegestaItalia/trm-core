import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { TrmPackage } from "../../trmPackage";
import { IActionContext, setSystemPackages, workflowCallbacks } from "../commons";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { init } from "./init";
import { analyze } from "./analyze";

/** Input used to compare a manifest's dependencies with packages installed in SAP. */
export interface CheckPackageDependenciesActionInput {
    /**
     * Optional context data.
     */
    contextData?: {
        /**
         * Snapshot of packages installed on the target system. When omitted, the action
         * queries the connected system.
         */
        systemPackages?: TrmPackage[]; 
    };

    /**
     * Data related to the package being checked.
     */
    packageData: {
        /**
         * Manifest whose `dependencies` collection will be checked.
         */
        manifest: TrmManifest;
    };
    
    /**
     * Print options.
     */
    printOptions?: {
        /**
         * Print the per-dependency status table. Defaults to `false`.
         */
        dependencyStatus?: boolean;

        /**
         * Print informational summary messages. Defaults to `false`.
         */
        information?: boolean;
    }
}

type WorkflowRuntime = {
    dependenciesStatus: {
        goodVersion: TrmManifestDependency[],
        badVersion: TrmManifestDependency[]
    }
}

/** Dependency compatibility report returned by {@link checkPackageDependencies}. */
export type CheckPackageDependenciesActionOutput = {
    /** Dependencies copied from the supplied manifest, or an empty array. */
    dependencies: TrmManifestDependency[],
    /** One result per dependency; `match` is true when an installed version satisfies its range. */
    dependencyStatus: {
        /** Manifest dependency that was evaluated. */
        dependency: TrmManifestDependency,
        /** Whether a matching installed package was found at a compatible version. */
        match: boolean
    }[]
}

/** Internal state shared by the dependency-check workflow steps. */
export interface CheckPackageDependenciesWorkflowContext extends IActionContext {
    /** Original action input. */
    rawInput: CheckPackageDependenciesActionInput,
    /** Intermediate classification of matching and non-matching dependencies. */
    runtime?: WorkflowRuntime,
    /** Report assembled by the workflow. */
    output?: CheckPackageDependenciesActionOutput
};

const WORKFLOW_NAME = 'check-dependencies';

/**
 * Checks whether installed TRM packages satisfy every dependency in a manifest.
 *
 * Dependency identity includes its registry. Version compatibility follows semantic-version
 * range rules. This action reports mismatches in its output rather than throwing for them.
 *
 * @param inputData Manifest, optional installed-package snapshot, and print settings.
 * @returns The manifest dependencies and their installed-version match status.
 * @throws When installed packages cannot be read or a dependency version cannot be evaluated.
 */
export async function checkPackageDependencies(inputData: CheckPackageDependenciesActionInput): Promise<CheckPackageDependenciesActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        analyze
    ];
    const result = await execute<CheckPackageDependenciesWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return result.output;
}
