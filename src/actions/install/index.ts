import execute from "@sammarks/workflow";
import { Logger } from "../../logger";
import { inspect } from "util";
import { Registry } from "../../registry";
import { TransportBinary, TrmArtifact, TrmPackage } from "../../trmPackage";
import { Manifest, TrmManifest, TrmManifestDependency } from "../../manifest";
import { init } from "./init";
import { setSystemPackages } from "./setSystemPackages";
import { checkAlreadyInstalled } from "./checkAlreadyInstalled";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { checkIntegrity } from "./checkIntegrity";
import { installDependencies } from "./installDependencies";
import { R3trans, R3transOptions } from "node-r3trans";
import { checkTransports } from "./checkTransports";
import { readDevcTransport } from "./readDevcTransport";
import { DEVCLASS, E071, TADIR, TDEVC, TDEVCT } from "../../client";
import { setR3trans } from "./setR3trans";
import { checkTadirContent } from "./checkTadirContent";
import { checkTadirObjectTypes } from "./checkTadirObjectTypes";
import { setDevclass } from "./setDevclass";
import { generateDevclass } from "./generateDevclass";
import { PackageHierarchy } from "../../commons";
import { importTadirTransport } from "./importTadirTransport";
import { importLangTransport } from "./importLangTransport";
import { setPackageIntegrity } from "./setPackageIntegrity";
import { generateWbTransport } from "./generateWbTransport";
import { Transport } from "../../transport";

export type InstallPackageReplacements = {
    originalDevclass: string,
    installDevclass: string
}

export type InstallActionInput = {
    packageName: string,
    registry: Registry,
    version?: string,
    systemPackages?: TrmPackage[],
    integrity?: string,
    r3transOptions?: R3transOptions,
    transportLayer?: string,
    /*forceInstall?: boolean,
    ignoreSapEntries?: boolean,
    skipDependencies?: boolean,
    skipLang?: boolean,
    importTimeout?: number,
    keepOriginalPackages?: boolean,
    packageReplacements?: InstallPackageReplacements[],
    skipWbTransport?: boolean,
    transportLayer?: string,
    targetSystem?: string,
    integrity?: string,
    safe?: boolean,
    ci?: boolean*/
}

type WorkflowParsedInput = {
    packageName?: string,
    version?: string,
    skipAlreadyInstalledCheck?: boolean,
    forceInstallSameVersion?: boolean,
    overwriteInstall?: boolean,
    systemPackages?: TrmPackage[],
    checkSapEntries?: boolean,
    checkDependencies?: boolean,
    installMissingDependencies?: boolean,
    installIntegrity?: string,
    safeInstall?: boolean,
    r3transOptions?: R3transOptions,
    checkObjectTypes?: boolean,
    keepOriginalPackages?: boolean,
    forceDevclassInput?: boolean,
    transportLayer?: string,
    importTimeout?: number,
    skipLangImport?: boolean,
    skipWbTransportGen?: boolean,
    wbTrTargetSystem?: string
}

type WorkflowRuntime = {
    registry?: Registry,
    trmPackage?: TrmPackage,
    manifest?: Manifest,
    trmManifest?: TrmManifest,
    dependenciesToInstall?: TrmManifestDependency[],
    trmArtifact?: TrmArtifact,
    r3trans?: R3trans,
    devcTransport?: TransportBinary,
    tadirTransport?: TransportBinary,
    langTransport?: TransportBinary,
    tdevcData?: TDEVC[],
    tdevctData?: TDEVCT[],
    tadirData?: TADIR[],
    workbenchObjects?: E071[],
    packageReplacements?: InstallPackageReplacements[],
    generatedDevclass?: DEVCLASS[],
    originalPackageHierarchy?: PackageHierarchy,
    trCopy?: string[],
    fetchedIntegrity?: string,
    wbTransport?: Transport
}

export type InstallActionOutput = {
    trmPackage: TrmPackage,
    registry: Registry,
    wbTransport?: Transport
}

export type InstallWorkflowContext = {
    rawInput: InstallActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output?: InstallActionOutput
};

const WORKFLOW_NAME = 'install';

export async function install(inputData: InstallActionInput): Promise<InstallActionOutput> {
    const workflow = [
        init,
        setSystemPackages,
        checkAlreadyInstalled,
        checkIntegrity,
        checkSapEntries,
        checkDependencies,
        installDependencies,
        setR3trans,
        checkTransports,
        readDevcTransport,
        setDevclass,
        checkTadirContent,
        checkTadirObjectTypes,
        generateDevclass,
        importTadirTransport,
        importLangTransport,
        setPackageIntegrity,
        generateWbTransport
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    const trmPackage = result.runtime.trmPackage;
    const registry = result.runtime.registry;
    const wbTransport = result.runtime.wbTransport;
    return {
        trmPackage,
        registry,
        wbTransport
    }
}