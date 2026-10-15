import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TrmPackage } from "../../trmPackage";
import { TrmManifest } from "../../manifest";
import { InstallTransport, TrmPackageUpdateData } from "../../systemConnector";
import { E071 } from "../../client";
import { checkServerAuth, IActionContext, setSystemPackages, executeWorkflow, workflowCallbacks } from "../commons";
import { ActionLockScope, releaseLogged, withLockRelease, executeRetainedWorkflow, PackageCleanupRevert, packageLockResource, CleanupPlan, logActionSummary, failureState } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { InstallPackageReplacements } from "../install";
import { init } from "./init";
import { checkDependants } from "./checkDependants";
import { uninstallNestedPackages } from "./uninstallNestedPackages";
import { lockResources } from "./lockResources";
import { generateDeletionTransport } from "./generateDeletionTransport";
import { removePackageData } from "./removePackageData";
import { generateLandscapeTransport, releaseLandscapeTransport } from "./generateLandscapeTransport";

/** Shared execution settings for the package uninstall action. */
export type UninstallActionInputContextData = {
    /**
     * Snapshot of packages installed on the target system. When omitted, the action queries SAP.
     */
    systemPackages?: TrmPackage[];

    /**
     * Disable interactive prompts. Any required choice without an explicit value then causes an error.
     */
    noInquirer?: boolean;
}

/** Options controlling package uninstall validation. */
export type UninstallActionInputUninstallData = {
    /**
     * Optional checks to perform before uninstalling.
     */
    checks?: {
        /**
         * Skip the check for installed packages that depend on the uninstalled package. Defaults to `false`.
         * When the check runs and finds dependants, the uninstall requires confirmation (aborted without prompts).
         */
        noDependants?: boolean;
        /**
         * Uninstall the package even when it has changes made on the target system (dirty entries),
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
         * TMS target of the landscape transport carrying the deletion. It is selected interactively when omitted.
         * When omitted and the system has no transport targets, it is treated as the final system
         * of the landscape and no landscape transport is generated.
         */
        targetSystem?: string;
    };
}

/** Input required to uninstall a TRM package from the connected SAP system. */
export interface UninstallActionInput {

    /** Optional shared execution settings. */
    contextData?: UninstallActionInputContextData,

    /**
     * Data related to the package being uninstalled.
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
    uninstallData?: UninstallActionInputUninstallData

    /**
     * Set by an uninstall for the TRM packages installed under it: their deletions are carried by the
     * landscape transport of the parent uninstall.
     */
    nested?: boolean
}

type WorkflowRuntime = {
    /** Installed release being uninstalled (same role as the release replaced by an install update). */
    update: TrmPackage,
    previousInstallPackages: InstallPackageReplacements[],
    /** Transports recorded for the installed release. */
    previousInstallTransports: InstallTransport[],
    dele?: Transport,
    /** Removal of the installed release, planned before anything changes. */
    cleanupPlan?: CleanupPlan,
    /** Deletion transports generated from the backups. */
    deletions?: { tadir?: Transport, cust?: Transport },
    /** Deletion transports imported by the uninstalls of the TRM packages installed under this one. */
    nestedDeletions?: Transport[],
    stopWarningShown: boolean,
    /** TRM packages installed in the SAP packages of the uninstalled one; the outermost ones are uninstalled directly. */
    nestedPackages: { outermost: TrmPackage[], all: TrmPackage[] },
    /** Rollbacks of the uninstalls of the TRM packages installed under this one, in execution order. */
    nestedRollbacks: Array<() => Promise<void>>,
    /** Lock releases of the uninstalls of the TRM packages installed under this one. */
    nestedReleases: Array<() => Promise<void>>,
    /** Objects removed by the deletion transports of the TRM packages installed under this one. */
    deletedObjects?: E071[]
}

type WorkflowRevert = PackageCleanupRevert & {
    /** Set before the landscape transport is released, as SAP may export it and still fail. */
    landscapeReleaseStarted?: boolean,
    /** Set once the landscape transport release succeeded. */
    landscapeReleased?: boolean,
    metadataRemoveStarted?: boolean,
    metadataPreviousPackageRow?: TrmPackageUpdateData
}

/** Result of a successful {@link uninstall} action. */
export type UninstallActionOutput = {
    /** Manifest of the uninstalled release. */
    manifest: TrmManifest,
    /** Deletion transport imported into the connected system (objects, or customizing when no object was deleted). */
    transport?: Transport,
    /** Deletion transports imported into the connected system, those of the TRM packages installed underneath included. */
    deletions?: Transport[],
    /** Landscape transport carrying the deletion to the following systems, when generated. */
    landscapeTransport?: Transport,
    /** Landscape target system of the released landscape transport. */
    targetSystem?: string
}

/** Internal state shared by package-uninstall workflow steps and rollback handlers. */
export interface UninstallWorkflowContext extends IActionContext {
    lockScope?: ActionLockScope,
    /** Original action input; optional groups are normalized during initialization. */
    rawInput: UninstallActionInput,
    /** Other packages uninstalled by the same run (the packages it's installed under, and their nested ones): they're not dependants. */
    uninstallingPackages?: TrmPackage[],
    /** Installed package and its install mappings. */
    runtime?: WorkflowRuntime,
    /** Data retained so completed steps can be rolled back after a later failure. */
    revert?: WorkflowRevert,
    /** Uninstall result assembled by the workflow. */
    output?: UninstallActionOutput
};

