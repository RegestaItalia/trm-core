import { Package } from "trm-registry-types";
import { Lockfile } from "../../lockfile";
import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TransportBinary, TrmPackage } from "../../trmPackage";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { PackageHierarchy } from "../../commons";
import { checkServerAuth, IActionContext, setSystemPackages, trmServerPa, workflowCallbacks } from "../commons";
import execute from "@simonegaffurini/sammarksworkflow";
import { init } from "./init";
import { checkTransports } from "./checkTransports";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { installDependencies } from "./installDependencies";
import { setInstallDevclass } from "./setInstallDevclass";
import { addNamespace } from "./addNamespace";
import { DEVCLASS, TDEVC, TDEVCT } from "../../client";
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
import { generateDeletionTransport } from "./generateDeletionTransport";

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
         * Skip package dependency validation and installation. Defaults to `false`.
         */
        noDependencies?: boolean;

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
         * Transport layer assigned to generated target packages. The system default is used when omitted.
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
    dependencies: TrmManifestDependency[],
    namespace: string,
    rootDevclassBeforeImport?: TDEVC,
    stopWarningShown: boolean
}


type WorkflowRevert = {
    transports: {
        devc: TransportBinary,
        tadir: TransportBinary,
        lang?: TransportBinary,
        cust?: TransportBinary[]
    },
    cleanupTransport?: Transport,
    sapPackages: DEVCLASS[],
    dele?: TransportBinary,
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
 * and required SAP entries, maps ABAP packages, imports the artifact transports, executes
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
    const workflow = [
        checkServerAuth,
        setSystemPackages,
        trmServerPa,
        init,
        checkTransports,
        checkSapEntries,
        checkDependencies,
        installDependencies,
        setInstallDevclass,
        addNamespace,
        generateDevclass,
        generateDeletionTransport,
        prepareDevc,
        prepareTadir,
        prepareLang,
        prepareCust,
        importBatch,
        generateLandscapeTransport,
        updatePackageData,
        executePostActivities,
        releaseLandscapeTransport
    ];
    const result = await execute<InstallWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return result.output;
}
