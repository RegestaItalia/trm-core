import execute from "@sammarks/workflow";
import { DEVCLASS, TADIR, TR_TARGET } from "../../client";
import { TrmManifest, TrmManifestDependency } from "../../manifest";
import { Registry } from "../../registry";
import { init } from "./init";
import { setDevclass } from "./setDevclass";
import { checkPublishAllowed } from "./checkPublishAllowed";
import { setTransportTarget } from "./setTransportTarget";
import { setDevclassObjs } from "./setDevclassObjs";
import { findDependencies } from "./findDependencies";
import { TadirDependency } from "../findDependencies";
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

export type PublishActionInput = {
    package: TrmManifest, //atleast name and version
    devclass?: DEVCLASS,
    registry: Registry,
    target?: TR_TARGET,
    ci?: boolean,
    skipDependencies?: boolean,
    forceManifestInput?: boolean,
    overwriteManifestValues?: boolean,
    skipEditSapEntries?: boolean,
    skipEditDependencies?: boolean,
    skipReadme?: boolean,
    skipLang?: boolean,
    readme?: string,
    releaseTimeout?: number,
    tmpFolder?: string
}

type WorkflowParsedInput = {
    packageName?: string,
    version?: string,
    devclass?: string,
    trTarget?: string,
    readme?: string,
    releaseFolder?: string,
    releaseTimeout?: number
}

type WorkflowRuntime = {
    registry?: Registry,
    dummyPackage?: TrmPackage,
    packageExistsOnRegistry?: boolean,
    tadirObjects?: TADIR[],
    dependencies?: TadirDependency[],
    packageDependencies?: TrmManifestDependency[],
    manifest?: TrmManifest,
    trmPackage?: TrmPackage,
    devcTransport?: Transport,
    tryDevcDeleteRevert?: boolean,
    tadirTransport?: Transport,
    tryTadirDeleteRevert?: boolean,
    langTransport?: Transport,
    tryLangDeleteRevert?: boolean,
    artifact?: TrmArtifact
}

export type WorkflowContext = {
    rawInput: PublishActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime
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
        releaseTadirTr,
        releaseLangTr,
        releaseDevcTr,
        generateTrmArtifact,
        publishTrmArtifact,
        finalizePublish
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<WorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    return result.runtime.trmPackage;
}