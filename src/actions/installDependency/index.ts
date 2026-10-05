import execute from "@simonegaffurini/sammarksworkflow";
import { AbstractRegistry } from "../../registry";
import { IActionContext, InstallActionInput, InstallActionInputContextData, InstallActionInputInstallData, InstallActionOutput, setSystemPackages, workflowCallbacks } from "..";
import { init } from "./init";
import { findInstallRelease } from "./findInstallRelease";
import { installRelease } from "./installRelease";
import { checkInstalledRelease } from "./checkInstalledRelease";
import { confirmDowngrade } from "./confirmDowngrade";
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
    /** Integrity of the locked release; the nested install verifies the release it fetches against it. */
    installIntegrity?: string,
    /** Version on the system before the install, if the dependency is installed. */
    installedVersion?: string,
    /** True when the installed release is kept and nothing is installed. */
    alreadyInstalled: boolean,
    installOutput: InstallActionOutput,
    rollback?: () => Promise<void>
    release?: () => Promise<void>
}

/** Result returned after a dependency release has been selected and installed, or kept. */
export type InstallDependencyActionOutput = {
    /** Full result produced by the underlying package installation; unset when `alreadyInstalled`. */
    installOutput?: InstallActionOutput,
    /** True when a compatible release was already installed and nothing was installed. */
    alreadyInstalled: boolean,
    /** Version on the system before the install, if the dependency was installed. */
    installedVersion?: string
}

/** Internal state shared by the dependency-install workflow steps. */
export interface InstallDependencyWorkflowContext extends IActionContext {
    /** Original action input. */
    rawInput: InstallDependencyActionInput,
    /** Resolved package, selected version, and nested installation result. */
    runtime?: WorkflowRuntime,
    /** Dependency-install result. */
    output?: InstallDependencyActionOutput,
    /** Optional transactional install runner supplied by a parent workflow. */
    installRunner?: (input: InstallActionInput) => Promise<{
        output: InstallActionOutput,
        rollback: () => Promise<void>
        release: () => Promise<void>
    }>
};

const WORKFLOW_NAME = 'install-dependency';

/**
 * Resolves the highest suitable dependency release and installs it on the target SAP system.
 *
 * A release already installed that satisfies `versionRange` is kept and nothing is installed,
 * unless a lockfile pins the dependency to a different version. Otherwise, a lockfile entry takes
 * precedence when present and its integrity is verified, or the newest registry release
 * satisfying `versionRange` is selected. Replacing a newer installed release requires
 * confirmation (or `installData.checks.allowDowngrade`). Installation is then delegated to
 * {@link install} with the supplied options.
 *
 * @param inputData Dependency identity, version range, registry, and install options.
 * @returns The nested installation result, or `alreadyInstalled` when nothing was installed.
 * @throws When no compatible release can be found, a downgrade is not confirmed, or the nested
 * install fails.
 */
export async function installDependency(inputData: InstallDependencyActionInput, installRunner?: InstallDependencyWorkflowContext['installRunner']): Promise<InstallDependencyActionOutput & {
    rollback?: () => Promise<void>
    release?: () => Promise<void>
}> {
    const workflow = [
        init,
        setSystemPackages,
        checkInstalledRelease,
        findInstallRelease,
        confirmDowngrade,
        installRelease
    ];
    const result = await execute<InstallDependencyWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        installRunner
    }, workflowCallbacks);
    const installOutput = result.runtime.installOutput;
    return {
        installOutput,
        alreadyInstalled: result.runtime.alreadyInstalled,
        installedVersion: result.runtime.installedVersion,
        rollback: result.runtime.rollback,
        release: result.runtime.release
    }
}
