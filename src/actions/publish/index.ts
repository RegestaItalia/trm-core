import execute from "@simonegaffurini/sammarksworkflow";
import { TrmArtifact, TrmPackage } from "../../trmPackage";
import { checkServerAuth, IActionContext, setSystemPackages, trmServerPa, workflowCallbacks } from "..";
import { ReleaseType } from "semver";
import { DEVCLASS, TADIR, TR_TARGET, TRKORR, TRNSPACET, TRNSPACETT, ZTY_SER_OBJ } from "../../client";
import { TrmManifest, TrmManifestBase } from "../../manifest";
import { AbstractRegistry } from "../../registry";
import { Package } from "trm-registry-types";
import { DotAbapGit } from "../../abapgit";
import { init } from "./init";
import { findDependencies } from "./findDependencies";
import { setCustomizingTransports } from "./setCustomizingTransports";
import { setManifestValues } from "./setManifestValues";
import { setOptionalReleaseData } from "./setOptionalPublishData";
import { Transport } from "../../transport";
import { generateDevcTransport } from "./generateDevcTransport";
import { generateTadirTransport } from "./generateTadirTransport";
import { generateLangTransport } from "./generateLangTransport";
import { generateCustTransport } from "./generateCustTransport";
import { releaseTransports } from "./releaseTransports";
import { publishToRegistry } from "./publishToRegistry";
import { updatePackageData } from "./updatePackageData";

/**
 * Input data for publish package action.
 */
export interface PublishActionInput {
    /**
     * Optional context data.
     */
    contextData?: {
        /**
         * Manually set installed packages on the system.
         */
        systemPackages?: TrmPackage[];

        /**
         * Use inquirer? (will force some decisions).
         */
        noInquirer?: boolean;

        /**
         * Log temporary folder.
         */
        logTemporaryFolder?: string;

        /**
         * Don't show a stop warning when process starts.
         */
        noStopWarning?: boolean;
    };

    /**
     * Data related to the package being published.
     */
    packageData: {
        /**
         * The name of the package.
         */
        name: string;

        /**
         * The version of the package.
         * 
         * If blank/latest the latest version is retrieved from the registry:
         * 
         * - first time publishing = 1.0.0
         * 
         * - package exists = latest + inc
         */
        version?: string;

        /**
         * Increment type for releases without specific version.
         */
        inc?: ReleaseType;

        /**
         * Indicates a pre release.
         */
        preRelease?: boolean;

        /**
         * Pre release identifier.
         */
        preReleaseIdentifier?: string;

        /**
         * Tags for the release.
         */
        tags?: string[];

        /**
         * The registry where the package has to be stored.
         */
        registry: AbstractRegistry;

        /**
         * ABAP package name.
         */
        devclass?: DEVCLASS;


        /**
         * TRM package manifest data.
         */
        manifest?: TrmManifestBase;
    };

    /**
         * Data related to the origin system.
         */
    systemData?: {

        /**
         * Publish transport target.
         */
        transportTarget?: TR_TARGET;
    }

    /**
     * Data related to package publish.
     */
    publishData?: {

        /**
         * Skip automatic dependencies detection.
         */
        noDependenciesDetection?: boolean,

        /**
         * Keep manifest values from latest release.
         */
        keepLatestReleaseManifestValues?: boolean,

        /**
         * Publish release as private.
         */
        private?: boolean,

        /**
         * Release readme.
         */
        readme?: string,

        /**
         * Release changelog.
         */
        changelog?: string,

        /**
         * Skip customizing transports publish.
         */
        noCustomizingTransports?: boolean,

        /**
         * Customizing transports. Has no effect if skipCustomizingTransports is set to true.
         */
        customizingTransports?: string[],

        /**
         * Skip translations transport publish.
         */
        noLanguageTransport?: boolean
    }
}

type EnrichedTransport = {
    trkorr: TRKORR,
    description: string
}

type WorkflowRuntime = {
    latest: {
        data: Package
    },
    sapPackage: {
        objects: TADIR[],
        namespace: {
            trnspacet: TRNSPACET,
            trnspacett: TRNSPACETT[]
        }
    },
    abapGit: {
        dotAbapGit: DotAbapGit,
        sourceCode: Buffer,
        object: ZTY_SER_OBJ[],
        excludedObjects: TADIR[]
    },
    manifest: TrmManifest,
    manifestXml: string,
    customizing: {
        retained: EnrichedTransport[],
        new: EnrichedTransport[]
    },
    transports: {
        devc: Transport,
        tadir: Transport,
        lang?: Transport,
        cust?: Transport[]
    },
    aggregatedTransports: Transport[],
    stopWarningShown: boolean
}

export type PublishActionOutput = {
    trmPackage: TrmPackage,
    trmArtifact: TrmArtifact
}

export interface PublishWorkflowContext extends IActionContext {
    rawInput: PublishActionInput,
    runtime?: WorkflowRuntime,
    output?: PublishActionOutput
};

const WORKFLOW_NAME = 'publish';

/**
 * Publish ABAP package to TRM registry
*/
export async function publish(inputData: PublishActionInput): Promise<PublishActionOutput> {
    inputData.contextData ??= {};
    inputData.systemData ??= {};
    inputData.publishData ??= { keepLatestReleaseManifestValues: true };
    inputData.publishData.keepLatestReleaseManifestValues ??= true;
    inputData.publishData.customizingTransports ??= [];
    inputData.packageData.manifest ??= {};
    inputData.packageData.manifest.authors ??= [];
    inputData.packageData.manifest.dependencies ??= [];
    inputData.packageData.manifest.keywords ??= [];
    inputData.packageData.manifest.postActivities ??= [];
    inputData.packageData.manifest.sapEntries ??= {};
    inputData.packageData.tags ??= [];

    const workflow = [
        checkServerAuth,
        setSystemPackages,
        trmServerPa,
        init,
        findDependencies,
        setCustomizingTransports,
        setManifestValues,
        setOptionalReleaseData,
        generateDevcTransport,
        generateTadirTransport,
        generateLangTransport,
        generateCustTransport,
        releaseTransports,
        publishToRegistry,
        updatePackageData
    ];
    const result = await execute<PublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return {
        trmPackage: result.output.trmPackage,
        trmArtifact: result.output.trmArtifact
    }
}
