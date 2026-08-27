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

/** Input required to build and publish a TRM package release from the connected SAP system. */
export interface PublishActionInput {
    /**
     * Optional context data.
     */
    contextData?: {
        /**
         * Snapshot of packages installed on the origin system. When omitted, the action queries SAP.
         */
        systemPackages?: TrmPackage[];

        /**
         * Disable interactive prompts. Missing required values then cause an error.
         */
        noInquirer?: boolean;

        /**
         * Directory in which transport-release logs and temporary files are written.
         */
        logTemporaryFolder?: string;
    };

    /**
     * Data related to the package being published.
     */
    packageData: {
        /**
         * TRM package name to publish.
         */
        name: string;

        /**
         * Exact semantic version or `latest`/omitted for automatic version calculation.
         * 
         * If blank/latest the latest version is retrieved from the registry:
         * 
         * - first time publishing = 1.0.0
         * 
         * - package exists = latest + inc
         */
        version?: string;

        /**
         * Semantic-version increment used when `version` is omitted or `latest`.
         */
        inc?: ReleaseType;

        /**
         * Publish a prerelease instead of a stable release.
         */
        preRelease?: boolean;

        /**
         * Prerelease identifier such as `alpha` or `beta`.
         */
        preReleaseIdentifier?: string;

        /**
         * Registry distribution tags assigned to the release. Defaults to an empty array.
         */
        tags?: string[];

        /**
         * Destination registry used for validation, version lookup, and publication.
         */
        registry: AbstractRegistry;

        /**
         * Source ABAP package. When omitted, the action derives or prompts for it.
         */
        devclass?: DEVCLASS;


        /**
         * Manifest values supplied by the caller. Missing values may be copied from the latest
         * release or collected interactively, depending on `publishData`.
         */
        manifest?: TrmManifestBase;
    };

    /**
         * Data related to the origin system.
         */
    systemData?: {

        /**
         * TMS target assigned to generated publish transports. It is selected interactively when omitted.
         */
        transportTarget?: TR_TARGET;
    }

    /**
     * Data related to package publish.
     */
    publishData?: {

        /**
         * Do not infer TRM dependencies from the source package hierarchy.
         */
        noDependenciesDetection?: boolean,

        /**
         * Merge unspecified manifest metadata from the latest release. Defaults to `true`.
         */
        keepLatestReleaseManifestValues?: boolean,

        /**
         * Set release visibility to private where supported by the registry.
         */
        private?: boolean,

        /**
         * Markdown readme stored with the release. Remote registries may prompt when omitted.
         */
        readme?: string,

        /**
         * Markdown changelog stored with the release. Remote registries may prompt when omitted.
         */
        changelog?: string,

        /**
         * Exclude all customizing transports from this release.
         */
        noCustomizingTransports?: boolean,

        /**
         * Existing customizing request numbers to include. Retained transports from the latest
         * release are merged into this list. Ignored when `noCustomizingTransports` is `true`.
         */
        customizingTransports?: string[],

        /**
         * Do not generate a language transport for translatable package content.
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

/** Artifacts produced by a successful {@link publish} action. */
export type PublishActionOutput = {
    /** Published package model, including its normalized manifest and registry identity. */
    trmPackage: TrmPackage,
    /** Generated release artifact containing transports, manifest, and optional source archive. */
    trmArtifact: TrmArtifact
}

/** Internal state shared by package-publish workflow steps. */
export interface PublishWorkflowContext extends IActionContext {
    /** Original action input; optional groups and collections are normalized before execution. */
    rawInput: PublishActionInput,
    /** Latest release, SAP objects, generated transports, manifest, and source data. */
    runtime?: WorkflowRuntime,
    /** Package and artifact assembled by the workflow. */
    output?: PublishActionOutput
};

const WORKFLOW_NAME = 'publish';

/**
 * Builds an ABAP package release from the connected SAP system and publishes it to a TRM registry.
 *
 * The workflow validates authorization and release metadata, detects dependencies, serializes
 * the source package, creates and releases DEVC/TADIR plus optional language/customizing
 * transports, uploads the artifact, and records the published package on the origin system.
 *
 * This operation creates and releases SAP transports. Do not interrupt it after processing begins.
 * The function normalizes missing optional input groups and arrays in place.
 *
 * @param inputData Source package, destination registry, release metadata, and publish options.
 * @returns The published package model and generated binary artifact.
 * @throws When validation, authorization, source serialization, transport generation/release,
 * or registry publication fails. A final local package-record update failure is logged but does
 * not reject an otherwise successful publication.
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
