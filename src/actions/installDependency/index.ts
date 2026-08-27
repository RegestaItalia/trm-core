import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { AbstractRegistry } from "../../registry";
import { IActionContext, InstallActionInputContextData, InstallActionInputInstallData, InstallActionOutput, setSystemPackages, workflowCallbacks } from "..";
import { init } from "./init";
import { findInstallRelease } from "./findInstallRelease";
import { installRelease } from "./installRelease";
import { TrmPackage } from "../../trmPackage";

/** Input used to resolve and install one TRM package dependency. */
export interface InstallDependencyActionInput {
    /** Shared install context, including optional package snapshot and prompt behavior. */
    contextData?: InstallActionInputContextData,

    /**
     * Data related to the dependency package being installed.
     */
    dependencyDataPackage: {
        /**
         * Dependency package name.
         */
        name: string;

        /**
         * Semantic-version range the installed release must satisfy.
         */
        versionRange: string;

        /**
         * Registry from which releases and artifacts are fetched.
         */
        registry: AbstractRegistry;
    };

    /** Options forwarded to the underlying {@link install} action. */
    installData?: InstallActionInputInstallData
}

type WorkflowRuntime = {
    trmPackage: TrmPackage,
    installVersion: string,
    installOutput: InstallActionOutput
}

/** Result returned after a dependency release has been selected and installed. */
export type InstallDependencyActionOutput = {
    /** Full result produced by the underlying package installation. */
    installOutput: InstallActionOutput
}

/** Internal state shared by the dependency-install workflow steps. */
export interface InstallDependencyWorkflowContext extends IActionContext {
    /** Original action input. */
    rawInput: InstallDependencyActionInput,
    /** Resolved package, selected version, and nested installation result. */
    runtime?: WorkflowRuntime,
    /** Dependency-install result. */
    output?: InstallDependencyActionOutput
};

const WORKFLOW_NAME = 'install-dependency';

/**
 * Resolves the highest suitable dependency release and installs it on the target SAP system.
 *
 * A lockfile entry takes precedence when present and its integrity is verified. Otherwise,
 * the newest registry release satisfying `versionRange` is selected. Installation is then
 * delegated to {@link install} with the supplied options.
 *
 * @param inputData Dependency identity, version range, registry, and install options.
 * @returns The nested installation result.
 * @throws When no compatible release can be found or the nested install fails.
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
