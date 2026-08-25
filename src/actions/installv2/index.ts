import { Package } from "trm-registry-types";
import { Lockfile } from "../../lockfile";
import { AbstractRegistry } from "../../registry";
import { Transport } from "../../transport";
import { TransportBinary, TrmPackage } from "../../trmPackage";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { PackageHierarchy } from "../../commons";
import { checkServerAuth, IActionContext, setSystemPackages, trmServerPa } from "../commons";
import { inspect, Logger } from "trm-commons";
import execute from "@simonegaffurini/sammarksworkflow";
import { init } from "./init";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { installDependencies } from "./installDependencies";

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
     * Transport-related options for installation.
     */
    installTransport?: {
        /**
         * The target system for the install transport.
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
    dependencies: TrmManifestDependency[]
}

export type InstallActionOutput = {
    manifest: TrmManifest,
    transport: Transport
}

export interface InstallWorkflowContext extends IActionContext {
    rawInput: InstallActionInput,
    runtime?: WorkflowRuntime,
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
        /*
        
        readTadir,
        setInstallDevclass,
        addNamespace,
        generateDevclass,
        importDevcTransport,
        importTadirTransport,
        importLangTransport,
        importCustTransport,
        refreshTmsTxt,
        generateInstallTransports,
        updatePackageData,
        executePostActivities,
        releaseInstallTransports*/
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    //const manifest = result.runtime.remotePackageData.manifest;
    return {
        manifest: undefined,
        transport: undefined
    }
}