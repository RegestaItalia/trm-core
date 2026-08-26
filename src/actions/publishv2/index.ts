import execute from "@simonegaffurini/sammarksworkflow";
import { TrmArtifact, TrmPackage } from "../../trmPackage";
import { checkServerAuth, IActionContext, setSystemPackages, trmServerPa, workflowCallbacks } from "..";
import { AbstractRegistry } from "../../registry";
import { DEVCLASS, TADIR, TARSYSTEM, TR_TARGET, TRNSPACET, TRNSPACETT } from "../../client";
import { TrmManifest, TrmManifestBase } from "../../manifest";
import { Transport } from "../../transport";
import { DotAbapGit } from "../../abapgit";
import { ReleaseType } from "semver";

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
         * Log temporary folder (for parsing R3Trans logs).
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
        skipCustomizingTransports?: boolean,

        /**
         * Customizing transports. Has no effect if skipCustomizingTransports is set to true.
         */
        customizingTransports?: string | Transport[],

        /**
         * Skip language (translations) transport publish.
         */
        noLanguageTransport?: boolean
    }
}

type WorkflowRuntime = {
}

export type PublishActionOutput = {
    trmPackage: TrmPackage,
    trmArtifact: TrmArtifact
}

export interface PublishWorkflowContext extends IActionContext {
    rawInput: PublishActionInput,
    runtime?: WorkflowRuntime,
    output?: PublishActionOutput,
    revert?: any
};

const WORKFLOW_NAME = 'publish';

/**
 * Publish ABAP package to TRM registry
*/
export async function publish(inputData: PublishActionInput): Promise<PublishActionOutput> {
    const workflow = [
        checkServerAuth
    ];
    const result = await execute<PublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    }, workflowCallbacks);
    return null;
    /*const trmPackage = result.runtime.trmPackage.package;
    const trmArtifact = result.runtime.trmPackage.artifact;
    return {
        trmPackage,
        trmArtifact
    }*/
}
