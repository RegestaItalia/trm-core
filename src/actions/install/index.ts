import { Package } from "trm-registry-types";
import { Lockfile } from "../../lockfile";
import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TransportBinary, TrmPackage } from "../../trmPackage";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { PackageHierarchy } from "../../commons";
import { checkServerAuth, IActionContext, setSystemPackages, trmServerPa, workflowCallbacks } from "../commons";
import { inspect, Logger } from "trm-commons";
import execute from "@simonegaffurini/sammarksworkflow";
import { init } from "./init";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { installDependencies } from "./installDependencies";
import { setInstallDevclass } from "./setInstallDevclass";
import { addNamespace } from "./addNamespace";
import { DEVCLASS, TDEVCT } from "../../client";
import { generateDevclass } from "./generateDevclass";
import { importDevcTransport } from "./importDevcTransport";
import { importTadirTransport } from "./importTadirTransport";
import { importLangTransport } from "./importLangTransport";
import { importCustTransport } from "./importCustTransport";
import { generateLandscapeTransport } from "./generateLandscapeTransport";
import { updatePackageData } from "./updatePackageData";
import { executePostActivities } from "./executePostActivities";
import { releaseLandscapeTransport } from "./releaseLandscapeTransport";

/**
 * ABAP package replacement during install
 */
export type InstallPackageReplacements = {
    /**
     * Original publisher ABAP package name
     */
    originalDevclass: string,

    /**
     * Install ABAP package name
     */
    installDevclass: string
}

/**
 * Optional context data.
 */
export type InstallActionInputContextData = {
    /**
     * Manually set installed packages on the system.
     */
    systemPackages?: TrmPackage[];

    /**
     * Use inquirer? (will force some decisions)
     */
    noInquirer?: boolean;

    /**
     * Log temporary folder.
     */
    logTemporaryFolder?: string;
}

/**
 * Optional install-specific data.
 */
export type InstallActionInputInstallData = {
    /**
     * Import-related data.
     */
    import?: {
        /**
         * Whether to skip importing language transports.
         */
        noLang?: boolean;

        /**
         * Whether to skip importing customizing transports.
         */
        noCust?: boolean;
    };

    /**
     * Optional checks to perform during installation.
     */
    checks?: {
        /**
         * Lockfile (for dependencies install matching integrity/version).
         */
        lockfile?: Lockfile;

        /**
         * Whether to skip checking for all SAP entries.
         */
        noSapEntries?: boolean;

        /**
         * Whether to skip checking for package dependencies.
         */
        noDependencies?: boolean;

        /**
         * Whether to skip checking for existing objects (potential overwrites).
         */
        noExistingObjects?: boolean;
    };

    /**
     * Options related to the devclass installation.
     */
    installDevclass?: {
        /**
         * Whether to keep the original package names from the publisher.
         */
        keepOriginal?: boolean;

        /**
         * The transport layer of the package.
         */
        transportLayer?: string;

        /**
         * List of package replacements to apply during installation. Ignored if used with keep original.
         */
        replacements?: InstallPackageReplacements[];

        /**
         * Skip install of namespace (if package has customer namespace).
         */
        skipNamespace?: boolean
    };

    /**
     * Landscape transport-related options.
     */
    landscapeTransport?: {
        /**
         * The target system for the landscape transport.
         */
        targetSystem?: string;
    };

    /**
     * Skip install post activities
     */
    skipPostActivities?: boolean
}

/**
 * Input data for install package action.
 */
export interface InstallActionInput {

    contextData?: InstallActionInputContextData,

    /**
     * Data related to the package being installed.
     */
    packageData: {
        /**
         * The name of the package.
         */
        name: string;

        /**
         * The version of the package (defaults to the latest version if not provided).
         */
        version?: string;

        /**
         * The registry where the package is stored.
         */
        registry: AbstractRegistry;

        /**
         * Overwrite package if same version is already installed?
         */
        overwrite?: boolean;
    };

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
    stopWarningShown: boolean
}


type WorkflowRevert = {
    transports: {
        devc: TransportBinary,
        tadir: TransportBinary,
        lang?: TransportBinary,
        cust?: TransportBinary[]
    },
    sapPackages: DEVCLASS[],
    dele?: TransportBinary,
    namespace?: string
}

export type InstallActionOutput = {
    manifest: TrmManifest,
    transport?: Transport
}

export interface InstallWorkflowContext extends IActionContext {
    rawInput: InstallActionInput,
    runtime?: WorkflowRuntime,
    revert?: WorkflowRevert,
    output?: InstallActionOutput
};

const WORKFLOW_NAME = 'install';

/**
 * Install TRM Package
*/
export async function install(inputData: InstallActionInput): Promise<InstallActionOutput> {
    const workflow = [
        checkServerAuth,
        setSystemPackages,
        trmServerPa,
        init,
        checkSapEntries,
        checkDependencies,
        installDependencies,
        setInstallDevclass,
        addNamespace,
        generateDevclass,
        importDevcTransport,
        importTadirTransport,
        importLangTransport,
        importCustTransport,
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
