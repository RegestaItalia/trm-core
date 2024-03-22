import execute from "@sammarks/workflow";
import { Logger } from "../../logger";
import { inspect } from "util";
import { Registry } from "../../registry";
import { TrmArtifact, TrmPackage } from "../../trmPackage";
import { Manifest, TrmManifest, TrmManifestDependency } from "../../manifest";
import { init } from "./init";
import { setSystemPackages } from "./setSystemPackages";
import { checkAlreadyInstalled } from "./checkAlreadyInstalled";
import { checkSapEntries } from "./checkSapEntries";
import { checkDependencies } from "./checkDependencies";
import { checkIntegrity } from "./checkIntegrity";
import { installDependencies } from "./installDependencies";

export type InstallPackageReplacements = {
    originalDevclass: string,
    installDevclass: string
}

export type InstallActionInput = {
    packageName: string,
    registry: Registry,
    version?: string,
    systemPackages?: TrmPackage[],
    integrity?: string
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
    safeInstall?: boolean
}

type WorkflowRuntime = {
    registry?: Registry,
    trmPackage?: TrmPackage,
    manifest?: Manifest,
    trmManifest?: TrmManifest,
    dependenciesToInstall?: TrmManifestDependency[],
    trmArtifact?: TrmArtifact
}

export type InstallActionOutput = {

}

export type InstallWorkflowContext = {
    rawInput: InstallActionInput,
    parsedInput: WorkflowParsedInput,
    runtime: WorkflowRuntime,
    output?: InstallActionOutput
};

const WORKFLOW_NAME = 'install';

export async function install(inputData: InstallActionInput): Promise<void> {
    const workflow = [
        init,
        setSystemPackages,
        checkAlreadyInstalled,
        checkIntegrity,
        checkSapEntries,
        checkDependencies,
        installDependencies,
        
    ];
    Logger.log(`Ready to execute workflow ${WORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
    const result = await execute<InstallWorkflowContext>(WORKFLOW_NAME, workflow, {
        rawInput: inputData,
        parsedInput: {},
        runtime: {}
    });
    Logger.log(`Workflow ${WORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
    /*if(result.output && result.output.trmPackage){
        return result.output.trmPackage;
    }else{
        throw new Error(`An error occurred during publish.`);
    }*/
}