import { Package } from "trm-registry-types";
import { Lockfile } from "../../lockfile";
import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TransportBinary, TrmPackage } from "../../trmPackage";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { PackageHierarchy } from "../../commons";
import { checkServerAuth, IActionContext, setSystemPackages, executeWorkflow, workflowCallbacks } from "../commons";
import { init } from "./init";
import { checkTransports } from "./checkTransports";
import { checkSapEntries } from "./checkSapEntries";
import { checkEngines } from "./checkEngines";
import { checkDependencies } from "./checkDependencies";
import { checkDependencyCycles } from "./checkDependencyCycles";
import { installDependencies } from "./installDependencies";
import { setInstallDevclass } from "./setInstallDevclass";
import { addNamespace } from "./addNamespace";
import { DEVCLASS, E071, TADIR, TDEVC, TDEVCT, ZTRM_INSTALLDEVC } from "../../client";
import { InstallTransport, TrmPackageUpdateData } from "../../systemConnector";
import { generateDevclass } from "./generateDevclass";
import { prepareDevc } from "./prepareDevc";
import { prepareTadir } from "./prepareTadir";
import { prepareLang } from "./prepareLang";
import { prepareCust } from "./prepareCust";
import { importBatch } from "./importBatch";
import { generateLandscapeTransport } from "./generateLandscapeTransport";
import { updatePackageData } from "./updatePackageData";
import { executePostActivities } from "./executePostActivities";
import { releaseLandscapeTransport } from "./releaseLandscapeTransport";
import { generateUpdateTransport } from "./generateUpdateTransport";
import { checkDependants } from "./checkDependants";
import { executeRetainedWorkflow } from "../commons/utils";
import { ActionLockScope, releaseLogged, withLockRelease, packageLockResource, resolveInstallPackage } from "../commons/utils";
import { lockResources } from "./lockResources";

/** Maps a publisher ABAP package to the package that should receive its objects during installation. */
export type InstallPackageReplacements = {
    /**
     * Original ABAP package name stored in the published artifact.
     */
    originalDevclass: string,

    /**
     * Target ABAP package name to use on the receiving system.
     */
    installDevclass: string
}

/** Shared execution settings for package and dependency installation actions. */
export type InstallActionInputContextData = {
    /**
     * Snapshot of packages installed on the target system. When omitted, the action queries SAP.
     */
    systemPackages?: TrmPackage[];

    /**
     * Disable interactive prompts. Any required choice without an explicit value then causes an error.
     */
    noInquirer?: boolean;

    /**
     * Directory in which transport-release logs and temporary files are written.
     */
    logTemporaryFolder?: string;
}

/** Options controlling package validation, transport import, and target package mapping. */
export type InstallActionInputInstallData = {
    /**
     * Import-related data.
     */
    import?: {
        /**
         * Skip the optional language transport. Defaults to `false`.
         */
        noLang?: boolean;

        /**
         * Skip all customizing transports. Defaults to `false`.
         * On update, the customizing of the installed release is then kept.
         */
        noCust?: boolean;
    };

    /**
     * Optional checks to perform during installation.
     */
    checks?: {
        /**
         * Lockfile used to pin dependency versions and verify release integrity.
         */
        lockfile?: Lockfile;

        /**
         * Skip validation of required SAP table entries. Defaults to `false`.
         */
        noSapEntries?: boolean;

        /**
         * Skip validation of the manifest engines (SAP components, products, notes, tables). Defaults to `false`.
         */
        noEngines?: boolean;

        /**
         * Skip package dependency validation and installation. Defaults to `false`.
         */
        noDependencies?: boolean;

        /**
         * Allow a dependency install to replace a newer installed release without confirmation.
         * Defaults to `false`: the user is prompted, and without a prompt the install is aborted.
         */
        allowDowngrade?: boolean;

        /**
         * Skip the safety check for repository objects that would be overwritten. Defaults to `false`.
         */
        noExistingObjects?: boolean;
    };

    /**
     * Options related to the devclass installation.
     */
    installDevclass?: {
        /**
         * Preserve publisher package names instead of mapping objects into an install package.
         */
        keepOriginal?: boolean;

        /**
         * Transport layer assigned to generated transportable target packages. When omitted, the system default
         * is resolved only if such packages have to be created.
         */
        transportLayer?: string;

        /**
         * Explicit publisher-to-target package mappings. Ignored when `keepOriginal` is `true`.
         */
        replacements?: InstallPackageReplacements[];

        /**
         * Do not register the package namespace on the target system.
         */
        skipNamespace?: boolean
    };

    /**
     * Landscape transport-related options.
     */
    landscapeTransport?: {
        /**
         * TMS target for the generated landscape transport. It is selected interactively when omitted.
         * When omitted and the system has no transport targets, it is treated as the final system
         * of the landscape and no landscape transport is generated.
         */
        targetSystem?: string;
    };

    /**
     * Skip every post-install activity declared in the manifest. Defaults to `false`.
     */
    skipPostActivities?: boolean
}

