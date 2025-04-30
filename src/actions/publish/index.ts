import execute from "@simonegaffurini/sammarksworkflow";
import { inspect } from "util";
import { Logger } from "trm-commons";
import { TrmArtifact, TrmPackage } from "../../trmPackage";
import { IActionContext, setSystemPackages } from "..";
import { AbstractRegistry } from "../../registry";
import { init } from "./init";
import { DEVCLASS, TADIR, TMSCSYS, TR_TARGET, TRNSPACET, TRNSPACETT } from "../../client";
import { setDevclass } from "./setDevclass";
import { setTransportTarget } from "./setTransportTarget";
import { findDependencies } from "./findDependencies";
import { TrmManifest, TrmManifestBase } from "../../manifest";
import { setManifestValues } from "./setManifestValues";
import { setReadme } from "./setReadme";
import { Transport } from "../../transport";
import { setCustomizingTransports } from "./setCustomizingTransports";
import { generateDevcTransport } from "./generateDevcTransport";
import { generateTadirTransport } from "./generateTadirTransport";
import { generateLangTransport } from "./generateLangTransport";
import { generateCustTransport } from "./generateCustTransport";
import { releaseTransports } from "./releaseTransports";
import { finalizePublish } from "./finalizePublish";
import { publishToRegistry } from "./publishToRegistry";
import { getSourceCode } from "./getSourceCode";
import { DotAbapGit } from "../../abapgit";

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
         * - package exists = latest + 0.0.1
         */
        version?: string;

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

        /**
         * Release timeout (in seconds).
         */
        releaseTimeout: number;
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
    rollback: boolean,
    trmPackage: {
        package: TrmPackage,
        registry: AbstractRegistry,
        latestReleaseManifest?: TrmManifest,
        manifest: TrmManifest,
        artifact?: TrmArtifact
    },
    systemData: {
        transportTargets: TMSCSYS[],
        devcTransport: Transport,
        tadirTransport: Transport,
        langTransport?: Transport,
        custTransport?: Transport,
        releasedTransports: Transport[]
    },
    packageData: {
        tadir: TADIR[],
        namespace?: {
            trnspacet: TRNSPACET,
            trnspacett: TRNSPACETT[]
        }
    },
    abapGitData: {
        dotAbapGit?: DotAbapGit,
        sourceCode?: {
            zip: Buffer,
            objects: TADIR[],
            ignoredObjects: TADIR[]
        }
    }
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
    const workflow = [
        init,
        setSystemPackages,
        setTransportTarget,
        setDevclass,
        findDependencies,
        setManifestValues,
        setReadme,
        setCustomizingTransports,
        getSourceCode,
        generateDevcTransport,
        generateTadirTransport,
        generateLangTransport,
        generateCustTransport,
        releaseTransports,
        publishToRegistry,
        finalizePublish
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<PublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const trmPackage = result.runtime.trmPackage.package;
    const trmArtifact = result.runtime.trmPackage.artifact;
    return {
        trmPackage,
        trmArtifact
    }
}