const WORKFLOW_NAME = 'uninstall';

/**
 * Uninstalls a TRM package from the currently connected SAP system.
 *
 * This is the opposite of {@link install}: the workflow authorizes the user, checks that no
 * installed package depends on it, removes the objects of the installed release through a
 * registry-generated deletion transport, forwards that transport to the landscape target
 * system so the package is uninstalled there too, and removes the TRM package record. The object
 * cleanup is the same performed when an install upgrades a package, with no incoming release.
 * Other TRM packages installed in its SAP packages, at any depth, are uninstalled first by the same
 * action, with the same options.
 * Completed reversible steps are rolled back when a later step fails.
 *
 * This operation changes the target SAP system. Do not interrupt it while transports are being
 * generated, imported, or released.
 *
 * @param inputData Package identity, registry, and uninstall options.
 * @returns The uninstalled release manifest, the imported deletion transport, and the landscape
 * target it was forwarded to.
 * @throws When authorization, dependants check, deletion transport processing, or the
 * package record removal fails.
 */
export async function uninstall(inputData: UninstallActionInput): Promise<UninstallActionOutput> {
    return (await runUninstall(inputData, false, [])).output;
}

const uninstallWorkflow = [
    checkServerAuth,
    setSystemPackages,
    init,
    checkDependants,
    uninstallNestedPackages,
    lockResources,
    generateDeletionTransport,
    removePackageData,
    generateLandscapeTransport,
    releaseLandscapeTransport
];

/** Logs what the uninstall left on the system: deletions, backups, landscape transport. */
function logUninstallSummary(context: UninstallWorkflowContext, succeeded: boolean, error?: unknown): void {
    if (!context.runtime?.update) {
        return;
    }
    const name = context.rawInput.packageData.name;
    const version = context.runtime.update.manifest.get().version;
    logActionSummary({
        outcome: succeeded
            ? `${name} ${version} uninstalled from ${SystemConnector.getDest()}.`
            : `${name} ${version} uninstall failed${failureState(context.revert?.deleImportStarted, error)}.`,
        deletions: succeeded ? context.output?.deletions : [],
        landscape: succeeded ? {
            transport: context.output?.landscapeTransport,
            targetSystem: context.rawInput.uninstallData?.landscapeTransport?.targetSystem,
            released: context.revert?.landscapeReleased
        } : undefined,
        revert: context.revert
    });
}

async function runUninstall(inputData: UninstallActionInput, retainRollback: boolean, uninstallingPackages: TrmPackage[], parentLockScope?: ActionLockScope): Promise<{
    output: UninstallActionOutput,
    rollback?: () => Promise<void>,
    release?: () => Promise<void>
}> {
    // A nested uninstall locks in its parent scope: the parent cleanup locks the same SAP packages
    // and objects again, and the parent releases them all once it has finished.
    const lockScope = parentLockScope || new ActionLockScope(WORKFLOW_NAME);
    const context: UninstallWorkflowContext = { rawInput: inputData, lockScope, uninstallingPackages };
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
        if (!parentLockScope) {
            try {
                await lockScope.release();
            } catch (error) {
                firstError ||= error;
            }
        }
        if (firstError) throw firstError;
    };
    if (!retainRollback) {
        return withLockRelease(release, async () => {
            try {
                const result = await executeWorkflow<UninstallWorkflowContext>(WORKFLOW_NAME, uninstallWorkflow, context, workflowCallbacks);
                logUninstallSummary(context, true);
                return { output: result.output };
            } catch (error) {
                logUninstallSummary(context, false, error);
                throw error;
            }
        });
    }
    let retained: Awaited<ReturnType<typeof executeRetainedWorkflow<UninstallWorkflowContext>>>;
    try {
        retained = await executeRetainedWorkflow<UninstallWorkflowContext>(
            WORKFLOW_NAME, uninstallWorkflow, context, workflowCallbacks
        );
    } catch (error) {
        await releaseLogged(release);
        throw error;
    }
    // The locks stay held until the parent calls release (or rollback).
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

/**
 * Internal transactional entry point used when a parent uninstall must retain rollback ownership:
 * the package is uninstalled, its locks stay held until `release`, and `rollback` restores it.
 *
 * @param uninstallingPackages Other packages uninstalled by the same run, ignored as dependants.
 * @param parentLockScope Lock scope of the parent uninstall: its locks are taken in it and released by the parent.
 */
export async function uninstallWithRollback(inputData: UninstallActionInput, uninstallingPackages: TrmPackage[], parentLockScope?: ActionLockScope): Promise<{
    output: UninstallActionOutput,
    rollback: () => Promise<void>,
    release: () => Promise<void>
}> {
    const retained = await runUninstall(inputData, true, uninstallingPackages, parentLockScope);
    return { output: retained.output, rollback: retained.rollback, release: retained.release };
}