/** Input required to install a TRM package release into the connected SAP system. */
export interface InstallActionInput {

    /** Optional shared execution settings. */
    contextData?: InstallActionInputContextData,

    /**
     * Data related to the package being installed.
     */
    packageData: {
        /**
         * Registry package name. For local registries, the manifest name becomes authoritative.
         */
        name: string;

        /**
         * Release version or registry selector. Defaults to `latest`.
         */
        version?: string;

        /**
         * Registry from which metadata and the release artifact are fetched.
         */
        registry: AbstractRegistry;

        /**
         * Allow reinstalling the same version. Defaults to `false`; dirty local changes still
         * require interactive confirmation and therefore abort when prompts are disabled.
         */
        overwrite?: boolean;

        /**
         * Expected release integrity (SHA-512, base64), for example from a lockfile. When set, the
         * install aborts before any change unless the release fetched from the registry matches it.
         */
        integrity?: string;
    };

    /** Optional validation, import, package-mapping, and post-activity settings. */
    installData?: InstallActionInputInstallData
}

type TransportRuntime = {
    binaries?: TransportBinary,
    instance?: Transport
}

type WorkflowRuntime = {
    isTrmServer: boolean,
    isTrmRest: boolean,
    isLocal: boolean,
    update: TrmPackage,
    package: {
        data: Package,
        hierarchy: PackageHierarchy
    },
    transports: {
        devc: TransportRuntime,
        tadir: TransportRuntime,
        lang?: TransportRuntime,
        cust?: TransportRuntime[]
    },
    dele?: Transport,
    transportEntries: {
        tdevct: TDEVCT[]
    },
    dependencies: InstallDependencyEntry[],
    namespace: string,
    /** Registry the package is recorded under: the real registry of a local (.trm) artifact. */
    installRegistry: AbstractRegistry,
    previousInstallPackages: InstallPackageReplacements[],
    /** Transports recorded for the installed release being updated. */
    previousInstallTransports: InstallTransport[],
    dependencyRollbacks: Array<() => Promise<void>>,
    dependencyReleases: Array<() => Promise<void>>,
    rootDevclassBeforeImport?: TDEVC,
    stopWarningShown: boolean,
    /** Release objects found on the system by check-transports, accepted before locking. */
    existingObjects?: TADIR[],
    /** Custom namespaces locked by this install or by the install it is a dependency of. */
    lockedNamespaces?: string[]
}


/** Dependency queued for install: missing from the system, or installed in an incompatible version. */
export type InstallDependencyEntry = {
    dependency: TrmManifestDependency,
    status: 'notFound' | 'versionMismatch',
    /** Version on the system; set for `versionMismatch`. */
    installedVersion?: string
}


type WorkflowRevert = {
    transports: {
        devc: TransportBinary,
        tadir: TransportBinary,
        lang?: TransportBinary,
        cust?: TransportBinary[]
    },
    cleanupTransport?: Transport,
    cleanupImported?: boolean,
    cleanupSucceeded?: boolean,
    importStarted?: boolean,
    importedEntries?: E071[],
    /** Imported customizing transports, copied into the rollback cleanup transport with their keys. */
    importedCustomizing?: Transport[],
    packageHierarchy?: TDEVC[],
    packageTransportLayers?: Array<{ devclass: DEVCLASS, transportLayer: string }>,
    createdTransports?: {
        devc?: Transport,
        tadir?: Transport,
        lang?: Transport,
        cust: Transport[]
    },
    sapPackages: DEVCLASS[],
    stagingPackages?: DEVCLASS[],
    dele?: TransportBinary,
    deleImportStarted?: boolean,
    deleInTargetTms?: boolean,
    cleanupOriginalTadir?: TADIR[],
    cleanupTemporaryPackages?: TDEVC[],
    updateCleanupTransport?: Transport,
    updateTablesBackupTransport?: Transport,
    retainedTables?: TransportBinary,
    metadataWriteStarted?: boolean,
    /** Set before the install transports are written, as SAP may commit them and still fail. */
    metadataTransportsWriteStarted?: boolean,
    metadataPackageRegistry?: string,
    /** Install package mappings written by this install. */
    metadataInstallDevc?: ZTRM_INSTALLDEVC[],
    metadataPackageRow?: TrmPackageUpdateData,
    metadataPreviousPackageRow?: TrmPackageUpdateData,
    namespace?: string
}

