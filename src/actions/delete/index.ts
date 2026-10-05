import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TrmPackage } from "../../trmPackage";
import { TrmManifest } from "../../manifest";
import { InstallTransport, TrmPackageUpdateData } from "../../systemConnector";
import { checkServerAuth, IActionContext, setSystemPackages, workflowCallbacks } from "../commons";
import execute from "@simonegaffurini/sammarksworkflow";
import { ActionLockScope, executeRetainedWorkflow, PackageCleanupRevert, packageLockResource } from "../commons/utils";
import { InstallPackageReplacements } from "../install";
import { init } from "./init";
import { checkDependants } from "./checkDependants";
import { deleteNestedPackages } from "./deleteNestedPackages";
import { lockResources } from "./lockResources";
import { generateDeletionTransport } from "./generateDeletionTransport";
import { removePackageData } from "./removePackageData";
import { forwardDeletionTransport } from "./forwardDeletionTransport";

/** Shared execution settings for the package delete action. */
export type DeleteActionInputContextData = {
    /**
     * Snapshot of packages installed on the target system. When omitted, the action queries SAP.
     */
    systemPackages?: TrmPackage[];

    /**
     * Disable interactive prompts. Any required choice without an explicit value then causes an error.
     */
    noInquirer?: boolean;
}

/** Options controlling package delete validation. */
export type DeleteActionInputDeleteData = {
    /**
     * Optional checks to perform before deleting.
     */
    checks?: {
        /**
         * Skip the check for installed packages that depend on the deleted package. Defaults to `false`.
         * When the check runs and finds dependants, the delete requires confirmation (aborted without prompts).
         */
        noDependants?: boolean;
        /**
         * Delete the package even when it has changes made on the target system (dirty entries),
         * without asking for confirmation. Defaults to `false`: dirty packages then require
         * confirmation (aborted without prompts).
         */
        ignoreDirty?: boolean;
    };

    /**
     * Landscape transport-related options.
     */
    landscapeTransport?: {
        /**
         * TMS target that receives the deletion transport. It is selected interactively when omitted.
         * When omitted and the system has no transport targets, it is treated as the final system
         * of the landscape and the deletion transport is not forwarded.
         */
        targetSystem?: string;
    };
}

/** Input required to delete (uninstall) a TRM package from the connected SAP system. */
export interface DeleteActionInput {

    /** Optional shared execution settings. */
    contextData?: DeleteActionInputContextData,

    /**
     * Data related to the package being deleted.
     */
    packageData: {
        /**
         * Name of the installed package.
         */
        name: string;

        /**
         * Registry the package was installed from. It generates the deletion transport,
         * so it can't be a local (file system) registry.
         */
        registry: AbstractRegistry;
    };

    /** Optional validation settings. */
    deleteData?: DeleteActionInputDeleteData
}

type WorkflowRuntime = {
    /** Installed release being deleted (same role as the release replaced by an install update). */
    update: TrmPackage,
    previousInstallPackages: InstallPackageReplacements[],
    /** Transports recorded for the installed release. */
    previousInstallTransports: InstallTransport[],
    dele?: Transport,
    stopWarningShown: boolean,
    /** TRM packages installed in the SAP packages of the deleted one; the outermost ones are deleted directly. */
    nestedPackages: { outermost: TrmPackage[], all: TrmPackage[] },
    /** Rollbacks of the deletes of the TRM packages installed under this one, in execution order. */
    nestedRollbacks: Array<() => Promise<void>>,
    /** Lock releases of the deletes of the TRM packages installed under this one. */
    nestedReleases: Array<() => Promise<void>>
}

type WorkflowRevert = PackageCleanupRevert & {
    metadataRemoveStarted?: boolean,
    metadataPreviousPackageRow?: TrmPackageUpdateData
}

/** Result of a successful {@link deletePackage} action. */
export type DeleteActionOutput = {
    /** Manifest of the deleted release. */
    manifest: TrmManifest,
    /** Deletion transport imported into the connected system. */
    transport?: Transport,
    /** Landscape target system whose import queue received the deletion transport, when forwarded. */
    targetSystem?: string
}

