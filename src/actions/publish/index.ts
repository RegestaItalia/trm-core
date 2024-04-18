import execute from "@simonegaffurini/sammarksworkflow";
import { DEVCLASS, TADIR, TR_TARGET } from "../../client";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { Registry } from "../../registry";
import { init } from "./init";
import { setDevclass } from "./setDevclass";
import { checkPublishAllowed } from "./checkPublishAllowed";
import { setTransportTarget } from "./setTransportTarget";
import { setDevclassObjs } from "./setDevclassObjs";
import { findDependencies } from "./findDependencies";
import { Logger } from "../../logger";
import { setTrmDependencies } from "./setTrmDependencies";
import { setSapEntries } from "./setSapEntries";
import { editSapEntries } from "./editSapEntries";
import { editTrmDependencies } from "./editTrmDependencies";
import { logDependencies } from "./logDependencies";
import { inspect } from "util";
import { TrmArtifact, TrmPackage } from "../../trmPackage";
import { checkPackageExistance } from "./checkPackageExistance";
import { overwriteManifestValues } from "./overwriteManifestValues";
import { setBackwardsCompatible } from "./setBackwardsCompatible";
import { setPrivate } from "./setPrivate";
import { setManifestValues } from "./setManifestValues";
import { buildTrmPackageInstance } from "./buildTrmPackageInstance";
import { setReadme } from "./setReadme";
import { Transport } from "../../transport";
import { generateDevcTr } from "./generateDevcTr";
import { generateTadirTr } from "./generateTadirTr";
import { generateLangTr } from "./generateLangTr";
import { releaseTadirTr } from "./releaseTadirTr";
import { releaseLangTr } from "./releaseLangTr";
import { releaseDevcTr } from "./releaseDevcTr";
import { generateTrmArtifact } from "./generateTrmArtifact";
import { publishTrmArtifact } from "./publishTrmArtifact";
import { finalizePublish } from "./finalizePublish";
import { FindDependencyActionOutput } from "../findDependencies";
import { generateCustTr } from "./generateCustTr";
import { releaseCustTr } from "./releaseCustTr";

export type PublishActionInput = {
    package: TrmManifest, //atleast name and version
    registry: Registry,
    devclass?: DEVCLASS,
    target?: TR_TARGET,
    ci?: boolean,
    skipDependencies?: boolean,
    forceManifestInput?: boolean,
    overwriteManifestValues?: boolean,
    skipEditSapEntries?: boolean,
    skipEditDependencies?: boolean,
    skipReadme?: boolean,
    skipLang?: boolean,
    skipCust?: boolean,
    customizingTransports?: string[],
    readme?: string,
    releaseTimeout?: number,
    tmpFolder?: string
}

export type WorkflowParsedInput = {
    packageName?: string,
    version?: string,
    devclass?: string,
    trTarget?: string,
    readme?: string,
    releaseFolder?: string,
    releaseTimeout?: number,
    customizingTransports?: string[],
}

export type WorkflowRuntime = {
    registry?: Registry,
    dummyPackage?: TrmPackage,
    packageExistsOnRegistry?: boolean,
    tadirObjects?: TADIR[],
    manifest?: TrmManifest,
    trmPackage?: TrmPackage,
    devcTransport?: Transport,
    tryDevcDeleteRevert?: boolean,
    tadirTransport?: Transport,
    tryTadirDeleteRevert?: boolean,
    langTransport?: Transport,
    tryLangDeleteRevert?: boolean,
    custTransport?: Transport,
    tryCustDeleteRevert?: boolean,
    artifact?: TrmArtifact,
    dependencies?: FindDependencyActionOutput
}

export type PublishActionOutput = {
    trmPackage: TrmPackage
}

export type PublishWorkflowContext = {
    rawInput: PublishActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output?: PublishActionOutput
};

const WORKFLOW_NAME = 'publish';

export async function publish(inputData: PublishActionInput): Promise<TrmPackage> {
    const workflow = [
        init,
        checkPackageExistance,
        checkPublishAllowed,
        setDevclass,
        setTransportTarget,
        setDevclassObjs,
        findDependencies,
        setTrmDependencies,
        setSapEntries,
        editTrmDependencies,
        editSapEntries,
        logDependencies,
        overwriteManifestValues,
        setBackwardsCompatible,
        setPrivate,
        setManifestValues,
        buildTrmPackageInstance,
        setReadme,
        generateDevcTr,
        generateTadirTr,
        generateLangTr,
        generateCustTr,
        releaseTadirTr,
        releaseLangTr,
        releaseCustTr,
        releaseDevcTr,
        generateTrmArtifact,
        publishTrmArtifact,
        finalizePublish
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<PublishWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    if(result.output && result.output.trmPackage){
        return result.output.trmPackage;
    }else{
        throw new Error(`An error occurred during publish.`);
    }
}