/** Result of a successful {@link install} action. */
export type InstallActionOutput = {
    /** Normalized manifest of the installed release. */
    manifest: TrmManifest,
    /** Generated landscape transport, when the installation produced one. */
    transport?: Transport
}

/** Internal state shared by package-install workflow steps and rollback handlers. */
export interface InstallWorkflowContext extends IActionContext {
    lockScope?: ActionLockScope,
    /** Custom namespaces already locked by the parent installs of a dependency install. */
    inheritedNamespaceLocks?: string[],
    /** Original action input; optional groups are normalized during initialization. */
    rawInput: InstallActionInput,
    /** Resolved release, package hierarchy, transports, dependencies, and system metadata. */
    runtime?: WorkflowRuntime,
    /** Data retained so completed steps can be rolled back after a later failure. */
    revert?: WorkflowRevert,
    /** Installation result assembled by the workflow. */
    output?: InstallActionOutput
};

const WORKFLOW_NAME = 'install';

/**
 * Installs a TRM package release into the currently connected SAP system.
 *
 * The workflow authorizes the user, fetches and validates the release, checks dependencies
 * (aborting on cyclic dependency graphs before anything is installed) and required SAP entries, maps ABAP packages, imports the artifact transports, executes
 * post-install activities, and records the installed package. Completed reversible steps are
 * rolled back when a later step fails.
 *
 * This operation changes the target SAP system. Do not interrupt it while transports are being
 * generated, imported, or released.
 *
 * @param inputData Package identity, registry, and installation options.
 * @returns The installed release manifest and, when generated, its landscape transport.
 * @throws When authorization, release validation, safety checks, dependency installation,
 * transport processing, or post-install work fails.
 */
export async function install(inputData: InstallActionInput): Promise<InstallActionOutput> {
    return (await runInstall(inputData, false)).output;
}

const installWorkflow = [
        checkServerAuth,
        setSystemPackages,
        init,
        checkDependants,
        checkTransports,
        checkSapEntries,
        checkEngines,
        checkDependencies,
        checkDependencyCycles,
        setInstallDevclass,
        lockResources,
        installDependencies,
        addNamespace,
        generateDevclass,
        generateUpdateTransport,
        prepareDevc,
        prepareTadir,
        prepareLang,
        prepareCust,
        importBatch,
        generateLandscapeTransport,
        executePostActivities,
        releaseLandscapeTransport,
        updatePackageData
];

async function runInstall(inputData: InstallActionInput, retainRollback: boolean, inheritedNamespaceLocks: string[] = []): Promise<{
    output: InstallActionOutput,
    rollback?: () => Promise<void>,
    release?: () => Promise<void>
}> {
    const lockScope = new ActionLockScope(WORKFLOW_NAME);
    const context: InstallWorkflowContext = { rawInput: inputData, lockScope, inheritedNamespaceLocks };
    //a local artifact is locked under the package it installs, as a remote install of it would be
    const lockPackage = await resolveInstallPackage(inputData.packageData.registry, inputData.packageData.name);
    await lockScope.acquire([packageLockResource(lockPackage.registry, lockPackage.name)]);
    const release = async (): Promise<void> => {
        let firstError: unknown;
        for (const releaseDependency of [...(context.runtime?.dependencyReleases || [])].reverse()) {
            try {
                await releaseDependency();
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
    if (!retainRollback) {
        return withLockRelease(release, async () => {
            const result = await executeWorkflow<InstallWorkflowContext>(WORKFLOW_NAME, installWorkflow, context, workflowCallbacks);
            return { output: result.output };
        });
    }
    let retained: Awaited<ReturnType<typeof executeRetainedWorkflow<InstallWorkflowContext>>>;
    try {
        retained = await executeRetainedWorkflow<InstallWorkflowContext>(
            WORKFLOW_NAME, installWorkflow, context, workflowCallbacks
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
 * Internal transactional entry point used when a parent install must retain rollback ownership.
 * `inheritedNamespaceLocks` are the namespaces the parent installs hold locked until they finish.
 */
export async function installWithRollback(inputData: InstallActionInput, inheritedNamespaceLocks: string[] = []): Promise<{
    output: InstallActionOutput,
    rollback: () => Promise<void>,
    release: () => Promise<void>
}> {
    const retained = await runInstall(inputData, true, inheritedNamespaceLocks);
    return { output: retained.output, rollback: retained.rollback, release: retained.release };
}