/** Internal state shared by package-delete workflow steps and rollback handlers. */
export interface DeleteWorkflowContext extends IActionContext {
    lockScope?: ActionLockScope,
    /** Original action input; optional groups are normalized during initialization. */
    rawInput: DeleteActionInput,
    /** Other packages deleted by the same run (the packages it's installed under, and their nested ones): they're not dependants. */
    deletingPackages?: TrmPackage[],
    /** Installed package and its install mappings. */
    runtime?: WorkflowRuntime,
    /** Data retained so completed steps can be rolled back after a later failure. */
    revert?: WorkflowRevert,
    /** Delete result assembled by the workflow. */
    output?: DeleteActionOutput
};

const WORKFLOW_NAME = 'delete';

/**
 * Deletes (uninstalls) a TRM package from the currently connected SAP system.
 *
 * This is the opposite of {@link install}: the workflow authorizes the user, checks that no
 * installed package depends on it, removes the objects of the installed release through a
 * registry-generated deletion transport, forwards that transport to the landscape target
 * system so the package is deleted there too, and removes the TRM package record. The object
 * cleanup is the same performed when an install upgrades a package, with no incoming release.
 * Other TRM packages installed in its SAP packages, at any depth, are deleted first by the same
 * action, with the same options.
 * Completed reversible steps are rolled back when a later step fails.
 *
 * This operation changes the target SAP system. Do not interrupt it while transports are being
 * generated, imported, or released.
 *
 * @param inputData Package identity, registry, and delete options.
 * @returns The deleted release manifest, the imported deletion transport, and the landscape
 * target it was forwarded to.
 * @throws When authorization, dependants check, deletion transport processing, or the
 * package record removal fails.
 */
export async function deletePackage(inputData: DeleteActionInput): Promise<DeleteActionOutput> {
    return (await runDelete(inputData, false, [])).output;
}

const deleteWorkflow = [
    checkServerAuth,
    setSystemPackages,
    init,
    checkDependants,
    deleteNestedPackages,
    lockResources,
    generateDeletionTransport,
    forwardDeletionTransport,
    removePackageData
];

async function runDelete(inputData: DeleteActionInput, retainRollback: boolean, deletingPackages: TrmPackage[]): Promise<{
    output: DeleteActionOutput,
    rollback?: () => Promise<void>,
    release?: () => Promise<void>
}> {
    const lockScope = new ActionLockScope(WORKFLOW_NAME);
    const context: DeleteWorkflowContext = { rawInput: inputData, lockScope, deletingPackages };
    await lockScope.acquire([packageLockResource(inputData.packageData.registry, inputData.packageData.name)]);
    const release = async (): Promise<void> => {
        let firstError: unknown;
        for (const releaseNested of [...(context.runtime?.nestedReleases || [])].reverse()) {
            try {
                await releaseNested();
            } catch (error) {
                firstError ||= error;
            }
        }
        try {
            await lockScope.release();
        } catch (error) {
            firstError ||= error;
        }
        if (firstError) throw firstError;
    };
    try {
        if (retainRollback) {
            const retained = await executeRetainedWorkflow<DeleteWorkflowContext>(
                WORKFLOW_NAME, deleteWorkflow, context, workflowCallbacks
            );
            return {
                output: retained.context.output,
                release,
                rollback: async () => {
                    let firstError: unknown;
                    try {
                        await retained.rollback();
                    } catch (error) {
                        firstError = error;
                    }
                    try {
                        await release();
                    } catch (error) {
                        firstError ||= error;
                    }
                    if (firstError) throw firstError;
                }
            };
        }
        const result = await execute<DeleteWorkflowContext>(WORKFLOW_NAME, deleteWorkflow, context, workflowCallbacks);
        await release();
        return { output: result.output };
    } catch (error) {
        try {
            await release();
        } catch {
            // Preserve the workflow failure; the release failure was already attempted.
        }
        throw error;
    }
}

/**
 * Internal transactional entry point used when a parent delete must retain rollback ownership:
 * the package is deleted, its locks stay held until `release`, and `rollback` restores it.
 *
 * @param deletingPackages Other packages deleted by the same run, ignored as dependants.
 */
export async function deleteWithRollback(inputData: DeleteActionInput, deletingPackages: TrmPackage[]): Promise<{
    output: DeleteActionOutput,
    rollback: () => Promise<void>,
    release: () => Promise<void>
}> {
    const retained = await runDelete(inputData, true, deletingPackages);
    return { output: retained.output, rollback: retained.rollback, release: retained.release };
}
