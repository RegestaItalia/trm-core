import execute from "@simonegaffurini/sammarksworkflow";
import { R3trans, R3transOptions } from "node-r3trans";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";
import { TransportBinary, TrmArtifact, TrmPackage } from "../../trmPackage";
import { init } from "./init";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { checkServerAuth, IActionContext } from "..";
import { setSystemPackages } from "../commons/setSystemPackages";
import { checkAlreadyInstalled } from "./checkAlreadyInstalled";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { installDependencies } from "./installDependencies";
import { setR3trans } from "./setR3trans";
import { DEVCLASS, E071, NAMESPACE, TADIR, TDEVC, TDEVCT } from "../../client";
import { checkTransports } from "./checkTransports";
import { readDevc } from "./readDevc";
import { setInstallDevclass } from "./setInstallDevclass";
import { checkObjectTypes } from "./checkObjectTypes";
import { generateDevclass } from "./generateDevclass";
import { readTadir } from "./readTadir";
import { PackageHierarchy } from "../../commons";
import { importDevcTransport } from "./importDevcTransport";
import { addNamespace } from "./addNamespace";
import { importTadirTransport } from "./importTadirTransport";
import { importLangTransport } from "./importLangTransport";
import { importCustTransport } from "./importCustTransport";
import { setPackageIntegrity } from "./setPackageIntegrity";
import { generateInstallTransport } from "./generateInstallTransport";
import { refreshTmsTxt } from "./refreshTmsTxt";
import { migrate } from "./migrate";
import { AbstractRegistry } from "../../registry";
import { executePostActivities } from "./executePostActivities";
import { setTrmServerUpgradeService } from "./setTrmServerUpgradeService";
import { commit } from "./commit";
import { Package } from "trm-registry-types";
import { Lockfile } from "../../lockfile/Lockfile";

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
     * Set r3trans options.
     */
    r3transOptions?: R3transOptions;

    /**
     * Skip printing R3trans info.
     */
    noR3transInfo?: boolean;

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
         * The timeout in milliseconds for TMS import.
         */
        timeout?: number;

        /**
         * Whether to skip importing language transports.
         */
        noLang?: boolean;

        /**
         * Whether to skip importing customizing transports.
         */
        noCust?: boolean;

        /**
         * If importing a transport that already exists, overwrite.
         */
        replaceExistingTransports?: boolean;
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
         * Whether to skip checking that all object types are supported.
         */
        noObjectTypes?: boolean;

        /**
         * Whether to skip checking for package dependencies.
         */
        noDependencies?: boolean;

        /**
         * Whether to skip checking for existing objects.
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
         * Whether to create an install transport for easy distribution across the landscape.
         */
        create?: boolean;

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
    registry: AbstractRegistry,
    update: boolean,
    remotePackageData: {
        data: Package,
        manifest: TrmManifest,
        artifact: TrmArtifact
    },
    packageTransports: {
        devc: TransportRuntime,
        tadir: TransportRuntime,
        lang: TransportRuntime,
        cust: TransportRuntime
    },
    packageTransportsData: {
        tdevc: TDEVC[],
        tdevct: TDEVCT[],
        tadir: TADIR[],
        e071: E071[]
    }
    dependenciesToInstall: TrmManifestDependency[],
    r3trans: R3trans,
    originalData: {
        hierarchy: PackageHierarchy
    }
    installData: {
        namespace: string,
        entries: E071[],
        transport?: Transport
    },
    generatedData: {
        devclass: DEVCLASS[],
        namespace: NAMESPACE,
        migrations: Transport[],
        tmsTxtRefresh: Transport[]
    }
}

export type InstallActionOutput = {
    manifest: TrmManifest,
    registry: AbstractRegistry,
    installTransport?: Transport
}

export interface InstallWorkflowContext extends IActionContext {
    rawInput: InstallActionInput,
    runtime?: WorkflowRuntime,
    output?: InstallActionOutput
};

const WORKFLOW_NAME = 'install';

/**
 * Install TRM Package from registry to target system
*/
export async function install(inputData: InstallActionInput): Promise<InstallActionOutput> {
    const workflow = [
        checkServerAuth,
        init,
        setSystemPackages,
        setTrmServerUpgradeService,
        checkAlreadyInstalled,
        checkSapEntries,
        checkDependencies,
        setR3trans,
        installDependencies,
        checkTransports,
        migrate,
        readDevc,
        readTadir,
        checkObjectTypes,
        setInstallDevclass,
        addNamespace,
        generateDevclass,
        importDevcTransport,
        importTadirTransport,
        importLangTransport,
        importCustTransport,
        refreshTmsTxt,
        setPackageIntegrity,
        generateInstallTransport,
        commit,
        executePostActivities
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const manifest = result.runtime.remotePackageData.manifest;
    const registry = result.runtime.registry;
    const installTransport = result.runtime.installData.transport;
    return {
        manifest,
        registry,
        installTransport
    }
}